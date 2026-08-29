"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "good" | "bad";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-brand text-on-brand hover:bg-brand-strong active:bg-brand-strong disabled:bg-line disabled:text-ink-muted",
  secondary:
    "bg-surface-raised text-ink border border-line hover:border-brand/60 active:bg-surface-sunken",
  ghost: "text-ink-muted hover:text-ink hover:bg-surface-sunken",
  good: "bg-good-soft text-good border border-good/30 hover:border-good/60 active:scale-[0.98]",
  bad: "bg-bad-soft text-bad border border-bad/30 hover:border-bad/60 active:scale-[0.98]",
};

export function Button({
  variant = "primary",
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      {...rest}
      className={`no-tap-zoom inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-base font-semibold transition-all outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

/** Přepínatelný „štítek“ – používá se pro výběr lekcí, typů i směru. */
export function Chip({
  selected,
  onClick,
  children,
  className = "",
  disabled,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={`no-tap-zoom rounded-full border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-40 ${
        selected
          ? "border-brand bg-brand text-on-brand"
          : "border-line bg-surface-raised text-ink-muted hover:border-brand/50 hover:text-ink"
      } ${className}`}
    >
      {children}
    </button>
  );
}

export function Panel({
  title,
  action,
  children,
  className = "",
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-3xl border border-line bg-surface-raised p-4 sm:p-5 ${className}`}
    >
      {(title || action) && (
        <header className="mb-3 flex items-center justify-between gap-3">
          {title && (
            <h2 className="text-sm font-semibold tracking-wide text-ink-muted uppercase">
              {title}
            </h2>
          )}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="no-tap-zoom flex w-full items-center justify-between gap-4 rounded-2xl px-1 py-2 text-left"
    >
      <span className="min-w-0">
        <span className="block text-base font-medium text-ink">{label}</span>
        {hint && <span className="block text-sm text-ink-muted">{hint}</span>}
      </span>
      <span
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
          checked ? "bg-brand" : "bg-line"
        }`}
      >
        <span
          className={`absolute top-1 h-5 w-5 rounded-full bg-surface-raised transition-all ${
            checked ? "left-6" : "left-1"
          }`}
        />
      </span>
    </button>
  );
}

export function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-surface-sunken"
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
    >
      <div
        className="h-full rounded-full bg-brand transition-[width] duration-300"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
