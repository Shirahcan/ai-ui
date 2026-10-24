import { useEffect, useRef, useState } from 'react';

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js';

/* Just the part of Cloudflare's global Turnstile API this calls. */
interface TurnstileApi {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

/** The script is loaded once per page, however many checks mount. */
let scriptPromise: Promise<void> | null = null;

function loadTurnstile(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      // A blocked script must not poison every later mount on this page.
      scriptPromise = null;
      reject(new Error('Turnstile script failed to load'));
    };
    document.head.appendChild(script);
  });

  return scriptPromise;
}

export interface HumanCheckProps {
  /** Cloudflare Turnstile site key. Empty renders nothing: no key means the backend skips the check. */
  siteKey: string;
  /** A fresh token, or '' when the last one failed or expired. */
  onToken: (token: string) => void;
  /** Bump it to run the challenge again (a token is single-use). */
  resetSignal?: number;
}

/**
 * Cloudflare Turnstile, the estate's one copy.
 *
 * ⚠ IT USED TO BE A FILE IN EVERY PRODUCT, and the copies had drifted: Portify's padded itself
 * when Cloudflare asked for a click, MployNow's did not, and MployNow's public assistant had no
 * check at all, so anybody could script it and spend provider credit. One component is how a
 * product cannot ship an assistant without one.
 *
 * ⚠ INVISIBLE FOR NEARLY EVERYBODY, PADDED ONLY WHILE CLOUDFLARE ASKS FOR A CLICK.
 * `appearance: 'interaction-only'` keeps the widget hidden unless the challenge genuinely needs a
 * person, and collapses it again once resolved. Padding it always would leave a blank strip under
 * every composer; padding it never left a visible "Verify you are human" box clipped in the
 * panel's rounded corner.
 */
export function HumanCheck({ siteKey, onToken, resetSignal = 0 }: HumanCheckProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  const [interactive, setInteractive] = useState(false);

  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  useEffect(() => {
    if (!siteKey) return;
    let cancelled = false;

    loadTurnstile()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          appearance: 'interaction-only',
          callback: (token: string) => onTokenRef.current(token),
          'error-callback': () => onTokenRef.current(''),
          'expired-callback': () => onTokenRef.current(''),
          'before-interactive-callback': () => setInteractive(true),
          'after-interactive-callback': () => setInteractive(false),
        });
      })
      .catch(() => onTokenRef.current(''));

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          /* the widget is already gone */
        }
        widgetIdRef.current = null;
      }
    };
  }, [siteKey]);

  useEffect(() => {
    if (resetSignal > 0 && widgetIdRef.current && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current);
    }
  }, [resetSignal]);

  if (!siteKey) return null;

  return <div ref={containerRef} data-aiui-human-check="" className={interactive ? 'px-4 pb-4' : undefined} />;
}
