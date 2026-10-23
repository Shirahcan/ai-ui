import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AssistantIntro } from '../src/components/AssistantIntro';

/**
 * The empty state, and the one defect it was already latent for.
 */
describe('AssistantIntro', () => {
  it('sends a starter prompt as the question it is', () => {
    const onPrompt = vi.fn();

    render(
      <AssistantIntro
        greeting="Hi, I'm Porter."
        prompts={['What do I owe?', 'Where is my case?']}
        onPrompt={onPrompt}
        promptsLabel="Try asking"
      >
        <p>I can help with your cases and documents.</p>
      </AssistantIntro>,
    );

    expect(screen.getByText("Hi, I'm Porter.")).toBeTruthy();
    expect(screen.getByText('I can help with your cases and documents.')).toBeTruthy();
    expect(screen.getByText('Try asking')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Where is my case?' }));
    expect(onPrompt).toHaveBeenCalledWith('Where is my case?');
  });

  /**
   * ⚠ THE LATENT BUG THIS ENDS. One product's copy of this screen omitted
   * `type`, and a `<button>` with no type inside a `<form>` submits it - so a
   * starter prompt in a panel whose composer is a form would send the empty
   * composer instead of asking its own question. It had not fired yet because of
   * where the intro happened to sit in the DOM.
   */
  it('never submits a surrounding form', () => {
    const onSubmit = vi.fn((e: { preventDefault: () => void }) => e.preventDefault());

    render(
      <form onSubmit={onSubmit}>
        <AssistantIntro prompts={['Ask me']} onPrompt={() => {}} />
      </form>,
    );

    const button = screen.getByRole('button', { name: 'Ask me' });
    expect(button.getAttribute('type')).toBe('button');

    fireEvent.click(button);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('renders nothing where a product has no prompts to offer', () => {
    render(<AssistantIntro greeting="Hello" prompts={[]} onPrompt={() => {}} />);

    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  /** A prompt with no handler is a button that does nothing, so it is not drawn. */
  it('needs a handler before it offers a prompt', () => {
    render(<AssistantIntro prompts={['Ask me']} />);

    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('lets a product lay the prompts out as a row of chips', () => {
    const { container } = render(
      <AssistantIntro
        prompts={['One', 'Two']}
        onPrompt={() => {}}
        promptsClassName="flex flex-wrap gap-2"
        promptClassName="rounded-full px-3 py-1.5"
      />,
    );

    expect(container.querySelector('.flex.flex-wrap')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'One' }).className).toBe('rounded-full px-3 py-1.5');
  });
});
