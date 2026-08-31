"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { Button, Chip, Panel, ProgressBar, Switch } from "@/components/ui";
import { useAppState } from "@/hooks/useAppState";
import { primeAudio } from "@/lib/audio";
import { nextDueAt, previewSize } from "@/lib/session";
import {
  DIRECTION_LABELS,
  MODES,
  MODE_HINTS,
  MODE_LABELS,
  SESSION_SIZES,
  TYPE_LABELS,
  directionsOf,
} from "@/lib/settings";
import { summarize } from "@/lib/srs";
import { formatUntil } from "@/lib/daily";
import type { Book, DirectionSetting, ItemType, Lesson } from "@/lib/types";

const DIRECTIONS: DirectionSetting[] = ["en2cs", "cs2en", "mixed"];
const TYPES: ItemType[] = ["word", "phrase"];

export function HomeClient({ lessons, books }: { lessons: Lesson[]; books: Book[] }) {
  const router = useRouter();
  // loadedAt je null, dokud data nedorazí z prohlížeče – díky tomu se serverový render nerozejde s klientským.
  const { ready, loadedAt: now, progress, settings, marked, updateSettings } =
    useAppState(lessons);

  const selectedIds = useMemo(() => new Set(settings.lessonIds), [settings.lessonIds]);

  const selectedLessons = useMemo(
    () => lessons.filter((lesson) => selectedIds.has(lesson.id)),
    [lessons, selectedIds],
  );

  const stats = useMemo(() => {
    if (now === null) return null;
    const items = selectedLessons
      .flatMap((lesson) => lesson.items)
      .filter((item) => settings.types.includes(item.type));
    return summarize(items, directionsOf(settings.direction), progress, now);
  }, [selectedLessons, settings.types, settings.direction, progress, now]);

  const preview = useMemo(
    () => (now === null ? null : previewSize(lessons, settings, progress, now, marked)),
    [lessons, settings, progress, now, marked],
  );

  /**
   * Když režim „Podle plánu" nic nenabízí, není to chyba – kartičky čekají na svůj
   * odstup. Uživateli ale musíme říct, kdy budou, a nabídnout cestu dál.
   */
  const waiting = useMemo(() => {
    if (now === null || settings.mode !== "due" || (preview?.inSession ?? 0) > 0) return null;
    const due = nextDueAt(lessons, settings, progress, now, marked);
    if (due === null) return null;
    return { at: due, in: formatUntil(due - now) };
  }, [lessons, settings, progress, now, marked, preview]);

  function toggleLesson(id: string) {
    updateSettings((prev) => ({
      lessonIds: prev.lessonIds.includes(id)
        ? prev.lessonIds.filter((x) => x !== id)
        : [...prev.lessonIds, id],
    }));
  }

  function toggleBook(book: Book) {
    const ids = book.lessons.map((l) => l.id);
    const allOn = ids.every((id) => selectedIds.has(id));
    updateSettings((prev) => ({
      lessonIds: allOn
        ? prev.lessonIds.filter((id) => !ids.includes(id))
        : [...new Set([...prev.lessonIds, ...ids])],
    }));
  }

  function toggleType(type: ItemType) {
    updateSettings((prev) => {
      const next = prev.types.includes(type)
        ? prev.types.filter((t) => t !== type)
        : [...prev.types, type];
      // Aspoň jeden typ musí zůstat zapnutý, jinak by kolo bylo prázdné.
      return { types: next.length > 0 ? next : prev.types };
    });
  }

  const allSelected = lessons.length > 0 && settings.lessonIds.length === lessons.length;
  const canStart = (preview?.inSession ?? 0) > 0;

  if (lessons.length === 0) {
    return (
      <Panel className="mt-4">
        <p className="text-base text-ink">
          Zatím tu nejsou žádné lekce. Přidej JSON soubor do složky{" "}
          <code className="rounded bg-surface-sunken px-1.5 py-0.5 text-sm">data/lessons/</code> a
          stránku obnov.
        </p>
      </Panel>
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-28">
      <Panel
        title="Lekce"
        action={
          <button
            type="button"
            onClick={() =>
              updateSettings({ lessonIds: allSelected ? [] : lessons.map((l) => l.id) })
            }
            className="text-sm font-medium text-brand"
          >
            {allSelected ? "Zrušit vše" : "Vybrat vše"}
          </button>
        }
      >
        <div className="flex flex-col gap-4">
          {books.map((book) => {
            const ids = book.lessons.map((l) => l.id);
            const allOn = ids.every((id) => selectedIds.has(id));
            const someOn = ids.some((id) => selectedIds.has(id));

            return (
              <div key={book.number}>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h3 className="text-base font-semibold text-ink">{book.title}</h3>
                  <button
                    type="button"
                    onClick={() => toggleBook(book)}
                    className="shrink-0 text-sm font-medium text-brand"
                  >
                    {allOn ? "Zrušit celou" : someOn ? "Doplnit celou" : "Celá učebnice"}
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {book.lessons.map((lesson) => (
                    <Chip
                      key={lesson.id}
                      selected={selectedIds.has(lesson.id)}
                      onClick={() => toggleLesson(lesson.id)}
                    >
                      {lesson.title.replace(`${book.title} – `, "")}
                      <span className="ml-1.5 opacity-60">{lesson.items.length}</span>
                    </Chip>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-sm">
          <Link href="/slovnicek" className="font-medium text-brand">
            Prohlédnout slovíčka v tabulce →
          </Link>
        </p>
      </Panel>

      <Panel title="Co zkoušet">
        <div className="flex flex-wrap gap-2">
          {TYPES.map((type) => {
            const count = selectedLessons.reduce(
              (sum, lesson) => sum + lesson.items.filter((i) => i.type === type).length,
              0,
            );
            return (
              <Chip
                key={type}
                selected={settings.types.includes(type)}
                onClick={() => toggleType(type)}
              >
                {TYPE_LABELS[type]}
                <span className="ml-1.5 opacity-60">{count}</span>
              </Chip>
            );
          })}
        </div>
      </Panel>

      <Panel title="Směr">
        <div className="flex flex-wrap gap-2">
          {DIRECTIONS.map((direction) => (
            <Chip
              key={direction}
              selected={settings.direction === direction}
              onClick={() => updateSettings({ direction })}
            >
              {DIRECTION_LABELS[direction]}
            </Chip>
          ))}
        </div>
      </Panel>

      <Panel title="Výběr kartiček">
        <div className="flex flex-wrap gap-2">
          {MODES.map((mode) => (
            <Chip
              key={mode}
              selected={settings.mode === mode}
              onClick={() => updateSettings({ mode })}
            >
              {MODE_LABELS[mode]}
            </Chip>
          ))}
        </div>
        <p className="mt-2 text-sm text-ink-muted">{MODE_HINTS[settings.mode]}</p>
        {waiting && (
          <div className="mt-3 rounded-2xl bg-surface-sunken px-4 py-3">
            <p className="text-sm text-ink">
              Teď není co opakovat – všechno z vybraných lekcí už jsi dal a čeká na svůj
              odstup. Nejbližší kartička přijde na řadu <strong>{waiting.in}</strong>.
            </p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <button
                type="button"
                onClick={() => updateSettings({ mode: "random" })}
                className="font-medium text-brand"
              >
                Procvičovat i tak
              </button>
              <span className="text-ink-muted">nebo si přiber další lekce výše.</span>
            </div>
          </div>
        )}
        {settings.mode === "marked" && (
          <p className="mt-1 text-sm text-ink-muted">
            Zaškrtnuto: <span className="font-semibold text-ink">{marked.size}</span>{" "}
            <Link href="/slovnicek" className="font-medium text-brand">
              upravit ve slovníčku →
            </Link>
          </p>
        )}
      </Panel>

      <Panel title="Délka kola">
        <div className="flex flex-wrap gap-2">
          {SESSION_SIZES.map((size) => (
            <Chip
              key={String(size.value)}
              selected={settings.sessionSize === size.value}
              onClick={() => updateSettings({ sessionSize: size.value })}
            >
              {size.label}
            </Chip>
          ))}
        </div>
      </Panel>

      <Panel title="Zvuk">
        <Switch
          label="Automaticky přehrát výslovnost"
          hint="Angličtinu přehraje hned, jak se objeví."
          checked={settings.autoPlayAudio}
          onChange={(autoPlayAudio) => updateSettings({ autoPlayAudio })}
        />
      </Panel>

      {stats && stats.total > 0 && (
        <Panel title="Jak na tom jsem">
          <div className="mb-3 grid grid-cols-3 gap-2 text-center">
            <Stat value={stats.due} label="na řadě" />
            <Stat value={stats.newCards} label="nových" tone="brand" />
            <Stat value={stats.mastered} label="naučeno" tone="good" />
          </div>
          <ProgressBar value={stats.mastered} max={stats.total} />
          <p className="mt-2 text-sm text-ink-muted">
            {stats.mastered} z {stats.total} kartiček je v posledním boxu.
          </p>
        </Panel>
      )}

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-surface/85 px-4 py-3 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-3">
          <div className="min-w-0 flex-1 text-sm text-ink-muted">
            {!ready || preview === null ? (
              <span className="text-ink-muted">Načítám…</span>
            ) : canStart ? (
              <>
                <span className="font-semibold text-ink">{preview.inSession} kartiček</span>
                {preview.available > preview.inSession && (
                  <span> z {preview.available} vybraných</span>
                )}
              </>
            ) : settings.mode === "marked" ? (
              "Ve slovníčku zatím nic není zaškrtnuté"
            ) : settings.lessonIds.length === 0 ? (
              "Vyber aspoň jednu lekci"
            ) : (
              "Pro toto nastavení nic nezbylo"
            )}
          </div>
          <Button
            onClick={() => {
              // Odemknutí zvuku musí proběhnout z kliknutí, jinak by první kartička
              // nezazněla – automatické přehrání spouští efekt, ne dotyk uživatele.
              primeAudio();
              router.push("/study");
            }}
            disabled={!ready || !canStart}
          >
            Spustit
          </Button>
        </div>
      </div>
    </div>
  );
}

function Stat({
  value,
  label,
  tone = "ink",
}: {
  value: number;
  label: string;
  tone?: "ink" | "brand" | "good";
}) {
  const color =
    tone === "brand" ? "text-brand" : tone === "good" ? "text-good" : "text-ink";
  return (
    <div className="rounded-2xl bg-surface-sunken px-2 py-3">
      <div className={`text-2xl font-bold tabular-nums ${color}`}>{value}</div>
      <div className="text-xs text-ink-muted">{label}</div>
    </div>
  );
}
