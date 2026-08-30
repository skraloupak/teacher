import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { audioKeyFor } from "./slug";
import type { Book, Item, Lesson, RawItem, RawLesson } from "./types";

const LESSONS_DIR = path.join(process.cwd(), "data", "lessons");
const AUDIO_DIR = path.join(process.cwd(), "public", "audio");

export const AUDIO_EXT = "m4a";

function isRawItem(value: unknown): value is RawItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    (item.type === "word" || item.type === "phrase") &&
    typeof item.en === "string" &&
    item.en.trim().length > 0 &&
    typeof item.cs === "string" &&
    item.cs.trim().length > 0
  );
}

async function readAudioKeys(): Promise<Set<string>> {
  try {
    const files = await readdir(AUDIO_DIR);
    return new Set(
      files
        .filter((name) => name.endsWith(`.${AUDIO_EXT}`))
        .map((name) => name.slice(0, -(AUDIO_EXT.length + 1))),
    );
  } catch {
    return new Set();
  }
}

/** Z id „u1-l2" vytáhne číslo učebnice i číslo lekce. */
function parseLessonId(id: string): { book: number; lesson: number } | null {
  const match = /^u(\d+)-l(\d+)$/i.exec(id.trim());
  return match ? { book: Number(match[1]), lesson: Number(match[2]) } : null;
}

function buildLesson(
  raw: RawLesson,
  fallbackOrder: number,
  audioKeys: Set<string>,
  file: string,
): Lesson {
  const seen = new Map<string, number>();
  const items: Item[] = [];
  let skipped = 0;

  for (const rawItem of raw.items) {
    if (!isRawItem(rawItem)) {
      // Vadná položka se sice dá přeskočit, ale nesmí zmizet potichu – jinak se překlep v datech nikdy nenajde.
      skipped++;
      continue;
    }

    const en = rawItem.en.trim();
    const audioKey = audioKeyFor(en);
    // Stejný anglický výraz dvakrát v jedné lekci – odlišíme pořadím, ať se id nepřekrývají.
    const dupes = seen.get(audioKey) ?? 0;
    seen.set(audioKey, dupes + 1);
    const id = dupes === 0 ? `${raw.id}:${audioKey}` : `${raw.id}:${audioKey}-${dupes + 1}`;

    items.push({
      ...rawItem,
      en,
      cs: rawItem.cs.trim(),
      ipa: rawItem.ipa?.trim().replace(/^\[|\]$/g, "") || undefined,
      note: rawItem.note?.trim() || undefined,
      id,
      lessonId: raw.id,
      lessonTitle: raw.title,
      audioKey,
      hasAudio: audioKeys.has(audioKey),
    });
  }

  if (skipped > 0) {
    console.warn(
      `[lekce] ${file}: přeskočeno ${skipped} vadných položek ` +
        `(chybí type "word"/"phrase", nebo je prázdné en či cs).`,
    );
  }

  const parsed = parseLessonId(raw.id);
  const book = typeof raw.book === "number" ? raw.book : (parsed?.book ?? 1);

  return {
    id: raw.id,
    order: typeof raw.order === "number" ? raw.order : (parsed?.lesson ?? fallbackOrder),
    title: raw.title,
    description: raw.description,
    book,
    bookTitle: raw.bookTitle ?? `Učebnice ${book}`,
    // Lekce může být na víc stránkách; jedna cesta se normalizuje na pole.
    source: raw.source ? (Array.isArray(raw.source) ? raw.source : [raw.source]) : undefined,
    items,
    wordCount: items.filter((i) => i.type === "word").length,
    phraseCount: items.filter((i) => i.type === "phrase").length,
  };
}

/**
 * Načte všechny lekce z data/lessons/*.json.
 * Běží na serveru při buildu – stránky jsou statické, takže se čtení nedělá za běhu.
 */
export async function getLessons(): Promise<Lesson[]> {
  const audioKeys = await readAudioKeys();

  let files: string[] = [];
  try {
    files = (await readdir(LESSONS_DIR)).filter((f) => f.endsWith(".json")).sort();
  } catch {
    return [];
  }

  const lessons: Lesson[] = [];
  const usedIds = new Map<string, string>();

  for (const [index, file] of files.entries()) {
    try {
      const raw = JSON.parse(await readFile(path.join(LESSONS_DIR, file), "utf8")) as RawLesson;
      if (!raw?.id || !raw?.title || !Array.isArray(raw.items)) {
        console.warn(`[lekce] Přeskakuji ${file}: chybí id, title nebo items.`);
        continue;
      }
      const clash = usedIds.get(raw.id);
      if (clash) {
        console.warn(`[lekce] Přeskakuji ${file}: id "${raw.id}" už použil soubor ${clash}.`);
        continue;
      }
      usedIds.set(raw.id, file);
      lessons.push(buildLesson(raw, index + 1, audioKeys, file));
    } catch (error) {
      console.warn(`[lekce] Nepodařilo se načíst ${file}:`, error);
    }
  }

  return lessons.sort(
    (a, b) => a.book - b.book || a.order - b.order || a.id.localeCompare(b.id),
  );
}

/** Lekce seskupené po učebnicích – v tomhle pořadí se nabízejí k výběru. */
export function groupByBook(lessons: Lesson[]): Book[] {
  const books = new Map<number, Book>();

  for (const lesson of lessons) {
    let book = books.get(lesson.book);
    if (!book) {
      book = { number: lesson.book, title: lesson.bookTitle, lessons: [], itemCount: 0 };
      books.set(lesson.book, book);
    }
    book.lessons.push(lesson);
    book.itemCount += lesson.items.length;
  }

  return [...books.values()].sort((a, b) => a.number - b.number);
}
