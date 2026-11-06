import { useEffect, useRef } from 'react';

/**
 * Ctrl+/ (Cmd+/ on a Mac) opens or closes the assistant from anywhere on the page (1.34.0).
 *
 * ⚠ NOT WHILE SOMEONE IS TYPING ELSEWHERE WITH A MODIFIER THAT MEANS SOMETHING THERE. Ctrl+/ toggles a
 * comment in code editors; inside a `[data-ai-shortcut-off]` region (a product's code field) the key
 * is left alone. Everywhere else it is free: no browser binds it.
 */
export function useAssistantShortcut(onToggle: () => void, enabled = true): void {
  const handler = useRef(onToggle);
  useEffect(() => {
    handler.current = onToggle;
  });

  useEffect(() => {
    if (!enabled) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== '/' || !(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
      const target = event.target as Element | null;
      if (target?.closest?.('[data-ai-shortcut-off]')) return;
      event.preventDefault();
      handler.current();
    };
    window.addEventListener('keydown', onKey);

    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}
