import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { themeToVars, type AssistantTheme } from '../theme';
import type { ConsoleCapabilities, ConsoleProduct } from './types';

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

/** Every product at once (the read-only "All products" view of a list). */
export const ALL_PRODUCTS = '*';

/**
 * The console paths that read or change ONE product's AI, which the admin key may point at another
 * product with `as_product`. Estate rows (`vault/*`, `estate`, `shared-tasks/*`) are already every
 * product's; `usage` takes its own `product` filter; `pause` / `resume` stay the own product's.
 */
const SCOPED = /^(state|usage\/calls|tasks|personas|knowledge|feedback|conversations\/stats|assist)(\/|$)/;

export interface RequestOptions {
  query?: Record<string, unknown>;
  body?: unknown;
  quiet?: boolean;
  /** Ask about this product instead of the one picked (the "All products" fan-out). */
  asProduct?: string;
}

export interface ConsoleContextValue {
  request: <T>(method: string, path: string, options?: RequestOptions) => Promise<T>;
  /**
   * The product the AI sections show: the console's own product, another one (admin key), or
   * `ALL_PRODUCTS` for a read-only list across every product. Null until capabilities load.
   */
  product: string | null;
  setProduct: (key: string) => void;
  /** The products the picker offers; empty when this console may not switch. */
  products: ConsoleProduct[];
  /** The picked product is not the console's own (another one, or every product). */
  viewingOther: boolean;
  allProducts: boolean;
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

const PRODUCT_STORAGE = 'ai-console.product';

function storedProduct(): string | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage.getItem(PRODUCT_STORAGE);
  } catch {
    return null;
  }
}

export function AiConsoleProvider({ baseUrl, theme, fetcher, onError, productNames, onNotice, children }: AiConsoleProviderProps) {
  const [capabilities, setCapabilities] = useState<ConsoleCapabilities | null>(null);
  const [capabilitiesError, setCapabilitiesError] = useState<ConsoleError | null>(null);
  const [products, setProducts] = useState<ConsoleProduct[]>([]);
  // Remembered for the browser tab, so moving between sections keeps the product picked.
  const [picked, setPicked] = useState<string | null>(storedProduct);

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

  const own = capabilities?.product ?? null;
  const canSwitch = capabilities?.can.act_for_products === true;
  // A choice the console cannot honour (no admin key, or a remembered product that left the
  // estate) falls back to the own product, so a stale choice never strands the screen.
  const product = canSwitch && picked && (picked === ALL_PRODUCTS || products.some((p) => p.key === picked)) ? picked : own;
  const allProducts = product === ALL_PRODUCTS;
  const viewingOther = product !== null && product !== own;

  const setProduct = useCallback((key: string) => {
    setPicked(key);
    try {
      window.sessionStorage.setItem(PRODUCT_STORAGE, key);
    } catch {
      // Storage blocked: the choice lasts until the page reloads.
    }
  }, []);

  const request = useCallback(
    async <T,>(method: string, path: string, options: RequestOptions = {}): Promise<T> => {
      const init: RequestInit = { method, headers: { Accept: 'application/json' } };
      if (options.body !== undefined) {
        init.headers = { ...init.headers, 'Content-Type': 'application/json' };
        init.body = JSON.stringify(options.body);
      }
      const clean = path.replace(/^\/+/, '');
      const target = options.asProduct ?? (product !== ALL_PRODUCTS ? product : null);
      const query = target && target !== own && SCOPED.test(clean) ? { ...options.query, as_product: target } : options.query;

      let response: Response;
      try {
        response = await fetchRef.current(`${root}/${clean}${toQuery(query)}`, init);
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
    [root, product, own],
  );

  // Asked once per console with the raw fetcher: what it may do never depends on the product picked.
  useEffect(() => {
    let live = true;
    const get = async <T,>(path: string): Promise<T> => {
      const response = await fetchRef.current(`${root}/${path}`, { method: 'GET', headers: { Accept: 'application/json' } });
      const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (!response.ok) {
        throw new ConsoleError(typeof body.message === 'string' ? body.message : `The AI service answered ${response.status}.`, response.status, body);
      }
      return body as T;
    };
    get<ConsoleCapabilities>('capabilities')
      .then(async (c) => {
        if (!live) return;
        setCapabilities(c);
        if (c.can.act_for_products === true) {
          const list = await get<{ products: ConsoleProduct[] }>('products').catch((e: ConsoleError) => {
            errorRef.current?.(e);
            return { products: [] as ConsoleProduct[] };
          });
          if (live) setProducts(list.products ?? []);
        }
      })
      .catch((e: unknown) => {
        if (!live) return;
        const error = e instanceof ConsoleError ? e : new ConsoleError('The console could not reach the server. Check the connection and try again.', 0, {});
        setCapabilitiesError(error);
      });
    return () => {
      live = false;
    };
  }, [root]);

  const vars = useMemo(() => themeToVars(theme), [theme]);
  const productName = useCallback(
    (key: string) => productNames?.[key] ?? products.find((p) => p.key === key)?.label ?? key,
    [productNames, products],
  );

  const value = useMemo<ConsoleContextValue>(
    () => ({ request, product, setProduct, products, viewingOther, allProducts, capabilities, capabilitiesError, productName, vars, notify, reportError }),
    [request, product, setProduct, products, viewingOther, allProducts, capabilities, capabilitiesError, productName, vars, notify, reportError],
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

/**
 * The "All products" view of a list: the same read asked once per product, each row tagged with
 * the product it came from. Inactive (path null, or not the all-products view) it asks nothing.
 *
 * ⚠ READ-ONLY BY DESIGN. Editing needs one product picked, so a change can never be aimed at
 * the wrong product from a merged list. A product that fails is listed in `failed`, never
 * dropped silently.
 */
export function useConsoleAcross<T>(path: string | null, query?: Record<string, unknown>) {
  const { request, products, allProducts } = useConsole();
  const active = path !== null && allProducts && products.length > 0;
  const [state, setState] = useState<{ results: Array<{ product: string; data: T }>; failed: Array<{ product: string; error: ConsoleError }>; loading: boolean }>({
    results: [],
    failed: [],
    loading: active,
  });
  const [tick, setTick] = useState(0);
  const key = JSON.stringify(query ?? {});
  const productKeys = products.map((p) => p.key).join(',');

  useEffect(() => {
    if (!active || path === null) return;
    let live = true;
    const q = JSON.parse(key) as Record<string, unknown>;
    Promise.all(
      productKeys.split(',').map((p) =>
        request<T>('GET', path, { query: q, asProduct: p, quiet: true }).then(
          (data) => ({ product: p, data, error: null as ConsoleError | null }),
          (error: ConsoleError) => ({ product: p, data: null as T | null, error }),
        ),
      ),
    ).then((all) => {
      if (!live) return;
      setState({
        results: all.filter((r) => r.data !== null).map((r) => ({ product: r.product, data: r.data as T })),
        failed: all.filter((r) => r.error !== null).map((r) => ({ product: r.product, error: r.error as ConsoleError })),
        loading: false,
      });
    });
    return () => {
      live = false;
    };
  }, [active, path, key, productKeys, tick, request]);

  const reload = useCallback(() => {
    setState((s) => ({ ...s, loading: true }));
    setTick((t) => t + 1);
  }, []);

  return { ...state, active, reload };
}
