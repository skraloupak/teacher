import type { ProgressMap, SessionRecord, StudySettings } from "../types";
import type { ProgressStore } from "./types";

const KEYS = {
  progress: "teacher-app:progress:v1",
  settings: "teacher-app:settings:v1",
  sessions: "teacher-app:sessions:v1",
  marked: "teacher-app:marked:v1",
} as const;

/** Kolik posledních kol si pamatujeme (statistiky). */
const MAX_SESSIONS = 200;

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as unknown;
    // Poškozený nebo cizí obsah v localStorage nesmí shodit aplikaci.
    if (parsed === null || typeof parsed !== typeof fallback) return fallback;
    if (Array.isArray(fallback) !== Array.isArray(parsed)) return fallback;
    return parsed as T;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Např. plná kvóta nebo privátní režim – učení může běžet dál bez ukládání.
  }
}

export class LocalProgressStore implements ProgressStore {
  async loadProgress(): Promise<ProgressMap> {
    return read<ProgressMap>(KEYS.progress, {});
  }

  async saveProgress(progress: ProgressMap): Promise<void> {
    // Ve dvou otevřených záložkách by slepý zápis přepsal cizí odpovědi.
    // Sloučíme podle času poslední odpovědi – novější záznam vyhrává.
    const stored = read<ProgressMap>(KEYS.progress, {});
    const merged: ProgressMap = { ...stored };
    for (const [key, card] of Object.entries(progress)) {
      const existing = merged[key];
      if (!existing || card.lastSeen >= existing.lastSeen) merged[key] = card;
    }
    write(KEYS.progress, merged);
  }

  async loadSettings(): Promise<StudySettings | null> {
    return read<StudySettings | null>(KEYS.settings, null);
  }

  async saveSettings(settings: StudySettings): Promise<void> {
    write(KEYS.settings, settings);
  }

  async loadMarked(): Promise<string[]> {
    const list = read<string[]>(KEYS.marked, []);
    return Array.isArray(list) ? list.filter((id) => typeof id === "string") : [];
  }

  async saveMarked(itemIds: string[]): Promise<void> {
    write(KEYS.marked, itemIds);
  }

  async loadSessions(): Promise<SessionRecord[]> {
    const list = read<SessionRecord[]>(KEYS.sessions, []);
    return Array.isArray(list) ? list : [];
  }

  async addSession(record: SessionRecord): Promise<void> {
    const list = await this.loadSessions();
    list.push(record);
    write(KEYS.sessions, list.slice(-MAX_SESSIONS));
  }

  async resetProgress(): Promise<void> {
    write(KEYS.progress, {});
    write(KEYS.sessions, []);
  }
}
