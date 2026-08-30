"use client";

import type { Item } from "./types";

type Speakable = Pick<Item, "en" | "audioKey" | "hasAudio">;

/** Klíče, u kterých je soubor prokazatelně vadný – podruhé to nezkoušíme. */
const brokenKeys = new Set<string>();

/** Krátké ticho ve WAV. Slouží jen k odemčení přehrávání při prvním dotyku. */
const SILENCE =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQAAAAA=";

/**
 * Jeden jediný přehrávač na celou aplikaci.
 *
 * Prohlížeče povolují přehrávání až po dotyku uživatele, a to **pro konkrétní
 * element**. Kdyby se pro každé slovíčko vyráběl `new Audio()`, byl by pokaždé
 * znovu zablokovaný – ruční tlačítko by hrálo (běží z kliknutí), ale automatické
 * přehrání po přechodu na další kartičku ne, protože to spouští efekt.
 * Sdílený element se odemkne jednou a zůstane odemčený.
 */
let player: HTMLAudioElement | null = null;
/** Které slovíčko právě hraje – aby chyba z přerušeného přehrání nezhasla to nové. */
let playToken = 0;

function getPlayer(): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  if (!player) {
    try {
      player = new Audio();
      player.preload = "auto";
    } catch {
      return null;
    }
  }
  return player;
}

export function stopSpeaking(): void {
  playToken++;
  if (player) {
    player.pause();
    try {
      player.currentTime = 0;
    } catch {
      // Element ještě nemá načtená data – pauza stačí.
    }
  }
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

function pickEnglishVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null;
  return (
    voices.find((v) => v.lang === "en-GB" && v.localService) ??
    voices.find((v) => v.lang === "en-US" && v.localService) ??
    voices.find((v) => v.lang.startsWith("en")) ??
    null
  );
}

/** Záložní syntéza v prohlížeči, když pro položku není předgenerovaný soubor. */
function speakWithBrowser(text: string): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const utterance = new SpeechSynthesisUtterance(text);
  const voice = pickEnglishVoice();
  if (voice) utterance.voice = voice;
  utterance.lang = voice?.lang ?? "en-GB";
  utterance.rate = 0.92;
  window.speechSynthesis.speak(utterance);
}

/** Přehraje anglickou výslovnost – nejdřív soubor z repa, jinak hlas prohlížeče. */
export function speakEnglish(item: Speakable): void {
  stopSpeaking();

  const audio = getPlayer();
  if (audio && item.hasAudio && !brokenKeys.has(item.audioKey)) {
    const token = playToken;
    audio.src = `/audio/${item.audioKey}.m4a`;
    audio.currentTime = 0;
    audio.muted = false;
    audio.volume = 1;

    audio.play().catch((error: unknown) => {
      // Mezitím jsme spustili něco jiného – tahle chyba už se netýká aktuálního zvuku.
      if (token !== playToken) return;

      const name = error instanceof Error ? error.name : "";
      if (name === "AbortError") return;
      if (name === "NotAllowedError") {
        // Prohlížeč ještě nedostal dotyk. Soubor je v pořádku, jen se teď nepřehraje.
        return;
      }
      brokenKeys.add(item.audioKey);
      speakWithBrowser(item.en);
    });
    return;
  }

  speakWithBrowser(item.en);
}

/** Je vůbec kde vzít zvuk? */
export function canSpeak(item: Speakable): boolean {
  if (item.hasAudio && !brokenKeys.has(item.audioKey)) return true;
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/**
 * Odemkne zvuk. Musí se volat **z obsluhy dotyku nebo kliknutí** – jinak to
 * prohlížeč odmítne. Přehraje kousek ticha na sdíleném přehrávači, takže je od
 * té chvíle povolené i automatické přehrávání z efektu.
 */
export function primeAudio(): void {
  if (typeof window === "undefined") return;

  const audio = getPlayer();
  if (audio) {
    // Ticho se nesmí přehrát ztlumeně – ztlumený zvuk prohlížeč povolí vždycky
    // a element by zůstal zamčený.
    audio.src = SILENCE;
    audio.volume = 1;
    audio.muted = false;
    void audio.play().then(
      () => audio.pause(),
      () => {
        // Odemčení se nepovedlo; zvuk pak zahraje až tlačítko reproduktoru.
      },
    );
  }

  if ("speechSynthesis" in window) {
    const utterance = new SpeechSynthesisUtterance("");
    utterance.volume = 0;
    window.speechSynthesis.speak(utterance);
  }
}
