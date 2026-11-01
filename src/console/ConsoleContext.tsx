import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { themeToVars, type AssistantTheme } from '../theme';
import type { ConsoleCapabilities } from './types';

/**
 * Site management's AI console: one provider, then any of the screens.
 *
 * ```tsx
 * <AiConsoleProvider baseUrl="/api/admin/ai-console" theme={PORTER_THEME} onError={reportErrorToPorter}>
 *   <AiConsole />
 * </AiConsoleProvider>
 * ```
 *
 * ⚠ THE THEME IS THE SAME `AssistantTheme` THE PRODUCT'S CHAT PANEL ALREADY TAKES, so adopting
 * the console costs a product no new design decision, and its console cannot drift from its chat.
 *
 * ⚠ `baseUrl` IS THE PRODUCT'S OWN PROXY (`ConsoleRoutes::mount`), never ai-service: the service is
 * loopback-only, and the proxy is where the product's admin auth and the audit actor live.
 */

export class ConsoleError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ConsoleError';
  }

  /** The field a 422 is about, so a form can show it beside that field. */
  get field(): string | null {
    return typeof this.body.field === 'string' ? this.body.field : null;
  }
}

export type ConsoleFetcher = (input: string, init: RequestInit) => Promise<Response>;

export interface AiConsoleProviderProps {
  baseUrl: string;
  theme: AssistantTheme;
  /** Defaults to `fetch` with the browser's cookies. A product with bearer auth passes its own. */
  fetcher?: ConsoleFetcher;
  /** Every failed request, so the product can put it on its own error surface. */
  onError?: (error: ConsoleError) => void;
  /** Human names for product keys (`mploynow` -> "MployNow"). */
  productNames?: Record<string, string>;
  /** A success or info notice (a saved key, an issued trust key). The product shows it its own way. */
  onNotice?: (notice: { title: string; description?: string; variant?: string }) => void;
  children: ReactNode;
}

export interface ConsoleContextValue {
  request: <T>(method: string, path: string, options?: { query?: Record<string, unknown>; body?: unknown; quiet?: boolean }) => Promise<T>;
  capabilities: ConsoleCapabilities | null;
  capabilitiesError: ConsoleError | null;
  productName: (key: string) => string;
  vars: Record<string, string>;
  notify: (notice: { title: string; description?: string; variant?: string }) => void;
  /** A failure that did not come from a request (a clipboard, a bad file): sent to `onError`. */
  reportError: (error: unknown) => void;
}

const Ctx = createContext<ConsoleContextValue | null>(null);

const defaultFetcher: ConsoleFetcher = (input, init) => fetch(input, { credentials: 'include', ...init });

function toQuery(query: Record<string, unknown> | undefined): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

export function AiConsoleProvider({ baseUrl, theme, fetcher, onError, productNames, onNotice, children }: AiConsoleProviderProps) {
  const [capabilities, setCapabilities] = useState<ConsoleCapabilities | null>(null);
  const [capabilitiesError, setCapabilitiesError] = useState<ConsoleError | null>(null);

  // Read through refs so a product passing inline functions does not refetch capabilities every render.
  const fetchRef = useRef(fetcher ?? defaultFetcher);
  const errorRef = useRef(onError);
  const noticeRef = useRef(onNotice);
  useEffect(() => {
    fetchRef.current = fetcher ?? defaultFetcher;
    errorRef.current = onError;
    noticeRef.current = onNotice;
  }, [fetcher, onError, onNotice]);

  const notify = useCallback((notice: { title: string; description?: string; variant?: string }) => noticeRef.current?.(notice), []);
  const reportError = useCallback((error: unknown) => {
    const message = error instanceof Error ? error.message : typeof error === 'string' ? error : 'Something went wrong in the AI console.';
    errorRef.current?.(new ConsoleError(message, 0, {}));
  }, []);

  const root = baseUrl.replace(/\/+$/, '');

  const request = useCallback(
    async <T,>(method: string, path: string, options: { query?: Record<string, unknown>; body?: unknown; quiet?: boolean } = {}): Promise<T> => {
      const init: RequestInit = { method, headers: { Accept: 'application/json' } };
      if (options.body !== undefined) {
        init.headers = { ...init.headers, 'Content-Type': 'application/json' };
        init.body = JSON.stringify(options.body);
      }

      let response: Response;
      try {
        response = await fetchRef.current(`${root}/${path.replace(/^\/+/, '')}${toQuery(options.query)}`, init);
      } catch {
        const error = new ConsoleError('The console could not reach the server. Check the connection and try again.', 0, {});
        if (!options.quiet) errorRef.current?.(error);
        throw error;
      }

      const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (!response.ok) {
        const message = typeof body.message === 'string' ? body.message : `The AI service answered ${response.status}.`;
        const error = new ConsoleError(message, response.status, body);
        if (!options.quiet) errorRef.current?.(error);
        throw error;
      }
      return body as T;
    },
    [root],
  );

  useEffect(() => {
    let live = true;
    request<ConsoleCapabilities>('GET', 'capabilities')
      .then((c) => live && setCapabilities(c))
      .catch((e: ConsoleError) => live && setCapabilitiesError(e));
    return () => {
      live = false;
    };
  }, [request]);

  const vars = useMemo(() => themeToVars(theme), [theme]);
  const productName = useCallback((key: string) => productNames?.[key] ?? key, [productNames]);

  const value = useMemo<ConsoleContextValue>(
    () => ({ request, capabilities, capabilitiesError, productName, vars, notify, reportError }),
    [request, capabilities, capabilitiesError, productName, vars, notify, reportError],
  );

  return (
    <Ctx.Provider value={value}>
      <div style={vars} className="text-[var(--ai-fg)]" data-ai-console="">
        {children}
      </div>
    </Ctx.Provider>
  );
}

export function useConsole(): ConsoleContextValue {
  const value = useContext(Ctx);
  if (!value) throw new Error('An AI console screen must sit inside <AiConsoleProvider>.');
  return value;
}

/**
 * Load one resource and keep it fresh: `{ data, error, loading, reload }`.
 * ⚠ `error` is kept apart from empty data, so a failed read never renders as zeros.
 */
export function useConsoleResource<T>(path: string | null, query?: Record<string, unknown>) {
  const { request } = useConsole();
  const [state, setState] = useState<{ data: T | null; error: ConsoleError | null; loading: boolean }>({
    data: null,
    error: null,
    loading: path !== null,
  });
  const [tick, setTick] = useState(0);
  const key = JSON.stringify(query ?? {});

  useEffect(() => {
    if (path === null) return;
    let live = true;
    request<T>('GET', path, { query: JSON.parse(key) as Record<string, unknown> })
      .then((data) => live && setState({ data, error: null, loading: false }))
      .catch((error: ConsoleError) => live && setState((s) => ({ data: s.data, error, loading: false })));
    return () => {
      live = false;
    };
  }, [path, key, tick, request]);

  const reload = useCallback(() => {
    setState((s) => ({ ...s, loading: true }));
    setTick((t) => t + 1);
  }, []);

  return { ...state, reload, setData: (data: T) => setState({ data, error: null, loading: false }) };
}
