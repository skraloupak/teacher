/** Deterministický, stabilní klíč z textu – používá se pro id položek i názvy audio souborů. */
export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/**
 * Klíč, pod kterým se hledá slovíčko v data/merged-words.json.
 *
 * Musí sjednotit i zápisy, které se liší jen interpunkcí – „apply (for)" ze slovníčku
 * a „apply for" z boxu předložek jsou totéž slovo a mají dostat jednu kartičku.
 */
export function mergeKeyFor(englishText: string): string {
  return englishText
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    // Výpustka uvozuje v učebnici box („get..." nad výčtem vazeb se slovesem get).
    // Bez tohohle by takový nadpis splynul s heslem „get" a stal se kartičkou.
    .replace(/\.{3}|\u2026/g, " ellipsis ")
    .replace(/[^a-z0-9 ]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** FNV-1a – krátký hash, aby se neshodly dvě různé fráze se stejným slugem. */
export function shortHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36).padStart(7, "0").slice(0, 7);
}

/** Klíč audio souboru: čitelný slug + hash originálního textu. */
export function audioKeyFor(englishText: string): string {
  const base = slugify(englishText) || "item";
  return `${base}-${shortHash(englishText.trim().toLowerCase())}`;
}
