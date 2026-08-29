"use client";

import { formatDay, formatDuration } from "@/lib/daily";
import type { DayStat } from "@/lib/types";

/**
 * Denní čas učení za poslední dva týdny. Jeden sloupec = jeden den, vodorovná
 * čára je denní cíl.
 *
 * Splněné dny se neliší jen barvou – dostanou i značku nad sloupcem, aby byly
 * poznat i pro toho, kdo barvy nerozliší.
 */
export function DailyChart({
  days,
  goalMs,
  today,
}: {
  days: DayStat[];
  goalMs: number;
  today: string;
}) {
  const peak = Math.max(goalMs, ...days.map((day) => day.activeMs));
  // Nad nejvyšším sloupcem necháme místo, ať se značka a popisek nedotýkají okraje.
  const scale = peak * 1.15;
  const goalRatio = scale > 0 ? goalMs / scale : 0;

  return (
    <figure className="m-0">
      <p className="mb-1 text-right text-[11px] text-ink-muted">
        čárka = denní cíl {Math.round(goalMs / 60_000)} min
      </p>
      <div className="relative h-44 w-full">
        {/* Čára denního cíle */}
        <div
          className="pointer-events-none absolute inset-x-0 border-t border-dashed border-ink-muted/50"
          style={{ bottom: `${goalRatio * 100}%` }}
          aria-hidden
        />

        <div className="flex h-full items-end gap-[2px]">
          {days.map((day) => {
            const reached = day.activeMs >= goalMs;
            const ratio = scale > 0 ? day.activeMs / scale : 0;
            const isToday = day.date === today;

            return (
              <div
                key={day.date}
                className="group relative flex h-full flex-1 flex-col justify-end"
                title={`${formatDay(day.date)}: ${formatDuration(day.activeMs)}`}
              >
                {reached && (
                  <span
                    className="mb-1 text-center text-[10px] leading-none text-good"
                    aria-hidden
                  >
                    ✓
                  </span>
                )}
                <div
                  className={`w-full rounded-t transition-colors ${
                    day.activeMs === 0
                      ? "bg-surface-sunken"
                      : reached
                        ? "bg-good"
                        : "bg-brand"
                  } ${isToday ? "ring-2 ring-ink/20" : ""}`}
                  style={{ height: `${Math.max(day.activeMs > 0 ? 3 : 2, ratio * 100)}%` }}
                />
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-1.5 flex gap-[2px]">
        {days.map((day) => (
          <span
            key={day.date}
            className={`flex-1 text-center text-[10px] ${
              day.date === today ? "font-semibold text-ink" : "text-ink-muted"
            }`}
          >
            {day.date.slice(8)}
          </span>
        ))}
      </div>

      <figcaption className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-good" aria-hidden />
          <span aria-hidden>✓</span> cíl splněn
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-brand" aria-hidden />
          rozděláno
        </span>
        <span>posledních {days.length} dní</span>
      </figcaption>
    </figure>
  );
}
