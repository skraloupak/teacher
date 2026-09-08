"use client";

import { useMemo, useState } from "react";
import { Button, Panel, ProgressBar } from "@/components/ui";
import type { GrammarQuestion } from "@/lib/types";

/**
 * Krátký test k jednomu gramatickému tématu. Doplňovačka s výběrem – u gramatiky
 * jde o rozhodnutí mezi dvěma tvary, takže kartička s otočením by nedávala smysl.
 * Po odpovědi se hned ukáže, proč je správně; to je na učení to podstatné.
 */
export function GrammarQuiz({ questions }: { questions: GrammarQuestion[] }) {
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [done, setDone] = useState(false);

  const question = questions[index];
  const answered = picked !== null;
  const isRight = answered && picked === question.correct;

  /** Věta rozdělená kolem mezery k doplnění, ať se dá zvýraznit. */
  const [before, after] = useMemo(() => {
    const parts = question.prompt.split(/_{2,}/);
    return [parts[0] ?? question.prompt, parts[1] ?? ""];
  }, [question.prompt]);

  function pick(option: number) {
    if (answered) return;
    setPicked(option);
    if (option === question.correct) setCorrectCount((n) => n + 1);
  }

  function next() {
    if (index + 1 >= questions.length) {
      setDone(true);
      return;
    }
    setIndex((i) => i + 1);
    setPicked(null);
  }

  function restart() {
    setIndex(0);
    setPicked(null);
    setCorrectCount(0);
    setDone(false);
  }

  if (done) {
    const rate = Math.round((correctCount / questions.length) * 100);
    return (
      <Panel>
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <p className="text-4xl font-bold tabular-nums text-ink">{rate} %</p>
          <p className="text-ink-muted">
            {correctCount} z {questions.length} správně
          </p>
          <Button onClick={restart} className="mt-1">
            Zkusit znovu
          </Button>
        </div>
      </Panel>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="mb-2 flex items-center justify-between text-sm text-ink-muted">
          <span className="tabular-nums">
            {index + 1} / {questions.length}
          </span>
          <span className="tabular-nums text-good">✓ {correctCount}</span>
        </div>
        <ProgressBar value={index + (answered ? 1 : 0)} max={questions.length} />
      </div>

      <Panel>
        <p className="text-xl leading-relaxed text-balance text-ink">
          {before}
          <span
            className={`mx-1 inline-block min-w-16 rounded-lg px-2 text-center ${
              answered
                ? isRight
                  ? "bg-good-soft text-good"
                  : "bg-bad-soft text-bad"
                : "bg-surface-sunken text-ink-muted"
            }`}
          >
            {answered ? question.options[question.correct] : "…"}
          </span>
          {after}
        </p>

        <div className="mt-4 flex flex-col gap-2">
          {question.options.map((option, i) => {
            const isCorrectOne = i === question.correct;
            const isPicked = i === picked;

            const look = !answered
              ? "border-line bg-surface-raised text-ink hover:border-brand/60"
              : isCorrectOne
                ? "border-good bg-good-soft text-good"
                : isPicked
                  ? "border-bad bg-bad-soft text-bad"
                  : "border-line bg-surface-raised text-ink-muted opacity-60";

            return (
              <button
                key={option}
                type="button"
                onClick={() => pick(i)}
                disabled={answered}
                className={`no-tap-zoom flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left text-base font-medium transition-colors disabled:cursor-default ${look}`}
              >
                <span>{option}</span>
                {answered && isCorrectOne && <span aria-hidden>✓</span>}
                {answered && isPicked && !isCorrectOne && <span aria-hidden>✗</span>}
              </button>
            );
          })}
        </div>

        {answered && (
          <div
            role="status"
            className={`mt-3 rounded-2xl px-4 py-3 text-sm ${
              isRight ? "bg-good-soft text-ink" : "bg-surface-sunken text-ink"
            }`}
          >
            <p className="font-semibold">{isRight ? "Správně." : "Vedle."}</p>
            <p className="mt-0.5 text-ink-muted">{question.explain}</p>
          </div>
        )}
      </Panel>

      {answered && (
        <Button onClick={next} className="w-full py-4">
          {index + 1 >= questions.length ? "Ukázat výsledek" : "Další otázka"}
        </Button>
      )}
    </div>
  );
}
