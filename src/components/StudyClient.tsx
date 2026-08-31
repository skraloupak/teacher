"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useReducer, useRef } from "react";
import { FlashCard, type SwipeIntent } from "@/components/FlashCard";
import { GoalBanner } from "@/components/GoalBanner";
import { SessionSummary } from "@/components/SessionSummary";
import { Button, ProgressBar } from "@/components/ui";
import { useAuth } from "@/components/AuthGate";
import { useAppState } from "@/hooks/useAppState";
import { useDailyGoal } from "@/hooks/useDailyGoal";
import { localDate } from "@/lib/daily";
import { primeAudio, speakEnglish, stopSpeaking } from "@/lib/audio";
import {
  buildNextRound,
  buildQueue,
  countUnpracticed,
  createSession,
  sessionProgress,
  sessionReducer,
  shuffle,
  type Card,
} from "@/lib/session";
import type { Lesson, SessionRecord } from "@/lib/types";

const EMPTY_SESSION = createSession([], 0);

/** Prvky, které si Enter a mezerník mají odbavit samy. */
const INTERACTIVE = "button, a, input, select, textarea, [contenteditable]";

/** Čtvercové tlačítko s ikonou. Význam nese popisek pro odečítač i bublinovou nápovědu. */
function IconAction({
  label,
  onClick,
  disabled,
  tone = "muted",
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "muted" | "brand" | "good";
  children: React.ReactNode;
}) {
  const hover =
    tone === "brand"
      ? "hover:border-brand/60 hover:text-brand"
      : tone === "good"
        ? "hover:border-good/60 hover:text-good"
        : "hover:border-ink-muted/60 hover:text-ink";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`no-tap-zoom flex h-12 w-12 items-center justify-center rounded-2xl border border-line bg-surface-raised text-ink-muted transition-colors focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none disabled:opacity-40 ${hover}`}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
        {children}
      </svg>
    </button>
  );
}

export function StudyClient({ lessons }: { lessons: Lesson[] }) {
  const router = useRouter();
  const { user } = useAuth();
  const {
    ready,
    progress,
    settings,
    sessions,
    marked,
    setMark,
    recordAnswer,
    markMastered,
    recordSession,
  } = useAppState(lessons);

  const goal = useDailyGoal(sessions, settings.dailyGoalMinutes, user?.email ?? null);

  const [state, dispatch] = useReducer(sessionReducer, EMPTY_SESSION);
  const startedRef = useRef(false);
  const savedRef = useRef(false);
  const primedRef = useRef(false);
  // Dokud nebyla fronta sestavená, drží reducer sdílený prázdný stav.
  const started = state !== EMPTY_SESSION;

  // Kolo sestavíme jednou, až jsou načtená data. Změna pokroku uprostřed kola ho nepřestaví.
  useEffect(() => {
    if (!ready || startedRef.current) return;
    startedRef.current = true;
    const now = Date.now();
    dispatch(createSession(buildQueue(lessons, settings, progress, now, marked), now));
  }, [ready, lessons, settings, progress, marked]);

  useEffect(() => stopSpeaking, []);

  // Aktuální stav pro úklidový efekt níž – ten běží až při odchodu a viděl by jinak stav z mountu.
  const liveRef = useRef({ state, settings, total: 0, recordSession });
  useEffect(() => {
    liveRef.current = { state, settings, total: sessionProgress(state).total, recordSession };
  });

  // Odchod z rozdělaného kola: zapíšeme, co se stihlo, ať naměřený čas nepropadne.
  useEffect(
    () => () => {
      const { state: last, settings: lastSettings, total: lastTotal, recordSession: save } =
        liveRef.current;
      if (last.finished || savedRef.current || last.answers === 0) return;
      savedRef.current = true;
      const finishedAt = Date.now();
      save({
        id: `${last.startedAt}`,
        finishedAt,
        lessonIds: [...new Set(last.queue.map((card) => card.item.lessonId))],
        direction: lastSettings.direction,
        types: lastSettings.types,
        total: lastTotal,
        correct: last.correct,
        wrong: last.wrong,
        durationMs: finishedAt - last.startedAt,
        activeMs: last.activeMs,
        date: localDate(finishedAt),
      });
    },
    [],
  );

  const card: Card | undefined = state.queue[state.position];
  const { done, total } = sessionProgress(state);

  /**
   * Prohlížeče pouštějí zvuk až po dotyku uživatele. Odemykáme ho při první interakci;
   * u kola spuštěného tlačítkem „Spustit" je odemčeno už z úvodní obrazovky.
   */
  const prime = useCallback(() => {
    if (primedRef.current) return;
    primedRef.current = true;
    primeAudio();
  }, []);

  // Automatické přehrání – anglická strana se ozve, jakmile je vidět.
  useEffect(() => {
    if (!settings.autoPlayAudio || !card || state.finished) return;
    const englishVisible = card.direction === "en2cs" ? !state.revealed : state.revealed;
    if (englishVisible) speakEnglish(card.item);
  }, [card, state.revealed, state.finished, settings.autoPlayAudio]);

  const answer = useCallback(
    (knew: boolean) => {
      if (!card || state.finished || state.awaitingNext) return;
      prime();
      stopSpeaking();
      recordAnswer(card.item.id, card.direction, knew);
      dispatch({ type: "answer", knew, now: Date.now() });
    },
    [card, state.finished, state.awaitingNext, recordAnswer, prime],
  );

  /**
   * Svislá gesta pracují se seznamem vybraných:
   * nahoru = chci to opakovat častěji (zaškrtne a počítá se jako chyba),
   * dolů = tohle už umím (odškrtne a počítá se jako správně).
   */
  const markAndAnswer = useCallback(
    (keep: boolean) => {
      if (!card || state.finished || state.awaitingNext) return;
      setMark(card.item.id, keep);
      answer(!keep);
    },
    [card, state.finished, state.awaitingNext, setMark, answer],
  );

  const onSwipe = useCallback(
    (intent: SwipeIntent) => {
      if (intent === "know") answer(true);
      else if (intent === "dontKnow") answer(false);
      else markAndAnswer(intent === "keep");
    },
    [answer, markAndAnswer],
  );

  /** „Tohle už umím" – kartička se odloží jako naučená a z kola zmizí. */
  const master = useCallback(() => {
    if (!card || state.finished || state.awaitingNext) return;
    stopSpeaking();
    markMastered(card.item.id);
    dispatch({ type: "master", now: Date.now() });
  }, [card, state.finished, state.awaitingNext, markMastered]);

  const next = useCallback(() => {
    stopSpeaking();
    dispatch({ type: "next", now: Date.now() });
  }, []);

  const flip = useCallback(() => {
    prime();
    dispatch({ type: state.revealed ? "hide" : "reveal", now: Date.now() });
  }, [state.revealed, prime]);

  // Uložení kola do statistik – právě jednou, po dokončení.
  useEffect(() => {
    if (!state.finished || savedRef.current || state.answers === 0) return;
    savedRef.current = true;
    const finishedAt = state.finishedAt ?? state.startedAt;
    const record: SessionRecord = {
      id: `${state.startedAt}`,
      finishedAt,
      // Lekce bereme z odehrané fronty, ne z výběru – v režimu „Vybrané" se zkouší
      // napříč všemi lekcemi bez ohledu na to, co je zaškrtnuté na úvodní obrazovce.
      lessonIds: [...new Set(state.queue.map((card) => card.item.lessonId))],
      direction: settings.direction,
      types: settings.types,
      total,
      correct: state.correct,
      wrong: state.wrong,
      durationMs: finishedAt - state.startedAt,
      activeMs: state.activeMs,
      date: localDate(finishedAt),
    };
    recordSession(record);
    goal.checkCelebration(record);
  }, [
    state.finished,
    state.finishedAt,
    state.answers,
    state.correct,
    state.wrong,
    state.startedAt,
    state.activeMs,
    state.queue,
    total,
    settings,
    recordSession,
    goal,
  ]);

  // Klávesnice pro pohodlné učení na počítači.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (state.finished) return;
      // Držená klávesa nesmí odpovídat za uživatele.
      if (event.repeat || event.defaultPrevented || event.isComposing) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const target = event.target as HTMLElement | null;
      const onControl = Boolean(target?.closest(INTERACTIVE));

      if (state.awaitingNext) {
        if (event.key === " " || event.key === "Enter" || event.key === "ArrowRight") {
          if (onControl) return;
          event.preventDefault();
          next();
        }
        return;
      }

      if (event.key === "ArrowLeft" || event.key === "1") {
        event.preventDefault();
        answer(false);
      } else if (event.key === "ArrowRight" || event.key === "2") {
        event.preventDefault();
        answer(true);
      } else if (event.key === "k" || event.key === "K") {
        event.preventDefault();
        master();
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        markAndAnswer(true);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        markAndAnswer(false);
      } else if (event.key === " " || event.key === "Enter") {
        // Enter a mezerník patří zaostřenému tlačítku – ať si svou akci odbaví samo.
        if (onControl) return;
        event.preventDefault();
        flip();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.finished, state.awaitingNext, answer, markAndAnswer, master, flip, next]);

  /** Další kolo ze stejných lekcí – hlavně to, co jsem ještě neviděl. */
  function nextRound() {
    const now = Date.now();
    const justPlayed = new Set(state.queue.map((item) => item.key));
    const plan = buildNextRound(lessons, settings, progress, now, marked, justPlayed);
    savedRef.current = false;
    dispatch(createSession(plan.queue, now));
  }

  function restart(onlyMissed: boolean) {
    const now = Date.now();
    let queue: Card[];
    if (onlyMissed) {
      // Chyby opakujeme z karet, které v kole opravdu byly. Nové sestavení fronty by je
      // oříznulo na délku kola a v režimu „podle plánu" by je vyhodilo úplně –
      // po opravě mají box 1, takže na řadu přijdou až za deset minut.
      const byKey = new Map<string, Card>();
      for (const item of state.queue) {
        if (state.missed.has(item.key)) byKey.set(item.key, item);
      }
      queue = shuffle([...byKey.values()]);
    } else {
      queue = buildQueue(lessons, settings, progress, now, marked);
    }
    savedRef.current = false;
    dispatch(createSession(queue, now));
  }

  const celebration = goal.celebrating ? (
    <GoalBanner
      activeMs={goal.activeMs}
      goalMs={goal.goalMs}
      streak={goal.streak}
      onClose={goal.dismiss}
    />
  ) : null;

  if (!ready || !started) {
    return <p className="py-16 text-center text-ink-muted">Připravuji kartičky…</p>;
  }

  // Dohrané kolo má přednost před prázdnou frontou, ať se souhrn neztratí.
  if (state.finished && state.answers > 0) {
    return (
      <>
        {celebration}
        <SessionSummary
        state={state}
        total={total}
        unpracticed={countUnpracticed(
          lessons,
          settings,
          progress,
          state.finishedAt ?? state.startedAt,
          marked,
        )}
        onNextRound={nextRound}
        onRepeatMissed={() => restart(true)}
          onRepeatAll={() => restart(false)}
          onHome={() => router.push("/")}
        />
      </>
    );
  }

  if (state.queue.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 py-16 text-center">
        <p className="text-lg font-semibold text-ink">Teď není co opakovat.</p>
        <p className="max-w-sm text-ink-muted">
          {settings.mode === "due"
            ? "Všechno z vybraných lekcí už jsi dal a kartičky čekají na svůj odstup – právě proto si je zapamatuješ. Přiber si další lekce, nebo přepni výběr na „Náhodně“."
            : "Buď nemáš vybranou žádnou lekci, nebo z ní po filtrech nic nezbylo."}
        </p>
        <Link href="/">
          <Button variant="secondary">Zpět na nastavení</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4 py-2">
      <div>
        <div className="mb-2 flex items-center justify-between text-sm text-ink-muted">
          <span className="tabular-nums">
            {done} / {total}
          </span>
          <span className="flex items-center gap-3 tabular-nums">
            <span className="text-good">✓ {state.correct}</span>
            <span className="text-bad">✗ {state.wrong}</span>
          </span>
        </div>
        <ProgressBar value={done} max={total} />
      </div>

      <div className="flex flex-1 items-center">
        <FlashCard
          key={`${card!.key}-${state.position}`}
          card={card!}
          revealed={state.revealed}
          locked={state.awaitingNext}
          marked={marked.has(card!.item.id)}
          onFlip={flip}
          onSwipe={onSwipe}
        />
      </div>

      <div className="flex flex-col gap-3">
        {state.awaitingNext ? (
          <Button onClick={next} className="w-full py-4">
            Další kartička
          </Button>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Button variant="bad" onClick={() => answer(false)} className="py-4">
              Nevím
            </Button>
            <Button variant="good" onClick={() => answer(true)} className="py-4">
              Vím
            </Button>
          </div>
        )}

        <div className="flex flex-col gap-2">
          {/* Tři doplňkové akce jen jako ikony – hlavní odpověď obstarají tlačítka nad nimi. */}
          <div className="flex items-center justify-center gap-2">
            <IconAction
              label="Zařadit mezi vybraná – budu to chtít opakovat častěji"
              onClick={() => markAndAnswer(true)}
              disabled={state.awaitingNext}
              tone="brand"
            >
              <path
                d="M12 4v13m0-13 5 5m-5-5-5 5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path d="M5 20h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </IconAction>

            <IconAction
              label="Tohle umím – vyřadit z vybraných"
              onClick={() => markAndAnswer(false)}
              disabled={state.awaitingNext}
            >
              <path
                d="M12 20V7m0 13 5-5m-5 5-5-5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path d="M5 4h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </IconAction>

            <IconAction
              label="Tohle už umím – neopakovat (klávesa K)"
              onClick={master}
              disabled={state.awaitingNext}
              tone="good"
            >
              <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.8" />
              <path
                d="m8.5 12 2.5 2.5 4.5-5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </IconAction>
          </div>

          <div className="flex items-center justify-between gap-3 text-sm">
            <Link href="/" className="shrink-0 text-ink-muted hover:text-ink">
              Ukončit kolo
            </Link>
            <span className="hidden text-right text-ink-muted sm:inline">
              ← nevím · → vím · ↑↓ výběr · K už umím
            </span>
            <span className="text-right text-ink-muted sm:hidden">
              odpovíš i tažením karty
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
