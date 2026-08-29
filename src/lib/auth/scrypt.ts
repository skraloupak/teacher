import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

/**
 * Hashování hesel scryptem. Záměrně bez `server-only`, aby se stejná implementace
 * dala použít i ze skriptu `scripts/create-user.mjs` – jinak by hrozilo, že se
 * zakládání uživatele a přihlašování rozejdou.
 *
 * V kódu aplikace se importuje přes `./password`, které přidává ochranu proti
 * zatažení do prohlížeče.
 */

const KEY_LENGTH = 64;
/** N=16384 je rozumný kompromis mezi odolností a rychlostí přihlášení. */
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1 } as const;

function derive(password: string, salt: Buffer, length: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, length, SCRYPT_OPTIONS, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

/**
 * Heslo se ukládá jako `scrypt$<sůl>$<hash>`. Sůl je náhodná pro každého uživatele,
 * takže dvě stejná hesla dají jiný zápis a nedají se porovnat mezi sebou.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await derive(password, salt, KEY_LENGTH);
  return `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltPart, hashPart] = stored.split("$");
  if (scheme !== "scrypt" || !saltPart || !hashPart) return false;

  const salt = Buffer.from(saltPart, "base64url");
  const expected = Buffer.from(hashPart, "base64url");
  const derived = await derive(password, salt, expected.length);

  // Porovnání v konstantním čase, ať se z doby odpovědi nedá nic vyčíst.
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}
