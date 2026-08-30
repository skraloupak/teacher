#!/usr/bin/env node
/**
 * Křížová kontrola fonetického přepisu proti espeak-ng.
 *
 *   npm run ipa:check tema-it        # jedna lekce
 *   npm run ipa:check                # všechny lekce
 *
 * espeak-ng klade přízvuk jinam než česká učebnice (kəmpjˈuːtə vs. kəmˈpjuːtə),
 * takže se neporovnávají přízvuky, ale samotné hlásky. Nesouhlas neznamená chybu –
 * je to seznam míst, která stojí za ruční kontrolu.
 *
 * Potřebuje `brew install espeak-ng`. Bez něj skript jen řekne, že kontrolu přeskakuje.
 */
import { execFile } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LESSONS_DIR = path.join(ROOT, "data", "lessons");

/** Kolik odlišných hlásek se ještě bere jako drobnost. */
const TOLERANCE = 0.25;

/**
 * Zbaví přepis všeho, co se mezi zdroji legitimně liší: přízvuků, délek,
 * mezer, závorek a variant oddělených čárkou.
 */
function normalize(ipa) {
  return (ipa ?? "")
    .split(",")[0]
    .replace(/[ˈˌ\s()\/]/g, "")
    .replace(/ː/g, "")
    // espeak zapisuje řadu hlásek jinak než britské slovníky – sjednotíme je,
    // ať se neozývá u každého druhého slova.
    .replace(/[ɐʌ]/g, "a")
    .replace(/[ɑɒɔ]/g, "o")
    .replace(/[æa]/g, "a")
    .replace(/[eɛ]/g, "e")
    .replace(/[ɪi]/g, "i")
    .replace(/[ʊu]/g, "u")
    .replace(/ɹ/g, "r")
    // espeak píše skriptové ɡ (U+0261), učebnice obyčejné g
    .replace(/ɡ/g, "g")
    .replace(/[ɜɐ]/g, "e")
    .replace(/ə/g, "");
}

/** Levenshteinova vzdálenost – kolik úprav dělí dva přepisy. */
function distance(a, b) {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) rows[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      rows[i][j] = Math.min(
        rows[i - 1][j] + 1,
        rows[i][j - 1] + 1,
        rows[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return rows[a.length][b.length];
}

async function espeakIpa(text) {
  const { stdout } = await execFileAsync("espeak-ng", ["-v", "en-gb", "--ipa", "-q", text]);
  return stdout.trim();
}

async function main() {
  try {
    await execFileAsync("espeak-ng", ["--version"]);
  } catch {
    console.log("espeak-ng není nainstalovaný – kontrolu přeskakuji.");
    console.log("Nainstaluješ ho příkazem: brew install espeak-ng");
    return;
  }

  const only = process.argv[2];
  const files = (await readdir(LESSONS_DIR))
    .filter((f) => f.endsWith(".json"))
    .filter((f) => !only || f === `${only}.json`);

  if (files.length === 0) {
    console.error(only ? `Lekce ${only} neexistuje.` : "Žádné lekce.");
    process.exit(1);
  }

  let checked = 0;
  const suspects = [];

  for (const file of files) {
    const lesson = JSON.parse(await readFile(path.join(LESSONS_DIR, file), "utf8"));
    for (const item of lesson.items) {
      if (!item.ipa) continue;
      // Fráze espeak čte jako větu, srovnání by nedávalo smysl.
      if (item.en.split(/\s+/).length > 2) continue;

      checked++;
      const theirs = normalize(await espeakIpa(item.en));
      const ours = normalize(item.ipa);
      if (!theirs || !ours) continue;

      const diff = distance(ours, theirs) / Math.max(ours.length, theirs.length);
      if (diff > TOLERANCE) {
        suspects.push({ lesson: lesson.id, en: item.en, ours: item.ipa, theirs: await espeakIpa(item.en), diff });
      }
    }
  }

  suspects.sort((a, b) => b.diff - a.diff);
  console.log(`Zkontrolováno ${checked} přepisů, k ověření ${suspects.length}:\n`);
  for (const s of suspects) {
    console.log(`  ${s.lesson}  ${s.en}`);
    console.log(`      naše:    ${s.ours}`);
    console.log(`      espeak:  ${s.theirs.trim()}`);
  }
  if (suspects.length === 0) console.log("  Všechno v toleranci.");
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
