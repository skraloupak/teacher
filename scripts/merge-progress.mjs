#!/usr/bin/env node
/**
 * Jednorázová migrace po sloučení slovíček, která učebnice uvádí ve víc lekcích.
 *
 * Dřív mělo „left" tři kartičky s třemi různými překlady (levý / odešel / zbylý)
 * a uživatel se neměl jak trefit do toho, který z nich se zrovna čeká. Nově je
 * z nich jedna kartička se všemi významy – a její postup je potřeba složit
 * ze tří starých záznamů.
 *
 * Slučuje se konzervativně: box a streak se berou nejnižší a „už umím" platí jen
 * tehdy, když bylo odložené ve všech předlohách. Kartička totiž nově zkouší i
 * významy, které uživatel v dané lekci nikdy neviděl.
 *
 *   npm run merge:progress            # jen ukáže, co by udělal
 *   npm run merge:progress -- --apply # provede
 */
import { MongoClient } from "mongodb";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { audioKeyFor, mergeKeyFor } from "../src/lib/slug.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APPLY = process.argv.includes("--apply");

function loadEnv() {
  const env = {};
  try {
    for (const line of readFileSync(path.join(ROOT, ".env"), "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#") || !t.includes("=")) continue;
      const [k, ...rest] = t.split("=");
      env[k.trim()] = rest.join("=").trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    // .env nemusí existovat – proměnné pak přijdou z prostředí.
  }
  return { ...env, ...process.env };
}

/**
 * Postaví mapu „staré id položky → nové id".
 *
 * Stará id se musí spočítat přesně tou logikou, kterou měl buildLesson před sloučením,
 * jinak by se k záznamům v databázi nešlo dohledat.
 */
function buildIdMap() {
  const merged = JSON.parse(readFileSync(path.join(ROOT, "data", "merged-words.json"), "utf8"));
  const lessonsDir = path.join(ROOT, "data", "lessons");
  const map = new Map();

  for (const file of readdirSync(lessonsDir).filter((f) => f.endsWith(".json")).sort()) {
    const raw = JSON.parse(readFileSync(path.join(lessonsDir, file), "utf8"));
    const seen = new Map();

    for (const item of raw.items ?? []) {
      if (typeof item?.en !== "string" || !item.en.trim()) continue;
      const en = item.en.trim();
      const oldKey = audioKeyFor(en);
      const dupes = seen.get(oldKey) ?? 0;
      seen.set(oldKey, dupes + 1);
      const oldId = dupes === 0 ? `${raw.id}:${oldKey}` : `${raw.id}:${oldKey}-${dupes + 1}`;

      const merge = merged[mergeKeyFor(en)];
      if (!merge) continue;
      map.set(oldId, `merged:${audioKeyFor(merge.en.trim())}`);
    }
  }
  return map;
}

/** Složí jeden postup z víc starých – vždy tou opatrnější variantou. */
function combine(cards, newItemId) {
  const sorted = [...cards].sort((a, b) => a.box - b.box);
  const base = sorted[0];
  return {
    key: `${newItemId}:${base.direction}`,
    itemId: newItemId,
    direction: base.direction,
    // Nejnižší box: kartička nově zkouší i významy, které uživatel neviděl.
    box: Math.min(...cards.map((c) => c.box ?? 0)),
    streak: Math.min(...cards.map((c) => c.streak ?? 0)),
    correct: cards.reduce((sum, c) => sum + (c.correct ?? 0), 0),
    wrong: cards.reduce((sum, c) => sum + (c.wrong ?? 0), 0),
    lastSeen: Math.max(...cards.map((c) => c.lastSeen ?? 0)),
    // Nejdřívější termín – ať se sloučená kartička neodloží déle, než by kterákoli předloha.
    dueAt: Math.min(...cards.map((c) => c.dueAt ?? 0)),
    // „Už umím" platí jen tehdy, když bylo odložené ve všech předlohách.
    mastered: cards.every((c) => c.mastered === true),
  };
}

const env = loadEnv();
for (const key of ["MONGODB_USER", "MONGODB_PASSWORD", "MONGODB_HOST", "MONGODB_DATABASE"]) {
  if (!env[key]) {
    console.error(`Chybí ${key} v .env.`);
    process.exit(1);
  }
}

const uri =
  `mongodb+srv://${encodeURIComponent(env.MONGODB_USER)}:${encodeURIComponent(env.MONGODB_PASSWORD)}` +
  `@${env.MONGODB_HOST.replace(/^mongodb(\+srv)?:\/\//, "")}/${env.MONGODB_DATABASE}` +
  `?authSource=${env.MONGODB_AUTH_SOURCE ?? "admin"}&tls=true`;

const idMap = buildIdMap();
console.log(`Sloučených položek v datech: ${new Set(idMap.values()).size} (z ${idMap.size} výskytů v lekcích)\n`);

const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
try {
  await client.connect();
  const db = client.db(env.MONGODB_DATABASE);
  const progress = db.collection("progress");
  const profiles = db.collection("profiles");

  const all = await progress.find({}).toArray();
  const dotcene = all.filter((c) => idMap.has(c.itemId));

  // Seskupíme podle cílové kartičky a směru – každá dvojice dá jeden nový záznam.
  const groups = new Map();
  for (const card of dotcene) {
    const newItemId = idMap.get(card.itemId);
    const groupKey = `${card.profileId}|${newItemId}|${card.direction}`;
    if (!groups.has(groupKey)) {
      groups.set(groupKey, { profileId: card.profileId, newItemId, cards: [] });
    }
    groups.get(groupKey).cards.push(card);
  }

  const slucovane = [...groups.values()].filter((g) => g.cards.length > 1);
  const prejmenovane = [...groups.values()].filter((g) => g.cards.length === 1);
  const masteredPryc = [...groups.values()].filter(
    (g) => g.cards.some((c) => c.mastered === true) && !g.cards.every((c) => c.mastered === true),
  );

  console.log(`Záznamů v databázi celkem:     ${all.length}`);
  console.log(`Dotčených sloučením:           ${dotcene.length}`);
  console.log(`  → vznikne nových kartiček:   ${groups.size}`);
  console.log(`     z toho složených z víc:   ${slucovane.length}`);
  console.log(`     z toho jen přejmenování:  ${prejmenovane.length}`);
  console.log(`Ubyde záznamů:                 ${dotcene.length - groups.size}`);
  console.log(`\nOdložení „už umím" se zruší u ${masteredPryc.length} kartiček,`);
  console.log(`protože nebylo odložené ve všech lekcích, ze kterých se slovíčko slučuje.`);

  if (slucovane.length > 0) {
    console.log(`\nUkázka slučovaných (prvních 8):`);
    for (const g of slucovane.slice(0, 8)) {
      const boxy = g.cards.map((c) => `${c.itemId.split(":")[0]}=box${c.box}`).join(", ");
      const vysledek = combine(g.cards, g.newItemId);
      console.log(`  ${g.newItemId.replace("merged:", "")} (${g.cards[0].direction})`);
      console.log(`    ${boxy}  →  box${vysledek.box}, správně ${vysledek.correct}×, špatně ${vysledek.wrong}×`);
    }
  }

  // Zaškrtnutá slovíčka ve slovníčku drží taky stará id.
  const profilyList = await profiles.find({}).toArray();
  let markedZmen = 0;
  const markedUpdates = [];
  for (const profil of profilyList) {
    const marked = profil.marked;
    if (!Array.isArray(marked) || marked.length === 0) continue;
    const nove = [...new Set(marked.map((id) => idMap.get(id) ?? id))];
    if (nove.length !== marked.length || nove.some((id, i) => id !== marked[i])) {
      markedZmen += marked.filter((id) => idMap.has(id)).length;
      markedUpdates.push({ _id: profil._id, marked: nove });
    }
  }
  console.log(`\nZaškrtnutá slovíčka k přepsání: ${markedZmen}`);

  if (dotcene.length === 0 && markedUpdates.length === 0) {
    console.log("\nNení co migrovat.");
  } else if (!APPLY) {
    console.log("\nZkušební běh – nic se nezměnilo.");
    console.log("Provedeš to příkazem: npm run merge:progress -- --apply");
    console.log("\nPřed spuštěním zavři aplikaci ve všech prohlížečích. Otevřená karta");
    console.log("drží postup se starými id a po migraci by je uložila zpátky.");
  } else {
    const noveZaznamy = [...groups.values()].map((g) => {
      const slozeny = combine(g.cards, g.newItemId);
      return {
        _id: `${g.profileId}:${slozeny.key}`,
        profileId: g.profileId,
        ...slozeny,
      };
    });

    // Nejdřív zapsat nové, až potom mazat staré – kdyby to spadlo mezi tím,
    // je lepší mít data dvakrát než je ztratit.
    //
    // Zapisuje se stejným pravidlem jako v API: jen když je skládaný výsledek aspoň
    // tak čerstvý jako to, co v databázi leží. Bez toho by druhý běh skriptu (nebo běh
    // po tom, co se uživatel na sloučenou kartičku mezitím učil) přepsal nasbíraný
    // pokrok starými hodnotami.
    if (noveZaznamy.length > 0) {
      await progress.bulkWrite(
        noveZaznamy.map((doc) => ({
          updateOne: {
            filter: { _id: doc._id },
            update: [
              {
                $replaceWith: {
                  $cond: [
                    { $gte: [doc.lastSeen, { $ifNull: ["$lastSeen", -1] }] },
                    { $literal: doc },
                    "$$ROOT",
                  ],
                },
              },
            ],
            upsert: true,
          },
        })),
        { ordered: false },
      );
    }

    const smazano =
      dotcene.length > 0
        ? await progress.deleteMany({ _id: { $in: dotcene.map((c) => c._id) } })
        : { deletedCount: 0 };

    for (const update of markedUpdates) {
      await profiles.updateOne({ _id: update._id }, { $set: { marked: update.marked } });
    }

    console.log(`\nZapsáno nových kartiček: ${noveZaznamy.length}`);
    console.log(`Smazáno starých záznamů: ${smazano.deletedCount}`);
    console.log(`Upravených profilů:      ${markedUpdates.length}`);
  }
} finally {
  await client.close().catch(() => {});
}
