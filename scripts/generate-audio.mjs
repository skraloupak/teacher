#!/usr/bin/env node
/**
 * Vygeneruje anglickou výslovnost pro všechna slovíčka a fráze do public/audio/*.m4a.
 * Používá vestavěný macOS `say`, takže nepotřebuje žádnou službu ani API klíč.
 *
 *   npm run audio                  # doplní jen chybějící
 *   npm run audio -- --force       # přegeneruje vše
 *   npm run audio:clean            # doplní chybějící a smaže osiřelé soubory
 *   VOICE=Daniel npm run audio     # konkrétní hlas; bez toho se vybere nejlepší nainstalovaný
 *   AUDIO_QUALITY=82 npm run audio -- --force   # vyšší kvalita (VBR 0–127, výchozí 64)
 *
 * Seznam hlasů vypíše `say -v '?' | grep en_`.
 */
import { execFile } from "node:child_process";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { audioKeyFor } from "../src/lib/slug.ts";
import { stripFreeAtoms } from "./m4a.mjs";

const execFileAsync = promisify(execFile);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LESSONS_DIR = path.join(ROOT, "data", "lessons");
const AUDIO_DIR = path.join(ROOT, "public", "audio");
const MANIFEST = path.join(AUDIO_DIR, "manifest.json");
/** Mezivýsledky patří do systémového tempu, ne do public/ – po pádu by se jinak dostaly do buildu. */
const TEMP_DIR = path.join(os.tmpdir(), "teacher-app-audio");

/**
 * Pořadí, ve kterém sáhneme po hlasu, když žádný není zadaný.
 * Enhanced/Premium varianty jsou neuronové a čtou plynule; compact hlasy zní roboticky.
 * Jména se hledají jako podřetězec, takže „Allison" chytí i „Allison (Enhanced)".
 */
const VOICE_PREFERENCE = [
  "Allison (Premium)",
  "Allison (Enhanced)",
  "Serena (Premium)",
  "Serena (Enhanced)",
  "Ava (Premium)",
  "Ava (Enhanced)",
  "Susan (Enhanced)",
  "Tom (Enhanced)",
  "Kate (Enhanced)",
  "Oliver (Enhanced)",
  "Samantha",
  "Daniel",
];
const RATE = process.env.AUDIO_RATE || "170"; // slov za minutu – mírně zpomaleno pro učení
/**
 * Řeč v mono AAC – `say` sám o sobě zapisuje skoro nekomprimovaný zvuk, proto se překóduje.
 * Hlasy macOS syntetizují nativně 22 050 Hz mono, takže vyšší vzorkovací frekvence ani
 * stereo nepřinesou nic než větší soubory.
 *
 * Kvalitu řídí VBR (`-s 3`), kde se stupeň zadává jako `vbrq` 0–127; pevný bitrate (`-b`)
 * se v tomhle režimu ignoruje. Výchozích 64 vychází na zhruba 54 kbps.
 */
const SAMPLE_RATE = process.env.AUDIO_SAMPLE_RATE || "22050";
const QUALITY = process.env.AUDIO_QUALITY || "64";
const DATA_FORMAT = `aac@${SAMPLE_RATE} vbrq${QUALITY}`;
const CONCURRENCY = 4;

const args = new Set(process.argv.slice(2));
const FORCE = args.has("--force");
const PRUNE = args.has("--prune");

/** Vypíše nainstalované anglické hlasy tak, jak je zná `say`. */
async function listEnglishVoices() {
  const { stdout } = await execFileAsync("say", ["-v", "?"]);
  const voices = [];
  for (const line of stdout.split("\n")) {
    // Formát: "Allison (Enhanced)  en_US    # Hello! My name is Allison."
    const match = /^(.+?)\s{2,}(en_[A-Z]{2})\s/.exec(line);
    if (match) voices.push({ name: match[1].trim(), lang: match[2] });
  }
  return voices;
}

/** Vybere nejlepší nainstalovaný hlas podle žebříčku výše. */
async function pickVoice() {
  if (process.env.VOICE) return process.env.VOICE;

  const installed = await listEnglishVoices();
  for (const wanted of VOICE_PREFERENCE) {
    const hit = installed.find((v) => v.name === wanted);
    if (hit) return hit.name;
  }
  // Nic z žebříčku – vezmeme cokoli anglického, ať skript nespadne.
  return installed[0]?.name ?? "Samantha";
}

async function collectItems() {
  const files = (await readdir(LESSONS_DIR)).filter((f) => f.endsWith(".json")).sort();
  /** @type {Map<string, string>} klíč -> anglický text */
  const wanted = new Map();

  for (const file of files) {
    const raw = JSON.parse(await readFile(path.join(LESSONS_DIR, file), "utf8"));
    for (const item of raw.items ?? []) {
      if (typeof item?.en !== "string" || !item.en.trim()) continue;
      const en = item.en.trim();
      wanted.set(audioKeyFor(en), en);
    }
  }
  return wanted;
}

async function loadManifest() {
  try {
    return JSON.parse(await readFile(MANIFEST, "utf8"));
  } catch {
    return { voice: null, format: null, entries: {} };
  }
}

async function synthesize(voice, key, text) {
  const target = path.join(AUDIO_DIR, `${key}.m4a`);
  const rawTemp = path.join(TEMP_DIR, `${key}.aiff`);
  const encodedTemp = path.join(TEMP_DIR, `${key}.m4a`);

  try {
    await execFileAsync("say", ["-v", voice, "-r", RATE, "-o", rawTemp, "--", text]);
    // afconvert je součást macOS; mono 22 kHz zmenší soubor zhruba na čtvrtinu.
    await execFileAsync("afconvert", [
      "-f", "m4af",
      "-d", `aac@${SAMPLE_RATE}`,
      "-u", "vbrq", QUALITY,
      "--mix", "-c", "1",
      "-s", "3",
      rawTemp,
      encodedTemp,
    ]);
    // afconvert zarovnává zvuková data na 4 kB a mezeru vyplní ničím; u krátkých nahrávek
    // je to skoro 40 % souboru. Do public/ zapisujeme až hotový výsledek, takže přerušený
    // běh nenechá useknutou nahrávku, kterou by příští spuštění považovalo za vyřízenou.
    await writeFile(target, stripFreeAtoms(await readFile(encodedTemp)));
  } finally {
    await rm(rawTemp, { force: true });
    await rm(encodedTemp, { force: true });
  }
}

/** Spustí úlohy s omezeným počtem souběžných procesů. */
async function runPool(tasks, limit) {
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (index < tasks.length) {
      const current = tasks[index++];
      await current();
    }
  });
  await Promise.all(workers);
}

async function main() {
  if (process.platform !== "darwin") {
    console.error("Tenhle generátor používá macOS `say`. Na jiném systému audio nevznikne –");
    console.error("aplikace pak sáhne po hlasu prohlížeče (Web Speech API).");
    process.exit(1);
  }

  const voice = await pickVoice();
  console.log(`Hlas: ${voice}${process.env.VOICE ? "" : " (vybrán automaticky)"}`);

  await mkdir(AUDIO_DIR, { recursive: true });
  await rm(TEMP_DIR, { recursive: true, force: true });
  await mkdir(TEMP_DIR, { recursive: true });

  // Pozůstatky starší verze skriptu, která psala dočasné soubory do public/audio.
  for (const file of await readdir(AUDIO_DIR)) {
    if (file.startsWith(".") && file.endsWith(".tmp.aiff")) {
      await rm(path.join(AUDIO_DIR, file), { force: true });
    }
  }

  const wanted = await collectItems();
  const manifest = await loadManifest();
  const voiceChanged =
    manifest.voice !== voice || manifest.format !== DATA_FORMAT || manifest.rate !== RATE;

  if (voiceChanged && manifest.voice) {
    console.log(
      `Nastavení se změnilo (${manifest.voice} @ ${manifest.format}, tempo ${manifest.rate} ` +
        `→ ${voice} @ ${DATA_FORMAT}, tempo ${RATE}) – generuji znovu vše.`,
    );
  }

  const todo = [];
  for (const [key, text] of wanted) {
    const exists = existsSync(path.join(AUDIO_DIR, `${key}.m4a`));
    if (!FORCE && !voiceChanged && exists) continue;
    todo.push({ key, text });
  }

  console.log(`Položek celkem: ${wanted.size}, ke generování: ${todo.length}`);

  let done = 0;
  let failed = 0;
  await runPool(
    todo.map(({ key, text }) => async () => {
      try {
        await synthesize(voice, key, text);
      } catch (error) {
        failed++;
        console.warn(`  ✗ ${text} → ${error.message}`);
        return;
      }
      done++;
      if (done % 25 === 0 || done === todo.length) {
        console.log(`  ${done}/${todo.length}`);
      }
    }),
    CONCURRENCY,
  );

  let pruned = 0;
  if (PRUNE) {
    const existing = (await readdir(AUDIO_DIR)).filter((f) => f.endsWith(".m4a"));
    for (const file of existing) {
      if (!wanted.has(file.slice(0, -4))) {
        await rm(path.join(AUDIO_DIR, file));
        pruned++;
      }
    }
  }

  const entries = {};
  for (const [key, text] of wanted) {
    if (existsSync(path.join(AUDIO_DIR, `${key}.m4a`))) entries[key] = text;
  }
  await writeFile(
    MANIFEST,
    JSON.stringify(
      { voice, format: DATA_FORMAT, rate: RATE, count: Object.keys(entries).length, entries },
      null,
      2,
    ) + "\n",
  );

  const bytes = (await readdir(AUDIO_DIR))
    .filter((f) => f.endsWith(".m4a"))
    .reduce((sum, f) => sum + statSync(path.join(AUDIO_DIR, f)).size, 0);

  await rm(TEMP_DIR, { recursive: true, force: true });

  console.log(`Hotovo: ${done} vygenerováno, ${failed} selhalo, ${pruned} smazáno.`);
  console.log(
    `Soubory: public/audio/*.m4a – ${Object.keys(entries).length} kusů, ` +
      `${(bytes / 1024 / 1024).toFixed(2)} MB, hlas ${voice}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
