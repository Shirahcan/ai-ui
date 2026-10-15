import type { StreamFrame } from './types';

/**
 * Read an SSE body as frames.
 *
 * ⚠ `EventSource` CANNOT BE USED FOR THIS, and reaching for it wastes a cycle
 * every time. It issues GET only and cannot set headers. An assistant turn is a
 * POST carrying the message and the page context, and it needs an
 * Authorization header. So: `fetch()` plus this parser.
 *
 * Three lessons are encoded here, each of which has cost a debugging cycle in
 * production and each of which works perfectly on localhost:
 *
 *  1. ⚠ **`decode(value, { stream: true })` IS LOAD-BEARING.** A multi-byte
 *     character routinely straddles a chunk boundary, and decoding each chunk
 *     independently turns every accented name and every emoji into a
 *     replacement character at random points in the answer.
 *  2. ⚠ **FRAMES SPLIT ACROSS CHUNKS.** `data: {"te` and `xt":"hi"}` arrive
 *     separately under any real network. A parser that assumes one frame per
 *     chunk corrupts in production and never locally. Buffer to a blank line.
 *  3. ⚠ **`\r\n` HAPPENS.** Some proxies rewrite line endings, and a parser
 *     that only splits on `\n\n` then waits forever for a frame boundary that
 *     has already gone past - the stream appears to hang with the answer
 *     half-written.
 */
export async function* readSseFrames(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<StreamFrame> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      if (signal?.aborted) return;

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      buffer = buffer.replace(/\r\n/g, '\n');

      let cut: number;
      while ((cut = buffer.indexOf('\n\n')) !== -1) {
        const frame = parseFrame(buffer.slice(0, cut));
        buffer = buffer.slice(cut + 2);

        if (frame) yield frame;
      }
    }

    /*
     * ⚠ THE LAST FRAME MAY ARRIVE WITHOUT ITS TRAILING BLANK LINE, because a
     * server that closes the connection immediately after writing `done` never
     * sends one. Dropping it loses the terminal event, and the consumer then
     * reports a truncated answer as a failure - for a turn that in fact
     * succeeded.
     */
    const tail = parseFrame(buffer);
    if (tail) yield tail;
  } finally {
    // Releasing matters on an abort: an un-released reader keeps the connection
    // (and the provider's generation) alive after the user pressed stop.
    try {
      reader.releaseLock();
    } catch {
      // Already released, or the stream errored. Nothing to do.
    }
  }
}

/** One `event:` / `data:` block. Returns null for a keep-alive or a blank. */
export function parseFrame(frame: string): StreamFrame | null {
  if (frame.trim() === '') return null;

  let event = '';
  let raw = '';

  for (const line of frame.split('\n')) {
    // A comment line is the standard keep-alive. Not an event.
    if (line.startsWith(':')) continue;

    if (line.startsWith('event:')) {
      event = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      // ⚠ Multi-line data is joined with newlines, per the SSE spec. A token
      // containing a line break arrives as two `data:` lines, and dropping the
      // newline silently reflows an assistant's paragraphs into one.
      raw += (raw ? '\n' : '') + line.slice(5).trim();
    }
  }

  if (!event) return null;

  try {
    const parsed: unknown = raw ? JSON.parse(raw) : {};

    return {
      event,
      data: typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {},
    };
  } catch {
    /*
     * ⚠ A MALFORMED FRAME IS NOT A FATAL. It is almost always a truncated
     * keep-alive or a provider's stray byte, and throwing here would abandon an
     * answer that is otherwise arriving perfectly well. The event name survives,
     * so a terminal frame still terminates.
     */
    return { event, data: {} };
  }
}

/**
 * Did the caller abort this themselves? Then it is not an error to report.
 *
 * ⚠ THREE SHAPES, BECAUSE ONE CANCELLATION HAS THREE NAMES. A bare `fetch`
 * rejects with a DOMException named `AbortError`; axios rejects with its own
 * `CanceledError`, whose `code` is `ERR_CANCELED` and whose `name` is
 * `CanceledError` only on recent versions. Every product in the estate reaches
 * its API through axios somewhere, so a check that knew only the fetch shape
 * would report a user's own deliberate Stop as a failure in exactly the
 * products this package is for.
 */
export function isAbortError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;

  const name = (error as { name?: unknown }).name;
  const code = (error as { code?: unknown }).code;

  return name === 'AbortError' || name === 'CanceledError' || code === 'ERR_CANCELED';
}
