/**
 * Umožní Node spustit moduly aplikace přímo, bez sestavení.
 *
 * Node 24 sice TypeScript přeloží sám, ale u relativních importů vyžaduje příponu,
 * kterou zdrojáky nepíšou (`./local` místo `./local.ts`). Tenhle hook ji doplní,
 * takže se dá doménová logika rychle proklepnout skriptem:
 *
 *   node --import ./scripts/devtools/register.mjs muj-test.mjs
 */
export async function resolve(specifier, context, next) {
  if (specifier.startsWith(".") && !/\.[cm]?[jt]s$/.test(specifier)) {
    try {
      return await next(`${specifier}.ts`, context);
    } catch {
      // Nebyl to TypeScript – ať chybu nahlásí Node nad původním zápisem.
    }
  }
  return next(specifier, context);
}
