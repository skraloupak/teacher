"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui";
import { cacheUser, readCachedUser, type AuthUser } from "@/lib/auth/client";

type AuthContextValue = {
  /** null znamená, že aplikace běží bez účtů. */
  user: AuthUser | null;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({ user: null, signOut: async () => {} });

/** Přihlášený uživatel a odhlášení pro zbytek aplikace. */
export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}

type Status =
  | { state: "checking" }
  /** Přihlašování není nastavené – aplikace běží bez účtů, jen z prohlížeče. */
  | { state: "open" }
  | { state: "signedIn"; user: AuthUser }
  | { state: "signedOut" };

/**
 * Pustí do aplikace jen přihlášeného uživatele.
 *
 * Aby po otevření neproblikla přihlašovací obrazovka, vyjde se z e-mailu uloženého
 * v prohlížeči a teprve pak se stav ověří na serveru. Skutečné oprávnění drží
 * httpOnly cookie, kterou si aplikace nemůže přečíst ani podvrhnout.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>({ state: "checking" });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const cached = readCachedUser();
      if (cached) setStatus({ state: "signedIn", user: cached });

      try {
        const response = await fetch("/api/auth/me");
        if (!response.ok) throw new Error(String(response.status));
        const data = (await response.json()) as {
          authRequired: boolean;
          user: AuthUser | null;
        };
        if (cancelled) return;

        if (!data.authRequired) {
          cacheUser(null);
          setStatus({ state: "open" });
        } else if (data.user) {
          cacheUser(data.user);
          setStatus({ state: "signedIn", user: data.user });
        } else {
          cacheUser(null);
          setStatus({ state: "signedOut" });
        }
      } catch {
        if (cancelled) return;
        // Server je nedostupný. S uloženým e-mailem necháme uživatele pracovat dál
        // (data stejně drží prohlížeč), jinak ukážeme přihlášení.
        setStatus(cached ? { state: "signedIn", user: cached } : { state: "signedOut" });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const signOut = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // I kdyby se cookie nepodařilo smazat na serveru, uživatele odhlásíme lokálně.
    }
    cacheUser(null);
    window.location.reload();
  }, []);

  const onSignedIn = useCallback((user: AuthUser) => {
    cacheUser(user);
    // Přenačtení je nejjistější způsob, jak začít s čistým stavem úložiště.
    window.location.reload();
  }, []);

  if (status.state === "checking") {
    return (
      <div className="flex min-h-dvh items-center justify-center px-4">
        <p className="text-ink-muted">Načítám…</p>
      </div>
    );
  }

  if (status.state === "signedOut") {
    return <SignInScreen onSignedIn={onSignedIn} />;
  }

  return (
    <AuthContext.Provider
      value={{
        user: status.state === "signedIn" ? status.user : null,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

function SignInScreen({ onSignedIn }: { onSignedIn: (user: AuthUser) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await response.json()) as { error?: string; email?: string };

      if (!response.ok) {
        setError(data.error ?? "Přihlášení se nezdařilo.");
        setBusy(false);
        return;
      }

      onSignedIn({ id: "", email: data.email ?? email });
    } catch {
      setError("Server neodpovídá. Zkus to znovu.");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-4 py-8">
      <div className="mb-6 text-center">
        <p className="text-3xl font-bold tracking-tight text-ink">
          Slovíčka<span className="text-brand">.</span>
        </p>
        <p className="mt-1 text-ink-muted">Přihlas se a pokrok ti zůstane na všech zařízeních.</p>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink-muted">E-mail</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="username"
            required
            autoFocus
            className="rounded-2xl border border-line bg-surface-raised px-4 py-3 text-base text-ink outline-none focus-visible:border-brand"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink-muted">Heslo</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
            className="rounded-2xl border border-line bg-surface-raised px-4 py-3 text-base text-ink outline-none focus-visible:border-brand"
          />
        </label>

        {error && (
          <p role="alert" className="rounded-2xl bg-bad-soft px-4 py-3 text-sm text-bad">
            {error}
          </p>
        )}

        <Button type="submit" disabled={busy} className="mt-1 w-full py-4">
          {busy ? "Přihlašuji…" : "Přihlásit se"}
        </Button>
      </form>
    </div>
  );
}
