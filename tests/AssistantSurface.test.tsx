import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AssistantSurface } from '../src/components/AssistantSurface';
import { ASSISTANT_PANEL_SIZE } from '../src/geometry';

/**
 * The card, and the one property that earns it.
 *
 * ⚠ THE ASSERTION THAT MATTERS IS THAT A PRODUCT CANNOT RESIZE IT WITH A CLASS.
 * Sharing the panel's PARTS left every product a different size - 34rem by 40rem
 * against 400px by 560px - so two panels built from identical components still did
 * not look like one product. The size is inline style precisely so a leftover
 * `h-[560px]` in a product's class string cannot win.
 */
describe('AssistantSurface', () => {
  const panel = (container: HTMLElement) => container.querySelector('[role="dialog"]') as HTMLElement;

  it('is one size everywhere, whatever a product passes', () => {
    const { container } = render(
      <AssistantSurface title="Mira" className="h-[560px] w-[400px] bg-white">
        <p>body</p>
      </AssistantSurface>,
    );

    const card = panel(container);
    expect(card.style.width).toBe(ASSISTANT_PANEL_SIZE.width);
    expect(card.style.height).toBe(ASSISTANT_PANEL_SIZE.height);
    expect(card.style.maxHeight).toBe(ASSISTANT_PANEL_SIZE.maxHeight);
    expect(card.style.borderRadius).toBe(ASSISTANT_PANEL_SIZE.borderRadius);

    // The product's own position and palette still arrive.
    expect(card.className).toContain('bg-white');
  });

  /**
   * ⚠ A COLOUR SLOT MUST NOT BE ABLE TO DROP THE SHARED SHAPE. Every class slot
   * here appends to `ASSISTANT_GEOMETRY`, so a product brands the header without
   * losing the padding and type size that make the panels one product.
   */
  it("keeps the shared shape under a product's own colours", () => {
    const { container } = render(
      <AssistantSurface
        title="Mira"
        subtitle="Looking ahead with you."
        headerClassName="border-b border-gray-100"
        titleClassName="text-[#152237]"
      />,
    );

    const header = container.querySelector('header') as HTMLElement;
    expect(header.className).toContain('px-5');
    expect(header.className).toContain('border-gray-100');

    const title = header.querySelector('p') as HTMLElement;
    expect(title.className).toContain('font-semibold');
    expect(title.className).toContain('text-[#152237]');
  });

  it('is a named dialog, because a keyboard user lands in it from nowhere', () => {
    const { container } = render(<AssistantSurface title="Porter" />);

    expect(panel(container).getAttribute('aria-label')).toBe('Porter');
  });

  it('takes a name of its own when the title is not a string', () => {
    const { container } = render(
      <AssistantSurface title={<span>Porter</span>} label="Porter, the Portify assistant" />,
    );

    expect(panel(container).getAttribute('aria-label')).toBe('Porter, the Portify assistant');
  });

  it('carries a subtitle for a product that has one, and nothing for one that does not', () => {
    const { container, rerender } = render(
      <AssistantSurface title="Mira" subtitle="Looking ahead with you." />,
    );
    expect(screen.getByText('Looking ahead with you.')).toBeTruthy();

    rerender(<AssistantSurface title="Porter" />);
    expect(panel(container).querySelectorAll('header p')).toHaveLength(1);
  });

  it('puts the product\'s own controls in the header, with the way out last', () => {
    const onClose = vi.fn();

    render(
      <AssistantSurface
        title="Porter"
        onClose={onClose}
        closeLabel="Close assistant"
        actions={<button type="button">History</button>}
      />,
    );

    expect(screen.getByRole('button', { name: 'History' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Close assistant' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('offers no way out when the product does not give it one', () => {
    render(<AssistantSurface title="Porter" />);

    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  /**
   * ⚠ THE HEADER MUST NOT SCROLL AWAY and the body must be able to shrink, or a
   * long conversation pushes the composer off the bottom of a short screen. Same
   * `min-h-0` lesson as the panel's list, one level up.
   */
  it('pins the header and keeps the card a flex column', () => {
    const { container } = render(<AssistantSurface title="Porter" />);

    expect(panel(container).className).toContain('flex-col');
    expect(container.querySelector('header')?.className).toContain('shrink-0');
  });
});
