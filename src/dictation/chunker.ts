import { DICTATION_SAMPLE_RATE, rms, toPcm16 } from './audio';

/**
 * Cuts continuous speech into phrases worth sending (live dictation, 2026-11-05).
 *
 * ⚠ THE POLICY IS SHAPED BY GROQ'S FREE TIER, which counts every request as at least 10 seconds and
 * allows ~2,000 a day. Sending each 2-second phrase on its own would spend the day in under an hour
 * of talking, after which every phrase goes to the PAID rung. So:
 *
 *  - a LONG pause (the person stopped to think) sends what they said at once, whatever its length;
 *  - while they keep talking, a short pause sends only once ~8 s of speech has gathered;
 *  - a monologue is cut at the next small dip after 25 s, and hard at 30 s;
 *  - silence is never sent: both providers invent sentences for it (Gemini answered two seconds of
 *    silence with "The house is cold." on production's key).
 *
 * ⚠ AND A STEADY TALKER STILL SEES WORDS (owner, 2026-11-05). The pause rules alone meant someone
 * who never stops for breath saw nothing for up to 25 s. So, IN ADDITION to every rule above, once
 * ~4 s of speech has gathered the next small dip (a breath between words, >= 200 ms) sends it; if
 * no dip comes by ~6 s, it is cut at the quietest moment of the last 1.5 s, never mid-loudness, and
 * whatever follows that moment starts the next phrase rather than being thrown away.
 *
 * Pure and clock-free: it is fed 16 kHz frames and returns phrases, so the policy is unit-tested
 * without a microphone.
 */
export interface ChunkPolicy {
  frameMs: number;
  longPauseMs: number;
  shortPauseMs: number;
  minSpeechForShortPauseMs: number;
  softMaxMs: number;
  hardMaxMs: number;
  /** Fixed-interval rule: speech gathered before a small dip sends it. */
  intervalMs: number;
  intervalDipMs: number;
  /** No dip by this length: cut at the quietest recent moment. */
  intervalMaxMs: number;
  minSpeechMs: number;
  preRollMs: number;
  calibrationMs: number;
}

export const DEFAULT_CHUNK_POLICY: ChunkPolicy = {
  frameMs: 20,
  longPauseMs: 1500,
  shortPauseMs: 600,
  minSpeechForShortPauseMs: 8000,
  softMaxMs: 25000,
  hardMaxMs: 30000,
  intervalMs: 4000,
  intervalDipMs: 200,
  intervalMaxMs: 6000,
  minSpeechMs: 300,
  preRollMs: 200,
  calibrationMs: 300,
};

export interface Phrase {
  pcm: Int16Array;
  /** Milliseconds of the phrase judged to be speech. */
  speechMs: number;
}

export class PhraseChunker {
  private readonly policy: ChunkPolicy;
  private readonly frameSamples: number;
  private pendingSamples: number[] = [];
  private frames: Float32Array[] = [];
  /** Per frame: loudness and whether it was speech, so a cut can carry the tail into the next phrase. */
  private loudness: number[] = [];
  private speechFlags: boolean[] = [];
  private noise: number | null = null;
  private calibration: number[] = [];
  private hasSpeech = false;
  private speechMs = 0;
  private silenceRunMs = 0;

  /** Last frame's loudness, 0..1, for a level meter. */
  level = 0;

  /** Whether the last frame was judged to be speech (the session's "nobody is talking" timer). */
  voiced = false;

  constructor(policy: Partial<ChunkPolicy> = {}) {
    this.policy = { ...DEFAULT_CHUNK_POLICY, ...policy };
    this.frameSamples = Math.round((DICTATION_SAMPLE_RATE * this.policy.frameMs) / 1000);
  }

  /** Feed 16 kHz samples (any length). Returns zero or more finished phrases. */
  push(samples: Float32Array): Phrase[] {
    const out: Phrase[] = [];
    for (let i = 0; i < samples.length; i++) {
      this.pendingSamples.push(samples[i] ?? 0);
      if (this.pendingSamples.length === this.frameSamples) {
        const phrase = this.frame(Float32Array.from(this.pendingSamples));
        this.pendingSamples = [];
        if (phrase) out.push(phrase);
      }
    }
    return out;
  }

  /** On Stop: whatever speech is still held. */
  flush(): Phrase | null {
    if (this.pendingSamples.length > 0) {
      this.frames.push(Float32Array.from(this.pendingSamples));
      this.pendingSamples = [];
    }
    return this.hasSpeech && this.speechMs >= this.policy.minSpeechMs ? this.cut(0) : this.reset();
  }

  private threshold(): number {
    // Three times the room's own noise, within sane bounds for a laptop or phone microphone.
    return Math.min(0.05, Math.max(0.008, (this.noise ?? 0.003) * 3));
  }

  private frame(frame: Float32Array): Phrase | null {
    const p = this.policy;
    const loudness = rms(frame);
    this.level = Math.min(1, loudness * 8);

    if (this.calibration.length * p.frameMs < p.calibrationMs) {
      this.calibration.push(loudness);
      this.noise = this.calibration.reduce((a, b) => a + b, 0) / this.calibration.length;
    }

    const voiced = loudness >= this.threshold();
    this.voiced = voiced;
    this.frames.push(frame);
    this.loudness.push(loudness);
    this.speechFlags.push(voiced);

    if (voiced) {
      this.hasSpeech = true;
      this.speechMs += p.frameMs;
      this.silenceRunMs = 0;
    } else {
      this.silenceRunMs += p.frameMs;
      // The room changes (a fan starts); follow it slowly while nobody speaks.
      this.noise = this.noise === null ? loudness : this.noise * 0.98 + loudness * 0.02;
    }

    if (!this.hasSpeech) {
      const keep = Math.ceil(p.preRollMs / p.frameMs);
      if (this.frames.length > keep) {
        const drop = this.frames.length - keep;
        this.frames.splice(0, drop);
        this.loudness.splice(0, drop);
        this.speechFlags.splice(0, drop);
      }
      return null;
    }

    const phraseMs = this.frames.length * p.frameMs;
    const trailing = Math.floor(this.silenceRunMs / p.frameMs);

    if (this.silenceRunMs >= p.longPauseMs) return this.emitOrDrop(trailing);
    if (this.silenceRunMs >= p.shortPauseMs && this.speechMs >= p.minSpeechForShortPauseMs) return this.emitOrDrop(trailing);
    if (phraseMs >= p.softMaxMs && this.silenceRunMs >= p.frameMs * 10) return this.emitOrDrop(trailing);
    if (phraseMs >= p.hardMaxMs) return this.emitOrDrop(0);

    // The fixed interval, on top of the pause rules above.
    if (this.speechMs >= p.intervalMs && this.silenceRunMs >= p.intervalDipMs) return this.emitOrDrop(trailing);
    if (this.speechMs >= p.intervalMaxMs) return this.cutAtQuietest();

    return null;
  }

  /** Cut at the quietest frame of the last 1.5 s; the frames after it begin the next phrase. */
  private cutAtQuietest(): Phrase {
    const window = Math.ceil(1500 / this.policy.frameMs);
    const from = Math.max(1, this.frames.length - window);
    let best = this.frames.length - 1;
    for (let i = from; i < this.frames.length; i++) {
      if ((this.loudness[i] ?? 1) < (this.loudness[best] ?? 1)) best = i;
    }

    const tailFrames = this.frames.slice(best + 1);
    const tailLoud = this.loudness.slice(best + 1);
    const tailFlags = this.speechFlags.slice(best + 1);
    this.frames = this.frames.slice(0, best + 1);
    this.speechMs -= tailFlags.filter(Boolean).length * this.policy.frameMs;

    const phrase = this.cut(0);

    this.frames = tailFrames;
    this.loudness = tailLoud;
    this.speechFlags = tailFlags;
    this.speechMs = tailFlags.filter(Boolean).length * this.policy.frameMs;
    this.hasSpeech = this.speechMs > 0;
    return phrase;
  }

  private emitOrDrop(trailingFrames: number): Phrase | null {
    if (this.speechMs < this.policy.minSpeechMs) return this.reset();
    return this.cut(trailingFrames);
  }

  /** Keep ~300 ms of the trailing silence so the last word is not clipped. */
  private cut(trailingFrames: number): Phrase {
    const keepTail = Math.ceil(300 / this.policy.frameMs);
    const drop = Math.max(0, trailingFrames - keepTail);
    const frames = drop > 0 ? this.frames.slice(0, this.frames.length - drop) : this.frames;
    const total = frames.reduce((n, f) => n + f.length, 0);
    const joined = new Float32Array(total);
    let offset = 0;
    for (const f of frames) {
      joined.set(f, offset);
      offset += f.length;
    }
    const phrase = { pcm: toPcm16(joined), speechMs: this.speechMs };
    this.reset();
    return phrase;
  }

  private reset(): null {
    this.frames = [];
    this.loudness = [];
    this.speechFlags = [];
    this.hasSpeech = false;
    this.speechMs = 0;
    this.silenceRunMs = 0;
    return null;
  }
}
