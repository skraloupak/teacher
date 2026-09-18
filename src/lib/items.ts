import type { Item } from "./types";

/**
 * Slovíčko sloučené z víc lekcí má ve všech stejné `id`. Kdekoli se skládá plochý
 * seznam položek z víc lekcí, musí se proto projít tímhle – jinak se táž kartička
 * objeví vícekrát: v kole by přišla dvakrát za sebou, ve slovníčku by se vykreslila
 * jako dva řádky se stejným React klíčem a počty by seděly jen zdánlivě.
 */
export function dedupeById(items: Item[]): Item[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}
