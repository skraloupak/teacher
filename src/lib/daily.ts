import type { DayStat, SessionRecord } from "./types";

/** Datum v lokálním čase jako RRRR-MM-DD. Půlnoc se řídí časem uživatele, ne UTC. */
export function localDate(timestamp: number): string {
  const d = new Date(timestamp);
  const month = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

/** Odhad času, když kolo vzniklo ve starší verzi bez měření – ať historie nezmizí. */
function activeOf(record: SessionRecord): number {
  if (typeof record.activeMs === "number") return record.activeMs;
  // Doba kola bez měření může obsahovat pauzy; strop drží odhad při zemi.
  return Math.min(record.durationMs, record.total * 15_000);
}

/** Sečte kola po dnech. Výsledek je seřazený od nejstaršího dne. */
export function summarizeDays(sessions: SessionRecord[]): DayStat[] {
  const byDate = new Map<string, DayStat>();

  for (const record of sessions) {
    const date = record.date ?? localDate(record.finishedAt);
    let day = byDate.get(date);
    if (!day) {
      day = { date, activeMs: 0, answers: 0, correct: 0, wrong: 0, sessions: 0, byLesson: {} };
      byDate.set(date, day);
    }

    const active = activeOf(record);
    day.activeMs += active;
    day.answers += record.correct + record.wrong;
    day.correct += record.correct;
    day.wrong += record.wrong;
    day.sessions += 1;

    // Čas kola rozpočítáme rovným dílem mezi lekce, ze kterých se skládalo.
    const lessons = record.lessonIds.length > 0 ? record.lessonIds : ["?"];
    const share = active / lessons.length;
    for (const lessonId of lessons) {
      day.byLesson[lessonId] = (day.byLesson[lessonId] ?? 0) + share;
    }
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function findDay(days: DayStat[], date: string): DayStat | null {
  return days.find((day) => day.date === date) ?? null;
}

/**
 * Posune datum o zadaný počet dní. Počítá se kalendářně, ne odečtením 24 hodin –
 * den s přechodem na letní čas má 23 hodin a pevný krok by jedno datum zdvojil
 * nebo přeskočil.
 */
export function shiftDate(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  // Date si přetečení dne přepočítá samo, včetně konců měsíců a přestupných roků.
  return localDate(new Date(year, month - 1, day + days).getTime());
}

function emptyDay(date: string): DayStat {
  return { date, activeMs: 0, answers: 0, correct: 0, wrong: 0, sessions: 0, byLesson: {} };
}

/** Posledních `count` dní včetně těch, kdy se uživatel neučil – kvůli grafu. */
export function lastDays(days: DayStat[], count: number, today: string): DayStat[] {
  const byDate = new Map(days.map((day) => [day.date, day]));
  const out: DayStat[] = [];

  for (let i = count - 1; i >= 0; i--) {
    const date = shiftDate(today, -i);
    out.push(byDate.get(date) ?? emptyDay(date));
  }
  return out;
}

/** Kolik dní v řadě až do dneška byl splněn cíl. Dnešek, který ještě není hotový, sérii nepřeruší. */
export function currentStreak(days: DayStat[], goalMs: number, today: string): number {
  const byDate = new Map(days.map((day) => [day.date, day]));
  let streak = 0;

  for (let i = 0; i < 400; i++) {
    const day = byDate.get(shiftDate(today, -i));
    if ((day?.activeMs ?? 0) >= goalMs) {
      streak++;
    } else if (i > 0) {
      break;
    }
  }
  return streak;
}

export function formatDuration(ms: number): string {
  const totalMinutes = Math.round(ms / 60_000);
  if (totalMinutes < 1) return `${Math.max(0, Math.round(ms / 1000))} s`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours} h ${minutes} min` : `${minutes} min`;
}

/** „pondělí 3. 9." pro popisky v tabulce. */
export function formatDay(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("cs-CZ", {
    weekday: "short",
    day: "numeric",
    month: "numeric",
  });
}
