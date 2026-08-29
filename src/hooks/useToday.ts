"use client";

import { useSyncExternalStore } from "react";
import { localDate } from "@/lib/daily";

const LISTENERS = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
/** Poslední rozeslané datum – snapshot musí být stabilní, jinak by React renderoval donekonečna. */
let current = "";

function notify(): void {
  const next = localDate(Date.now());
  if (next === current) return;
  current = next;
  for (const listener of LISTENERS) listener();
}

function subscribe(callback: () => void): () => void {
  LISTENERS.add(callback);
  if (!timer) {
    // Minuta stačí – jde jen o to zachytit přechod přes půlnoc.
    timer = setInterval(notify, 60_000);
    document.addEventListener("visibilitychange", notify);
  }
  return () => {
    LISTENERS.delete(callback);
    if (LISTENERS.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
      document.removeEventListener("visibilitychange", notify);
    }
  };
}

function getSnapshot(): string {
  if (!current) current = localDate(Date.now());
  return current;
}

/**
 * Dnešní datum, které se samo přepne přes půlnoc.
 *
 * Na serveru vrací null, aby se serverový a klientský render nerozešly – dokud
 * datum nedorazí, komponenta ukazuje načítání.
 */
export function useToday(): string | null {
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}
