"use client";

import { useCallback, useMemo, useState } from "react";
import { useToday } from "@/hooks/useToday";
import { currentStreak, localDate, summarizeDays } from "@/lib/daily";
import type { SessionRecord } from "@/lib/types";

const CELEBRATED_PREFIX = "teacher-app:celebrated";

/** Klíč je vázaný na účet, ať oslava jednoho uživatele nepřipraví o konfety druhého. */
function celebratedKey(userKey: string | null): string {
  return userKey ? `${CELEBRATED_PREFIX}:${userKey}` : CELEBRATED_PREFIX;
}

function readCelebrated(userKey: string | null): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(celebratedKey(userKey));
  } catch {
    return null;
  }
}

function writeCelebrated(userKey: string | null, date: string): void {
  try {
    window.localStorage.setItem(celebratedKey(userKey), date);
  } catch {
    // Bez uložení se oslava může zopakovat po znovunačtení – nic zásadního.
  }
}

/**
 * Sleduje plnění denního cíle a hlídá, kdy má přijít oslava.
 * Počítá se z odehraných kol, takže je stav stejný na všech zařízeních.
 */
export function useDailyGoal(
  sessions: SessionRecord[],
  goalMinutes: number,
  userKey: string | null,
) {
  const [celebrating, setCelebrating] = useState(false);
  const today = useToday();

  const days = useMemo(() => summarizeDays(sessions), [sessions]);
  const goalMs = Math.max(1, goalMinutes) * 60_000;

  const todayStat = useMemo(
    () => (today === null ? null : (days.find((day) => day.date === today) ?? null)),
    [days, today],
  );

  const activeMs = todayStat?.activeMs ?? 0;
  const reached = activeMs >= goalMs;
  const streak = useMemo(
    () => (today === null ? 0 : currentStreak(days, goalMs, today)),
    [days, goalMs, today],
  );

  /**
   * Volá se hned po dokončení kola. Právě uložený záznam se předává zvlášť –
   * `sessions` ho ještě neobsahují, protože zápis stavu se propíše až v dalším renderu.
   * Bez toho by oslava přišla až o kolo později, nebo vůbec.
   */
  const checkCelebration = useCallback(
    (justFinished?: SessionRecord) => {
      // Datum bereme čerstvé – kolo mohlo skončit až po půlnoci.
      const todayKey = localDate(Date.now());
      const fromSessions = days.find((day) => day.date === todayKey)?.activeMs ?? 0;
      const recordDate =
        justFinished && (justFinished.date ?? localDate(justFinished.finishedAt));
      const extraMs = recordDate === todayKey ? (justFinished?.activeMs ?? 0) : 0;

      if (fromSessions + extraMs < goalMs) return;
      if (readCelebrated(userKey) === todayKey) return;
      writeCelebrated(userKey, todayKey);
      setCelebrating(true);
    },
    [days, goalMs, userKey],
  );

  const dismiss = useCallback(() => setCelebrating(false), []);

  return {
    days,
    today,
    todayStat,
    activeMs,
    goalMs,
    reached,
    streak,
    celebrating,
    checkCelebration,
    dismiss,
  };
}
