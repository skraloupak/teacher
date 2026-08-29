# Slovíčka – kartičky na angličtinu

Webová aplikace na učení anglických slovíček a frází pomocí kartiček. Otočíš kartu, řekneš
si, jestli jsi to věděl, a co ti nešlo, se vrací častěji.

- **Next.js 16 + React 19 + Tailwind v4**, TypeScript
- Mobil na prvním místě, funguje i offline (kromě prvního načtení)
- Pokrok a nastavení v prohlížeči, volitelně zrcadlené do MongoDB
- Výslovnost z předgenerovaných MP4/AAC souborů v repu, fallback na hlas prohlížeče

## Spuštění

```bash
npm install
npm run dev      # http://localhost:4000
npm run build && npm start
```

## Přihlášení

Aplikace je za přihlášením. Účet se zakládá skriptem:

```bash
npm run user -- muj@email.cz heslo    # založí účet nebo změní stávajícímu heslo
npm run user                          # zeptá se interaktivně
```

Heslo se ukládá scryptem se solí – v databázi není v čitelné podobě a zpátky se z něj
dostat nedá.

Po přihlášení dostane prohlížeč **httpOnly cookie** s podepsaným tokenem (HMAC-SHA256,
klíč z `AUTH_SECRET`). K té se žádný skript na stránce nedostane, takže se nedá ukrást přes
XSS. V `localStorage` je jenom e-mail, a to čistě proto, aby po otevření appky neproblikla
přihlašovací obrazovka – na oprávnění nemá vliv, to se ověřuje vždycky na serveru.
Přihlášení platí 90 dní.

Každý účet má vlastní pokrok – data se v databázi klíčují id uživatele.

Když v `.env` chybí `AUTH_SECRET` nebo připojení k databázi, aplikace se nezamyká a jede
v lokálním režimu jen z prohlížeče.

## Obrazovky

| Cesta | Co je tam |
| --- | --- |
| `/` | výběr lekcí (po učebnicích), směr, režim, délka kola – a Spustit |
| `/study` | samotné kartičky |
| `/slovnicek` | všechna slovíčka ve dvou sloupcích: filtr podle učebnice, lekce a typu, hledání, výslovnost, stav učení, zaškrtávání |
| `/stats` | úspěšnost, rozložení podle boxů, co ti nejde, poslední kola |

## Jak se učení chová

Na kartičce odpovídáš rovnou z přední strany:

| Gesto | Klávesa | Co to udělá |
| --- | --- | --- |
| tažení doprava | `→` nebo `2` | **vím** – správně, jde se dál |
| tažení doleva | `←` nebo `1` | **nevím** – karta se otočí, ukáže odpověď a čeká na „Další" |
| tažení nahoru | `↑` | **zařadit mezi vybraná** – zaškrtne ve slovníčku a počítá se jako chyba, ať se vrací častěji |
| tažení dolů | `↓` | **umím, vyřadit** – odškrtne ve slovníčku a počítá se jako správně |
| klepnutí na kartu | mezerník | otočí kartu, když si nejsi jistý – odpovědět můžeš pak |

Po dokončení kola nabídne souhrn **Pokračovat dalším kolem** – poskládá se ze stejných
lekcí, přednost mají kartičky, které jsi ještě neprocvičoval, a mezi ně se přimíchá menší
porce těch, se kterými jsi měl potíže. Kartičky z právě dohraného kola se přeskočí. Až
projdeš celou lekci, kolo se poskládá z opakování.

Kartičky se vybírají podle zvoleného **režimu**:

| Režim | Co dělá |
| --- | --- |
| Náhodně | zamíchá všechno z vybraných lekcí a vezme zadaný počet |
| Podle plánu | jen kartičky, které jsou podle Leitnera na řadě |
| Co mi nejde | seřadí podle chybovosti, nejhorší jdou první |
| Vybrané | jen slovíčka zaškrtnutá ve slovníčku, napříč všemi lekcemi |

Ve slovníčku jde levý nebo pravý sloupec zakrýt a odkrývat po jednom – hodí se na rychlé
projetí bez spouštění kola. Zaškrtnutá slovíčka se pak dají zkoušet volbou režimu **Vybrané**.

Každá kartička je dvojice **položka × směr** (`hello → ahoj` a `ahoj → hello` jsou dvě různé
kartičky, protože jedno umíš dřív než druhé).

Kartičky putují Leitnerovými boxy 0–5:

| Box | Kdy se vrátí |
| --- | --- |
| 0 | hned (nová nebo čerstvě chybná) |
| 1 | za 10 minut |
| 2 | za den |
| 3 | za 3 dny |
| 4 | za týden |
| 5 | za 3 týdny – naučeno |

Správná odpověď posune kartičku o box výš, chybná ji vrátí na začátek a zároveň ji hned
zařadí zpátky do fronty aktuálního kola. Kolo končí, až všechno projde správně.

Nastavení (lekce, slovíčka/fráze, směr, délka kola) se ukládá a příště se předvyplní.

## Přidání nové lekce

Lekce jsou obyčejné JSON soubory v `data/lessons/`. Jeden soubor = jedna lekce:

```json
{
  "id": "u1-l3",
  "title": "Učebnice 1 – lekce 3",
  "items": [
    { "type": "word", "en": "hello", "cs": "ahoj", "ipa": "həˈləʊ" },
    { "type": "phrase", "en": "Nice to meet you.", "cs": "Těší mě." },
    { "type": "phrase", "en": "at home", "cs": "doma", "note": "předložky" }
  ]
}
```

Položky (`items`):

| Pole | Povinné | Význam |
| --- | --- | --- |
| `type` | ano | `word` (slovíčko) nebo `phrase` (fráze, spojení) |
| `en` | ano | anglicky |
| `cs` | ano | česky |
| `ipa` | ne | výslovnost z učebnice, zobrazí se na odpovědi |
| `note` | ne | upřesnění překladu nebo název oddílu |

Lekce:

| Pole | Povinné | Význam |
| --- | --- | --- |
| `id` | ano | ve tvaru `u<učebnice>-l<lekce>`, např. `u2-l5` – z něj se odvodí učebnice i pořadí |
| `title` | ano | název v seznamu |
| `book`, `bookTitle`, `order` | ne | přebijí to, co plyne z `id` |
| `description`, `source` | ne | popisek a odkaz na naskenovanou stránku |

Soubor stačí přidat a stránku obnovit – aplikace si všechny lekce načte sama, nikde se
neregistrují. Lekce se v aplikaci samy seskupí po učebnicích, takže jde vybrat celá učebnice
jedním kliknutím. Originální fotky stránek z učebnice patří do `screenshots/lekce/` a pojmenovávají se
stejně jako lekce (`u1-l1.jpg`).

Vadná položka se přeskočí a napíše se o tom varování do konzole při buildu – kouknout se tam
vyplatí, když se počet kartiček nezdá.

**Pozor na id:** identifikátor kartičky se odvozuje z `id` lekce a anglického textu. Když
u existující položky přepíšeš `en`, bere se jako nová a přijde o dosavadní pokrok. Oprava
překladu, IPA nebo poznámky pokrok neovlivní.

## Výslovnost

```bash
npm run audio                 # dogeneruje, co chybí
npm run audio -- --force      # přegeneruje všechno
npm run audio:clean           # dogeneruje a smaže soubory k položkám, které už nejsou
VOICE="Ava (Premium)" npm run audio          # konkrétní hlas
AUDIO_QUALITY=82 npm run audio -- --force    # jemnější komprese (VBR 0–127, výchozí 64)
```

**Hlas se vybírá sám.** Skript se podívá, co je nainstalované, a vezme nejlepší dostupný –
Enhanced a Premium varianty čtou plynule, compact hlasy zní roboticky. Pořadí je v konstantě
`VOICE_PREFERENCE`. Když se hlas změní, přegenerují se všechny nahrávky samy (pozná se to
podle `public/audio/manifest.json`).

Další hlasy se stahují v Nastavení systému → Zpřístupnění → Mluvený obsah → Systémový hlas →
*Spravovat hlasy* → English. Stojí za to: **Ava** (479 MB) a **Serena** (GB, 204 MB) jsou
nejlepší, **Allison** (99 MB) je nejlepší poměr kvality a velikosti. Seznam nainstalovaných
vypíše `say -v '?' | grep en_`.

Kvalitu drží hlas, ne komprese – hlasy macOS syntetizují 22 050 Hz mono, takže vyšší
vzorkovací frekvence ani stereo nic nepřidají, jen nafouknou soubory.

Skript používá vestavěný macOS `say`, takže nepotřebuje žádnou službu ani klíč. Výsledek
jsou soubory `public/audio/*.m4a`, které patří do repa – aplikace je pak přehrává offline
a všude stejně. Kde soubor chybí (nebo běžíš na jiném systému než macOS), sáhne aplikace
po hlasu prohlížeče přes Web Speech API.

Dostupné hlasy vypíše `say -v '?' | grep en_`.

## Struktura

```
data/lessons/*.json     obsah lekcí – tohle přidáváš
screenshots/lekce/*.jpg fotky stránek učebnice, ze kterých lekce vznikly
public/audio/*.m4a      předgenerovaná výslovnost
scripts/generate-audio.mjs
src/lib/                doménová logika – žádný React
  types.ts              datový model
  lessons.server.ts     načtení lekcí ze souborů (běží při buildu)
  srs.ts                Leitnerovy boxy a plán opakování
  session.ts            sestavení fronty kola a jeho průběh
  mongo.ts              připojení k databázi (jen server)
  auth/                 hesla (scrypt), podepsané tokeny, účty
  storage/              úložiště pokroku: local, synced, slučování
src/components/         obrazovky a UI
src/app/                routy: / výběr, /study učení, /slovnicek, /stats
  api/lessons           lekce jako JSON
  api/state             čtení a zápis pokroku do databáze
  api/auth/*            přihlášení, odhlášení, kdo jsem
middleware.ts           hlídá /api/state proti nepřihlášeným
```

## Ukládání pokroku

Zdrojem rychlosti je vždycky prohlížeč – učení nikdy nečeká na síť. Když je nastavená
MongoDB, stav se navíc zrcadlí do ní, takže pokrok drží i mezi zařízeními.

```
    kartička            localStorage           /api/state            MongoDB
  odpověď  ─────────────►  zápis hned  ──── po 1,2 s dávkou ────►  upsert
  start kola ◄──── sloučení obojího ◄──────── načtení ◄──────────  čtení
```

U kartiček vyhrává **novější odpověď** (podle `lastSeen`) – na obou stranách, takže si dvě
zařízení ani dvě otevřené záložky nepřepíšou pokrok navzájem. Nastavení a zaškrtnutá
slovíčka nemají historii, tam platí poslední změna.

Výběr lekcí, směr, režim i délka kola se ukládají a příště se předvyplní – zaklikávat se to
musí jen jednou.

Když proměnné v `.env` chybí nebo databáze neodpovídá, API vrátí `501` a aplikace jede dál
jen z prohlížeče – jen se nesynchronizuje.

### Nastavení databáze

Zkopíruj `.env.example` do `.env` a vyplň:

| Proměnná | Význam |
| --- | --- |
| `MONGODB_USER`, `MONGODB_PASSWORD` | přihlašovací údaje |
| `MONGODB_HOST` | host bez schématu, např. `cluster.example.mongodb.net` (připojuje se přes `mongodb+srv` s TLS) |
| `MONGODB_DATABASE` | název databáze |
| `MONGODB_AUTH_SOURCE` | nepovinné, výchozí `admin` |
| `MONGODB_PROFILE` | nepovinné, klíč profilu pro režim bez přihlašování |
| `AUTH_SECRET` | podpisový klíč tokenů; bez něj se aplikace nezamyká |

Kolekce se založí samy: `users` (účty), `progress` (kartička × směr), `sessions` (dohraná kola)
a `profiles` (nastavení a zaškrtnutá slovíčka). Indexy se vytvoří při prvním připojení.

Nový podpisový klíč vygeneruješ takhle (změna klíče odhlásí všechny):

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

`.env` je v `.gitignore` – heslo se do repa nedostane.

### Kam sáhnout při změně

Všechny zápisy jdou přes rozhraní `ProgressStore` (`src/lib/storage/types.ts`). Implementace
jsou `LocalProgressStore` (prohlížeč) a `SyncedProgressStore` (prohlížeč + databáze); která se
použije, se rozhoduje na jediném místě – v `getStore()` (`src/lib/storage/index.ts`).
