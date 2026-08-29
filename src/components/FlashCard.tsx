"use client";

import { useRef, useState } from "react";
import { SpeakButton } from "@/components/SpeakButton";
import { answerOf, promptOf, type Card } from "@/lib/session";
import { TYPE_LABELS } from "@/lib/settings";

/** Od kolika pixelů tahu už jde o odpověď, a ne o klepnutí. */
const SWIPE_THRESHOLD = 72;
/** Svislé gesto je méně obvyklé, tak chce o něco delší tah. */
const SWIPE_THRESHOLD_Y = 88;

/** Co gesto znamená: vodorovně odpověď, svisle práce se seznamem vybraných. */
export type SwipeIntent = "know" | "dontKnow" | "keep" | "drop";

const INTENT_LABELS: Record<SwipeIntent, string> = {
  know: "vím",
  dontKnow: "nevím",
  keep: "zařadit mezi vybraná",
  drop: "umím, vyřadit",
};

/** Kladné („zvládl jsem to") gesta obarvíme zeleně, ostatní červeně. */
function toneOf(intent: SwipeIntent | null): "good" | "bad" | null {
  if (intent === null) return null;
  return intent === "know" || intent === "drop" ? "good" : "bad";
}

function intentOf(dx: number, dy: number): SwipeIntent | null {
  if (Math.abs(dx) >= Math.abs(dy)) {
    if (Math.abs(dx) < SWIPE_THRESHOLD) return null;
    return dx > 0 ? "know" : "dontKnow";
  }
  if (Math.abs(dy) < SWIPE_THRESHOLD_Y) return null;
  return dy < 0 ? "keep" : "drop";
}

/** Delší text potřebuje menší písmo, ať se vejde bez posouvání. */
function textSize(text: string): string {
  if (text.length > 60) return "text-xl sm:text-2xl";
  if (text.length > 30) return "text-2xl sm:text-3xl";
  if (text.length > 16) return "text-3xl sm:text-4xl";
  return "text-4xl sm:text-5xl";
}

function Face({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flip-face absolute inset-0 flex flex-col rounded-3xl border border-line bg-surface-raised p-5 ${className}`}
    >
      {children}
    </div>
  );
}

export function FlashCard({
  card,
  revealed,
  locked,
  marked,
  onFlip,
  onSwipe,
}: {
  card: Card;
  revealed: boolean;
  /** Odpověď už padla – kartička jen dohrává, nedá se na ni odpovědět znovu. */
  locked?: boolean;
  /** Je položka na seznamu vybraných? */
  marked?: boolean;
  onFlip: () => void;
  /** Tažení: doprava vím, doleva nevím, nahoru zařadit mezi vybraná, dolů umím a vyřadit. */
  onSwipe?: (intent: SwipeIntent) => void;
}) {
  const prompt = promptOf(card);
  const answer = answerOf(card);
  const answerIsEnglish = card.direction === "cs2en";

  const startRef = useRef<{ x: number; y: number } | null>(null);
  const swipedRef = useRef(false);
  const [drag, setDrag] = useState({ x: 0, y: 0 });

  const swipeEnabled = Boolean(onSwipe) && !locked;

  function handleTouchStart(event: React.TouchEvent) {
    // Příznak nulujeme na začátku každého dotyku – po tažení totiž žádný klik nepřijde,
    // takže by jinak zůstal viset a spolkl by příští klepnutí.
    swipedRef.current = false;
    if (!swipeEnabled) return;
    const touch = event.changedTouches[0];
    startRef.current = { x: touch.clientX, y: touch.clientY };
  }

  function handleTouchMove(event: React.TouchEvent) {
    const start = startRef.current;
    if (!start) return;
    const touch = event.changedTouches[0];
    // Táhne se vždy jen po jedné ose – po té, která nabrala víc.
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    setDrag(Math.abs(dx) >= Math.abs(dy) ? { x: dx, y: 0 } : { x: 0, y: dy });
  }

  function handleTouchEnd() {
    const start = startRef.current;
    startRef.current = null;
    const { x, y } = drag;
    setDrag({ x: 0, y: 0 });
    if (!start) return;
    const intent = intentOf(x, y);
    if (!intent) return;
    swipedRef.current = true;
    onSwipe?.(intent);
  }

  function handleClick() {
    // Po tažení nechceme kartu ještě otočit.
    if (swipedRef.current) {
      swipedRef.current = false;
      return;
    }
    onFlip();
  }

  const dragging = drag.x !== 0 || drag.y !== 0;
  const intent = intentOf(drag.x, drag.y);
  const tone = toneOf(intent);

  const faceTone =
    tone === "good" ? "bg-good-soft" : tone === "bad" ? "bg-bad-soft" : undefined;

  const hint = intent ? INTENT_LABELS[intent] : null;

  return (
    <div
      className={`flip-scene no-tap-zoom w-full cursor-pointer ${swipeEnabled ? "touch-none" : ""}`}
      onClick={handleClick}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      role="button"
      tabIndex={0}
      aria-label={revealed ? "Skrýt odpověď" : "Ukázat odpověď"}
      onKeyDown={(event) => {
        if (event.key === "Enter") onFlip();
      }}
      style={{
        transform: dragging
          ? `translate(${drag.x}px, ${drag.y}px) rotate(${drag.x / 28}deg)`
          : undefined,
        transition: dragging ? "none" : "transform 220ms ease-out",
      }}
    >
      <div className="flip-inner relative h-[19rem] w-full sm:h-[22rem]" data-flipped={revealed}>
        {/* Přední strana – otázka */}
        <Face className={faceTone}>
          <div className="flex items-center justify-between gap-2 text-xs font-medium tracking-wide text-ink-muted uppercase">
            <span className="flex items-center gap-1.5">
              {TYPE_LABELS[card.item.type]}
              {marked && <MarkedDot />}
            </span>
            <span className="truncate">{card.item.lessonTitle}</span>
          </div>
          <div className="flex flex-1 items-center justify-center px-1 text-center">
            <p className={`font-bold text-balance text-ink ${textSize(prompt)}`}>{prompt}</p>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span
              className={`text-sm ${
                tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : "text-ink-muted"
              }`}
            >
              {hint ?? "Klepnutím otočíš"}
            </span>
            {card.direction === "en2cs" && <SpeakButton item={card.item} size="sm" />}
          </div>
        </Face>

        {/* Zadní strana – odpověď */}
        <Face className={`flip-face-back transition-colors ${faceTone ?? "bg-brand-soft"}`}>
          <div className="flex items-center justify-between text-xs font-medium tracking-wide uppercase">
            <span className="flex items-center gap-1.5 text-brand">
              Odpověď
              {marked && <MarkedDot />}
            </span>
            {hint && (
              <span className={tone === "good" ? "text-good" : "text-bad"}>{hint}</span>
            )}
          </div>
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-1 text-center">
            <p className={`font-bold text-balance text-ink ${textSize(answer)}`}>{answer}</p>
            {answerIsEnglish && card.item.ipa && (
              <p className="font-mono text-base text-ink-muted">[{card.item.ipa}]</p>
            )}
            {card.item.note && <p className="text-sm text-ink-muted">{card.item.note}</p>}
            <p className="text-sm text-ink-muted">{prompt}</p>
          </div>
          <div className="flex items-center justify-center">
            <SpeakButton item={card.item} />
          </div>
        </Face>
      </div>
    </div>
  );
}

/** Tečka, která říká, že položka je na seznamu vybraných. */
function MarkedDot() {
  return (
    <span
      className="inline-block h-2 w-2 rounded-full bg-brand"
      title="Je mezi vybranými"
      aria-label="Je mezi vybranými"
    />
  );
}
