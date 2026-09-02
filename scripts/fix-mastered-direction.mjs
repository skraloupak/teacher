#!/usr/bin/env node
/**
 * Jednorázová oprava dat po změně chování tlačítka „tohle už umím".
 *
 * Dřív odložení platilo pro oba směry naráz. To ale není pravda – poznat slovo
 * v anglické větě je něco jiného než vybavit si ho z češtiny. Skript vrátí do
 * opakování ta odložení, která vznikla ve směru, kde uživatel nikdy neodpověděl.
 * Čeho se dotkl vlastním učením, nechá být.
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

  // Kartičky v posledním boxu, na které uživatel nikdy neodpověděl. Nemohly se tam
  // dostat učením – vznikly odložením, které dřív platilo pro oba směry. Bereme i ty
  // bez příznaku `mastered`, protože ten v aplikaci přibyl až později.
  const untouched = await progress
    .find({
      correct: 0,
      wrong: 0,
      $or: [{ mastered: true }, { box: { $gte: 5 } }],
    })
    .toArray();

  const byDirection = {};
  for (const card of untouched) {
    byDirection[card.direction] = (byDirection[card.direction] ?? 0) + 1;
  }

  const keptCount = await progress.countDocuments({
    box: { $gte: 5 },
    $or: [{ correct: { $gt: 0 } }, { wrong: { $gt: 0 } }],
  });

  console.log(`Naučených kartiček bez jediné odpovědi: ${untouched.length}`);
  for (const [direction, count] of Object.entries(byDirection)) {
    console.log(`  ${direction === "en2cs" ? "anglicky → česky" : "česky → anglicky"}: ${count}`);
  }
  console.log(`Naučených, které si uživatel odpracoval (zůstanou): ${keptCount}`);

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
