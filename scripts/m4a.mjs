/**
 * Drobná údržba MP4/M4A kontejneru.
 *
 * `afconvert` zarovnává začátek zvukových dat na 4 kB a mezeru vyplní atomem `free`.
 * U krátkých nahrávek je to klidně třetina souboru. Výplň se dá zahodit, ale offsety
 * v tabulkách `stco`/`co64` ukazují na absolutní pozice v souboru, takže se musí přepočítat –
 * jinak vznikne soubor, který se tváří v pořádku a přitom nejde dekódovat.
 */

const CONTAINERS = new Set(["moov", "trak", "mdia", "minf", "stbl"]);

function topLevelAtoms(buf) {
  const atoms = [];
  for (let offset = 0; offset + 8 <= buf.length; ) {
    const size = buf.readUInt32BE(offset);
    const type = buf.toString("latin1", offset + 4, offset + 8);
    // size 0 = atom do konce souboru, size 1 = 64bitová délka; ani jedno tu afconvert nepoužívá.
    if (size < 8 || offset + size > buf.length) return null;
    atoms.push({ offset, size, type });
    offset += size;
  }
  return atoms;
}

/**
 * Odstraní výplňové atomy `free` a opraví offsety chunků.
 * Vrací původní buffer, když není co odstranit nebo když soubor nevypadá podle očekávání.
 */
export function stripFreeAtoms(buf) {
  const atoms = topLevelAtoms(buf);
  if (!atoms) return buf;

  const free = atoms.filter((a) => a.type === "free");
  if (free.length === 0) return buf;

  const kept = atoms.filter((a) => a.type !== "free");
  const out = Buffer.concat(kept.map((a) => buf.subarray(a.offset, a.offset + a.size)));

  /** Kolik bajtů výplně leželo před danou původní pozicí – jen o tolik se offset posouvá. */
  const shiftAt = (originalOffset) =>
    free.reduce((sum, a) => (a.offset < originalOffset ? sum + a.size : sum), 0);

  let failed = false;

  const walk = (start, end) => {
    for (let offset = start; offset + 8 <= end; ) {
      const size = out.readUInt32BE(offset);
      const type = out.toString("latin1", offset + 4, offset + 8);
      if (size < 8 || offset + size > end) {
        failed = true;
        return;
      }

      if (CONTAINERS.has(type)) {
        walk(offset + 8, offset + size);
      } else if (type === "stco" || type === "co64") {
        const wide = type === "co64";
        const count = out.readUInt32BE(offset + 12);
        const bytes = wide ? 8 : 4;
        if (offset + 16 + count * bytes > offset + size) {
          failed = true;
          return;
        }
        for (let i = 0; i < count; i++) {
          const at = offset + 16 + bytes * i;
          if (wide) {
            const value = out.readBigUInt64BE(at);
            out.writeBigUInt64BE(value - BigInt(shiftAt(Number(value))), at);
          } else {
            const value = out.readUInt32BE(at);
            out.writeUInt32BE(value - shiftAt(value), at);
          }
        }
      }

      offset += size;
    }
  };

  walk(0, out.length);
  // Když kontejner vypadal jinak, než čekáme, radši vrátíme originál – větší soubor je lepší než rozbitý.
  return failed ? buf : out;
}
