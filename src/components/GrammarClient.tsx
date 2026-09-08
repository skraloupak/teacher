"use client";

import { useMemo, useState } from "react";
import { GrammarQuiz } from "@/components/GrammarQuiz";
import { Button, Chip, Panel } from "@/components/ui";
import { SpeakButton } from "@/components/SpeakButton";
import type { GrammarTopic } from "@/lib/types";

type Mode = "explain" | "practise";

export function GrammarClient({ topics }: { topics: GrammarTopic[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("explain");
  const [query, setQuery] = useState("");

  const topic = useMemo(
    () => topics.find((t) => t.id === openId) ?? null,
    [topics, openId],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return topics;
    return topics.filter(
      (t) =>
        t.title.toLowerCase().includes(needle) ||
        t.tagline.toLowerCase().includes(needle),
    );
  }, [topics, query]);

  if (topics.length === 0) {
    return (
      <Panel className="mt-4">
        <p className="text-ink">
          Zatím tu nejsou žádná témata. Přidej JSON do složky{" "}
          <code className="rounded bg-surface-sunken px-1.5 py-0.5 text-sm">data/grammar/</code>.
        </p>
      </Panel>
    );
  }

  // Detail tématu
  if (topic) {
    return (
      <div className="flex flex-col gap-4 pb-8">
        <div>
          <button
            type="button"
            onClick={() => setOpenId(null)}
            className="mb-2 text-sm font-medium text-brand"
          >
            ← Zpět na přehled
          </button>
          <h1 className="text-2xl font-bold text-ink">{topic.title}</h1>
          <p className="mt-0.5 text-ink-muted">{topic.tagline}</p>
        </div>

        <div className="flex gap-2">
          <Chip selected={mode === "explain"} onClick={() => setMode("explain")}>
            Vysvětlení
          </Chip>
          <Chip selected={mode === "practise"} onClick={() => setMode("practise")}>
            Procvičit
            <span className="ml-1.5 opacity-60">{topic.quiz.length}</span>
          </Chip>
        </div>

        {mode === "practise" ? (
          <GrammarQuiz key={topic.id} questions={topic.quiz} />
        ) : (
          <>
            <Panel title="O co jde">
              <p className="text-base leading-relaxed text-ink">{topic.core}</p>
            </Panel>

            <Panel title="Jak si to zapamatovat">
              <p className="text-base leading-relaxed text-ink">{topic.memoryHook}</p>
            </Panel>

            {topic.rules.length > 0 && (
              <Panel title="Pravidla">
                <dl className="flex flex-col divide-y divide-line">
                  {topic.rules.map((rule) => (
                    <div key={rule.label} className="py-2.5 first:pt-0 last:pb-0">
                      <dt className="font-semibold text-ink">{rule.label}</dt>
                      <dd className="mt-0.5 text-ink-muted">{rule.text}</dd>
                    </div>
                  ))}
                </dl>
              </Panel>
            )}

            {topic.examples.length > 0 && (
              <Panel title="Příklady">
                <ul className="flex flex-col divide-y divide-line">
                  {topic.examples.map((example) => (
                    <li key={example.en} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-ink">{example.en}</p>
                        <p className="text-sm text-ink-muted">{example.cs}</p>
                        {example.note && (
                          <p className="mt-0.5 text-sm text-ink-muted italic">{example.note}</p>
                        )}
                      </div>
                      <SpeakButton
                        item={{ en: example.en, audioKey: "", hasAudio: false }}
                        size="sm"
                      />
                    </li>
                  ))}
                </ul>
              </Panel>
            )}

            {topic.pitfalls && topic.pitfalls.length > 0 && (
              <Panel title="Na čem Čech chybuje">
                <ul className="flex flex-col gap-3">
                  {topic.pitfalls.map((pitfall) => (
                    <li key={pitfall.wrong}>
                      <p className="text-bad line-through decoration-bad/40">{pitfall.wrong}</p>
                      <p className="font-medium text-good">{pitfall.right}</p>
                      <p className="mt-0.5 text-sm text-ink-muted">{pitfall.why}</p>
                    </li>
                  ))}
                </ul>
              </Panel>
            )}

            <Button onClick={() => setMode("practise")} className="w-full py-4">
              Vyzkoušet se ({topic.quiz.length} otázek)
            </Button>
          </>
        )}
      </div>
    );
  }

  // Přehled témat
  return (
    <div className="flex flex-col gap-4 pb-8">
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Hledat téma…"
        className="w-full rounded-2xl border border-line bg-surface-raised px-4 py-3 text-base text-ink outline-none placeholder:text-ink-muted focus-visible:border-brand"
      />

      <ul className="flex flex-col gap-2">
        {filtered.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => {
                setOpenId(item.id);
                setMode("explain");
              }}
              className="no-tap-zoom flex w-full items-center gap-3 rounded-3xl border border-line bg-surface-raised p-4 text-left transition-colors hover:border-brand/60"
            >
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-ink">{item.title}</p>
                <p className="truncate text-sm text-ink-muted">{item.tagline}</p>
              </div>
              <span className="shrink-0 text-sm text-ink-muted">{item.quiz.length} otázek</span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0 text-ink-muted">
                <path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </li>
        ))}
      </ul>

      {filtered.length === 0 && (
        <Panel>
          <p className="text-ink-muted">Nic neodpovídá hledání.</p>
        </Panel>
      )}
    </div>
  );
}
