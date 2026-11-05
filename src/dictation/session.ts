import { encodeWav } from './audio';
import { PhraseChunker, type ChunkPolicy, type Phrase } from './chunker';
import { microphoneSupported, openMicrophone, type Microphone } from './microphone';
import { onDevicePreviewAvailable, startOnDevicePreview, type OnDevicePreview } from './onDevicePreview';

/**
 * One dictation session: microphone -> phrases -> the product's transcribe call -> words, in order.
 *
 * ⚠ THE PACKAGE NEVER CALLS ai-service. ai-service is loopback-only, so `transcribe` is the
 * product's own call to its own route (Portify: POST /api/v1/ai/dictation), exactly as the chat
 * panel streams through the product's proxy.
 */
export interface DictationContext {
  /** The tail of what was already written in this session, so a sentence split over two phrases reads on. */
  previous: string;
  terms: string[];
  language?: string;
  sequence: number;
}

export interface DictationConfig {
  transcribe: (phrase: Blob, context: DictationContext) => Promise<string>;
  /** Names and words the person may say: the client's name, the case title, programme terms. */
  terms?: string[];
  /** BCP-47, e.g. "en-CA" or "fr-CA". The provider gets the two-letter code. */
  language?: string;
  /** Hard stop for one session, in seconds. Default 600. */
  maxSeconds?: number;
  /** Stops by itself after this long with nobody speaking, in seconds. Default 60. */
  idleSeconds?: number;
  /** Grey words while speaking where the browser recognises on the device. Default true. */
  preview?: boolean;
  /** A failure the person should not be left guessing about (Portify: reportErrorToPorter). */
  onError?: (error: unknown) => void;
  labels?: Partial<DictationLabels>;
  /** Tuning for tests; products leave it alone. */
  policy?: Partial<ChunkPolicy>;
}

export interface DictationLabels {
  start: string;
  stop: string;
  listening: string;
  writing: string;
  blocked: string;
  noMicrophone: string;
  unsupported: string;
  partLost: string;
  unavailable: string;
}

export const DEFAULT_DICTATION_LABELS: DictationLabels = {
  start: 'Dictate',
  stop: 'Stop dictating',
  listening: 'Listening. Pause to see your words.',
  writing: 'Writing what you said',
  blocked: 'The microphone is blocked. Allow it in your browser’s site settings, then try again.',
  noMicrophone: 'No microphone was found. Connect one and try again.',
  unsupported: 'This browser cannot record from a microphone.',
  partLost: 'Part of what you said could not be written down. Say it again.',
  unavailable: 'Dictation is not available right now. Type instead.',
};

export type DictationState = 'idle' | 'starting' | 'listening' | 'finishing' | 'error';

export interface DictationEvents {
  onText: (text: string) => void;
  onState: (state: DictationState, message: string | null) => void;
  onLevel: (level: number) => void;
  onPreview: (text: string) => void;
}

/** HTTP statuses that end the session: off (404), today's minutes used (429), nobody to transcribe (503). */
const STOPPING_STATUSES = [401, 403, 404, 429, 503];

function statusOf(error: unknown): number | null {
  const e = error as { status?: unknown; response?: { status?: unknown } } | null;
  const status = e?.response?.status ?? e?.status;
  return typeof status === 'number' ? status : null;
}

function messageOf(error: unknown): string | null {
  const e = error as { message?: unknown; response?: { data?: { message?: unknown } } } | null;
  const m = e?.response?.data?.message ?? e?.message;
  return typeof m === 'string' && m.trim() !== '' ? m : null;
}

export class DictationSession {
  private readonly labels: DictationLabels;
  private chunker: PhraseChunker;
  private mic: Microphone | null = null;
  private preview: OnDevicePreview | null = null;
  private state: DictationState = 'idle';
  private sequence = 0;
  private nextToDeliver = 1;
  private inFlight = 0;
  private queue: Array<{ sequence: number; phrase: Phrase }> = [];
  private results = new Map<number, string>();
  private written = '';
  private quietMs = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private levelAt = 0;

  constructor(private readonly config: DictationConfig, private readonly events: DictationEvents) {
    this.labels = { ...DEFAULT_DICTATION_LABELS, ...config.labels };
    this.chunker = new PhraseChunker(config.policy);
  }

  get current(): DictationState {
    return this.state;
  }

  /** Call straight from the click or tap: iOS only lets audio start inside the gesture. */
  async start(): Promise<void> {
    if (this.state === 'starting' || this.state === 'listening') return;

    if (!microphoneSupported()) {
      this.set('error', this.labels.unsupported);
      return;
    }

    this.reset();
    this.set('starting', null);

    try {
      this.mic = await openMicrophone((samples) => this.onSamples(samples));
    } catch (error) {
      const name = (error as { name?: string })?.name;
      this.set('error', name === 'NotAllowedError' || name === 'SecurityError'
        ? this.labels.blocked
        : name === 'NotFoundError' || name === 'OverconstrainedError'
          ? this.labels.noMicrophone
          : this.labels.unavailable);
      if (name !== 'NotAllowedError' && name !== 'NotFoundError') this.config.onError?.(error);
      return;
    }

    // stop() may have run while the permission prompt was open.
    if ((this.state as DictationState) !== 'starting') {
      this.mic.stop();
      this.mic = null;
      return;
    }

    this.set('listening', this.labels.listening);
    this.timer = setTimeout(() => this.stop(), (this.config.maxSeconds ?? 600) * 1000);

    if (this.config.preview !== false) {
      const lang = this.config.language ?? (typeof navigator !== 'undefined' ? navigator.language : 'en-US');
      void onDevicePreviewAvailable(lang).then((ok) => {
        if (ok && this.state === 'listening') this.preview = startOnDevicePreview(lang, (t) => this.events.onPreview(t));
      });
    }
  }

  stop(): void {
    if (this.state !== 'starting' && this.state !== 'listening') return;

    const last = this.chunker.flush();
    this.release();
    if (last) this.enqueue(last);

    if (this.inFlight === 0 && this.queue.length === 0) {
      this.set('idle', null);
    } else {
      this.set('finishing', this.labels.writing);
    }
  }

  /** Unmount: drop everything, deliver nothing more. */
  destroy(): void {
    this.release();
    this.queue = [];
    this.state = 'idle';
  }

  private release(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.mic?.stop();
    this.mic = null;
    this.preview?.stop();
    this.preview = null;
    this.events.onLevel(0);
  }

  private reset(): void {
    this.chunker = new PhraseChunker(this.config.policy);
    this.sequence = 0;
    this.nextToDeliver = 1;
    this.results.clear();
    this.queue = [];
    this.written = '';
    this.quietMs = 0;
  }

  private onSamples(samples: Float32Array): void {
    if (this.state !== 'listening') return;

    for (const phrase of this.chunker.push(samples)) this.enqueue(phrase);

    // About 15 level updates a second is smooth and cheap.
    const now = Date.now();
    if (now - this.levelAt > 66) {
      this.levelAt = now;
      this.events.onLevel(this.chunker.level);
    }

    this.quietMs = this.chunker.voiced ? 0 : this.quietMs + (samples.length / 16000) * 1000;
    if (this.quietMs >= (this.config.idleSeconds ?? 60) * 1000) this.stop();
  }

  private enqueue(phrase: Phrase): void {
    this.preview?.cut();
    this.queue.push({ sequence: ++this.sequence, phrase });
    this.pump();
  }

  private pump(): void {
    while (this.inFlight < 2 && this.queue.length > 0) {
      const job = this.queue.shift()!;
      this.inFlight++;
      void this.send(job.sequence, job.phrase).finally(() => {
        this.inFlight--;
        this.pump();
        if (this.state === 'finishing' && this.inFlight === 0 && this.queue.length === 0) this.set('idle', null);
      });
    }
  }

  private async send(sequence: number, phrase: Phrase): Promise<void> {
    const blob = encodeWav(phrase.pcm);
    const context: DictationContext = {
      previous: this.written.slice(-200),
      terms: this.config.terms ?? [],
      language: this.config.language?.slice(0, 2),
      sequence,
    };

    let text = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        text = (await this.config.transcribe(blob, context)).trim();
        break;
      } catch (error) {
        const status = statusOf(error);
        if (status !== null && STOPPING_STATUSES.includes(status)) {
          this.results.set(sequence, '');
          this.deliver();
          this.fail(messageOf(error) ?? this.labels.unavailable);
          return;
        }
        if (attempt === 1) {
          this.config.onError?.(error);
          if (this.state === 'listening') this.events.onState('listening', this.labels.partLost);
        }
      }
    }

    this.results.set(sequence, text);
    this.deliver();
  }

  /** Words land in the order they were spoken, even when a later phrase came back first. */
  private deliver(): void {
    while (this.results.has(this.nextToDeliver)) {
      const text = this.results.get(this.nextToDeliver)!;
      this.results.delete(this.nextToDeliver);
      this.nextToDeliver++;
      if (this.state === 'idle' && this.mic === null && this.queue.length === 0 && this.inFlight === 0) {
        // Destroyed: the box this was for may be gone.
        continue;
      }
      if (text !== '') {
        this.written = (this.written + ' ' + text).trim();
        this.events.onText(text);
      }
    }
  }

  private fail(message: string): void {
    this.release();
    this.queue = [];
    this.set('error', message);
  }

  private set(state: DictationState, message: string | null): void {
    this.state = state;
    this.events.onState(state, message);
  }
}
