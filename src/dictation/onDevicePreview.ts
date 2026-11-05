/**
 * Grey words while the person is still speaking, ONLY where the browser recognises speech on the
 * device itself (Chrome desktop's `processLocally`).
 *
 * ⚠ NEVER THE CLOUD MODE. The browser's default speech recognition sends the audio to the browser
 * maker's servers, and a client describing their immigration case is not something any of our
 * products has cleared to go there. If on-device recognition is not available, there is simply no
 * preview; the server's words still arrive after each pause.
 *
 * ⚠ THE PREVIEW IS NEVER THE RECORD. It is shown, then replaced by the server's text for the phrase.
 * Nothing it hears reaches the box.
 */

interface RecognitionResultLike {
  0: { transcript: string };
  isFinal: boolean;
}

interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  processLocally?: boolean;
  onresult: ((event: { resultIndex: number; results: ArrayLike<RecognitionResultLike> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

interface RecognitionCtor {
  new (): RecognitionLike;
  available?: (options: { langs: string[]; processLocally: boolean }) => Promise<string>;
}

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** True only when the browser says this language can be recognised without leaving the device. */
export async function onDevicePreviewAvailable(language: string): Promise<boolean> {
  const Ctor = recognitionCtor();
  if (!Ctor || typeof Ctor.available !== 'function') return false;

  try {
    return (await Ctor.available({ langs: [language], processLocally: true })) === 'available';
  } catch {
    return false;
  }
}

export interface OnDevicePreview {
  /** Forget what has been heard so far: the phrase it belonged to was just sent. */
  cut: () => void;
  stop: () => void;
}

export function startOnDevicePreview(language: string, onText: (text: string) => void): OnDevicePreview | null {
  const Ctor = recognitionCtor();
  if (!Ctor) return null;

  let recognition: RecognitionLike;
  try {
    recognition = new Ctor();
  } catch {
    return null;
  }

  // Refuse rather than fall back: if the property is not there, this browser would use the cloud.
  if (!('processLocally' in recognition)) return null;

  recognition.processLocally = true;
  recognition.lang = language;
  recognition.continuous = true;
  recognition.interimResults = true;

  let from = 0;
  let total = 0;
  let stopped = false;

  recognition.onresult = (event) => {
    total = event.results.length;
    let text = '';
    for (let i = from; i < event.results.length; i++) text += event.results[i]?.[0].transcript ?? '';
    onText(text.trim());
  };
  recognition.onerror = () => onText('');
  // Chrome ends a continuous session on its own after a while; carry on until we are stopped.
  recognition.onend = () => {
    if (stopped) return;
    from = 0;
    total = 0;
    try {
      recognition.start();
    } catch {
      // Not restartable; the server text still arrives.
    }
  };

  try {
    recognition.start();
  } catch {
    return null;
  }

  return {
    cut: () => {
      from = total;
      onText('');
    },
    stop: () => {
      stopped = true;
      try {
        recognition.stop();
      } catch {
        // Already stopped.
      }
      onText('');
    },
  };
}
