import { useEffect, useRef } from 'react';

/**
 * An ask that finishes while the tab is hidden marks the tab's title ("✓ Porter finished · ...") until
 * the person looks (1.45.0). Moved out of AssistantTerminal in 1.48.0, unchanged.
 */
export function useDoneMark(working: boolean, on: boolean, assistantName: string): void {
  const wasWorking = useRef(working);

  useEffect(() => {
    const finished = wasWorking.current && !working;

    wasWorking.current = working;
    if (!finished || !on || typeof document === 'undefined' || document.visibilityState === 'visible') return;

    const original = document.title;
    const mark = `✓ ${assistantName} finished · `;

    document.title = mark + original;

    const restore = () => {
      if (document.visibilityState !== 'visible') return;
      if (document.title.startsWith(mark)) document.title = document.title.slice(mark.length);
      document.removeEventListener('visibilitychange', restore);
    };

    document.addEventListener('visibilitychange', restore);

    return () => document.removeEventListener('visibilitychange', restore);
  }, [working, on, assistantName]);
}
