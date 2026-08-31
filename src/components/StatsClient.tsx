"use client";

import { useMemo, useState } from "react";
import { Button, Panel, ProgressBar } from "@/components/ui";
import { useAppState } from "@/hooks/useAppState";
import { DIRECTION_LABELS } from "@/lib/settings";
import { BOX_LABELS, MAX_BOX, isDue } from "@/lib/srs";
import type { Direction, Item, Lesson } from "@/lib/types";

type DirectionStat = {
  touched: number;
  mastered: number;
  /** Z toho odloženo tlačítkem „už umím" – bez jediné odpovědi. */
  setAside: number;
  due: number;
  answered: number;
  successRate: number;
};

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

  /** Rozložení podle boxů bereme dohromady – je to obrázek stavu, ne součet. */
  const byBox = useMemo(() => {
    const counts = new Array(MAX_BOX + 1).fill(0);
    for (const card of liveCards) counts[Math.min(card.box, MAX_BOX)]++;
    return counts;
  }, [liveCards]);

  /**
   * Čísla se počítají zvlášť pro každý směr. Sčítat je dohromady by mátlo:
   * jedno slovíčko je kartička dvakrát a „naučeno 146" pak neodpovídá ničemu,
   * co uživatel vidí při učení.
   */
  const overview = useMemo(() => {
    const forDirection = (direction: Direction) => {
      const cards = liveCards.filter((card) => card.direction === direction);
      const answered = cards.reduce((sum, c) => sum + c.correct + c.wrong, 0);
      const correct = cards.reduce((sum, c) => sum + c.correct, 0);
      return {
        touched: cards.length,
        mastered: cards.filter((c) => c.box >= MAX_BOX).length,
        setAside: cards.filter((c) => c.mastered).length,
        due: now === null ? 0 : cards.filter((c) => isDue(c, now)).length,
        answered,
        successRate: answered > 0 ? Math.round((correct / answered) * 100) : 0,
      };
    };
    return { en2cs: forDirection("en2cs"), cs2en: forDirection("cs2en") };
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

  if (liveCards.length === 0) {
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
      <Panel title="Podle směru">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-ink-muted">
                <th scope="col" className="py-2 text-left font-medium">
                  &nbsp;
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  anglicky → česky
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  česky → anglicky
                </th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ["naučeno", (d: DirectionStat) => d.mastered, "text-good"],
                  ["z toho odloženo", (d: DirectionStat) => d.setAside, "text-ink-muted"],
                  ["rozpracovaných", (d: DirectionStat) => d.touched, "text-ink"],
                  ["čeká na řadě", (d: DirectionStat) => d.due, "text-brand"],
                  ["odpovědí", (d: DirectionStat) => d.answered, "text-ink"],
                  ["úspěšnost", (d: DirectionStat) => `${d.successRate} %`, "text-ink"],
                ] as const
              ).map(([label, pick, tone]) => (
                <tr key={label} className="border-b border-line last:border-0">
                  <th scope="row" className="py-2 text-left font-normal text-ink-muted">
                    {label}
                  </th>
                  <td className={`py-2 text-right font-semibold tabular-nums ${tone}`}>
                    {pick(overview.en2cs)}
                  </td>
                  <td className={`py-2 text-right font-semibold tabular-nums ${tone}`}>
                    {pick(overview.cs2en)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm text-ink-muted">
          Každé slovíčko je kartička dvakrát – zvlášť pro každý směr. Čísla se proto
          nesčítají; na úvodní obrazovce vidíš ten směr, který máš nastavený. Odložená
          slovíčka („už umím“) se počítají do obou směrů, i když jsi je v jednom z nich
          nikdy nezkoušel.
        </p>
      </Panel>

      <Panel title="Rozložení podle boxů">
        <ul className="flex flex-col gap-2">
          {byBox.map((count, box) => (
            <li key={box} className="flex items-center gap-3">
              <span className="w-28 shrink-0 text-sm text-ink-muted">{BOX_LABELS[box]}</span>
              <div className="flex-1">
                <ProgressBar value={count} max={liveCards.length} />
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
