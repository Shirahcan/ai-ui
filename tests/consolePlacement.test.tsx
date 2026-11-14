import { fireEvent, render } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { ConsoleHost } from '../src/terminal/ConsoleHost';

/**
 * Where the console sits (1.60.3, shared console C6f): at the top-left corner of the region that scrolls, however
 * deep in the page the host mounted it, and never taller than what is left of the viewport. The email editor mounts
 * it inside a centred content column 60px down; before this it started there, left a gap between the sidebar and its
 * tab, and ran the composer off the bottom of a short screen.
 */
const terminal = { assistantName: 'Porter', subjectLabel: 'Welcome email', subjectNoun: 'email', session: null, turns: [], live: null, notes: [], loading: false, value: '', onChange: () => undefined, onAsk: () => undefined } as never;

function rect(left: number, top: number): DOMRect {
  return { left, top, right: left, bottom: top, width: 0, height: 0, x: left, y: top, toJSON: () => ({}) } as DOMRect;
}

describe('ConsoleHost placement', () => {
  beforeAll(() => Object.defineProperty(Element.prototype, 'scrollTo', { value: vi.fn(), configurable: true }));
  afterEach(() => vi.restoreAllMocks());

  /** A scrolling region at (258, 62) with the host's wrapper mounted at (279, 134), on a 600px-high window. */
  function mount(scrolls: boolean) {
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(600);
    const where = new Map<string, DOMRect>([['region', rect(258, 62)]]);
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      if (this instanceof HTMLElement && this.dataset.testRegion !== undefined) return where.get('region')!;
      if (this instanceof HTMLElement && this.classList.contains('sticky')) return where.get('anchor') ?? rect(279, 134);
      return rect(0, 0);
    });

    const view = render(
      <div data-test-region="" style={{ overflowY: scrolls ? 'auto' : 'visible' }}>
        <ConsoleHost open onOpenChange={() => undefined} terminal={terminal} composer={{} as never} assistantName="Porter" working={null} />
      </div>,
    );
    const box = view.container.querySelector<HTMLElement>('[data-console-box]')!;

    return { box, frame: box.parentElement!, where };
  }

  it('moves to the region\'s top-left corner and ends above the bottom of the viewport', () => {
    const { box, frame } = mount(true);

    // Left edge of the region (the tab touches the sidebar), 12px below its top edge.
    expect(frame.style.left).toBe('-21px');
    expect(frame.style.top).toBe('-60px');
    // 600 - (62 + 12) - 12: the composer is on screen.
    expect(box.style.maxHeight).toBe('514px');
  });

  it('follows the page as it scrolls, so it stays in the corner', () => {
    const { frame, where } = mount(true);

    where.set('anchor', rect(279, 104));
    fireEvent.scroll(window);

    expect(frame.style.top).toBe('-30px');
  });

  it('keeps the host\'s own place when the window scrolls, and only caps the height', () => {
    const { box, frame } = mount(false);

    expect(frame.style.left).toBe('');
    expect(frame.style.top).toBe('');
    // 600 - 134 - 12.
    expect(box.style.maxHeight).toBe('454px');
  });
});
