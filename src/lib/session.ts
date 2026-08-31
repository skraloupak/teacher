import { MAX_BOX, difficultyScore, getProgress, isDue, isMastered, progressKey } from "./srs";
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

/**
 * Nejdelší mezera mezi dvěma úkony, která se ještě počítá do času učení.
 * Delší pauza znamená, že uživatel odešel – do statistik se pak započítá jen strop.
 */
const IDLE_CAP_MS = 60_000;

export function shuffle<T>(list: T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Kartičky z vybraných lekcí bez ohledu na to, jestli jsou zrovna na řadě.
 * Vynechává jen položky ručně odložené jako „už umím" – ty se nevrací nikdy.
 */
function selectCandidates(
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
      // Odložené směry do výběru vůbec nevstupují.
      const scored = directions
        .map((direction) => getProgress(progress, item.id, direction, now))
        .filter((p) => !p.mastered)
        .map((p) => ({ direction: p.direction, score: difficultyScore(p), due: isDue(p, now) }))
        .sort((a, b) => Number(b.due) - Number(a.due) || b.score - a.score);
      if (scored.length === 0) continue;
      candidates = [scored[0].direction];
    }

    for (const direction of candidates) {
      const p = getProgress(progress, item.id, direction, now);
      // „Tohle už umím" platí napořád, ne jen do konce kola.
      if (p.mastered) continue;
      cards.push({ key: progressKey(item.id, direction), item, direction });
    }
  }

  return cards;
}

/**
 * Vybere kartičky, které se mají zkoušet. Deterministické – žádné míchání,
 * takže se dá zavolat i jen pro spočítání, kolik toho v kole bude.
 *
 * Naučené kartičky (poslední box) se nenabízejí; výjimkou je režim „Podle plánu",
 * kde se po svém odstupu vrátí ke kontrole.
 */
export function selectCards(
  lessons: Lesson[],
  settings: StudySettings,
  progress: ProgressMap,
  now: number,
  marked?: ReadonlySet<string>,
): Card[] {
  return selectCandidates(lessons, settings, progress, now, marked).filter((card) => {
    const p = getProgress(progress, card.item.id, card.direction, now);
    return settings.mode === "due" ? isDue(p, now) : !isMastered(p);
  });
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

/**
 * Kdy přijde na řadu nejbližší kartička z vybraných lekcí – bez ohledu na režim.
 * Když je co dělat hned, vrací aktuální čas; když už není co opakovat, null.
 */
export function nextDueAt(
  lessons: Lesson[],
  settings: StudySettings,
  progress: ProgressMap,
  now: number,
  marked?: ReadonlySet<string>,
): number | null {
  // Termín nás zajímá i u kartiček, které zvolený režim zrovna odfiltroval –
  // včetně naučených, ty se v plánu opakování po svém odstupu vrátí.
  const cards = selectCandidates(lessons, settings, progress, now, marked);

  let soonest: number | null = null;
  for (const card of cards) {
    const p = progress[card.key];
    const due = p ? p.dueAt : now;
    if (soonest === null || due < soonest) soonest = due;
  }
  return soonest;
}

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
  /** Klíče odložené jako „tohle už umím" – z kola vypadly bez zkoušení. */
  mastered: Set<string>;
  answers: number;
  correct: number;
  wrong: number;
  startedAt: number;
  finishedAt: number | null;
  /** Nasčítaný čas skutečného učení, bez dlouhých pauz. */
  activeMs: number;
  /** Kdy naposledy uživatel něco udělal – od toho se měří další úsek. */
  lastActionAt: number;
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
    mastered: new Set(),
    answers: 0,
    correct: 0,
    wrong: 0,
    startedAt: now,
    finishedAt: queue.length === 0 ? now : null,
    activeMs: 0,
    lastActionAt: now,
    finished: queue.length === 0,
  };
}

export type SessionAction =
  | { type: "master"; now: number }
  | { type: "reveal"; now: number }
  | { type: "hide"; now: number }
  | { type: "answer"; knew: boolean; now: number }
  | { type: "next"; now: number }
  | { type: "finish"; now: number };

/** Přičte čas od poslední akce. Dlouhá pauza se ořízne, ať se čas učení nenafukuje. */
function tick(state: SessionState, now: number): SessionState {
  const elapsed = Math.max(0, now - state.lastActionAt);
  return {
    ...state,
    activeMs: state.activeMs + Math.min(elapsed, IDLE_CAP_MS),
    lastActionAt: now,
  };
}

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
      return state.revealed ? state : { ...tick(state, action.now), revealed: true };

    case "hide":
      // Zpátky na otázku smí jen ten, kdo ještě neodpověděl.
      return state.revealed && !state.awaitingNext
        ? { ...tick(state, action.now), revealed: false }
        : state;

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
        ...tick(state, action.now),
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

    case "master": {
      const card = state.queue[state.position];
      if (!card || state.finished) return state;

      // Kartička opouští kolo úplně – i případné další výskyty, které v něm čekají.
      const queue = state.queue.filter(
        (item, index) => index < state.position || item.key !== card.key,
      );
      const mastered = new Set(state.mastered);
      mastered.add(card.key);
      const missed = new Set(state.missed);
      missed.delete(card.key);
      const learned = new Set(state.learned);
      learned.delete(card.key);

      // Na uvolněné místo se posunula další kartička, pozice zůstává.
      const finished = state.position >= queue.length;
      return {
        ...tick(state, action.now),
        queue,
        mastered,
        missed,
        learned,
        revealed: false,
        awaitingNext: false,
        finished,
        finishedAt: finished ? action.now : state.finishedAt,
      };
    }

    case "next":
      if (!state.awaitingNext || state.finished) return state;
      return advance(tick(state, action.now), state.queue, action.now);

    case "finish":
      return { ...state, finished: true, finishedAt: state.finishedAt ?? action.now };

    default:
      return state;
  }
}

/**
 * Kolik unikátních kartiček kolo obsahuje a kolik už mám za sebou.
 * Odložené („tohle už umím") se počítají do obojího – z fronty sice zmizely,
 * ale ukazatel průběhu se kvůli tomu nesmí vrátit zpátky.
 */
export function sessionProgress(state: SessionState): { done: number; total: number } {
  // Odložená kartička může mít ve frontě ještě svůj dřívější, už odbytý výskyt –
  // ten by se sečetl s `mastered` a tatáž kartička by se do součtu započítala dvakrát.
  const unique = new Set(
    state.queue.map((card) => card.key).filter((key) => !state.mastered.has(key)),
  );
  return {
    done: state.learned.size + state.mastered.size,
    total: unique.size + state.mastered.size,
  };
}

/** Text na přední straně kartičky. */
export function promptOf(card: Card): string {
  return card.direction === "en2cs" ? card.item.en : card.item.cs;
}

/** Text na zadní straně kartičky. */
export function answerOf(card: Card): string {
  return card.direction === "en2cs" ? card.item.cs : card.item.en;
}
