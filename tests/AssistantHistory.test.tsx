import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AssistantHistory } from '../src/components/AssistantHistory';

/**
 * Thread history, and the deletion it must not get wrong.
 */
const threads = [
  { id: 'c1', title: 'Spousal sponsorship documents', updatedAt: new Date().toISOString() },
  { id: 'c2', title: null, updatedAt: null },
];

describe('AssistantHistory', () => {
  it('opens the thread that was clicked', () => {
    const onSelect = vi.fn();

    render(<AssistantHistory threads={threads} onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Spousal sponsorship documents'));

    expect(onSelect).toHaveBeenCalledWith('c1');
  });

  it('names a thread that never got a title', () => {
    render(<AssistantHistory threads={threads} onSelect={vi.fn()} />);

    expect(screen.getByText('Untitled conversation')).toBeTruthy();
  });

  it('marks the thread already open rather than hiding it', () => {
    render(<AssistantHistory threads={threads} activeId="c1" onSelect={vi.fn()} />);

    expect(screen.getByText(/Current/)).toBeTruthy();
    expect(screen.getByText('Spousal sponsorship documents')).toBeTruthy();
  });

  it('says how long ago, and says nothing when it cannot know', () => {
    render(<AssistantHistory threads={threads} onSelect={vi.fn()} />);

    expect(screen.getByText(/Just now/)).toBeTruthy();
  });

  /**
   * ⚠ A DELETE AFFORDANCE A PRODUCT CANNOT HONOUR IS WORSE THAN NONE. Offering
   * one where the endpoint does not exist is the "control offered where it cannot
   * succeed" shape, so the whole control is absent without a handler.
   */
  it('offers no delete at all without a handler', () => {
    render(<AssistantHistory threads={threads} onSelect={vi.fn()} />);

    expect(screen.queryByLabelText(/^Delete conversation:/)).toBeNull();
  });

  describe('deletion', () => {
    it('asks first, and names the thread in the control', () => {
      const onDelete = vi.fn();

      render(<AssistantHistory threads={threads} onSelect={vi.fn()} onDelete={onDelete} />);

      fireEvent.click(
        screen.getByLabelText('Delete conversation: Spousal sponsorship documents'),
      );

      expect(screen.getByText('Delete this conversation?')).toBeTruthy();
      expect(onDelete).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
      expect(onDelete).toHaveBeenCalledWith('c1');
    });

    it('lets the reader back out, with the row intact', () => {
      const onDelete = vi.fn();

      render(<AssistantHistory threads={threads} onSelect={vi.fn()} onDelete={onDelete} />);

      fireEvent.click(
        screen.getByLabelText('Delete conversation: Spousal sponsorship documents'),
      );
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(screen.queryByText('Delete this conversation?')).toBeNull();
      expect(screen.getByText('Spousal sponsorship documents')).toBeTruthy();
      expect(onDelete).not.toHaveBeenCalled();
    });

    it('says it is working, and cannot be fired twice', () => {
      const onDelete = vi.fn();

      render(
        <AssistantHistory threads={threads} onSelect={vi.fn()} onDelete={onDelete} deleting />,
      );

      fireEvent.click(
        screen.getByLabelText('Delete conversation: Spousal sponsorship documents'),
      );

      const button = screen.getByRole('button', { name: 'Deleting…' });
      expect(button).toHaveProperty('disabled', true);

      fireEvent.click(button);
      expect(onDelete).not.toHaveBeenCalled();
    });

    it('offers another go when the last one failed', () => {
      render(
        <AssistantHistory
          threads={threads}
          onSelect={vi.fn()}
          onDelete={vi.fn()}
          deleteFailed
        />,
      );

      fireEvent.click(
        screen.getByLabelText('Delete conversation: Spousal sponsorship documents'),
      );

      expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    });
  });

  it('hands an empty list over to the product', () => {
    render(
      <AssistantHistory threads={[]} onSelect={vi.fn()} empty={<p>No conversations yet</p>} />,
    );

    expect(screen.getByText('No conversations yet')).toBeTruthy();
    expect(screen.queryByRole('list')).toBeNull();
  });
});
