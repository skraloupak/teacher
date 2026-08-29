"use client";

import type { Item } from "./types";

type Speakable = Pick<Item, "en" | "audioKey" | "hasAudio">;

let currentAudio: HTMLAudioElement | null = null;
/** Klíče, u kterých je soubor prokazatelně vadný – podruhé to nezkoušíme. */
const brokenKeys = new Set<string>();

/** Krátké ticho ve WAV – slouží jen k odemčení přehrávání po prvním dotyku. */
const SILENCE =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQAAAAA=";

export function stopSpeaking(): void {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
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

  if (item.hasAudio && !brokenKeys.has(item.audioKey)) {
    const audio = new Audio(`/audio/${item.audioKey}.m4a`);
    currentAudio = audio;
    audio.play().catch((error: unknown) => {
      const name = error instanceof Error ? error.name : "";
      // Mezitím jsme přehrávání sami zastavili nebo spustili jiné – se souborem to nesouvisí.
      if (currentAudio !== audio) return;
      currentAudio = null;
      if (name === "AbortError") return;
      // Prohlížeč zvuk zatím nepovolil; soubor je v pořádku, jen chybí dotyk uživatele.
      if (name === "NotAllowedError") return;
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
 * Safari na iOS pustí zvuk až po dotyku uživatele – a to zvlášť pro přehrávání souborů
 * a zvlášť pro syntézu řeči. Volá se z obsluhy prvního klepnutí, ne z efektu.
 */
export function primeAudio(): void {
  if (typeof window === "undefined") return;

  try {
    const unlock = new Audio(SILENCE);
    unlock.muted = true;
    unlock
      .play()
      .then(() => unlock.pause())
      .catch(() => {
        // Odemčení se nepovedlo – zvuk pak zahraje až na vyžádání tlačítkem.
      });
  } catch {
    // Starší prohlížeč bez konstruktoru Audio.
  }

  if ("speechSynthesis" in window) {
    const utterance = new SpeechSynthesisUtterance("");
    utterance.volume = 0;
    window.speechSynthesis.speak(utterance);
  }
}
