"use client";

import { useMemo } from "react";
import { DailyChart } from "@/components/DailyChart";
import { GoalBanner } from "@/components/GoalBanner";
import { Button, Chip, Panel, ProgressBar } from "@/components/ui";
import { useAuth } from "@/components/AuthGate";
import { useAppState } from "@/hooks/useAppState";
import { useDailyGoal } from "@/hooks/useDailyGoal";
import { formatDay, formatDuration, lastDays } from "@/lib/daily";
import { DAILY_GOALS } from "@/lib/settings";
import type { Lesson } from "@/lib/types";

const CHART_DAYS = 14;
const TABLE_DAYS = 10;

export function ProfileClient({ lessons }: { lessons: Lesson[] }) {
  const { user, signOut } = useAuth();
  const { ready, settings, sessions, updateSettings } = useAppState(lessons);
  const goal = useDailyGoal(sessions, settings.dailyGoalMinutes, user?.email ?? null);
  const today = goal.today;

  const lessonTitles = useMemo(
    () => new Map(lessons.map((lesson) => [lesson.id, lesson.title])),
    [lessons],
  );

  const chartDays = useMemo(
    () => (today === null ? [] : lastDays(goal.days, CHART_DAYS, today)),
    [goal.days, today],
  );

  const tableDays = useMemo(
    () => (today === null ? [] : lastDays(goal.days, TABLE_DAYS, today).slice().reverse()),
    [goal.days, today],
  );

  /** Kolik času padlo na kterou lekci za sledované období. */
  const byLesson = useMemo(() => {
    const totals = new Map<string, number>();
    for (const day of chartDays) {
      for (const [lessonId, ms] of Object.entries(day.byLesson)) {
        totals.set(lessonId, (totals.get(lessonId) ?? 0) + ms);
      }
    }
    return [...totals.entries()].sort((a, b) => b[1] - a[1]);
  }, [chartDays]);

  const totals = useMemo(() => {
    const active = goal.days.reduce((sum, day) => sum + day.activeMs, 0);
    const answers = goal.days.reduce((sum, day) => sum + day.answers, 0);
    const correct = goal.days.reduce((sum, day) => sum + day.correct, 0);
    return {
      active,
      answers,
      days: goal.days.filter((day) => day.activeMs > 0).length,
      rate: answers > 0 ? Math.round((correct / answers) * 100) : 0,
    };
  }, [goal.days]);

  if (!ready || today === null) {
    return <p className="py-16 text-center text-ink-muted">Načítám…</p>;
  }

  const percent = Math.min(100, Math.round((goal.activeMs / goal.goalMs) * 100));
  const remaining = Math.max(0, goal.goalMs - goal.activeMs);

  return (
    <div className="flex flex-col gap-4 pb-8">
      {goal.celebrating && (
        <GoalBanner
          activeMs={goal.activeMs}
          goalMs={goal.goalMs}
          streak={goal.streak}
          onClose={goal.dismiss}
        />
      )}

      <Panel title="Dnes">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <div>
            <p className="text-4xl font-bold tabular-nums text-ink">
              {formatDuration(goal.activeMs)}
            </p>
            <p className="text-sm text-ink-muted">
              {goal.reached
                ? "Cíl je splněný, hezky."
                : `Do cíle zbývá ${formatDuration(remaining)}.`}
            </p>
          </div>
          {goal.streak > 0 && (
            <div className="shrink-0 rounded-2xl bg-surface-sunken px-3 py-2 text-center">
              <p className="text-xl font-bold tabular-nums text-ink">{goal.streak}</p>
              <p className="text-xs text-ink-muted">
                {goal.streak === 1 ? "den v řadě" : goal.streak < 5 ? "dny v řadě" : "dní v řadě"}
              </p>
            </div>
          )}
        </div>
        <ProgressBar value={goal.activeMs} max={goal.goalMs} />
        <p className="mt-1.5 text-sm text-ink-muted">
          {percent} % z {formatDuration(goal.goalMs)}
        </p>
      </Panel>

      <Panel title="Denní cíl">
        <div className="flex flex-wrap gap-2">
          {DAILY_GOALS.map((minutes) => (
            <Chip
              key={minutes}
              selected={settings.dailyGoalMinutes === minutes}
              onClick={() => updateSettings({ dailyGoalMinutes: minutes })}
            >
              {minutes} min
            </Chip>
          ))}
        </div>
        <p className="mt-2 text-sm text-ink-muted">
          Počítá se čas, kdy se opravdu odpovídá – delší pauza se do něj nezapočítá.
        </p>
      </Panel>

      <Panel title="Poslední dva týdny">
        <DailyChart days={chartDays} goalMs={goal.goalMs} today={today} />
      </Panel>

      <Panel title="Po dnech" className="px-0 sm:px-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-ink-muted">
                <th scope="col" className="px-4 py-2 font-medium sm:px-5">
                  Den
                </th>
                <th scope="col" className="px-2 py-2 text-right font-medium">
                  Čas
                </th>
                <th scope="col" className="px-2 py-2 text-right font-medium">
                  Kol
                </th>
                <th scope="col" className="px-2 py-2 text-right font-medium">
                  Odpovědí
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium sm:px-5">
                  Úspěšnost
                </th>
              </tr>
            </thead>
            <tbody>
              {tableDays.map((day) => {
                const rate =
                  day.answers > 0 ? Math.round((day.correct / day.answers) * 100) : null;
                const reached = day.activeMs >= goal.goalMs;
                return (
                  <tr key={day.date} className="border-b border-line last:border-0">
                    <th
                      scope="row"
                      className={`px-4 py-2 text-left font-normal sm:px-5 ${
                        day.date === today ? "font-semibold text-ink" : "text-ink-muted"
                      }`}
                    >
                      {reached && (
                        <span className="mr-1 text-good" aria-label="cíl splněn">
                          ✓
                        </span>
                      )}
                      {formatDay(day.date)}
                    </th>
                    <td className="px-2 py-2 text-right tabular-nums text-ink">
                      {day.activeMs > 0 ? formatDuration(day.activeMs) : "–"}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-ink-muted">
                      {day.sessions || "–"}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-ink-muted">
                      {day.answers || "–"}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-ink-muted sm:px-5">
                      {rate === null ? "–" : `${rate} %`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      {byLesson.length > 0 && (
        <Panel title="Na čem jsem trávil čas">
          <ul className="flex flex-col gap-2">
            {byLesson.map(([lessonId, ms]) => (
              <li key={lessonId} className="flex items-center gap-3">
                <span className="w-40 shrink-0 truncate text-sm text-ink">
                  {lessonTitles.get(lessonId) ?? lessonId}
                </span>
                <div className="flex-1">
                  <ProgressBar value={ms} max={byLesson[0][1]} />
                </div>
                <span className="w-16 shrink-0 text-right text-sm tabular-nums text-ink-muted">
                  {formatDuration(ms)}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel title="Celkem">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Metric value={formatDuration(totals.active)} label="času učením" />
          <Metric value={totals.days} label="dní učení" />
          <Metric value={totals.answers} label="odpovědí" />
          <Metric value={`${totals.rate} %`} label="úspěšnost" />
        </div>
      </Panel>

      {user && (
        <Panel title="Účet">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-ink">{user.email}</p>
            <Button variant="secondary" onClick={() => void signOut()}>
              Odhlásit se
            </Button>
          </div>
        </Panel>
      )}
    </div>
  );
}

function Metric({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="rounded-2xl bg-surface-sunken px-3 py-3 text-center">
      <div className="text-xl font-bold tabular-nums text-ink">{value}</div>
      <div className="text-xs text-ink-muted">{label}</div>
    </div>
  );
}
