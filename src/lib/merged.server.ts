import { readFile } from "node:fs/promises";
import path from "node:path";
import { mergeKeyFor } from "./slug";

const MERGED_FILE = path.join(process.cwd(), "data", "merged-words.json");

/**
 * Slovíčko, které učebnice uvádí ve víc lekcích – pokaždé s jiným českým překladem.
 *
 * Bez sloučení dostane uživatel „left" třikrát a pokaždé se od něj čeká jiná odpověď
 * („levý" / „odešel" / „zbylý"), takže se nemá jak trefit. Sloučená kartička ukáže
 * všechny významy najednou a v SRS se počítá jako jedna položka.
 */
export type MergedWord = {
  /** Anglické heslo, jak má stát na kartičce – sjednocuje i zápisy typu „apply (for)" × „apply for". */
  en: string;
  /** Překlad pokrývající významy ze všech lekcí, oddělené středníkem. */
  cs: string;
  type: "word" | "phrase";
  ipa?: string;
  note?: string;
  /** Lekce, ve kterých se slovíčko objevilo. */
  lessons: string[];
  /** Jak se varianty lišily – jen pro přehled, aplikace s tím nepracuje. */
  verdikt?: string;
  /** Význam doplněný nad rámec učebnice, když nějaký je. */
  pridano?: string;
};

let cache: Map<string, MergedWord> | null = null;

/** Načte tabulku sloučených slovíček. Soubor nemusí existovat – pak se prostě neslučuje. */
export async function readMergedWords(): Promise<Map<string, MergedWord>> {
  if (cache) return cache;
  try {
    const raw = JSON.parse(await readFile(MERGED_FILE, "utf8")) as Record<string, MergedWord>;
    cache = new Map(Object.entries(raw));
  } catch {
    cache = new Map();
  }
  return cache;
}

/** Najde sloučené heslo pro anglický výraz z lekce. */
export function mergedFor(
  merged: Map<string, MergedWord>,
  englishText: string,
): MergedWord | undefined {
  return merged.get(mergeKeyFor(englishText));
}
