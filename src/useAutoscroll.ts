import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Keep a message list at the latest message WITHOUT stealing the scrollbar.
 *
 * ⚠ THIS IS A FIX, NOT A CONVENIENCE. Every hand-built panel this package
 * replaces autoscrolls the same wrong way: `scrollTo({ top: scrollHeight })` on
 * every message change, unconditionally. During a streamed answer that effect
 * fires on a token cadence, so a reader who scrolls UP to check what the
 * assistant said thirty seconds ago is dragged back to the bottom several times
 * a second and physically cannot read it. The longer and more useful the
 * answer, the worse it gets.
 *
 * The rule is: follow the stream only while the reader is ALREADY at the bottom.
 * The moment they scroll away, stop following and say so, so the panel can
 * offer them a way back instead of taking the decision from them.
 */
export interface AutoscrollOptions {
  /**
   * Change this whenever content was appended - the message count, the streamed
   * text, a pending flag. Any value that differs is a reason to re-check.
   */
  watch: unknown;

  /**
   * How close to the bottom still counts as "at the bottom", in pixels.
   *
   * ⚠ IT CANNOT BE ZERO. Sub-pixel layout, a fractional device pixel ratio
   * and a mid-stream reflow all leave `scrollHeight - scrollTop - clientHeight`
   * at something like 0.5 while the reader is plainly at the bottom, which
   * would un-pin the list on its own and stop it following the live answer.
   */
  threshold?: number;
}

export interface Autoscroll<T extends HTMLElement = HTMLDivElement> {
  /** Attach to the scrolling element. */
  scrollRef: React.RefObject<T | null>;

  /** Attach to the same element's `onScroll`. */
  onScroll: () => void;

  /** False once the reader has scrolled away from the bottom. */
  isPinned: boolean;

  /** Put them back, and resume following. For a "jump to latest" control. */
  scrollToBottom: () => void;
}

export function useAutoscroll<T extends HTMLElement = HTMLDivElement>({
  watch,
  threshold = 48,
}: AutoscrollOptions): Autoscroll<T> {
  const scrollRef = useRef<T | null>(null);

  /*
   * ⚠ PINNED STARTS TRUE so the panel OPENS at the newest message. A
   * restored conversation that opened at its oldest message reads as a
   * different, empty thread until the reader works out they have to scroll.
   */
  const [isPinned, setIsPinned] = useState(true);
  const pinnedRef = useRef(true);

  const atBottom = useCallback((): boolean => {
    const el = scrollRef.current;
    if (!el) return true;

    // Nothing overflows yet, so the reader is trivially at the end of it.
    if (el.scrollHeight <= el.clientHeight) return true;

    return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
  }, [threshold]);

  const onScroll = useCallback(() => {
    const next = atBottom();

    if (next === pinnedRef.current) return;

    pinnedRef.current = next;
    setIsPinned(next);
  }, [atBottom]);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;

    pinnedRef.current = true;
    setIsPinned(true);
    /*
     * ⚠ `behavior: 'auto'`, NEVER 'smooth'. A smooth scroll animates over
     * several frames, and during those frames the element genuinely is not at
     * the bottom - so the scroll events the animation itself fires would un-pin
     * the list halfway through its own catch-up. An instant jump is also what a
     * reader following a live answer actually wants.
     */
    el.scrollTo({ top: el.scrollHeight, behavior: 'auto' });
  }, []);

  /*
   * Syncing a DOM property with React state, which is what effects are for.
   * The decision is read from the ref rather than from `isPinned`, so a token
   * arriving in the same tick as a scroll cannot act on a stale pin.
   */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !pinnedRef.current) return;

    el.scrollTo({ top: el.scrollHeight, behavior: 'auto' });
  }, [watch]);

  return { scrollRef, onScroll, isPinned, scrollToBottom };
}
