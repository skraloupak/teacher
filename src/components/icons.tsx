/**
 * Jedna sada ikon pro celou aplikaci.
 *
 * Ikony se kreslí do mřížky 24 × 24 a mají jednotnou geometrii: kulaté konce
 * i spoje a stejnou optickou sílu tahu. Tloušťka se přepočítává podle
 * vykreslené velikosti (`weight` je v pixelech, ne v jednotkách mřížky), takže
 * ikona v seznamu slovíček má stejně silný tah jako ikona na kartičce – jinak
 * malé ikony působí ztuha a velké naopak vybledle.
 */

export type IconProps = {
  /** Hrana ikony v pixelech. */
  size?: number;
  /** Optická síla tahu v pixelech, nezávisle na `size`. */
  weight?: number;
  className?: string;
};

function Icon({
  size = 20,
  weight = 1.6,
  className,
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      // Z pixelů zpátky do jednotek mřížky, ať je tah opticky pořád stejný.
      strokeWidth={(weight * 24) / size}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  );
}

/** Světlý režim. */
export function SunIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.64 5.64l1.55 1.55M16.81 16.81l1.55 1.55M18.36 5.64l-1.55 1.55M7.19 16.81l-1.55 1.55" />
    </Icon>
  );
}

/** Tmavý režim. */
export function MoonIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3.4a6.2 6.2 0 0 0 8.6 8.6A8.6 8.6 0 1 1 12 3.4Z" />
    </Icon>
  );
}

/** Výslovnost. */
export function SpeakerIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M11 5.2 6.6 9H3.4A1.4 1.4 0 0 0 2 10.4v3.2A1.4 1.4 0 0 0 3.4 15h3.2l4.4 3.8Z" />
      <path d="M15.1 9.4a3.6 3.6 0 0 1 0 5.2" />
      <path d="M17.9 6.9a7.3 7.3 0 0 1 0 10.2" />
    </Icon>
  );
}

/** Zavřít. */
export function CloseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m7 7 10 10M17 7 7 17" />
    </Icon>
  );
}

/** Zařadit mezi vybraná slovíčka. */
export function BookmarkPlusIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M17.6 20.4 12 17.3l-5.6 3.1V5.6A1.6 1.6 0 0 1 8 4h8a1.6 1.6 0 0 1 1.6 1.6Z" />
      <path d="M12 8.2v4.6M9.7 10.5h4.6" />
    </Icon>
  );
}

/** Odebrat z vybraných slovíček. */
export function BookmarkMinusIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M17.6 20.4 12 17.3l-5.6 3.1V5.6A1.6 1.6 0 0 1 8 4h8a1.6 1.6 0 0 1 1.6 1.6Z" />
      <path d="M9.7 10.5h4.6" />
    </Icon>
  );
}

/** Malý plný praporek – štítek „vybráno“ u kartičky. */
export function BookmarkFilledIcon({ size = 10, className }: Omit<IconProps, "weight">) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path d="M17.6 20.4 12 17.3l-5.6 3.1V5.6A1.6 1.6 0 0 1 8 4h8a1.6 1.6 0 0 1 1.6 1.6Z" />
    </svg>
  );
}

/** Tohle už umím – neopakovat. */
export function CheckCircleIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.2" />
      <path d="m8.6 12.2 2.4 2.4 4.4-5.2" />
    </Icon>
  );
}

/** Fajfka do zaškrtávacího políčka. */
export function CheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m6 12.5 4 4 8-9" />
    </Icon>
  );
}

/** Vrátit zpět – slovíčko se má zase objevovat. */
export function UndoIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.6 12a8.4 8.4 0 1 0 2.8-6.3L3.6 8.2" />
      <path d="M3.6 3.6v4.6h4.6" />
    </Icon>
  );
}
