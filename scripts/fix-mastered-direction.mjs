#!/usr/bin/env node
/**
 * Jednorázová oprava dat po změně chování tlačítka „tohle už umím".
 *
 * Dřív odložení platilo pro oba směry naráz. To ale není pravda – poznat slovo
 * v anglické větě je něco jiného než vybavit si ho z češtiny.
 *
 * Skript vrátí do opakování jen ta odložení, která leží ve směru, kde uživatel
 * nikdy na nic neodpověděl. Takový směr se nemohl odložit vědomě, je to pozůstatek
 * starého chování. Odložení ve směru, který uživatel trénuje, zůstává – i když
 * na tu konkrétní kartičku neodpověděl, protože právě to tlačítko „už umím" umí.
 *
 *   npm run fix:mastered            # jen ukáže, co by udělal
 *   npm run fix:mastered -- --apply # provede
 */
import { MongoClient } from "mongodb";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
try {
  await client.connect();
  const progress = client.db(env.MONGODB_DATABASE).collection("progress");

  // Nejdřív zjistíme, které směry uživatel opravdu trénuje – tedy kde má aspoň
  // jednu odpověď. Odložení v NETRÉNOVANÉM směru nemohlo vzniknout vědomě;
  // je pozůstatek staršího chování, kdy tlačítko odkládalo oba směry naráz.
  const all = await progress.find({}).toArray();
  const answeredIn = new Set(
    all.filter((c) => c.correct > 0 || c.wrong > 0).map((c) => c.direction),
  );

  const untouched = all.filter(
    (c) =>
      !answeredIn.has(c.direction) &&
      c.correct === 0 &&
      c.wrong === 0 &&
      (c.mastered === true || c.box >= 5),
  );

  const keptDeliberate = all.filter(
    (c) =>
      answeredIn.has(c.direction) &&
      c.correct === 0 &&
      c.wrong === 0 &&
      (c.mastered === true || c.box >= 5),
  );

  console.log(
    `Směry, ve kterých se opravdu učíš: ${[...answeredIn].join(", ") || "(zatím žádný)"}\n`,
  );

  const byDirection = {};
  for (const card of untouched) {
    byDirection[card.direction] = (byDirection[card.direction] ?? 0) + 1;
  }

  const keptCount = all.filter(
    (c) => c.box >= 5 && (c.correct > 0 || c.wrong > 0),
  ).length;

  console.log(`K vrácení do opakování: ${untouched.length}`);
  for (const [direction, count] of Object.entries(byDirection)) {
    console.log(`  ${direction === "en2cs" ? "anglicky → česky" : "česky → anglicky"}: ${count}`);
  }
  console.log("\nZŮSTANOU beze změny:");
  console.log(`  odložená ve směru, který trénuješ: ${keptDeliberate.length}`);
  console.log(`  naučená vlastními odpověďmi:       ${keptCount}`);

  if (untouched.length === 0) {
    console.log("\nNení co opravovat.");
  } else if (!APPLY) {
    console.log("\nZkušební běh – nic se nezměnilo.");
    console.log("Provedeš to příkazem: npm run fix:mastered -- --apply");
  } else {
    const now = Date.now();
    const result = await progress.updateMany(
      { _id: { $in: untouched.map((c) => c._id) } },
      { $set: { mastered: false, box: 0, streak: 0, dueAt: now, lastSeen: now } },
    );
    console.log(`\nVráceno do opakování: ${result.modifiedCount} kartiček.`);
  }
} finally {
  await client.close().catch(() => {});
}
