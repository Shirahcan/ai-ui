import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AssistantDock } from '../src';

const theme = { surface: '#fff', fg: '#111', muted: '#666', border: '#ddd', accent: '#6f6df3', accentFg: '#fff' };

function dock(extra: Partial<Parameters<typeof AssistantDock>[0]> = {}) {
  const onToggle = vi.fn();
  const placements: string[] = [];
  render(
    <AssistantDock
      theme={theme}
      open={false}
      onToggle={onToggle}
      openLabel="Ask Mira"
      closeLabel="Close Mira"
      storagePrefix="test.assistant"
      renderPanel={({ className }) => {
        placements.push(className);
        return <div data-testid="panel" className={className} />;
      }}
      {...extra}
    />,
  );

  return { onToggle, placements };
}

describe('AssistantDock', () => {
  beforeEach(() => {
    // jsdom has no PointerEvent, so a pointer event would carry no button or coordinates.
    class FakePointerEvent extends MouseEvent {
      pointerId: number;
      constructor(type: string, init: MouseEventInit & { pointerId?: number } = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 0;
      }
    }
    Object.defineProperty(window, 'PointerEvent', { value: FakePointerEvent, configurable: true });
    window.localStorage.clear();
    Object.defineProperty(window, 'innerWidth', { value: 1000, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
  });

  it('anchors the panel bottom-right, clearing the launcher alone or a taller stack', () => {
    const alone = dock();
    expect(alone.placements.at(-1)).toContain('bottom-[calc(6.5rem');
    expect(alone.placements.at(-1)).toContain('right-5');

    const withReport = dock({ stack: () => <button type="button">Report an issue</button> });
    expect(withReport.placements.at(-1)).toContain('bottom-[calc(10rem');
    expect(screen.getByText('Report an issue')).toBeTruthy();
  });

  it('a tap toggles; a drag snaps to the corner it is dropped in, remembers it, and does not toggle', () => {
    const { onToggle, placements } = dock();
    const button = screen.getByRole('button', { name: 'Ask Mira' });

    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledTimes(1);

    fireEvent.pointerDown(button, { button: 0, pointerId: 1, clientX: 950, clientY: 750 });
    fireEvent.pointerMove(button, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerUp(button, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.click(button);

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem('test.assistant.corner')).toBe('tl');
    expect(placements.at(-1)).toContain('top-28 left-5');
  });

  it('Ctrl+/ toggles when the shortcut is on', () => {
    const { onToggle } = dock({ shortcut: true });
    fireEvent.keyDown(window, { key: '/', ctrlKey: true });
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
