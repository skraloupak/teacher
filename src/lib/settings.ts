import type {
  Direction,
  DirectionSetting,
  ItemType,
  StudyMode,
  StudySettings,
} from "./types";

export const DEFAULT_SETTINGS: StudySettings = {
  lessonIds: [],
  types: ["word", "phrase"],
  direction: "en2cs",
  sessionSize: 20,
  mode: "random",
  autoPlayAudio: false,
  dailyGoalMinutes: 10,
};

export const SESSION_SIZES: Array<{ value: number | null; label: string }> = [
  { value: 10, label: "10" },
  { value: 20, label: "20" },
  { value: 30, label: "30" },
  { value: 50, label: "50" },
  { value: null, label: "Vše" },
];

export const DIRECTION_LABELS: Record<DirectionSetting, string> = {
  en2cs: "Anglicky → česky",
  cs2en: "Česky → anglicky",
  mixed: "Obojí náhodně",
};

export const TYPE_LABELS: Record<ItemType, string> = {
  word: "Slovíčka",
  phrase: "Fráze",
};

export const MODE_LABELS: Record<StudyMode, string> = {
  random: "Náhodně",
  due: "Podle plánu",
  hardest: "Co mi nejde",
  marked: "Vybrané",
};

export const MODE_HINTS: Record<StudyMode, string> = {
  random: "Zamíchá všechno z vybraných lekcí a vezme zadaný počet.",
  due: "Jen kartičky, které jsou podle plánu opakování na řadě.",
  hardest: "Seřadí kartičky podle chybovosti – nejhorší jdou první.",
  marked: "Jen slovíčka zaškrtnutá ve slovníčku – napříč všemi lekcemi, bez ohledu na výběr výše.",
};

export const MODES: StudyMode[] = ["random", "due", "hardest", "marked"];

/** Nabídka denních cílů v minutách. */
export const DAILY_GOALS = [5, 10, 15, 20, 30, 45, 60];

export function directionsOf(setting: DirectionSetting): Direction[] {
  return setting === "mixed" ? ["en2cs", "cs2en"] : [setting];
}

/** Rozpozná i starší uložené nastavení s přepínači onlyDue/hardestFirst. */
function readMode(base: Partial<StudySettings> & Record<string, unknown>): StudyMode {
  if (
    base.mode === "random" ||
    base.mode === "due" ||
    base.mode === "hardest" ||
    base.mode === "marked"
  ) {
    return base.mode;
  }
  if (base.hardestFirst === true) return "hardest";
  if (base.onlyDue === true) return "due";
  return DEFAULT_SETTINGS.mode;
}

/** Načtené nastavení může být staré nebo poškozené – doplníme chybějící a zahodíme nesmysly. */
export function normalizeSettings(
  raw: Partial<StudySettings> | null | undefined,
  availableLessonIds: string[],
): StudySettings {
  const base = { ...DEFAULT_SETTINGS, ...(raw ?? {}) } as Partial<StudySettings> &
    Record<string, unknown>;
  const known = new Set(availableLessonIds);

  // Při úplně prvním spuštění předvybereme první lekci, ať appka nezačíná prázdná.
  // Když si uživatel výběr sám zruší, respektujeme to – rozlišuje se podle toho, zda něco bylo uloženo.
  const lessonIds = Array.isArray(base.lessonIds)
    ? base.lessonIds.filter((id) => known.has(id))
    : [];
  if (!raw && lessonIds.length === 0) lessonIds.push(...availableLessonIds.slice(0, 1));

  const types = Array.isArray(base.types)
    ? (base.types.filter((t) => t === "word" || t === "phrase") as ItemType[])
    : DEFAULT_SETTINGS.types;

  const direction: DirectionSetting =
    base.direction === "cs2en" || base.direction === "mixed" || base.direction === "en2cs"
      ? base.direction
      : DEFAULT_SETTINGS.direction;

  const sessionSize =
    base.sessionSize === null || (typeof base.sessionSize === "number" && base.sessionSize > 0)
      ? base.sessionSize
      : DEFAULT_SETTINGS.sessionSize;

  return {
    lessonIds,
    types: types.length > 0 ? types : DEFAULT_SETTINGS.types,
    direction,
    sessionSize,
    mode: readMode(base),
    autoPlayAudio: Boolean(base.autoPlayAudio),
    dailyGoalMinutes:
      typeof base.dailyGoalMinutes === "number" && base.dailyGoalMinutes > 0
        ? Math.min(600, Math.round(base.dailyGoalMinutes))
        : DEFAULT_SETTINGS.dailyGoalMinutes,
  };
}
