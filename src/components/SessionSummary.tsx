"use client";

import { Button, Panel } from "@/components/ui";
import type { SessionState } from "@/lib/session";

function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes} min ${seconds} s` : `${seconds} s`;
}

export function SessionSummary({
  state,
  total,
  onRepeatMissed,
  onRepeatAll,
  onHome,
}: {
  state: SessionState;
  total: number;
  onRepeatMissed: () => void;
  onRepeatAll: () => void;
  onHome: () => void;
}) {
  const successRate = state.answers > 0 ? Math.round((state.correct / state.answers) * 100) : 0;
  const missedCount = state.missed.size;

  return (
    <div className="flex flex-1 flex-col justify-center gap-4 py-6">
      <div className="text-center">
        <p className="text-sm font-medium tracking-wide text-ink-muted uppercase">Kolo hotovo</p>
        <p className="mt-1 text-5xl font-bold tabular-nums text-ink">{successRate} %</p>
        <p className="mt-1 text-ink-muted">
          {state.correct} správně z {state.answers} odpovědí
        </p>
      </div>

      <Panel>
        <dl className="grid grid-cols-3 gap-2 text-center">
          <div>
            <dt className="text-xs text-ink-muted">kartiček</dt>
            <dd className="text-xl font-bold tabular-nums text-ink">{total}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-muted">chybovalo</dt>
            <dd className="text-xl font-bold tabular-nums text-bad">{missedCount}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-muted">čas</dt>
            <dd className="text-xl font-bold tabular-nums text-ink">
              {formatDuration((state.finishedAt ?? state.startedAt) - state.startedAt)}
            </dd>
          </div>
        </dl>
      </Panel>

      {missedCount > 0 && (
        <Panel title="Nešlo ti">
          <ul className="flex flex-col gap-1.5">
            {[...state.missed].slice(0, 12).map((key) => {
              const card = state.queue.find((c) => c.key === key);
              if (!card) return null;
              return (
                <li key={key} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-medium text-ink">{card.item.en}</span>
                  <span className="text-right text-ink-muted">{card.item.cs}</span>
                </li>
              );
            })}
            {missedCount > 12 && (
              <li className="text-sm text-ink-muted">a další {missedCount - 12}…</li>
            )}
          </ul>
        </Panel>
      )}

      <div className="flex flex-col gap-2">
        {missedCount > 0 && (
          <Button onClick={onRepeatMissed} className="w-full py-4">
            Zopakovat chyby ({missedCount})
          </Button>
        )}
        <Button variant="secondary" onClick={onRepeatAll} className="w-full">
          Ještě jednou celé kolo
        </Button>
        <Button variant="ghost" onClick={onHome} className="w-full">
          Zpět na nastavení
        </Button>
      </div>
    </div>
  );
}
