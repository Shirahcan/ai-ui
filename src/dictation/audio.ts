/**
 * Audio plumbing for dictation: resample the microphone to 16 kHz mono and write PCM16 WAV.
 *
 * ⚠ WAV, NOT WHAT MediaRecorder WRITES. Chrome records WebM/Opus, which Gemini (the paid second
 * rung behind Groq) does not read. 16 kHz mono PCM is what both providers take, is ~32 KB a second,
 * and lets ai-service measure the phrase's length and loudness from its header and samples.
 */

export const DICTATION_SAMPLE_RATE = 16000;

/**
 * Streaming downsampler from the device rate (44.1/48 kHz) to 16 kHz by box-averaging, carrying the
 * fractional position across chunks so phrase boundaries never click or drift.
 */
export class Resampler {
  private readonly ratio: number;
  private position = 0;
  private carry: Float32Array = new Float32Array(0);

  constructor(inputRate: number, outputRate = DICTATION_SAMPLE_RATE) {
    this.ratio = inputRate / outputRate;
  }

  push(input: Float32Array): Float32Array {
    if (this.ratio === 1) return input.slice(0);

    const data = new Float32Array(this.carry.length + input.length);
    data.set(this.carry, 0);
    data.set(input, this.carry.length);

    const out: number[] = [];
    let pos = this.position;
    while (pos + this.ratio <= data.length) {
      const start = Math.floor(pos);
      const end = Math.min(data.length, Math.floor(pos + this.ratio));
      let sum = 0;
      for (let i = start; i < end; i++) sum += data[i] ?? 0;
      out.push(end > start ? sum / (end - start) : data[start] ?? 0);
      pos += this.ratio;
    }

    const consumed = Math.floor(pos);
    this.carry = data.slice(consumed);
    this.position = pos - consumed;

    return Float32Array.from(out);
  }
}

/** Root-mean-square loudness of a frame, 0 (silence) to ~1 (clipping). */
export function rms(frame: Float32Array): number {
  if (frame.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < frame.length; i++) {
    const v = frame[i] ?? 0;
    sum += v * v;
  }
  return Math.sqrt(sum / frame.length);
}

export function toPcm16(samples: Float32Array): Int16Array {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

/** A complete RIFF/WAVE file: 16-bit PCM, mono. */
export function encodeWav(pcm: Int16Array, sampleRate = DICTATION_SAMPLE_RATE): Blob {
  const buffer = new ArrayBuffer(44 + pcm.length * 2);
  const view = new DataView(buffer);
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };

  text(0, 'RIFF');
  view.setUint32(4, 36 + pcm.length * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, pcm.length * 2, true);
  new Int16Array(buffer, 44).set(pcm);

  return new Blob([buffer], { type: 'audio/wav' });
}
