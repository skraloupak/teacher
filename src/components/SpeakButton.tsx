"use client";

import { canSpeak, speakEnglish } from "@/lib/audio";
import type { Item } from "@/lib/types";

export function SpeakButton({
  item,
  size = "md",
  className = "",
}: {
  item: Item;
  size?: "sm" | "md";
  className?: string;
}) {
  if (!canSpeak(item)) return null;

  const dimension = size === "sm" ? "h-9 w-9" : "h-12 w-12";

  return (
    <button
      type="button"
      aria-label={`Přehrát výslovnost: ${item.en}`}
      onClick={(event) => {
        // Kliknutí na reproduktor nesmí otočit kartu pod ním.
        event.stopPropagation();
        speakEnglish(item);
      }}
      className={`no-tap-zoom inline-flex ${dimension} shrink-0 items-center justify-center rounded-full border border-line bg-surface-raised text-brand transition-colors hover:border-brand/60 active:scale-95 ${className}`}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M4 9.5h3.2L12 5.5v13L7.2 14.5H4a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1Z"
          fill="currentColor"
        />
        <path
          d="M15.6 8.8a4.5 4.5 0 0 1 0 6.4M18.3 6a8 8 0 0 1 0 12"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}
