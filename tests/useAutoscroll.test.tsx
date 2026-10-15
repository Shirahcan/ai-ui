import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAutoscroll } from '../src/useAutoscroll';

/**
 * jsdom has no layout and no `scrollTo`, so the geometry is driven by hand.
 * That is fine here: the thing under test is the DECISION, not the paint.
 */
const geometry = { scrollHeight: 1000, clientHeight: 300, scrollTop: 700 };
let scrollTo: ReturnType<typeof vi.fn>;

beforeEach(() => {
  geometry.scrollHeight = 1000;
  geometry.clientHeight = 300;
  geometry.scrollTop = 700; // exactly at the bottom

  scrollTo = vi.fn();

  Object.defineProperty(Element.prototype, 'scrollTo', { value: scrollTo, configurable: true });
  Object.defineProperty(Element.prototype, 'scrollHeight', {
    get: () => geometry.scrollHeight,
    configurable: true,
  });
  Object.defineProperty(Element.prototype, 'clientHeight', {
    get: () => geometry.clientHeight,
    configurable: true,
  });
  Object.defineProperty(Element.prototype, 'scrollTop', {
    get: () => geometry.scrollTop,
    set: (v: number) => {
      geometry.scrollTop = v;
    },
    configurable: true,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function Harness({ watch }: { watch: unknown }) {
  const { scrollRef, onScroll, isPinned, scrollToBottom } = useAutoscroll({ watch });

  return (
    <>
      <div data-testid="list" ref={scrollRef} onScroll={onScroll} />
      <span data-testid="pinned">{String(isPinned)}</span>
      <button type="button" data-testid="jump" onClick={scrollToBottom}>
        jump
      </button>
    </>
  );
}

const pinned = () => screen.getByTestId('pinned').textContent;
const scrollUpTo = (top: number) => {
  geometry.scrollTop = top;
  act(() => {
    screen.getByTestId('list').dispatchEvent(new Event('scroll', { bubbles: true }));
  });
};

describe('useAutoscroll', () => {
  it('opens at the newest message and follows new content', () => {
    const { rerender } = render(<Harness watch={1} />);

    expect(pinned()).toBe('true');
    expect(scrollTo).toHaveBeenCalledWith({ top: 1000, behavior: 'auto' });

    scrollTo.mockClear();
    geometry.scrollHeight = 1400;
    rerender(<Harness watch={2} />);

    expect(scrollTo).toHaveBeenCalledWith({ top: 1400, behavior: 'auto' });
  });

  /** The defect this hook exists for. */
  it('STOPS following once the reader scrolls up, and does not drag them back', () => {
    const { rerender } = render(<Harness watch={1} />);

    scrollUpTo(120);
    expect(pinned()).toBe('false');

    scrollTo.mockClear();
    geometry.scrollHeight = 1400;
    rerender(<Harness watch={2} />);
    geometry.scrollHeight = 1800;
    rerender(<Harness watch={3} />);

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('resumes following when the reader asks to jump back', () => {
    const { rerender } = render(<Harness watch={1} />);

    scrollUpTo(120);
    scrollTo.mockClear();

    act(() => {
      screen.getByTestId('jump').click();
    });

    expect(pinned()).toBe('true');
    expect(scrollTo).toHaveBeenCalledWith({ top: 1000, behavior: 'auto' });

    scrollTo.mockClear();
    geometry.scrollHeight = 1400;
    rerender(<Harness watch={2} />);

    expect(scrollTo).toHaveBeenCalledWith({ top: 1400, behavior: 'auto' });
  });

  it('treats a near-bottom position as the bottom', () => {
    render(<Harness watch={1} />);

    // 40px short of the end: inside the 48px threshold.
    scrollUpTo(660);
    expect(pinned()).toBe('true');

    // 60px short: outside it.
    scrollUpTo(640);
    expect(pinned()).toBe('false');
  });

  it('treats a list that does not overflow as pinned', () => {
    geometry.scrollHeight = 200;
    geometry.clientHeight = 300;
    geometry.scrollTop = 0;

    render(<Harness watch={1} />);
    scrollUpTo(0);

    expect(pinned()).toBe('true');
  });

  /**
   * A smooth scroll animates across frames, and its own scroll events would
   * un-pin the list halfway through its catch-up.
   */
  it('never animates the scroll', () => {
    const { rerender } = render(<Harness watch={1} />);
    rerender(<Harness watch={2} />);

    act(() => {
      screen.getByTestId('jump').click();
    });

    for (const call of scrollTo.mock.calls) {
      expect((call[0] as ScrollToOptions).behavior).toBe('auto');
    }
    expect(scrollTo).toHaveBeenCalled();
  });
});
