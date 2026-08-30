export type ItemType = "word" | "phrase";

/** Směr zkoušení: co je na přední straně kartičky. */
export type Direction = "en2cs" | "cs2en";

/** Nastavení směru, které si uživatel volí (mixed = obojí v jednom kole). */
export type DirectionSetting = Direction | "mixed";

/** Položka tak, jak ji píšeme do JSONu v data/lessons. */
export type RawItem = {
  type: ItemType;
  en: string;
  cs: string;
  /** Fonetický přepis z učebnice, např. „ˈbɜːθdeɪ". */
  ipa?: string;
  /** Volitelná poznámka – upřesnění překladu, kontext, název oddílu. */
  note?: string;
};

export type RawLesson = {
  id: string;
  order?: number;
  title: string;
  description?: string;
  /** Číslo učebnice. Když chybí, odvodí se z id ve tvaru „u1-l2". */
  book?: number;
  /** Název učebnice do hlavičky. Když chybí, použije se „Učebnice N". */
  bookTitle?: string;
  /** Odkud lekce pochází – cesta k naskenované stránce učebnice, nebo víc stránek. */
  source?: string | string[];
  items: RawItem[];
};

/** Položka po načtení – doplněné id a odkaz na lekci. */
export type Item = RawItem & {
  id: string;
  lessonId: string;
  lessonTitle: string;
  /** Slug pro audio soubor v public/audio (bez přípony). */
  audioKey: string;
  /** Je pro položku předgenerovaný zvuk? Když ne, použije se hlas prohlížeče. */
  hasAudio: boolean;
};

export type Lesson = {
  id: string;
  order: number;
  title: string;
  description?: string;
  book: number;
  bookTitle: string;
  source?: string[];
  items: Item[];
  wordCount: number;
  phraseCount: number;
};

/** Lekce seskupené podle učebnice – takhle je vybírá úvodní obrazovka. */
export type Book = {
  number: number;
  title: string;
  lessons: Lesson[];
  itemCount: number;
};

/** Stav jedné kartičky (položka × směr) v Leitnerově systému. */
export type CardProgress = {
  /** `${itemId}:${direction}` */
  key: string;
  itemId: string;
  direction: Direction;
  /** 0 = nová/čerstvě chybná, 5 = naučeno */
  box: number;
  correct: number;
  wrong: number;
  /** Kolikrát po sobě správně. */
  streak: number;
  lastSeen: number;
  dueAt: number;
};

export type ProgressMap = Record<string, CardProgress>;

/**
 * Jak se vybírá a řadí obsah kola.
 * - `random` – klasika: zamíchá všechno vybrané a vezme z toho zadaný počet
 * - `due` – jen kartičky, které jsou podle plánu opakování na řadě
 * - `hardest` – nejdřív ty s největší chybovostí
 * - `marked` – jen položky zaškrtnuté ve slovníčku, napříč všemi lekcemi
 */
export type StudyMode = "random" | "due" | "hardest" | "marked";

export type StudySettings = {
  lessonIds: string[];
  types: ItemType[];
  direction: DirectionSetting;
  /** Počet kartiček v kole; null = všechny vybrané. */
  sessionSize: number | null;
  mode: StudyMode;
  autoPlayAudio: boolean;
  /** Kolik minut denně si chci dát. Po dosažení přijde oslava. */
  dailyGoalMinutes: number;
};

/** Záznam o dokončeném kole – pro statistiky. */
export type SessionRecord = {
  id: string;
  finishedAt: number;
  lessonIds: string[];
  direction: DirectionSetting;
  types: ItemType[];
  total: number;
  correct: number;
  wrong: number;
  /** Od začátku do konce kola, včetně případných pauz. */
  durationMs: number;
  /**
   * Čas, kdy jsem se opravdu učil. Delší pauza mezi odpověďmi se počítá jen
   * do stropu, takže odskok od telefonu statistiku nenafoukne.
   */
  activeMs?: number;
  /** Den v lokálním čase ve tvaru RRRR-MM-DD – podle něj se sčítají denní statistiky. */
  date?: string;
};

/** Souhrn jednoho dne učení. */
export type DayStat = {
  date: string;
  activeMs: number;
  answers: number;
  correct: number;
  wrong: number;
  sessions: number;
  /** Kolik času padlo na kterou lekci. */
  byLesson: Record<string, number>;
};
