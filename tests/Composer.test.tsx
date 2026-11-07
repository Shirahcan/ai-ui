import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Composer } from '../src/components/Composer';

/**
 * The composer, and the recall ring one product in the estate had.
 *
 * ⚠ THE ASSERTIONS THAT EARN THIS FILE ARE THE GUARDS, not the recall. Walking
 * back through what you sent is pleasant; replacing a half-written question with
 * an older one because the caret happened to be on line two is a lost question,
 * and that is what an unguarded ArrowUp handler does.
 */
type Props = Parameters<typeof Composer>[0];

/** The composer is controlled, so the test owns the value it controls. */
function Harness({ value: initial = '', onSend, ...rest }: Partial<Props> = {}) {
  const [value, setValue] = useState(initial);

  return <Composer {...rest} value={value} onChange={setValue} onSend={onSend ?? (() => {})} />;
}

const box = () => screen.getByRole('textbox') as HTMLTextAreaElement;

const caretAt = (position: number) => {
  const el = box();
  el.selectionStart = position;
  el.selectionEnd = position;
};

describe('Composer', () => {
  describe('history recall', () => {
    const history = ['the newest question', 'an older question'];

    it('walks back through what was sent, newest first', () => {
      render(<Harness history={history} />);

      caretAt(0);
      fireEvent.keyDown(box(), { key: 'ArrowUp' });
      expect(box().value).toBe('the newest question');

      caretAt(0);
      fireEvent.keyDown(box(), { key: 'ArrowUp' });
      expect(box().value).toBe('an older question');
    });

    it('stops at the oldest rather than wrapping round', () => {
      render(<Harness history={history} />);

      for (let i = 0; i < 4; i += 1) {
        caretAt(0);
        fireEvent.keyDown(box(), { key: 'ArrowUp' });
      }

      expect(box().value).toBe('an older question');
    });

    /**
     * ⚠ THE DRAFT COMES BACK, which is the whole reason the ring is worth having.
     * Somebody half-way through a question who checks what they asked before has
     * not asked to lose it.
     */
    it('restores the draft it stashed on the way out', () => {
      render(<Harness history={history} />);

      fireEvent.change(box(), { target: { value: 'half a question' } });

      caretAt(0);
      fireEvent.keyDown(box(), { key: 'ArrowUp' });
      expect(box().value).toBe('the newest question');

      caretAt(box().value.length);
      fireEvent.keyDown(box(), { key: 'ArrowDown' });
      expect(box().value).toBe('half a question');
    });

    it('leaves the arrow keys alone part-way through a multi-line draft', () => {
      render(<Harness history={history} />);

      fireEvent.change(box(), { target: { value: 'line one\nline two' } });

      // The caret is on line two, where ArrowUp means "go up a line".
      caretAt(12);
      fireEvent.keyDown(box(), { key: 'ArrowUp' });

      expect(box().value).toBe('line one\nline two');
    });

    it('does nothing at all when there is no history', () => {
      render(<Harness />);

      caretAt(0);
      fireEvent.keyDown(box(), { key: 'ArrowUp' });

      expect(box().value).toBe('');
    });

    /**
     * ⚠ TYPING LEAVES THE RING. Without this the next ArrowUp continues from
     * wherever the ring was, so a reader who recalled an old question, edited it,
     * then pressed Up would watch their edit vanish into an older entry.
     */
    it('treats an edit as a new draft', () => {
      render(<Harness history={history} />);

      caretAt(0);
      fireEvent.keyDown(box(), { key: 'ArrowUp' });
      fireEvent.change(box(), { target: { value: 'the newest question, edited' } });

      caretAt(0);
      fireEvent.keyDown(box(), { key: 'ArrowUp' });
      expect(box().value).toBe('the newest question');

      caretAt(box().value.length);
      fireEvent.keyDown(box(), { key: 'ArrowDown' });
      expect(box().value).toBe('the newest question, edited');
    });

    it('starts the ring over after a send', () => {
      const onSend = vi.fn();
      render(<Harness history={history} onSend={onSend} />);

      caretAt(0);
      fireEvent.keyDown(box(), { key: 'ArrowUp' });
      fireEvent.keyDown(box(), { key: 'Enter' });
      expect(onSend).toHaveBeenCalledTimes(1);

      // Down from a fresh ring has nowhere to go, and must not resurrect a stash.
      caretAt(box().value.length);
      fireEvent.keyDown(box(), { key: 'ArrowDown' });
      expect(box().value).toBe('the newest question');
    });
  });

  /**
   * ⚠ A BOX THAT CANNOT SEND IS NOT A BOX THAT CANNOT BE TYPED IN. Porter's
   * panel opens before its thread has loaded; disabling the textarea for that
   * second would swallow whatever somebody typed into it.
   */
  it('can refuse Send while staying typable', () => {
    const onSend = vi.fn();
    render(<Harness value="a question" sendDisabled onSend={onSend} />);

    expect(box()).toHaveProperty('disabled', false);
    expect(screen.getByRole('button', { name: 'Send' })).toHaveProperty('disabled', true);

    fireEvent.keyDown(box(), { key: 'Enter' });
    expect(onSend).not.toHaveBeenCalled();
  });

  /**
   * ⚠ THE DEFAULT IS WHAT MOST PANELS WANT, AND THE OPT-IN IS WHAT SAVED A
   * DOCUMENTED CAPABILITY. Porter supersedes - a second message mid-answer is taken
   * together with the first - and its knowledge base promises that in three bullets.
   * Swapping its hand-built composer for this one silently swallowed the keystroke,
   * because a panel WITHOUT a supersede path must not start a second turn into one
   * message list.
   */
  describe('sending while a turn is running', () => {
    it('refuses by default, because a second turn into one list is a defect', () => {
      const onSend = vi.fn();
      render(<Harness value="a follow-up" busy onSend={onSend} />);

      fireEvent.keyDown(box(), { key: 'Enter' });

      expect(onSend).not.toHaveBeenCalled();
    });

    it('allows it for a product that supersedes', () => {
      const onSend = vi.fn();
      render(<Harness value="actually, LMIA only" busy sendWhileBusy onSend={onSend} />);

      fireEvent.keyDown(box(), { key: 'Enter' });

      expect(onSend).toHaveBeenCalledTimes(1);
    });

    /** Still nothing to send is still nothing to send. */
    it('does not fire an empty turn either way', () => {
      const onSend = vi.fn();
      render(<Harness busy sendWhileBusy onSend={onSend} />);

      fireEvent.keyDown(box(), { key: 'Enter' });

      expect(onSend).not.toHaveBeenCalled();
    });
  });

  it('keeps the box full width: the tools and Send sit in a row BELOW the words, inside one border', () => {
    // jsdom has no microphone, and the button rightly hides without one; give it one.
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: vi.fn() }, configurable: true });
    (window as unknown as { AudioContext: unknown }).AudioContext = class {};
    const { container } = render(
      <Harness
        attachments={{ accept: ['application/pdf'], maxFiles: 1, maxBytes: 1, onUpload: async () => ({ id: 'x' }) } as never}
        dictation={{ transcribe: async () => '' }}
      />,
    );
    const frame = container.querySelector('[data-ai-composer-box]')!;
    const tools = container.querySelector('[data-ai-composer-tools]')!;

    // The textarea is the box's first child (attachment chips aside) and the tool row comes after it.
    expect(frame.contains(box())).toBe(true);
    expect(box().compareDocumentPosition(tools) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(box().className).toContain('w-full');
    // Every control lives in the tool row, so adding one never takes width from the words.
    for (const name of ['Attach a file', 'Dictate', 'Send']) {
      expect(tools.contains(screen.getByRole('button', { name }))).toBe(true);
    }
  });

  it('swaps Send for Stop while a turn is running', () => {
    const onStop = vi.fn();
    render(<Harness busy onStop={onStop} stopClassName="porter-stop" />);

    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull();

    const stop = screen.getByRole('button', { name: 'Stop' });
    expect(stop.className).toBe('porter-stop');

    fireEvent.click(stop);
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it('does not lock its height while it is not rendered (a hidden panel)', () => {
    // jsdom renders nothing, which is exactly the hidden-panel case: no client rects.
    render(<Harness placeholder="What is year to date revenue?" />);
    const box = screen.getByPlaceholderText('What is year to date revenue?') as HTMLTextAreaElement;

    expect(box.style.height).toBe('auto');
  });

  it('locks to the measured height once it is rendered', () => {
    const rects = vi
      .spyOn(HTMLElement.prototype, 'getClientRects')
      .mockReturnValue([{}] as unknown as DOMRectList);
    const scroll = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(48);

    render(<Harness placeholder="ask" />);

    expect((screen.getByPlaceholderText('ask') as HTMLTextAreaElement).style.height).toBe('48px');

    rects.mockRestore();
    scroll.mockRestore();
  });

  describe('tools slot (1.38.0)', () => {
    it('renders a surface control in the tools row, before Send', () => {
      render(<Harness value="make it warmer" tools={<button type="button">Plan first</button>} />);

      const plan = screen.getByRole('button', { name: 'Plan first' });
      const send = screen.getByRole('button', { name: 'Send' });

      expect(plan.closest('[data-ai-composer-tools]')).not.toBeNull();
      expect(plan.compareDocumentPosition(send) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('leaves the row as it was without one', () => {
      render(<Harness value="hello" />);

      expect(screen.getAllByRole('button')).toHaveLength(1);
    });
  });
});

