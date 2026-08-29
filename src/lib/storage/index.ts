import { SyncedProgressStore } from "./synced";
import type { ProgressStore } from "./types";

let instance: ProgressStore | null = null;

/**
 * Jediné místo, kde se rozhoduje, kam se ukládá.
 *
 * Používá se úložiště, které drží data v prohlížeči a zároveň je zrcadlí do MongoDB
 * přes /api/state. Když databáze není nastavená (chybí proměnné v .env) nebo neodpovídá,
 * aplikace jede dál jen z prohlížeče – jen se nesynchronizuje mezi zařízeními.
 */
export function getStore(): ProgressStore {
  if (!instance) instance = new SyncedProgressStore();
  return instance;
}

export type { ProgressStore };
