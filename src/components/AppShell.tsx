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

/**
 * Ikony do spodní lišty. Na telefonu se pět popisků vedle loga a přepínače motivu
 * do řádku nevejde – poslední položka utíkala mimo obrazovku.
 */
const ICONS: Record<string, ReactNode> = {
  "/": (
    <path
      d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10a2 2 0 0 1 2 2v13a1.5 1.5 0 0 0-1.5-1.5h-5A1.5 1.5 0 0 1 4 16V5.5ZM20 5.5A1.5 1.5 0 0 0 18.5 4H14a2 2 0 0 0-2 2v13a1.5 1.5 0 0 1 1.5-1.5h5A1.5 1.5 0 0 0 20 16V5.5Z"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinejoin="round"
    />
  ),
  "/slovnicek": (
    <path
      d="M4 6h7M4 12h7M4 18h7M15 6h5M15 12h5M15 18h5"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
    />
  ),
  "/gramatika": (
    <path
      d="M5 19V6.5A2.5 2.5 0 0 1 7.5 4H19v13H7.5A2.5 2.5 0 0 0 5 19Zm0 0A2.5 2.5 0 0 0 7.5 21H19M9 8h6"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  "/stats": (
    <path
      d="M5 20V12M12 20V5M19 20v-5"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
  ),
  "/profil": (
    <path
      d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm8 8a8 8 0 0 0-16 0"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
};

const NAV = [
  { href: "/", label: "Učení" },
  { href: "/slovnicek", label: "Slovníček" },
  { href: "/gramatika", label: "Gramatika" },
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
        {/* Na telefonu zůstane v hlavičce jen přepínač motivu, odkazy jsou dole. */}
        <nav className="hidden items-center gap-1 sm:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                pathname === item.href
                  ? "bg-brand-soft text-brand"
                  : "text-ink-muted hover:text-ink"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <ThemeToggle />
      </header>

      {/* Spodní odsazení o výšku lišty, ať ji obsah nekončí pod ní. */}
      <main className="flex flex-1 flex-col" style={{ paddingBottom: "var(--bottom-nav)" }}>
        {children}
      </main>

      {/* Spodní lišta na telefonu – palec na ni dosáhne a popisky se nikam netlačí. */}
      <nav
        aria-label="Hlavní navigace"
        className="fixed inset-x-0 bottom-0 z-40 h-[var(--bottom-nav)] border-t border-line bg-surface/95 backdrop-blur sm:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="mx-auto flex max-w-2xl items-stretch">
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`no-tap-zoom flex flex-1 flex-col items-center gap-0.5 px-1 py-2 text-[11px] font-medium transition-colors ${
                  active ? "text-brand" : "text-ink-muted"
                }`}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                  {ICONS[item.href]}
                </svg>
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
