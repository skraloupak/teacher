"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useReducer, useRef } from "react";
import { FlashCard, type SwipeIntent } from "@/components/FlashCard";
import { SessionSummary } from "@/components/SessionSummary";
import { Button, ProgressBar } from "@/components/ui";
import { useAppState } from "@/hooks/useAppState";
import { primeAudio, speakEnglish, stopSpeaking } from "@/lib/audio";
import {
  buildQueue,
  createSession,
  sessionProgress,
  sessionReducer,
  shuffle,
  type Card,
} from "@/lib/session";
import type { Lesson } from "@/lib/types";

const EMPTY_SESSION = createSession([], 0);

/** Prvky, které si Enter a mezerník mají odbavit samy. */
const INTERACTIVE = "button, a, input, select, textarea, [contenteditable]";

export function StudyClient({ lessons }: { lessons: Lesson[] }) {
  const router = useRouter();
  const { ready, progress, settings, marked, setMark, recordAnswer, recordSession } =
    useAppState(lessons);

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

  const card: Card | undefined = state.queue[state.position];
  const { done, total } = sessionProgress(state);

  /** Prohlížeče pouštějí zvuk až po dotyku uživatele – odemkneme ho při první interakci. */
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

  const next = useCallback(() => {
    stopSpeaking();
    dispatch({ type: "next", now: Date.now() });
  }, []);

  const flip = useCallback(() => {
    prime();
    dispatch({ type: state.revealed ? "hide" : "reveal" });
  }, [state.revealed, prime]);

  // Uložení kola do statistik – právě jednou, po dokončení.
  useEffect(() => {
    if (!state.finished || savedRef.current || state.answers === 0) return;
    savedRef.current = true;
    const finishedAt = state.finishedAt ?? state.startedAt;
    recordSession({
      id: `${state.startedAt}`,
      finishedAt,
      lessonIds: settings.lessonIds,
      direction: settings.direction,
      types: settings.types,
      total,
      correct: state.correct,
      wrong: state.wrong,
      durationMs: finishedAt - state.startedAt,
    });
  }, [
    state.finished,
    state.finishedAt,
    state.answers,
    state.correct,
    state.wrong,
    state.startedAt,
    total,
    settings,
    recordSession,
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
  }, [state.finished, state.awaitingNext, answer, markAndAnswer, flip, next]);

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

  if (!ready || !started) {
    return <p className="py-16 text-center text-ink-muted">Připravuji kartičky…</p>;
  }

  // Dohrané kolo má přednost před prázdnou frontou, ať se souhrn neztratí.
  if (state.finished && state.answers > 0) {
    return (
      <SessionSummary
        state={state}
        total={total}
        onRepeatMissed={() => restart(true)}
        onRepeatAll={() => restart(false)}
        onHome={() => router.push("/")}
      />
    );
  }

  if (state.queue.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 py-16 text-center">
        <p className="text-lg font-semibold text-ink">Pro tohle nastavení nic nezbylo.</p>
        <p className="max-w-sm text-ink-muted">
          Buď nemáš vybranou žádnou lekci, nebo máš zapnutý výběr „podle plánu“ a všechno už je
          na dnešek hotové.
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
          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="secondary"
              onClick={() => markAndAnswer(true)}
              disabled={state.awaitingNext}
              className="py-2.5 text-sm"
            >
              ↑ Zařadit mezi vybraná
            </Button>
            <Button
              variant="secondary"
              onClick={() => markAndAnswer(false)}
              disabled={state.awaitingNext}
              className="py-2.5 text-sm"
            >
              ↓ Umím, vyřadit
            </Button>
          </div>

          <div className="flex items-center justify-between gap-3 text-sm">
            <Link href="/" className="shrink-0 text-ink-muted hover:text-ink">
              Ukončit kolo
            </Link>
            <span className="hidden text-right text-ink-muted sm:inline">
              ← nevím · → vím · ↑↓ výběr · mezerník otočí
            </span>
            <span className="text-right text-ink-muted sm:hidden">
              tažením do stran odpovíš, nahoru/dolů řídíš výběr
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
