import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { GrammarTopic } from "./types";

const GRAMMAR_DIR = path.join(process.cwd(), "data", "grammar");

function isValid(topic: unknown): topic is GrammarTopic {
  if (!topic || typeof topic !== "object") return false;
  const t = topic as Record<string, unknown>;
  return (
    typeof t.id === "string" &&
    typeof t.title === "string" &&
    typeof t.core === "string" &&
    Array.isArray(t.rules) &&
    Array.isArray(t.examples) &&
    Array.isArray(t.quiz)
  );
}

/**
 * Načte gramatická témata z data/grammar/*.json.
 * Stejně jako lekce se čtou při buildu, takže stránky zůstávají statické.
 */
export async function getGrammarTopics(): Promise<GrammarTopic[]> {
  let files: string[] = [];
  try {
    files = (await readdir(GRAMMAR_DIR)).filter((f) => f.endsWith(".json")).sort();
  } catch {
    return [];
  }

  const topics: GrammarTopic[] = [];
  const usedIds = new Map<string, string>();

  for (const [index, file] of files.entries()) {
    try {
      const raw = JSON.parse(await readFile(path.join(GRAMMAR_DIR, file), "utf8"));
      if (!isValid(raw)) {
        console.warn(`[gramatika] Přeskakuji ${file}: chybí povinná pole.`);
        continue;
      }
      const clash = usedIds.get(raw.id);
      if (clash) {
        console.warn(`[gramatika] Přeskakuji ${file}: id "${raw.id}" už použil ${clash}.`);
        continue;
      }
      usedIds.set(raw.id, file);
      topics.push({ ...raw, order: typeof raw.order === "number" ? raw.order : index + 1 });
    } catch (error) {
      console.warn(`[gramatika] Nepodařilo se načíst ${file}:`, error);
    }
  }

  return topics.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, "cs"));
}
