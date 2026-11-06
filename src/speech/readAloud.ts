/**
 * Read an answer aloud with the browser's own speech (1.34.0, owner 2026-11-06: "more useful features
 * for the shared chat panel"). `speechSynthesis` speaks on the device: free, nothing leaves the
 * browser, no vendor. Where it is missing (some embedded webviews) the button is simply not offered.
 *
 * ⚠ MARKDOWN IS NOT SPEECH. Read raw, an answer says "asterisk asterisk 1,800 asterisk asterisk" and
 * reads a table's pipes. `plainForSpeech` keeps the words and drops the marks.
 */

export function canReadAloud(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function';
}

/** The words of a Markdown answer, as a person would read them out. */
export function plainForSpeech(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\|?\s*:?-{3,}.*$/gm, '')
    .replace(/\|/g, ', ')
    .replace(/(\*\*|__|\*|_|~~)/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

export interface SpeakOptions {
  /** BCP 47, e.g. `en-CA` or `fr-CA`; the browser picks a matching voice. Defaults to the page's. */
  lang?: string;
  onEnd?: () => void;
}

/** Speak `markdown`, stopping whatever was being read. Returns false when the browser cannot. */
export function speak(markdown: string, options: SpeakOptions = {}): boolean {
  if (!canReadAloud()) return false;
  const text = plainForSpeech(markdown);
  if (text === '') return false;

  const synth = window.speechSynthesis;
  synth.cancel();
  const utterance = new window.SpeechSynthesisUtterance(text);
  utterance.lang = options.lang ?? (typeof document !== 'undefined' ? document.documentElement.lang : '') ?? '';
  const voice = synth.getVoices().find((v) => utterance.lang !== '' && v.lang.toLowerCase().startsWith(utterance.lang.toLowerCase().slice(0, 2)) && v.localService);
  if (voice) utterance.voice = voice;
  let ended = false;
  const finish = () => {
    if (ended) return;
    ended = true;
    options.onEnd?.();
  };
  utterance.onend = finish;
  utterance.onerror = finish;
  synth.speak(utterance);

  return true;
}

export function stopSpeaking(): void {
  if (canReadAloud()) window.speechSynthesis.cancel();
}
