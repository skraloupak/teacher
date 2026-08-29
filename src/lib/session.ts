import { MAX_BOX, difficultyScore, getProgress, isDue, progressKey } from "./srs";
import { directionsOf } from "./settings";
import type { Direction, Item, Lesson, ProgressMap, StudySettings } from "./types";

/** Jedna kartička v kole = položka zkoušená v jednom směru. */
export type Card = {
  key: string;
  item: Item;
  direction: Direction;
};

/** O kolik pozic dál se vrátí kartička, kterou jsem nevěděl. */
const REINSERT_GAP = 4;

export function shuffle<T>(list: T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Vybere kartičky odpovídající nastavení. Deterministické – žádné míchání,
 * takže se dá zavolat i jen pro spočítání, kolik toho v kole bude.
 */
export function selectCards(
  lessons: Lesson[],
  settings: StudySettings,
  progress: ProgressMap,
  now: number,
  marked?: ReadonlySet<string>,
): Card[] {
  const selected = new Set(settings.lessonIds);
  const types = new Set(settings.types);
  const directions = directionsOf(settings.direction);
  const onlyMarked = settings.mode === "marked";

  const items = lessons
    // Zaškrtnutá slovíčka si uživatel vybral ručně, takže je bereme ze všech lekcí.
    .filter((lesson) => onlyMarked || selected.has(lesson.id))
    .flatMap((lesson) => lesson.items)
    .filter((item) => types.has(item.type))
    .filter((item) => !onlyMarked || marked?.has(item.id));

  const cards: Card[] = [];

  for (const item of items) {
    let candidates: Direction[] = directions;

    if (settings.direction === "mixed") {
      // Nechceme každou položku dvakrát – vybereme směr, který mi jde hůř.
      const scored = directions
        .map((direction) => {
          const p = getProgress(progress, item.id, direction, now);
          return { direction, score: difficultyScore(p), due: isDue(p, now) };
        })
        .sort((a, b) => Number(b.due) - Number(a.due) || b.score - a.score);
      candidates = [scored[0].direction];
    }

    for (const direction of candidates) {
      const p = getProgress(progress, item.id, direction, now);
      if (settings.mode === "due" && !isDue(p, now)) continue;
      cards.push({ key: progressKey(item.id, direction), item, direction });
    }
  }

  return cards;
}

/** Kolik kartiček nastavení nabízí a kolik jich do kola opravdu půjde. */
export function previewSize(
  lessons: Lesson[],
  settings: StudySettings,
  progress: ProgressMap,
  now: number,
  marked?: ReadonlySet<string>,
): { available: number; inSession: number } {
  const available = selectCards(lessons, settings, progress, now, marked).length;
  return {
    available,
    inSession: settings.sessionSize ? Math.min(settings.sessionSize, available) : available,
  };
}

/** Sestaví hotovou frontu pro kolo – vybere, seřadí a ořízne. */
export function buildQueue(
  lessons: Lesson[],
  settings: StudySettings,
  progress: ProgressMap,
  now: number,
  marked?: ReadonlySet<string>,
): Card[] {
  const cards = selectCards(lessons, settings, progress, now, marked);

  const ordered =
    settings.mode === "hardest"
      ? [...cards].sort(
          (a, b) =>
            difficultyScore(getProgress(progress, b.item.id, b.direction, now)) -
            difficultyScore(getProgress(progress, a.item.id, a.direction, now)),
        )
      : shuffle(cards);

  return settings.sessionSize ? ordered.slice(0, settings.sessionSize) : ordered;
}

/** Jaký podíl dalšího kola tvoří kartičky, se kterými jsem měl potíže. */
const REVIEW_SHARE = 0.25;

export type NextRoundPlan = {
  queue: Card[];
  /** Kolik kartiček z vybraných lekcí jsem ještě nikdy neviděl. */
  freshRemaining: number;
  /** Kolik jich v tomhle kole je poprvé. */
  freshInRound: number;
  /** Kolik je jich zopakovaných, protože mi dřív nešly. */
  reviewInRound: number;
};

/** Kolik kartiček z vybraných lekcí jsem ještě nikdy neprocvičoval. */
export function countUnpracticed(
  lessons: Lesson[],
  settings: StudySettings,
  progress: ProgressMap,
  now: number,
  marked?: ReadonlySet<string>,
): number {
  return selectCards(lessons, settings, progress, now, marked).filter((card) => !progress[card.key])
    .length;
}

/**
 * Sestaví další kolo ze stejného výběru lekcí: přednost mají kartičky, které jsem
 * ještě neprocvičoval, a mezi ně se přimíchají ty, se kterými jsem měl potíže.
 * Kartičky z právě dohraného kola se přeskakují, ať se nezopakuje totéž.
 *
 * Když už v lekcích nic nového nezbývá, poskládá se běžné kolo.
 */
export function buildNextRound(
  lessons: Lesson[],
  settings: StudySettings,
  progress: ProgressMap,
  now: number,
  marked: ReadonlySet<string> | undefined,
  justPlayed: ReadonlySet<string>,
): NextRoundPlan {
  const all = selectCards(lessons, settings, progress, now, marked);

  const isFresh = (card: Card) => !progress[card.key];
  const needsReview = (card: Card) => {
    const p = progress[card.key];
    return Boolean(p) && p.box < MAX_BOX && (p.wrong > 0 || isDue(p, now));
  };

  const freshRemaining = all.filter(isFresh).length;
  const available = all.filter((card) => !justPlayed.has(card.key));

  const fresh = shuffle(available.filter(isFresh));
  const review = shuffle(available.filter((card) => !isFresh(card) && needsReview(card)));
  const other = shuffle(available.filter((card) => !isFresh(card) && !needsReview(card)));

  const size = settings.sessionSize ?? all.length;

  // Nejdřív novinky, k nim menší porce opakování; když jednoho ubývá, doplní se druhým.
  const reviewTarget = Math.min(Math.ceil(size * REVIEW_SHARE), review.length);
  const freshPart = fresh.slice(0, Math.max(0, size - reviewTarget));
  const reviewPart = review.slice(0, Math.max(0, size - freshPart.length));
  const picked = [...freshPart, ...reviewPart];

  if (picked.length < size) {
    picked.push(...review.slice(reviewPart.length, reviewPart.length + size - picked.length));
  }
  if (picked.length < size) {
    picked.push(...other.slice(0, size - picked.length));
  }
  // Všechno projeté – kolo se prostě zamíchá znovu.
  if (picked.length === 0) {
    return {
      queue: buildQueue(lessons, settings, progress, now, marked),
      freshRemaining,
      freshInRound: 0,
      reviewInRound: 0,
    };
  }

  return {
    queue: shuffle(picked),
    freshRemaining,
    freshInRound: freshPart.length,
    reviewInRound: picked.length - freshPart.length,
  };
}

export type SessionState = {
  /** Fronta kartiček; nesprávné se do ní vracejí znovu. */
  queue: Card[];
  position: number;
  revealed: boolean;
  /**
   * Odpověď „nevím" padla dřív, než byla vidět odpověď – kartička je zodpovězená,
   * ale ještě zůstává na obrazovce, aby se dala přečíst. Čeká se na „Další".
   */
  awaitingNext: boolean;
  /** Klíče kartiček, které už jsem v tomhle kole dal správně. */
  learned: Set<string>;
  /** Klíče, u kterých jsem aspoň jednou chyboval. */
  missed: Set<string>;
  answers: number;
  correct: number;
  wrong: number;
  startedAt: number;
  finishedAt: number | null;
  finished: boolean;
};

export function createSession(queue: Card[], now: number): SessionState {
  return {
    queue,
    position: 0,
    revealed: false,
    awaitingNext: false,
    learned: new Set(),
    missed: new Set(),
    answers: 0,
    correct: 0,
    wrong: 0,
    startedAt: now,
    finishedAt: queue.length === 0 ? now : null,
    finished: queue.length === 0,
  };
}

export type SessionAction =
  | { type: "reveal" }
  | { type: "hide" }
  | { type: "answer"; knew: boolean; now: number }
  | { type: "next"; now: number }
  | { type: "finish"; now: number };

/** Posun na další kartičku ve frontě. */
function advance(state: SessionState, queue: Card[], now: number): SessionState {
  const position = state.position + 1;
  const finished = position >= queue.length;
  return {
    ...state,
    queue,
    position,
    revealed: false,
    awaitingNext: false,
    finished,
    finishedAt: finished ? now : state.finishedAt,
  };
}

export function sessionReducer(
  state: SessionState,
  action: SessionState | SessionAction,
): SessionState {
  if (!("type" in action)) return action;

  switch (action.type) {
    case "reveal":
      return state.revealed ? state : { ...state, revealed: true };

    case "hide":
      // Zpátky na otázku smí jen ten, kdo ještě neodpověděl.
      return state.revealed && !state.awaitingNext ? { ...state, revealed: false } : state;

    case "answer": {
      const card = state.queue[state.position];
      if (!card || state.finished || state.awaitingNext) return state;

      const learned = new Set(state.learned);
      const missed = new Set(state.missed);
      const queue = [...state.queue];

      if (action.knew) {
        learned.add(card.key);
      } else {
        missed.add(card.key);
        learned.delete(card.key);
        // Vrátíme kartičku o kus dál ve frontě, ať se na ni ještě dnes dostane.
        // U poslední kartičky ve frontě to vyjde na konec – tam je opakování hned za sebou
        // jediná možnost, jak kolo dohrát.
        const insertAt = Math.min(state.position + 1 + REINSERT_GAP, queue.length);
        queue.splice(insertAt, 0, card);
      }

      const counted: SessionState = {
        ...state,
        queue,
        learned,
        missed,
        answers: state.answers + 1,
        correct: state.correct + (action.knew ? 1 : 0),
        wrong: state.wrong + (action.knew ? 0 : 1),
      };

      // Nevěděl jsem a ještě jsem odpověď neviděl – otočíme kartu a necháme ji přečíst.
      if (!action.knew && !state.revealed) {
        return { ...counted, revealed: true, awaitingNext: true };
      }

      return advance(counted, queue, action.now);
    }

    case "next":
      if (!state.awaitingNext || state.finished) return state;
      return advance(state, state.queue, action.now);

    case "finish":
      return { ...state, finished: true, finishedAt: state.finishedAt ?? action.now };

    default:
      return state;
  }
}

/** Kolik unikátních kartiček kolo obsahuje a kolik už mám za sebou. */
export function sessionProgress(state: SessionState): { done: number; total: number } {
  const unique = new Set(state.queue.map((card) => card.key));
  return { done: state.learned.size, total: unique.size };
}

/** Text na přední straně kartičky. */
export function promptOf(card: Card): string {
  return card.direction === "en2cs" ? card.item.en : card.item.cs;
}

/** Text na zadní straně kartičky. */
export function answerOf(card: Card): string {
  return card.direction === "en2cs" ? card.item.cs : card.item.en;
}
