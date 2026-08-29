"use client";

import { useEffect, useRef } from "react";

type Piece = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rotation: number;
  spin: number;
  color: string;
};

const COLORS = ["#5b53e0", "#9d96ff", "#12805c", "#4ad4a0", "#f2b705", "#ff8090"];
const GRAVITY = 0.12;
const DRAG = 0.995;
const DURATION_MS = 2600;

/**
 * Krátká oslava po splnění denního cíle. Kreslí se do canvasu nad stránkou,
 * neblokuje ovládání a po pár vteřinách sama zmizí.
 *
 * Respektuje „omezit pohyb" v systému – kdo má animace vypnuté, nic se mu nehýbe.
 */
export function Confetti({ onDone }: { onDone?: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const timer = setTimeout(() => onDone?.(), 1200);
      return () => clearTimeout(timer);
    }

    const context = canvas.getContext("2d");
    if (!context) return;

    const ratio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    context.scale(ratio, ratio);

    // Dva pramínky ze spodních rohů, jak to dělají konfetová děla.
    const pieces: Piece[] = [];
    for (let i = 0; i < 140; i++) {
      const fromLeft = i % 2 === 0;
      const angle = (fromLeft ? -60 : -120) + (Math.random() * 34 - 17);
      const speed = 9 + Math.random() * 7;
      const radians = (angle * Math.PI) / 180;
      pieces.push({
        x: fromLeft ? -10 : width + 10,
        y: height + 10,
        vx: Math.cos(radians) * speed * (fromLeft ? 1 : -1),
        vy: Math.sin(radians) * speed,
        size: 6 + Math.random() * 6,
        rotation: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 0.3,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
      });
    }

    let frame = 0;
    const started = performance.now();

    const draw = (time: number) => {
      const elapsed = time - started;
      context.clearRect(0, 0, width, height);

      // Ke konci se konfety plynule vytratí.
      context.globalAlpha = Math.max(0, Math.min(1, (DURATION_MS - elapsed) / 700));

      for (const piece of pieces) {
        piece.vy += GRAVITY;
        piece.vx *= DRAG;
        piece.x += piece.vx;
        piece.y += piece.vy;
        piece.rotation += piece.spin;

        context.save();
        context.translate(piece.x, piece.y);
        context.rotate(piece.rotation);
        context.fillStyle = piece.color;
        context.fillRect(-piece.size / 2, -piece.size / 2, piece.size, piece.size * 0.6);
        context.restore();
      }

      if (elapsed < DURATION_MS) {
        frame = requestAnimationFrame(draw);
      } else {
        context.clearRect(0, 0, width, height);
        onDone?.();
      }
    };

    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [onDone]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-50 h-full w-full"
    />
  );
}
