"use client";

import { SpeakerIcon } from "@/components/icons";
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
      <SpeakerIcon />
    </button>
  );
}
