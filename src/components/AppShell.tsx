"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { AuthGate } from "@/components/AuthGate";
import { getServerTheme, getTheme, setTheme, subscribeTheme } from "@/lib/theme";

function ThemeToggle() {
  const theme = useSyncExternalStore(subscribeTheme, getTheme, getServerTheme);

  function toggle() {
    setTheme(theme === "dark" ? "light" : "dark");
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "dark" ? "Přepnout na světlý režim" : "Přepnout na tmavý režim"}
      className="no-tap-zoom rounded-full border border-line bg-surface-raised p-2 text-ink-muted transition-colors hover:text-ink"
    >
      {theme === "dark" ? (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8" />
          <path
            d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  );
}

const NAV = [
  { href: "/", label: "Učení" },
  { href: "/slovnicek", label: "Slovníček" },
  { href: "/stats", label: "Statistiky" },
  { href: "/profil", label: "Profil" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <AuthGate>
      <Chrome>{children}</Chrome>
    </AuthGate>
  );
}

function Chrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 pb-8">
      <header className="flex items-center justify-between gap-2 py-4">
        <Link href="/" className="text-lg font-bold tracking-tight text-ink">
          Slovíčka<span className="text-brand">.</span>
        </Link>
        <nav className="flex items-center gap-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-full px-2 py-1.5 text-[13px] font-medium transition-colors sm:px-3 sm:text-sm ${
                pathname === item.href
                  ? "bg-brand-soft text-brand"
                  : "text-ink-muted hover:text-ink"
              }`}
            >
              {item.label}
            </Link>
          ))}
          <ThemeToggle />
        </nav>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
