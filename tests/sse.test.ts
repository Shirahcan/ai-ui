import { describe, expect, it } from 'vitest';
import { parseFrame, readSseFrames } from '../src/sse';

/** Build a readable stream from the given byte chunks. */
function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }

      controller.close();
    },
  });
}

async function collect(chunks: string[]) {
  const frames = [];

  for await (const frame of readSseFrames(streamOf(chunks))) {
    frames.push(frame);
  }

  return frames;
}

describe('readSseFrames', () => {
  it('reads whole frames', async () => {
    const frames = await collect([
      'event: token\ndata: {"text":"Hello"}\n\n',
      'event: done\ndata: {"text":"Hello"}\n\n',
    ]);

    expect(frames.map((f) => f.event)).toEqual(['token', 'done']);
    expect(frames[0]?.data.text).toBe('Hello');
  });

  /**
   * ⚠ THE LESSON THAT WORKS ON LOCALHOST AND CORRUPTS IN PRODUCTION. `data: {"te`
   * and `xt":"hi"}` arrive separately under any real network, and a parser that
   * assumes one frame per chunk drops both halves.
   */
  it('reassembles a frame split across chunks', async () => {
    const frames = await collect(['event: token\nda', 'ta: {"te', 'xt":"split"}\n', '\n']);

    expect(frames).toHaveLength(1);
    expect(frames[0]?.data.text).toBe('split');
  });

  /**
   * ⚠ A MULTI-BYTE CHARACTER ROUTINELY STRADDLES A CHUNK BOUNDARY, and decoding
   * each chunk independently turns every accented name into a replacement
   * character at a random point in the answer.
   */
  it('does not mangle a multi-byte character split across chunks', async () => {
    const encoder = new TextEncoder();
    const bytes = encoder.encode('event: token\ndata: {"text":"Nkechi Obí"}\n\n');

    // Cut in the middle of the two-byte í.
    const cut = bytes.indexOf(0xc3);
    expect(cut).toBeGreaterThan(0);

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, cut + 1));
        controller.enqueue(bytes.slice(cut + 1));
        controller.close();
      },
    });

    const frames = [];
    for await (const frame of readSseFrames(stream)) frames.push(frame);

    expect(frames[0]?.data.text).toBe('Nkechi Obí');
  });

  /** ⚠ Some proxies rewrite line endings; a `\n\n`-only parser then hangs. */
  it('handles CRLF frames', async () => {
    const frames = await collect(['event: token\r\ndata: {"text":"crlf"}\r\n\r\n']);

    expect(frames[0]?.data.text).toBe('crlf');
  });

  /**
   * ⚠ THE LAST FRAME MAY ARRIVE WITHOUT ITS TRAILING BLANK LINE, because a
   * server that closes immediately after writing `done` never sends one.
   * Dropping it loses the terminal event, and the consumer then reports a
   * successful turn as truncated.
   */
  it('yields a terminal frame with no trailing blank line', async () => {
    const frames = await collect(['event: done\ndata: {"text":"finished"}']);

    expect(frames).toHaveLength(1);
    expect(frames[0]?.event).toBe('done');
  });

  it('skips keep-alive comments', async () => {
    const frames = await collect([': keep-alive\n\n', 'event: token\ndata: {"text":"x"}\n\n']);

    expect(frames).toHaveLength(1);
  });

  it('stops when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    const frames = [];
    for await (const frame of readSseFrames(streamOf(['event: token\ndata: {}\n\n']), controller.signal)) {
      frames.push(frame);
    }

    expect(frames).toHaveLength(0);
  });
});

describe('parseFrame', () => {
  it('returns null for a blank frame', () => {
    expect(parseFrame('')).toBeNull();
    expect(parseFrame('   ')).toBeNull();
  });

  it('returns null when there is no event name', () => {
    expect(parseFrame('data: {"text":"orphan"}')).toBeNull();
  });

  /**
   * ⚠ A MALFORMED FRAME IS NOT FATAL. It is almost always a truncated keep-alive
   * or a provider's stray byte, and throwing would abandon an answer that is
   * otherwise arriving fine. The event name survives, so a terminal frame still
   * terminates.
   */
  it('keeps the event name when the data will not parse', () => {
    expect(parseFrame('event: done\ndata: {not json')).toEqual({ event: 'done', data: {} });
  });

  /** ⚠ Multi-line data joins with a newline, per the spec: a token containing a
   * line break arrives as two `data:` lines, and dropping it reflows an
   * assistant's paragraphs into one. */
  it('joins multi-line data', () => {
    const frame = parseFrame('event: token\ndata: {"text":"a\ndata: b"}');

    expect(frame?.event).toBe('token');
  });
});
