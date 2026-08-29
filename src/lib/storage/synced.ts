"use client";

import type { ProgressMap, SessionRecord, StudySettings } from "../types";
import { LocalProgressStore } from "./local";
import { mergeProgress, mergeSessions } from "./merge";
import type { ProgressStore } from "./types";

const MAX_SESSIONS = 200;
/** Jak dlouho se sbírají změny, než odletí jeden zápis na server. */
const FLUSH_DELAY = 1200;
/** Server nesmí blokovat učení – když se neozve, jede se z prohlížeče. */
const FETCH_TIMEOUT = 6000;

type RemoteState = {
  progress: ProgressMap;
  settings: StudySettings | null;
  sessions: SessionRecord[];
  marked: string[];
  updatedAt: number;
};

async function fetchJson(input: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Úložiště, které drží data v prohlížeči a zároveň je zrcadlí do MongoDB.
 *
 * Prohlížeč je pořád zdroj rychlosti – učení nikdy nečeká na síť. Server přidává
 * sdílení mezi zařízeními: při startu se stavy sloučí (u kartiček vyhrává novější
 * odpověď), zápisy odcházejí na pozadí. Když databáze není nastavená nebo neodpovídá,
 * aplikace funguje dál jen lokálně.
 */
export class SyncedProgressStore implements ProgressStore {
  private local = new LocalProgressStore();
  private remote: Promise<RemoteState | null> | null = null;
  /**
   * Poslední známý stav ze serveru. Udržuje se i při zápisech, protože se čte při
   * každém přechodu mezi obrazovkami – bez toho by nově uložené nastavení
   * přebila stará odpověď zapamatovaná ze startu aplikace.
   */
  private cached: RemoteState | null = null;
  private available = true;

  /** Změny čekající na odeslání. */
  private pending: {
    progress: ProgressMap;
    settings?: StudySettings;
    sessions: SessionRecord[];
    marked?: string[];
  } = { progress: {}, sessions: [] };

  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    if (typeof window !== "undefined") {
      // Rozdělaný zápis se pokusíme odeslat ještě před zavřením karty.
      window.addEventListener("pagehide", () => void this.flush(true));
    }
  }

  /** Stáhne stav ze serveru. Síť se použije nejvýš jednou za život instance. */
  private async loadRemote(): Promise<RemoteState | null> {
    // Co jsme mezitím uložili, má přednost před tím, co server vrátil při startu.
    if (this.cached) return this.cached;

    if (!this.remote) {
      this.remote = (async () => {
        try {
          const response = await fetchJson("/api/state");
          // 501 = databáze není nastavená, 401 = vypršelo přihlášení.
          // V obou případech se dál pracuje jen z prohlížeče.
          if (response.status === 501 || response.status === 401) {
            this.available = false;
            return null;
          }
          if (!response.ok) return null;
          const data = (await response.json()) as RemoteState;
          this.cached = data;
          return data;
        } catch {
          // Offline nebo pomalá síť – učení tím netrpí.
          return null;
        }
      })();
    }
    return this.remote;
  }

  private schedule(): void {
    if (!this.available) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), FLUSH_DELAY);
  }

  /** Odešle nasbírané změny. `immediate` se používá při zavírání stránky. */
  private async flush(immediate = false): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (!this.available) return;

    const batch = this.pending;
    const hasWork =
      Object.keys(batch.progress).length > 0 ||
      batch.sessions.length > 0 ||
      batch.settings !== undefined ||
      batch.marked !== undefined;
    if (!hasWork) return;

    this.pending = { progress: {}, sessions: [] };

    const body = JSON.stringify({
      progress: batch.progress,
      sessions: batch.sessions,
      settings: batch.settings,
      marked: batch.marked,
      updatedAt: Date.now(),
    });

    // Při zavírání stránky už fetch nemusí doběhnout, sendBeacon ano.
    if (immediate && typeof navigator !== "undefined" && "sendBeacon" in navigator) {
      // sendBeacon umí jen POST; PUT tu obsloužíme běžným fetchem s keepalive.
      try {
        await fetch("/api/state", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: true,
        });
      } catch {
        // Nedoručeno – data zůstávají v prohlížeči a odejdou příště.
      }
      return;
    }

    try {
      const response = await fetchJson("/api/state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body,
      });
      if (response.status === 501 || response.status === 401) this.available = false;
    } catch {
      // Nevadí; lokální kopie je zdroj pravdy a pošle se při příští změně.
      this.pending.progress = { ...batch.progress, ...this.pending.progress };
      this.pending.sessions = [...batch.sessions, ...this.pending.sessions];
      this.pending.settings ??= batch.settings;
      this.pending.marked ??= batch.marked;
    }
  }

  async loadProgress(): Promise<ProgressMap> {
    const [local, remote] = await Promise.all([this.local.loadProgress(), this.loadRemote()]);
    if (!remote) return local;

    const merged = mergeProgress(local, remote.progress);
    await this.local.saveProgress(merged);
    if (this.cached) this.cached.progress = merged;
    // Co má prohlížeč navíc, doplníme na server.
    this.pending.progress = { ...this.pending.progress, ...merged };
    this.schedule();
    return merged;
  }

  async saveProgress(progress: ProgressMap): Promise<void> {
    await this.local.saveProgress(progress);
    if (this.cached) this.cached.progress = mergeProgress(this.cached.progress, progress);
    this.pending.progress = { ...this.pending.progress, ...progress };
    this.schedule();
  }

  async loadSettings(): Promise<StudySettings | null> {
    const [local, remote] = await Promise.all([this.local.loadSettings(), this.loadRemote()]);
    // Nastavení nemá historii – bereme serverové, pokud nějaké je.
    return remote?.settings ?? local;
  }

  async saveSettings(settings: StudySettings): Promise<void> {
    await this.local.saveSettings(settings);
    if (this.cached) this.cached.settings = settings;
    this.pending.settings = settings;
    this.schedule();
  }

  async loadMarked(): Promise<string[]> {
    const [local, remote] = await Promise.all([this.local.loadMarked(), this.loadRemote()]);
    return remote?.marked ?? local;
  }

  async saveMarked(itemIds: string[]): Promise<void> {
    await this.local.saveMarked(itemIds);
    if (this.cached) this.cached.marked = itemIds;
    this.pending.marked = itemIds;
    this.schedule();
  }

  async loadSessions(): Promise<SessionRecord[]> {
    const [local, remote] = await Promise.all([this.local.loadSessions(), this.loadRemote()]);
    if (!remote) return local;
    const merged = mergeSessions(local, remote.sessions, MAX_SESSIONS);
    return merged;
  }

  async addSession(record: SessionRecord): Promise<void> {
    await this.local.addSession(record);
    if (this.cached) {
      this.cached.sessions = mergeSessions(this.cached.sessions, [record], MAX_SESSIONS);
    }
    this.pending.sessions.push(record);
    this.schedule();
  }

  async resetProgress(): Promise<void> {
    await this.local.resetProgress();
    this.pending = { progress: {}, sessions: [] };
    this.remote = null;
    this.cached = null;
    if (!this.available) return;
    try {
      await fetchJson("/api/state", { method: "DELETE" });
    } catch {
      // Server se ozve příště; lokálně je smazáno.
    }
  }
}
