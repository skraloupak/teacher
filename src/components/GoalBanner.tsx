"use client";

import { Confetti } from "@/components/Confetti";
import { CloseIcon } from "@/components/icons";
import { formatDuration } from "@/lib/daily";

/** Oznámení, že dnešní cíl padl. Zobrazí se jednou denně. */
export function GoalBanner({
  activeMs,
  goalMs,
  streak,
  onClose,
}: {
  activeMs: number;
  goalMs: number;
  /** Kolikátý den v řadě cíl padl. */
  streak: number;
  onClose: () => void;
}) {
  return (
    <>
      <Confetti />
      <div className="fixed inset-x-0 top-0 z-50 px-4 pt-4">
        <div
          role="status"
          className="mx-auto flex w-full max-w-2xl items-center gap-3 rounded-3xl border border-good/30 bg-good-soft px-4 py-3 shadow-lg"
        >
          <span className="text-2xl" aria-hidden>
            🎉
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-ink">Dnešní cíl je splněný!</p>
            <p className="text-sm text-ink-muted">
              {formatDuration(activeMs)} z {formatDuration(goalMs)}
              {streak > 1 && ` · ${streak} dní v řadě`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Zavřít"
            className="no-tap-zoom shrink-0 rounded-full p-2 text-ink-muted transition-colors hover:text-ink"
          >
            <CloseIcon size={18} />
          </button>
        </div>
      </div>
    </>
  );
}
