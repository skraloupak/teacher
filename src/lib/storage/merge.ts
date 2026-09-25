import type { ProgressMap, SessionRecord } from "../types";

/**
 * Sloučí dvě mapy pokroku. Vyhrává novější odpověď – tak se nepřepíšou
 * data z druhého zařízení ani z jiné otevřené záložky.
 */
export function mergeProgress(base: ProgressMap, incoming: ProgressMap): ProgressMap {
  const merged: ProgressMap = { ...base };
  for (const [key, card] of Object.entries(incoming)) {
    const existing = merged[key];
    if (!existing || card.lastSeen >= existing.lastSeen) merged[key] = card;
  }
  return merged;
}

/**
 * Záznamy, které má prohlížeč navíc nebo čerstvější než server.
 *
 * Posílat po každém startu celou mapu je zbytečné – u tisícovky kartiček z ní je
 * přes 300 kB a `fetch` s `keepalive`, kterým se odesílá rozdělaný zápis při zavírání
 * karty, takhle velké tělo odmítne. Spolu s ním by propadlo i nastavení.
 */
export function progressToPush(local: ProgressMap, remote: ProgressMap): ProgressMap {
  const out: ProgressMap = {};
  for (const [key, card] of Object.entries(local)) {
    const theirs = remote[key];
    if (!theirs || card.lastSeen > theirs.lastSeen) out[key] = card;
  }
  return out;
}

/** Sloučí historii kol podle id a seřadí ji podle času dokončení. */
export function mergeSessions(
  base: SessionRecord[],
  incoming: SessionRecord[],
  limit: number,
): SessionRecord[] {
  const byId = new Map<string, SessionRecord>();
  for (const record of [...base, ...incoming]) byId.set(record.id, record);
  return [...byId.values()].sort((a, b) => a.finishedAt - b.finishedAt).slice(-limit);
}
