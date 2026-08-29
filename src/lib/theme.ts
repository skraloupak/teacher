"use client";

const THEME_KEY = "teacher-app:theme";

export type Theme = "light" | "dark";

const listeners = new Set<() => void>();

export function subscribeTheme(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

/** Zdrojem pravdy je atribut na <html> – nastaví ho skript v layoutu ještě před vykreslením. */
export function getTheme(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function getServerTheme(): Theme {
  return "light";
}

export function setTheme(next: Theme): void {
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {
    // Bez uložení se téma jen nezapamatuje do příště.
  }
  for (const listener of listeners) listener();
}
