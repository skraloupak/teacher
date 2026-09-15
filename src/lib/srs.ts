import type { CardProgress, Direction, Item, ProgressMap } from "./types";

/** Nejvyšší box – kartička v něm se považuje za naučenou. */
export const MAX_BOX = 5;

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/** Za jak dlouho se kartička vrátí, když ji dám správně z daného boxu. */
export const BOX_INTERVALS: number[] = [
  0, // box 0 – nová nebo čerstvě chybná, chci ji hned
  10 * MINUTE, // box 1
  1 * DAY, // box 2
  3 * DAY, // box 3
  7 * DAY, // box 4
  21 * DAY, // box 5 – naučeno
];

/**
 * Jak se boxy jmenují v přehledu. Popisek říká, jaký ODSTUP se u kartičky použije
 * po správné odpovědi – ne za jak dlouho se objeví. Kartička v boxu „po 10 minutách"
 * může mít termín dávno za sebou a čekat na řadě.
 */
export const BOX_LABELS = [
  "Nové a chybné",
  "Odstup 10 minut",
  "Odstup 1 den",
  "Odstup 3 dny",
  "Odstup týden",
  "Naučeno",
];

/** Časová pásma pro přehled „kdy co přijde na řadu". */
export const DUE_BUCKETS: Array<{ label: string; within: number }> = [
  { label: "na řadě teď", within: 0 },
  { label: "do hodiny", within: 60 * MINUTE },
  { label: "dnes", within: DAY },
  { label: "do týdne", within: 7 * DAY },
  { label: "později", within: Infinity },
];

/** Rozdělí kartičky podle toho, kdy přijdou na řadu. Odložené se nepočítají. */
export function bucketByDue(cards: CardProgress[], now: number): number[] {
  const counts = new Array(DUE_BUCKETS.length).fill(0);

  for (const card of cards) {
    if (card.mastered) continue;
    const inMs = card.dueAt - now;
    const index = DUE_BUCKETS.findIndex((bucket) => inMs <= bucket.within);
    counts[index === -1 ? DUE_BUCKETS.length - 1 : index]++;
  }
  return counts;
}

export function progressKey(itemId: string, direction: Direction): string {
  return `${itemId}:${direction}`;
}

export function emptyProgress(itemId: string, direction: Direction, now: number): CardProgress {
  return {
    key: progressKey(itemId, direction),
    itemId,
    direction,
    box: 0,
    correct: 0,
    wrong: 0,
    streak: 0,
    lastSeen: 0,
    dueAt: now,
  };
}

export function getProgress(
  progress: ProgressMap,
  itemId: string,
  direction: Direction,
  now: number,
): CardProgress {
  return progress[progressKey(itemId, direction)] ?? emptyProgress(itemId, direction, now);
}

/**
 * Vyhodnocení odpovědi. Správně = posun o box výš a delší odstup,
 * špatně = zpátky na začátek, ať se vrátí hned v tomhle kole.
 */
export function applyAnswer(prev: CardProgress, knew: boolean, now: number): CardProgress {
  const box = knew ? Math.min(MAX_BOX, prev.box + 1) : 0;
  return {
    ...prev,
    box,
    // Odpověď na kartičku odložení ruší – uživatel ji zjevně zkouší dál.
    mastered: false,
    correct: prev.correct + (knew ? 1 : 0),
    wrong: prev.wrong + (knew ? 0 : 1),
    streak: knew ? prev.streak + 1 : 0,
    lastSeen: now,
    dueAt: now + BOX_INTERVALS[box],
  };
}

/**
 * Označí kartičku za naučenou bez zkoušení – rovnou do posledního boxu.
 * Používá se u slov, která uživatel zjevně zná a nechce je opakovat.
 */
export function masterCard(prev: CardProgress, now: number): CardProgress {
  return {
    ...prev,
    box: MAX_BOX,
    mastered: true,
    lastSeen: now,
    dueAt: now + BOX_INTERVALS[MAX_BOX],
  };
}

/**
 * Vrátí kartičku zpátky do opakování – do prvního boxu a rovnou na řadu.
 * Statistiky úspěšnosti zůstávají, ať se neztratí historie.
 */
export function resetCard(prev: CardProgress, now: number): CardProgress {
  // lastSeen se musí posunout, jinak by při synchronizaci z druhého zařízení
  // vyhrál starší odložený záznam a položka by se odložila znovu.
  return { ...prev, box: 0, streak: 0, mastered: false, lastSeen: now, dueAt: now };
}

export function isDue(p: CardProgress, now: number): boolean {
  return p.dueAt <= now;
}

export function isMastered(p: CardProgress): boolean {
  return p.box >= MAX_BOX;
}

/** Kolik se dá čekat, že kartičku umím – 0..1. Používá se pro řazení „nejdřív to, co mi nejde“. */
export function difficultyScore(p: CardProgress): number {
  const attempts = p.correct + p.wrong;
  if (attempts === 0) return 0.5; // nová – střed, ať se nepere s prokázanými problémy
  const errorRate = p.wrong / attempts;
  const boxPenalty = 1 - p.box / MAX_BOX;
  return errorRate * 0.6 + boxPenalty * 0.4;
}

export type DueSummary = {
  total: number;
  due: number;
  newCards: number;
  mastered: number;
  /** Počty kartiček podle boxu, index 0..MAX_BOX. */
  byBox: number[];
};

export function summarize(
  items: Item[],
  directions: Direction[],
  progress: ProgressMap,
  now: number,
): DueSummary {
  const byBox = new Array(MAX_BOX + 1).fill(0);
  let due = 0;
  let newCards = 0;
  let mastered = 0;

  for (const item of items) {
    for (const direction of directions) {
      const p = progress[progressKey(item.id, direction)];
      if (!p) {
        newCards++;
        due++;
        byBox[0]++;
        continue;
      }
      byBox[Math.min(p.box, MAX_BOX)]++;
      if (isDue(p, now)) due++;
      if (isMastered(p)) mastered++;
    }
  }

  return { total: items.length * directions.length, due, newCards, mastered, byBox };
}
