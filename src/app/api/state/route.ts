import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { COLLECTIONS, PROFILE_ID, getDb, isMongoConfigured } from "@/lib/mongo";
import type { CardProgress, ProgressMap, SessionRecord, StudySettings } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Kolik posledních kol se drží v historii. */
const MAX_SESSIONS = 200;

type StatePayload = {
  progress?: ProgressMap;
  settings?: StudySettings | null;
  sessions?: SessionRecord[];
  marked?: string[];
  /** Čas poslední změny nastavení a výběru na straně klienta. */
  updatedAt?: number;
};

function notConfigured() {
  // 501 říká klientovi „tohle tu není zapnuté" – aplikace pak jede jen z prohlížeče.
  return NextResponse.json(
    { error: "MongoDB není nakonfigurované.", configured: false },
    { status: 501 },
  );
}

/**
 * Pod jakým klíčem se ukládají data. Když je zapnuté přihlašování, je to id uživatele,
 * takže každý má svůj pokrok; bez něj se použije jeden sdílený profil.
 */
async function resolveProfileId(): Promise<string | null> {
  if (!process.env.AUTH_SECRET) return PROFILE_ID;
  const session = await getSession();
  return session ? session.sub : null;
}

function unauthorized() {
  return NextResponse.json({ error: "Nepřihlášeno." }, { status: 401 });
}

export async function GET() {
  if (!isMongoConfigured()) return notConfigured();

  const profileId = await resolveProfileId();
  if (!profileId) return unauthorized();

  try {
    const db = await getDb();
    if (!db) return notConfigured();

    const [cards, profile, sessions] = await Promise.all([
      db
        .collection<CardProgress & { profileId: string }>(COLLECTIONS.progress)
        .find({ profileId: profileId })
        .toArray(),
      db.collection(COLLECTIONS.profiles).findOne({ _id: profileId as never }),
      db
        .collection<SessionRecord & { profileId: string }>(COLLECTIONS.sessions)
        .find({ profileId: profileId })
        .sort({ finishedAt: 1 })
        .limit(MAX_SESSIONS)
        .toArray(),
    ]);

    const progress: ProgressMap = {};
    for (const card of cards) {
      progress[card.key] = {
        key: card.key,
        itemId: card.itemId,
        direction: card.direction,
        box: card.box,
        correct: card.correct,
        wrong: card.wrong,
        streak: card.streak,
        lastSeen: card.lastSeen,
        dueAt: card.dueAt,
      };
    }

    return NextResponse.json({
      configured: true,
      progress,
      settings: (profile?.settings as StudySettings | undefined) ?? null,
      marked: (profile?.marked as string[] | undefined) ?? [],
      updatedAt: (profile?.updatedAt as number | undefined) ?? 0,
      sessions: sessions.map((doc) => ({
        id: doc.id,
        finishedAt: doc.finishedAt,
        lessonIds: doc.lessonIds,
        direction: doc.direction,
        types: doc.types,
        total: doc.total,
        correct: doc.correct,
        wrong: doc.wrong,
        durationMs: doc.durationMs,
      })),
    });
  } catch (error) {
    console.error("[api/state] čtení selhalo:", error);
    return NextResponse.json({ error: "Čtení z databáze selhalo." }, { status: 502 });
  }
}

export async function PUT(request: Request) {
  if (!isMongoConfigured()) return notConfigured();

  let payload: StatePayload;
  try {
    payload = (await request.json()) as StatePayload;
  } catch {
    return NextResponse.json({ error: "Neplatné tělo požadavku." }, { status: 400 });
  }

  const profileId = await resolveProfileId();
  if (!profileId) return unauthorized();

  try {
    const db = await getDb();
    if (!db) return notConfigured();

    // Kartičky: přepíšeme jen tehdy, když je příchozí odpověď novější.
    // Díky tomu si dvě zařízení navzájem nepřemažou pokrok.
    const cards = Object.values(payload.progress ?? {});
    if (cards.length > 0) {
      await db.collection(COLLECTIONS.progress).bulkWrite(
        cards.map((card) => {
          const _id = `${profileId}:${card.key}`;
          return {
            updateOne: {
              filter: { _id: _id as never },
              update: [
                {
                  $replaceWith: {
                    $cond: [
                      { $gte: [card.lastSeen, { $ifNull: ["$lastSeen", -1] }] },
                      { $literal: { _id, profileId: profileId, ...card } },
                      "$$ROOT",
                    ],
                  },
                },
              ],
              upsert: true,
            },
          };
        }),
        { ordered: false },
      );
    }

    // Historie kol jsou neměnné záznamy – stačí je založit, když ještě nejsou.
    const sessions = payload.sessions ?? [];
    if (sessions.length > 0) {
      await db.collection(COLLECTIONS.sessions).bulkWrite(
        sessions.map((record) => ({
          updateOne: {
            filter: { _id: `${profileId}:${record.id}` as never },
            update: { $setOnInsert: { profileId: profileId, ...record } },
            upsert: true,
          },
        })),
        { ordered: false },
      );
    }

    // Nastavení a zaškrtnutá slovíčka nemají historii – platí poslední změna.
    const profilePatch: Record<string, unknown> = {};
    if (payload.settings) profilePatch.settings = payload.settings;
    if (payload.marked) profilePatch.marked = payload.marked;

    if (Object.keys(profilePatch).length > 0) {
      const updatedAt = payload.updatedAt ?? Date.now();
      await db.collection(COLLECTIONS.profiles).updateOne(
        { _id: profileId as never },
        [
          {
            $set: Object.fromEntries(
              Object.entries({ ...profilePatch, updatedAt }).map(([field, value]) => [
                field,
                {
                  $cond: [
                    { $gte: [updatedAt, { $ifNull: ["$updatedAt", -1] }] },
                    { $literal: value },
                    `$${field}`,
                  ],
                },
              ]),
            ),
          },
        ],
        { upsert: true },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[api/state] zápis selhal:", error);
    return NextResponse.json({ error: "Zápis do databáze selhal." }, { status: 502 });
  }
}

/** Smaže pokrok i historii; nastavení a výběr zůstávají. */
export async function DELETE() {
  if (!isMongoConfigured()) return notConfigured();

  const profileId = await resolveProfileId();
  if (!profileId) return unauthorized();

  try {
    const db = await getDb();
    if (!db) return notConfigured();

    await Promise.all([
      db.collection(COLLECTIONS.progress).deleteMany({ profileId }),
      db.collection(COLLECTIONS.sessions).deleteMany({ profileId }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[api/state] mazání selhalo:", error);
    return NextResponse.json({ error: "Mazání v databázi selhalo." }, { status: 502 });
  }
}
