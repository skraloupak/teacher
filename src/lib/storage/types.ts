import type { ProgressMap, SessionRecord, StudySettings } from "../types";

/**
 * Rozhraní úložiště. Dnes ho plní localStorage, později může stejné metody
 * obsloužit MongoDB přes API routy – zbytek aplikace se nemusí měnit.
 */
export interface ProgressStore {
  loadProgress(): Promise<ProgressMap>;
  saveProgress(progress: ProgressMap): Promise<void>;
  loadSettings(): Promise<StudySettings | null>;
  saveSettings(settings: StudySettings): Promise<void>;
  /** Id položek, které si uživatel zaškrtl ve slovníčku. */
  loadMarked(): Promise<string[]>;
  saveMarked(itemIds: string[]): Promise<void>;
  loadSessions(): Promise<SessionRecord[]>;
  addSession(record: SessionRecord): Promise<void>;
  resetProgress(): Promise<void>;
}
