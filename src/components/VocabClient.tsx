"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { SpeakButton } from "@/components/SpeakButton";
import { Chip, Panel } from "@/components/ui";
import { useAppState } from "@/hooks/useAppState";
import { TYPE_LABELS } from "@/lib/settings";
import { BOX_LABELS, MAX_BOX, progressKey } from "@/lib/srs";
import type { Book, Item, ItemType, Lesson } from "@/lib/types";

type Scope = { kind: "all" } | { kind: "book"; book: number } | { kind: "lesson"; id: string };
/** Který sloupec je zakrytý, aby se dalo zkoušet sám ze sebe. */
type Cover = "none" | "cs" | "en";

const COVER_LABELS: Record<Cover, string> = {
  none: "Nic",
  cs: "Češtinu",
  en: "Angličtinu",
};

/** Zjednodušené hledání – bez diakritiky a bez ohledu na velikost písmen. */
function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function VocabClient({ lessons, books }: { lessons: Lesson[]; books: Book[] }) {
  const { progress, marked, toggleMark, clearMarks } = useAppState(lessons);
  const [scope, setScope] = useState<Scope>({ kind: "all" });
  const [typeFilter, setTypeFilter] = useState<ItemType | "all">("all");
  const [onlyMarked, setOnlyMarked] = useState(false);
  const [cover, setCover] = useState<Cover>("none");
  const [peeked, setPeeked] = useState<ReadonlySet<string>>(() => new Set());
  const [query, setQuery] = useState("");

  function peek(id: string) {
    setPeeked((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }

  function changeCover(next: Cover) {
    setCover(next);
    setPeeked(new Set());
  }

  const items = useMemo(() => {
    const inScope = lessons.filter((lesson) =>
      scope.kind === "all"
        ? true
        : scope.kind === "book"
          ? lesson.book === scope.book
          : lesson.id === scope.id,
    );
    const all = inScope.flatMap((lesson) => lesson.items);
    const byType = typeFilter === "all" ? all : all.filter((i) => i.type === typeFilter);
    const byMark = onlyMarked ? byType.filter((i) => marked.has(i.id)) : byType;
    const needle = normalize(query.trim());
    if (!needle) return byMark;
    return byMark.filter(
      (item) =>
        normalize(item.en).includes(needle) ||
        normalize(item.cs).includes(needle) ||
        normalize(item.note ?? "").includes(needle),
    );
  }, [lessons, scope, typeFilter, onlyMarked, marked, query]);

  /** Nejnižší dosažený box napříč oběma směry – hrubý ukazatel „jak to umím". */
  function boxOf(item: Item): number | null {
    const a = progress[progressKey(item.id, "en2cs")]?.box;
    const b = progress[progressKey(item.id, "cs2en")]?.box;
    if (a === undefined && b === undefined) return null;
    return Math.min(a ?? MAX_BOX, b ?? MAX_BOX);
  }

  if (lessons.length === 0) {
    return (
      <Panel className="mt-4">
        <p className="text-ink">Zatím tu nejsou žádné lekce.</p>
      </Panel>
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-8">
      <Panel title="Odkud">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <Chip selected={scope.kind === "all"} onClick={() => setScope({ kind: "all" })}>
              Vše
              <span className="ml-1.5 opacity-60">
                {lessons.reduce((sum, l) => sum + l.items.length, 0)}
              </span>
            </Chip>
            {books.map((book) => (
              <Chip
                key={book.number}
                selected={scope.kind === "book" && scope.book === book.number}
                onClick={() => setScope({ kind: "book", book: book.number })}
              >
                {book.title}
                <span className="ml-1.5 opacity-60">{book.itemCount}</span>
              </Chip>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 border-t border-line pt-3">
            {lessons.map((lesson) => (
              <Chip
                key={lesson.id}
                selected={scope.kind === "lesson" && scope.id === lesson.id}
                onClick={() => setScope({ kind: "lesson", id: lesson.id })}
              >
                {lesson.title}
                <span className="ml-1.5 opacity-60">{lesson.items.length}</span>
              </Chip>
            ))}
          </div>
        </div>
      </Panel>

      <Panel title="Filtr">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <Chip selected={typeFilter === "all"} onClick={() => setTypeFilter("all")}>
              Vše
            </Chip>
            {(["word", "phrase"] as ItemType[]).map((type) => (
              <Chip key={type} selected={typeFilter === type} onClick={() => setTypeFilter(type)}>
                {TYPE_LABELS[type]}
              </Chip>
            ))}
            <Chip selected={onlyMarked} onClick={() => setOnlyMarked(!onlyMarked)}>
              Jen zaškrtnuté
              <span className="ml-1.5 opacity-60">{marked.size}</span>
            </Chip>
          </div>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Hledat česky nebo anglicky…"
            className="w-full rounded-2xl border border-line bg-surface-raised px-4 py-3 text-base text-ink outline-none placeholder:text-ink-muted focus-visible:border-brand"
          />
        </div>
      </Panel>

      <Panel title="Zakrýt pro zkoušení">
        <div className="flex flex-wrap gap-2">
          {(["none", "cs", "en"] as Cover[]).map((value) => (
            <Chip key={value} selected={cover === value} onClick={() => changeCover(value)}>
              {COVER_LABELS[value]}
            </Chip>
          ))}
        </div>
        {cover !== "none" && (
          <p className="mt-2 text-sm text-ink-muted">
            Klepnutím na zakryté pole si ho odkryješ.
          </p>
        )}
      </Panel>

      {marked.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-sm">
          <span className="text-ink-muted">
            Zaškrtnuto {marked.size} slovíček – v{" "}
            <Link href="/" className="font-medium text-brand">
              učení
            </Link>{" "}
            je vyzkoušíš volbou „Vybrané“.
          </span>
          <button type="button" onClick={clearMarks} className="font-medium text-brand">
            Zrušit zaškrtnutí
          </button>
        </div>
      )}

      <Panel title={`Slovíčka (${items.length})`} className="px-0 sm:px-0">
        {items.length === 0 ? (
          <p className="px-4 text-ink-muted sm:px-5">Nic neodpovídá filtru.</p>
        ) : (
          <ul className="divide-y divide-line">
            {items.map((item) => {
              const box = boxOf(item);
              const isMarked = marked.has(item.id);
              const open = peeked.has(item.id);

              return (
                <li key={item.id} className="flex items-start gap-2 px-3 py-2.5 sm:px-4">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={isMarked}
                    aria-label={`Zaškrtnout ${item.en}`}
                    onClick={() => toggleMark(item.id)}
                    className={`no-tap-zoom mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                      isMarked
                        ? "border-brand bg-brand text-on-brand"
                        : "border-line bg-surface-raised text-transparent"
                    }`}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path
                        d="m5 12.5 4.5 4.5L19 7.5"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>

                  <div className="grid min-w-0 flex-1 grid-cols-2 gap-2 sm:gap-4">
                    <div className="flex min-w-0 items-start gap-2">
                      <SpeakButton item={item} size="sm" className="mt-0.5" />
                      <Covered
                        hidden={cover === "en" && !open}
                        onPeek={() => peek(item.id)}
                        label="anglicky"
                      >
                        <span className="font-semibold break-words text-ink">{item.en}</span>
                        {item.ipa && (
                          <span className="block font-mono text-sm break-words text-ink-muted">
                            [{item.ipa}]
                          </span>
                        )}
                      </Covered>
                    </div>

                    <div className="flex min-w-0 flex-col items-start">
                      <Covered
                        hidden={cover === "cs" && !open}
                        onPeek={() => peek(item.id)}
                        label="česky"
                      >
                        <span className="break-words text-ink">{item.cs}</span>
                        {item.note && (
                          <span className="block text-sm break-words text-ink-muted italic">
                            {item.note}
                          </span>
                        )}
                      </Covered>
                      {box !== null && (
                        <span
                          className={`mt-0.5 text-xs ${
                            box >= MAX_BOX ? "text-good" : "text-ink-muted"
                          }`}
                          title={`Box ${box}: ${BOX_LABELS[box]}`}
                        >
                          {box >= MAX_BOX ? "naučeno" : `box ${box}`}
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}

/** Sloupec, který jde skrýt kvůli samozkoušení a klepnutím zase odkrýt. */
function Covered({
  hidden,
  onPeek,
  label,
  children,
}: {
  hidden: boolean;
  onPeek: () => void;
  label: string;
  children: React.ReactNode;
}) {
  if (!hidden) return <div className="min-w-0">{children}</div>;

  return (
    <button
      type="button"
      onClick={onPeek}
      aria-label={`Odkrýt ${label}`}
      className="no-tap-zoom h-6 w-full rounded-lg bg-surface-sunken transition-colors hover:bg-line"
    />
  );
}
