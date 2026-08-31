"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getStore } from "@/lib/storage";
import { normalizeSettings } from "@/lib/settings";
import { applyAnswer, getProgress, masterCard, resetCard } from "@/lib/srs";
import type { Direction, Lesson, ProgressMap, SessionRecord, StudySettings } from "@/lib/types";

/**
 * Načte pokrok a nastavení z úložiště a drží je v paměti.
 * Zápisy jsou „fire and forget“ – učení nikdy nečeká na uložení.
 */
export function useAppState(lessons: Lesson[]) {
  const store = useMemo(() => getStore(), []);
  const lessonIds = useMemo(() => lessons.map((l) => l.id), [lessons]);

  const [ready, setReady] = useState(false);
  /** Čas, kdy se data načetla. Slouží jako „teď" pro výpočty – na serveru je null, takže se render nerozejde. */
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  const [progress, setProgress] = useState<ProgressMap>({});
  const [settings, setSettings] = useState<StudySettings>(() =>
    normalizeSettings(null, lessonIds),
  );
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  /** Položky zaškrtnuté ve slovníčku – dají se pak zkoušet zvlášť. */
  const [marked, setMarked] = useState<ReadonlySet<string>>(() => new Set());

  // Aktuální pokrok si držíme i v refu, aby rychlé odpovědi po sobě nepřepisovaly změny.
  const progressRef = useRef<ProgressMap>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [loadedProgress, loadedSettings, loadedSessions, loadedMarked] = await Promise.all([
        store.loadProgress(),
        store.loadSettings(),
        store.loadSessions(),
        store.loadMarked(),
      ]);
      if (cancelled) return;
      progressRef.current = loadedProgress;
      setProgress(loadedProgress);
      setSessions(loadedSessions);
      setMarked(new Set(loadedMarked));
      setSettings(normalizeSettings(loadedSettings, lessonIds));
      setLoadedAt(Date.now());
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [store, lessonIds]);

  const updateSettings = useCallback(
    (patch: Partial<StudySettings> | ((prev: StudySettings) => Partial<StudySettings>)) => {
      setSettings((prev) => {
        const next = normalizeSettings(
          { ...prev, ...(typeof patch === "function" ? patch(prev) : patch) },
          lessonIds,
        );
        void store.saveSettings(next);
        return next;
      });
    },
    [store, lessonIds],
  );

  /** Zapíše výsledek jedné odpovědi do Leitnerova systému. */
  const recordAnswer = useCallback(
    (itemId: string, direction: Direction, knew: boolean) => {
      const now = Date.now();
      const current = getProgress(progressRef.current, itemId, direction, now);
      const updated = applyAnswer(current, knew, now);
      const next = { ...progressRef.current, [updated.key]: updated };
      progressRef.current = next;
      setProgress(next);
      void store.saveProgress(next);
    },
    [store],
  );

  /**
   * Odloží položku jako naučenou, a to v obou směrech – kdo zná „and", zná ho
   * česky i anglicky a nemá důvod ho zkoušet zvlášť.
   */
  const markMastered = useCallback(
    (itemId: string) => {
      const now = Date.now();
      const next = { ...progressRef.current };
      for (const direction of ["en2cs", "cs2en"] as const) {
        const current = getProgress(next, itemId, direction, now);
        const updated = masterCard(current, now);
        next[updated.key] = updated;
      }
      progressRef.current = next;
      setProgress(next);
      void store.saveProgress(next);

      // Odložená položka nemá co dělat ani mezi vybranými, jinak by chodila
      // dál v režimu „Vybrané".
      setMarked((prev) => {
        if (!prev.has(itemId)) return prev;
        const nextMarks = new Set(prev);
        nextMarks.delete(itemId);
        void store.saveMarked([...nextMarks]);
        return nextMarks;
      });
    },
    [store],
  );

  /** Vrátí položku zpátky do opakování – opak markMastered, opět v obou směrech. */
  const resetMastered = useCallback(
    (itemId: string) => {
      const now = Date.now();
      const next = { ...progressRef.current };
      for (const direction of ["en2cs", "cs2en"] as const) {
        const current = getProgress(next, itemId, direction, now);
        const updated = resetCard(current, now);
        next[updated.key] = updated;
      }
      progressRef.current = next;
      setProgress(next);
      void store.saveProgress(next);
    },
    [store],
  );

  const recordSession = useCallback(
    (record: SessionRecord) => {
      setSessions((prev) => [...prev, record].slice(-1000));
      void store.addSession(record);
    },
    [store],
  );

  /** Přepne zaškrtnutí položky ve slovníčku. */
  const toggleMark = useCallback(
    (itemId: string) => {
      setMarked((prev) => {
        const next = new Set(prev);
        if (next.has(itemId)) next.delete(itemId);
        else next.add(itemId);
        void store.saveMarked([...next]);
        return next;
      });
    },
    [store],
  );

  /** Nastaví zaškrtnutí natvrdo – používá učení, kde gesto znamená konkrétní směr. */
  const setMark = useCallback(
    (itemId: string, value: boolean) => {
      setMarked((prev) => {
        if (prev.has(itemId) === value) return prev;
        const next = new Set(prev);
        if (value) next.add(itemId);
        else next.delete(itemId);
        void store.saveMarked([...next]);
        return next;
      });
    },
    [store],
  );

  const clearMarks = useCallback(() => {
    setMarked(new Set());
    void store.saveMarked([]);
  }, [store]);

  const resetProgress = useCallback(async () => {
    await store.resetProgress();
    progressRef.current = {};
    setProgress({});
    setSessions([]);
  }, [store]);

  return {
    ready,
    loadedAt,
    progress,
    settings,
    sessions,
    marked,
    toggleMark,
    setMark,
    clearMarks,
    updateSettings,
    recordAnswer,
    markMastered,
    resetMastered,
    recordSession,
    resetProgress,
  };
}
