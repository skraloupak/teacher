"use client";

import type { ProgressMap, SessionRecord, StudySettings } from "../types";
import { LocalProgressStore } from "./local";
import { mergeProgress, mergeSessions, progressToPush } from "./merge";
import type { ProgressStore } from "./types";

const MAX_SESSIONS = 1000;
/** Jak dlouho se sbírají změny, než odletí jeden zápis na server. */
const FLUSH_DELAY = 1200;
/**
 * Nastavení a zaškrtnutí odcházejí dřív než kartičky. Jsou malá, mění se po jednom
 * kliknutí a uživatel hned potom klidně obnoví stránku – čekat s nimi přes vteřinu
 * znamená, že se výběr lekcí nestihne uložit.
 */
const SETTINGS_FLUSH_DELAY = 300;
/** Server nesmí blokovat učení – když se neozve, jede se z prohlížeče. */
const FETCH_TIMEOUT = 6000;
/**
 * Strop pro tělo `fetch`u s `keepalive` podle specifikace Fetch. Větší zápis prohlížeč
 * odmítne, takže se při zavírání karty musí poslat jen to podstatné.
 */
const KEEPALIVE_LIMIT = 60_000;

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

  private timerAt = 0;

  private schedule(delay: number = FLUSH_DELAY): void {
    if (!this.available) return;
    const at = Date.now() + delay;
    // Naplánovaný dřívější zápis se neodsouvá – jinak by proud odpovědí donekonečna
    // odkládal nastavení, které čeká na odeslání.
    if (this.timer && this.timerAt <= at) return;
    if (this.timer) clearTimeout(this.timer);
    this.timerAt = at;
    this.timer = setTimeout(() => void this.flush(), delay);
  }

  /** Odešle nasbírané změny. `immediate` se používá při zavírání stránky. */
  private async flush(immediate = false): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
      this.timerAt = 0;
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

    // Při zavírání stránky fetch nemusí doběhnout; `keepalive` ho nechá dojet i po
    // odchodu ze stránky, ale tělo smí mít jen 64 kB. Když se dávka nevejde, odešleme
    // aspoň nastavení a zaškrtnutí – kartičky jsou v prohlížeči a odejdou příště,
    // kdežto ztracené nastavení uživatel uvidí hned po načtení stránky.
    if (immediate) {
      // Limit platí pro bajty, ne pro znaky – české texty jsou v UTF-8 delší.
      const bytes = new Blob([body]).size;
      const small =
        bytes <= KEEPALIVE_LIMIT
          ? body
          : JSON.stringify({
              progress: {},
              sessions: batch.sessions,
              settings: batch.settings,
              marked: batch.marked,
              updatedAt: Date.now(),
            });
      try {
        await fetch("/api/state", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: small,
          keepalive: true,
        });
        if (small !== body) {
          // Kartičky se neodeslaly. Fronta je jen v paměti a se zavřenou kartou zanikne,
          // ale odpovědi zůstávají v prohlížeči – odejdou při první odpovědi příště
          // (saveProgress posílá celou mapu) nebo startovním doplněním v loadProgress.
          this.pending.progress = { ...batch.progress, ...this.pending.progress };
        }
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

    // Rozdíl se musí spočítat DŘÍV, než se přepíše cache: `remote` je tentýž objekt,
    // který drží `this.cached`, takže po přiřazení níž by se mapa porovnávala sama
    // se sebou a nikdy by se nic neodeslalo.
    const merged = mergeProgress(local, remote.progress);
    // Doplníme jen to, co prohlížeč má navíc – posílat po každém startu celou mapu
    // znamená stovky kB a při zavírání karty se takový zápis vůbec neodešle.
    const push = progressToPush(merged, remote.progress);
    await this.local.saveProgress(merged);
    if (this.cached) this.cached.progress = merged;
    if (Object.keys(push).length > 0) {
      this.pending.progress = { ...this.pending.progress, ...push };
      this.schedule();
    }
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
    this.schedule(SETTINGS_FLUSH_DELAY);
  }

  async loadMarked(): Promise<string[]> {
    const [local, remote] = await Promise.all([this.local.loadMarked(), this.loadRemote()]);
    return remote?.marked ?? local;
  }

  async saveMarked(itemIds: string[]): Promise<void> {
    await this.local.saveMarked(itemIds);
    if (this.cached) this.cached.marked = itemIds;
    this.pending.marked = itemIds;
    this.schedule(SETTINGS_FLUSH_DELAY);
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
