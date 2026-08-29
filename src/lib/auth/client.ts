"use client";

/** Kdo je přihlášený – jen pro okamžité vykreslení, ne pro autorizaci. */
export type AuthUser = { id: string; email: string };

const USER_KEY = "teacher-app:user";

/**
 * Přihlášení drží httpOnly cookie, ke které se skript nedostane. V localStorage je
 * jenom e-mail, aby se po otevření appky nemuselo čekat na server a neproblikla
 * přihlašovací obrazovka. Autorizaci to neovlivňuje – tu řeší vždycky server.
 */
export function readCachedUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(USER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthUser;
    return typeof parsed?.email === "string" ? parsed : null;
  } catch {
    return null;
  }
}

export function cacheUser(user: AuthUser | null): void {
  if (typeof window === "undefined") return;
  try {
    if (user) window.localStorage.setItem(USER_KEY, JSON.stringify(user));
    else window.localStorage.removeItem(USER_KEY);
  } catch {
    // Bez uložení se jen při dalším otevření chvilku počká na server.
  }
}
