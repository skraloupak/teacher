"use client";

import { useMemo, useState } from "react";
import { Button, Panel, ProgressBar } from "@/components/ui";
import { useAppState } from "@/hooks/useAppState";
import { DIRECTION_LABELS } from "@/lib/settings";
import { BOX_LABELS, MAX_BOX, isDue } from "@/lib/srs";
import type { Item, Lesson } from "@/lib/types";

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("cs-CZ", {
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function StatsClient({ lessons }: { lessons: Lesson[] }) {
  const { ready, loadedAt: now, progress, sessions, resetProgress } = useAppState(lessons);
  const [confirmReset, setConfirmReset] = useState(false);

  const itemsById = useMemo(() => {
    const map = new Map<string, Item>();
    for (const lesson of lessons) for (const item of lesson.items) map.set(item.id, item);
    return map;
  }, [lessons]);

  /** Jen kartičky, ke kterým pořád existuje položka v lekcích. */
  const liveCards = useMemo(
    () => Object.values(progress).filter((card) => itemsById.has(card.itemId)),
    [progress, itemsById],
  );

  const orphanCount = Object.keys(progress).length - liveCards.length;

  const overview = useMemo(() => {
    const cards = liveCards;
    const byBox = new Array(MAX_BOX + 1).fill(0);
    let due = 0;
    for (const card of cards) {
      byBox[Math.min(card.box, MAX_BOX)]++;
      if (now !== null && isDue(card, now)) due++;
    }
    const answered = cards.reduce((sum, c) => sum + c.correct + c.wrong, 0);
    const correct = cards.reduce((sum, c) => sum + c.correct, 0);
    return {
      touched: cards.length,
      mastered: byBox[MAX_BOX],
      due,
      byBox,
      answered,
      successRate: answered > 0 ? Math.round((correct / answered) * 100) : 0,
    };
  }, [liveCards, now]);

  const hardest = useMemo(
    () =>
      liveCards
        .filter((card) => card.wrong > 0)
        .sort((a, b) => b.wrong - a.wrong || a.box - b.box)
        .slice(0, 15),
    [liveCards],
  );

  const recentSessions = useMemo(() => [...sessions].reverse().slice(0, 8), [sessions]);

  if (!ready) return <p className="py-16 text-center text-ink-muted">Načítám…</p>;

  if (overview.touched === 0) {
    return (
      <Panel className="mt-4">
        <p className="text-ink">
          Zatím tu nic není. Spusť první kolo a statistiky se začnou plnit.
        </p>
      </Panel>
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-8">
      <Panel title="Celkem">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Metric value={overview.touched} label="rozpracovaných" />
          <Metric value={overview.mastered} label="naučeno" tone="good" />
          <Metric value={overview.due} label="čeká na řadě" tone="brand" />
          <Metric value={`${overview.successRate} %`} label="úspěšnost" />
        </div>
      </Panel>

      <Panel title="Rozložení podle boxů">
        <ul className="flex flex-col gap-2">
          {overview.byBox.map((count, box) => (
            <li key={box} className="flex items-center gap-3">
              <span className="w-28 shrink-0 text-sm text-ink-muted">{BOX_LABELS[box]}</span>
              <div className="flex-1">
                <ProgressBar value={count} max={overview.touched} />
              </div>
              <span className="w-8 shrink-0 text-right text-sm tabular-nums text-ink-muted">
                {count}
              </span>
            </li>
          ))}
        </ul>
      </Panel>

      {hardest.length > 0 && (
        <Panel title="Co mi nejde">
          <ul className="flex flex-col divide-y divide-line">
            {hardest.map((card) => {
              const item = itemsById.get(card.itemId)!;
              return (
                <li key={card.key} className="flex items-baseline justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink">{item.en}</p>
                    <p className="truncate text-sm text-ink-muted">{item.cs}</p>
                  </div>
                  <div className="shrink-0 text-right text-sm tabular-nums">
                    <span className="text-bad">{card.wrong}×</span>{" "}
                    <span className="text-ink-muted">
                      / {card.correct + card.wrong}
                    </span>
                    <p className="text-xs text-ink-muted">
                      {card.direction === "en2cs" ? "en→cs" : "cs→en"}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}

      {recentSessions.length > 0 && (
        <Panel title="Poslední kola">
          <ul className="flex flex-col divide-y divide-line">
            {recentSessions.map((session) => (
              <li key={session.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">{formatDate(session.finishedAt)}</p>
                  <p className="truncate text-xs text-ink-muted">
                    {DIRECTION_LABELS[session.direction]} · {session.total} kartiček
                  </p>
                </div>
                <span className="shrink-0 text-sm tabular-nums">
                  <span className="text-good">{session.correct}</span>
                  <span className="text-ink-muted"> / </span>
                  <span className="text-bad">{session.wrong}</span>
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {orphanCount > 0 && (
        <p className="px-1 text-sm text-ink-muted">
          V úložišti je {orphanCount} záznamů k položkám, které už v lekcích nejsou (po úpravě
          dat). Do statistik se nepočítají; smazat je můžeš tlačítkem níž.
        </p>
      )}

      <Panel title="Vynulovat">
        {confirmReset ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-ink-muted">
              Smaže se celý pokrok i historie kol. Nastavení zůstane. Tohle nejde vrátit.
            </p>
            <div className="flex gap-2">
              <Button
                variant="bad"
                onClick={async () => {
                  await resetProgress();
                  setConfirmReset(false);
                }}
              >
                Ano, smazat
              </Button>
              <Button variant="ghost" onClick={() => setConfirmReset(false)}>
                Zrušit
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="secondary" onClick={() => setConfirmReset(true)}>
            Smazat pokrok
          </Button>
        )}
      </Panel>
    </div>
  );
}

function Metric({
  value,
  label,
  tone = "ink",
}: {
  value: number | string;
  label: string;
  tone?: "ink" | "brand" | "good";
}) {
  const color = tone === "brand" ? "text-brand" : tone === "good" ? "text-good" : "text-ink";
  return (
    <div className="rounded-2xl bg-surface-sunken px-3 py-3 text-center">
      <div className={`text-2xl font-bold tabular-nums ${color}`}>{value}</div>
      <div className="text-xs text-ink-muted">{label}</div>
    </div>
  );
}
