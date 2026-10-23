import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MessageBubble } from '../src/components/MessageBubble';
import type { PanelMessage } from '../src/types';

/**
 * The shared bubble, and the caveat that earns it.
 *
 * ⚠ THE ASSERTIONS THAT MATTER ARE THE THREE GROUNDING CASES. Everything else
 * here is frame and layout. Grounding is the thing two products disagreed about
 * while both returning the same two fields from their APIs, and the thing a
 * loose check would get catastrophically wrong in the other direction: a `!grounded`
 * test stamps BEST-EFFORT on every answer in every product that never set the
 * field, which is most of them.
 */
const message = (over: Partial<PanelMessage> = {}): PanelMessage => ({
  id: 'm1',
  role: 'assistant',
  text: 'The fee is $1,000 per position.',
  ...over,
});

describe('MessageBubble', () => {
  it('names the speaker on the row, for a product stylesheet and for a test', () => {
    const { container } = render(<MessageBubble message={message({ role: 'user', text: 'hi' })} />);

    expect(container.querySelector('[data-role="user"]')).toBeTruthy();
  });

  it('never renders a user\'s own words as Markdown', () => {
    render(<MessageBubble message={message({ role: 'user', text: 'what does **this** mean?' })} />);

    // The asterisks are the question, not formatting.
    expect(screen.getByText('what does **this** mean?')).toBeTruthy();
  });

  describe('the ungrounded caveat', () => {
    it('labels an answer the assistant did not retrieve', () => {
      render(<MessageBubble message={message({ grounded: false, confidence: 'low' })} />);

      expect(screen.getByText(/Best-effort/)).toBeTruthy();
      expect(screen.getByText(/low confidence/)).toBeTruthy();
    });

    it('says nothing about an answer that WAS grounded', () => {
      render(<MessageBubble message={message({ grounded: true, confidence: 'high' })} />);

      expect(screen.queryByText(/Best-effort/)).toBeNull();
    });

    /**
     * ⚠ THE ONE THAT PROTECTS EVERY OTHER PRODUCT. Reeve and the finance panels
     * report no grounding at all. If an absent flag counted as false, adopting this
     * bubble would print BEST-EFFORT under every answer they have ever given.
     */
    it('says nothing when the product makes no grounding claim', () => {
      render(<MessageBubble message={message({ confidence: 'high' })} />);

      expect(screen.queryByText(/Best-effort/)).toBeNull();
    });

    it('needs a label as well as the flag, so there is nothing to half-render', () => {
      const { rerender } = render(<MessageBubble message={message({ grounded: false })} />);
      expect(screen.queryByText(/Best-effort/)).toBeNull();

      rerender(<MessageBubble message={message({ grounded: false, confidence: '  ' })} />);
      expect(screen.queryByText(/Best-effort/)).toBeNull();
    });

    /**
     * ⚠ THE REGRESSION THIS COMPONENT INHERITS. Porter's transcript column was typed
     * as a float for a day, `(float) 'high'` is `0.0`, and the bubble's `confidence &&`
     * check then printed a bare "0" into the conversation where the caveat belonged.
     * Fixed at its source, and made unrepeatable here.
     */
    it('refuses a numeric confidence rather than printing it', () => {
      render(
        <MessageBubble
          message={message({ grounded: false, confidence: 0 as unknown as string })}
        />,
      );

      expect(screen.queryByText(/Best-effort/)).toBeNull();
      expect(screen.queryByText('0')).toBeNull();
    });
  });

  /**
   * ⚠ ORDER IS BEHAVIOUR HERE, not layout taste. The caveat has to be readable
   * before the control that acts on the answer.
   */
  it('puts the caveat above the product\'s own controls', () => {
    const { container } = render(
      <MessageBubble
        message={message({ grounded: false, confidence: 'medium' })}
        footer={<button type="button">Open the case</button>}
      />,
    );

    const text = container.textContent ?? '';
    expect(text.indexOf('Best-effort')).toBeLessThan(text.indexOf('Open the case'));
  });

  it('renders the product\'s own content instead of the text when it has some', () => {
    render(
      <MessageBubble
        message={message({ content: <table><tbody><tr><td>42</td></tr></tbody></table> })}
      />,
    );

    expect(screen.getByText('42')).toBeTruthy();
    expect(screen.queryByText(/The fee is/)).toBeNull();
  });

  /**
   * ⚠ A PRODUCT'S CLASS MUST WIN, INLINE STYLE INCLUDED. The package's own
   * colours are set as inline `style`, which beats any class a product writes, so
   * passing a class has to drop them. Without this a branded bubble renders the
   * package's grey underneath Portify's glass and MployNow's indigo.
   */
  it('drops its own colours for the speaker a product has styled', () => {
    const { container } = render(
      <MessageBubble message={message()} bubbleClassName="bg-white/80 text-slate-700" />,
    );

    const bubble = container.querySelector('.bg-white\\/80') as HTMLElement | null;
    expect(bubble).toBeTruthy();
    expect(bubble?.style.background).toBe('');
  });

  it('styles the two speakers independently', () => {
    const { container } = render(
      <MessageBubble
        message={message({ role: 'user', text: 'hi' })}
        bubbleClassName="assistant-frame"
        userBubbleClassName="user-frame"
      />,
    );

    expect(container.querySelector('.user-frame')).toBeTruthy();
    expect(container.querySelector('.assistant-frame')).toBeNull();
  });

  /**
   * ⚠ A LONG URL IS THE CASE THIS PROTECTS. Without somewhere to put
   * `break-words`, one unbroken link pushes a 330px panel sideways - which is why
   * Porter could not have adopted this bubble without the slot.
   */
  it('lets a product wrap the rendered answer, but not the user\'s own row', () => {
    const { container, rerender } = render(
      <MessageBubble message={message()} contentClassName="break-words" />,
    );
    expect(container.querySelector('.break-words')).toBeTruthy();

    rerender(
      <MessageBubble
        message={message({ role: 'user', text: 'hi' })}
        contentClassName="break-words"
      />,
    );
    expect(container.querySelector('.break-words')).toBeNull();
    expect(container.querySelector('.whitespace-pre-wrap')).toBeTruthy();
  });

  it('states a failure pinned to one message, as an alarm', () => {
    render(<MessageBubble message={message({ error: 'That answer did not arrive.' })} />);

    const alerts = screen.queryAllByRole('alert');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.textContent).toBe('That answer did not arrive.');
  });
});
