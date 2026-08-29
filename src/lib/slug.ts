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
