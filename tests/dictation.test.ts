import { describe, expect, it, vi, beforeEach } from 'vitest';
import { PhraseChunker } from '../src/dictation/chunker';
import { applyCommands, insertPhrase } from '../src/dictation/text';
import { encodeWav, Resampler } from '../src/dictation/audio';

const RATE = 16000;
const tone = (ms: number, amp = 0.2) => Float32Array.from({ length: (RATE * ms) / 1000 }, (_, i) => amp * Math.sin((2 * Math.PI * 220 * i) / RATE));
const quiet = (ms: number) => new Float32Array((RATE * ms) / 1000).fill(0.0005);

/** Feed the chunker a script of [kind, ms] and collect the phrase lengths (ms) it cuts. */
function run(script: Array<['speak' | 'pause', number]>, chunker = new PhraseChunker()) {
  const cut: number[] = [];
  chunker.push(quiet(300)); // the room, for calibration
  for (const [kind, ms] of script) {
    for (const phrase of chunker.push(kind === 'speak' ? tone(ms) : quiet(ms))) cut.push(Math.round(phrase.pcm.length / 16));
  }
  return { cut, chunker };
}

describe('the phrase chunker (shaped by Groq\'s 10-second minimum)', () => {
  it('sends what was said at once after a long pause, however short it was', () => {
    const { cut } = run([['speak', 2000], ['pause', 1600]]);
    expect(cut).toHaveLength(1);
    expect(cut[0]).toBeGreaterThanOrEqual(2000);
  });

  it('holds short pauses until about 8 s of speech has gathered', () => {
    const { cut } = run([['speak', 3000], ['pause', 700], ['speak', 3000], ['pause', 700], ['speak', 3000], ['pause', 700]]);
    expect(cut).toHaveLength(1);
    expect(cut[0]).toBeGreaterThan(9000);
  });

  it('cuts a monologue after 25 s at the next small dip, and never lets one run past 30 s', () => {
    const dip = run([['speak', 26000], ['pause', 250], ['speak', 1000]]);
    expect(dip.cut[0]).toBeGreaterThanOrEqual(25000);
    const hard = run([['speak', 31000]]);
    expect(hard.cut[0]).toBeLessThanOrEqual(30000);
  });

  it('never sends silence or a click, because providers invent sentences for it', () => {
    expect(run([['pause', 5000]]).cut).toHaveLength(0);
    expect(run([['speak', 100], ['pause', 2000]]).cut).toHaveLength(0);
    const { chunker } = run([['pause', 2000]]);
    expect(chunker.flush()).toBeNull();
  });

  it('hands over what is held when the person presses Stop', () => {
    const { chunker, cut } = run([['speak', 1500]]);
    expect(cut).toHaveLength(0);
    expect(chunker.flush()?.pcm.length).toBeGreaterThan(1500 * 16);
  });
});

describe('spoken commands and inserting at the caret', () => {
  it('turns whole-phrase and trailing commands into text, but keeps the word in a sentence', () => {
    expect(applyCommands('New paragraph.')).toBe('\n\n');
    expect(applyCommands('Thanks for calling, new paragraph.')).toBe('Thanks for calling\n\n');
    expect(applyCommands('Nouvelle ligne')).toBe('\n');
    expect(applyCommands('Period.')).toBe('.');
    expect(applyCommands('The processing period.')).toBe('The processing period.');
  });

  it('inserts at the caret with one space, a capital after a full stop, and none before punctuation', () => {
    expect(insertPhrase('Hello.', 6, 6, 'how are you?')).toEqual({ value: 'Hello. How are you?', caret: 19 });
    expect(insertPhrase('Dear Ada', 8, 8, 'Comma.')).toEqual({ value: 'Dear Ada,', caret: 9 });
    expect(insertPhrase('Hi  there', 3, 3, 'Ada')).toEqual({ value: 'Hi Ada there', caret: 6 });
    expect(insertPhrase('', 0, 0, 'please send it')).toEqual({ value: 'Please send it', caret: 14 });
  });

  it('replaces only a selection the person made', () => {
    expect(insertPhrase('Send the letter today', 9, 15, 'bank letter').value).toBe('Send the bank letter today');
  });
});

describe('audio', () => {
  it('writes a WAV whose header says 16 kHz mono PCM16 and its length', async () => {
    const blob = encodeWav(new Int16Array(16000));
    // jsdom's Blob has no arrayBuffer(); FileReader is what it does have.
    const bytes = await new Promise<ArrayBuffer>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.readAsArrayBuffer(blob);
    });
    const view = new DataView(bytes);
    expect(blob.type).toBe('audio/wav');
    expect(view.getUint32(24, true)).toBe(16000);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(40, true)).toBe(32000);
  });

  it('resamples 48 kHz to 16 kHz without losing samples between chunks', () => {
    const r = new Resampler(48000);
    let total = 0;
    for (let i = 0; i < 10; i++) total += r.push(new Float32Array(4801)).length;
    expect(Math.abs(total - 16003)).toBeLessThanOrEqual(1);
  });
});

/* ---------------------------------------------------------------------------------------------- */

let feed: ((s: Float32Array) => void) | null = null;
vi.mock('../src/dictation/microphone', () => ({
  microphoneSupported: () => true,
  openMicrophone: async (onSamples: (s: Float32Array) => void) => {
    feed = onSamples;
    return { stream: {} as MediaStream, stop: () => { feed = null; } };
  },
}));
vi.mock('../src/dictation/onDevicePreview', () => ({
  onDevicePreviewAvailable: async () => false,
  startOnDevicePreview: () => null,
}));

describe('a dictation session', () => {
  beforeEach(() => {
    feed = null;
  });

  const say = (ms: number) => feed!(tone(ms));
  const hush = (ms: number) => feed!(quiet(ms));

  it('delivers the words in the order spoken even when a later phrase comes back first', async () => {
    const { DictationSession } = await import('../src/dictation/session');
    const replies: Array<(t: string) => void> = [];
    const words: string[] = [];
    const session = new DictationSession(
      { transcribe: () => new Promise<string>((resolve) => replies.push(resolve)), terms: ['Ada'] },
      { onText: (t) => words.push(t), onState: () => {}, onLevel: () => {}, onPreview: () => {} },
    );

    await session.start();
    hush(300);
    say(1500); hush(1600);
    say(1500); hush(1600);
    expect(replies).toHaveLength(2);

    replies[1]!('second');
    await Promise.resolve();
    expect(words).toEqual([]);
    replies[0]!('first');
    await new Promise((r) => setTimeout(r, 0));
    expect(words).toEqual(['first', 'second']);
    session.destroy();
  });

  it('stops and says why when the product answers 429 (today\'s minutes are used)', async () => {
    const { DictationSession } = await import('../src/dictation/session');
    const states: Array<[string, string | null]> = [];
    const session = new DictationSession(
      {
        transcribe: async () => {
          throw { response: { status: 429, data: { message: "You have used today's 60 minutes of dictation." } } };
        },
      },
      { onText: () => {}, onState: (s, m) => states.push([s, m]), onLevel: () => {}, onPreview: () => {} },
    );

    await session.start();
    hush(300);
    say(1500); hush(1600);
    await new Promise((r) => setTimeout(r, 0));

    expect(states.at(-1)).toEqual(['error', "You have used today's 60 minutes of dictation."]);
    expect(feed).toBeNull();
  });

  it('passes the names and the words already written to the product\'s transcribe call', async () => {
    const { DictationSession } = await import('../src/dictation/session');
    const contexts: Array<{ previous: string; terms: string[]; language?: string }> = [];
    const session = new DictationSession(
      { transcribe: async (_b, ctx) => { contexts.push(ctx); return 'hello Ada'; }, terms: ['Ada Obi'], language: 'en-CA' },
      { onText: () => {}, onState: () => {}, onLevel: () => {}, onPreview: () => {} },
    );

    await session.start();
    hush(300);
    say(1500); hush(1600);
    await new Promise((r) => setTimeout(r, 0));
    say(1500); hush(1600);
    await new Promise((r) => setTimeout(r, 0));

    expect(contexts[0]).toMatchObject({ previous: '', terms: ['Ada Obi'], language: 'en' });
    expect(contexts[1]?.previous).toBe('hello Ada');
    session.destroy();
  });
});
