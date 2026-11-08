import { useEffect, useState } from 'react';

/**
 * Who the assistant is, as the ONE shared shell needs it (1.42.0, owner 2026-11-08: one base
 * assistant everywhere; the UI is never differentiated per assistant, only its name, avatar and
 * greeting differ, as data).
 *
 * The record lives in ai-service (`GET /v1/assistants/{key}`), read through the product's own proxy;
 * colours are the product's theme, never the assistant's.
 */
export interface AssistantSurfaceInfo {
  key: string;
  mode: 'conversation' | 'grounded' | 'silent';
  label: string;
  description: string;
}

export interface AssistantIdentity {
  key: string;
  /** The assistant's name: "Porter". */
  name: string;
  /** The product it works inside: "Portify". */
  productName: string;
  avatarUrl: string | null;
  /** The empty state's greeting per audience (`client`, `consultant`...); `*` is everyone's. */
  greetings: Record<string, string>;
  surfaces: AssistantSurfaceInfo[];
  /** True once the service's record was read; false while loading or when it could not be. */
  fromService: boolean;
}

/** What the product knows before the record arrives: its assistant's key and names, from its config. */
export interface AssistantIdentityFallback {
  key: string;
  name: string;
  productName: string;
  avatarUrl?: string | null;
}

const MODES = ['conversation', 'grounded', 'silent'] as const;

/** The service's record (or whatever the product's proxy passes through) as an identity; never throws. */
export function identityFromRecord(record: unknown, fallback: AssistantIdentityFallback): AssistantIdentity {
  const base: AssistantIdentity = {
    key: fallback.key,
    name: fallback.name,
    productName: fallback.productName,
    avatarUrl: fallback.avatarUrl ?? null,
    greetings: {},
    surfaces: [],
    fromService: false,
  };
  const raw = record && typeof record === 'object' && 'assistant' in record ? (record as { assistant: unknown }).assistant : record;
  if (!raw || typeof raw !== 'object') return base;

  const r = raw as Record<string, unknown>;
  const look = r.look && typeof r.look === 'object' ? (r.look as Record<string, unknown>) : {};
  const greetings: Record<string, string> = {};
  if (look.greetings && typeof look.greetings === 'object') {
    for (const [audience, text] of Object.entries(look.greetings as Record<string, unknown>)) {
      if (typeof text === 'string' && text.trim() !== '') greetings[audience] = text;
    }
  }
  const surfaces: AssistantSurfaceInfo[] = Array.isArray(r.surfaces)
    ? (r.surfaces as unknown[]).flatMap((s) => {
        if (!s || typeof s !== 'object') return [];
        const o = s as Record<string, unknown>;
        if (typeof o.key !== 'string') return [];
        const mode = (MODES as readonly string[]).includes(String(o.mode)) ? (o.mode as AssistantSurfaceInfo['mode']) : 'grounded';

        return [{ key: o.key, mode, label: typeof o.label === 'string' ? o.label : o.key, description: typeof o.description === 'string' ? o.description : '' }];
      })
    : [];

  return {
    key: typeof r.key === 'string' ? r.key : base.key,
    name: typeof r.display_name === 'string' && r.display_name.trim() !== '' ? r.display_name : base.name,
    productName: typeof r.product_name === 'string' && r.product_name.trim() !== '' ? r.product_name : base.productName,
    avatarUrl: typeof look.avatar_url === 'string' && look.avatar_url !== '' ? look.avatar_url : base.avatarUrl,
    greetings,
    surfaces,
    fromService: true,
  };
}

/** The greeting for an audience: its own, else everyone's (`*`), else null (the surface says its own). */
export function greetingFor(identity: AssistantIdentity, audience: string | null | undefined): string | null {
  return (audience ? identity.greetings[audience] : undefined) ?? identity.greetings['*'] ?? null;
}

/** One read per assistant per page load: every surface on the page shares it. */
const cache = new Map<string, Promise<AssistantIdentity>>();

/** @internal for tests */
export function resetAssistantIdentityCache(): void {
  cache.clear();
}

/**
 * The assistant's identity for any surface: the fallback at once (so nothing waits or flashes blank),
 * then the service's record. `load` is the product's call to its own proxy; a failure keeps the
 * fallback and is never thrown at the screen.
 */
export function useAssistantIdentity(load: () => Promise<unknown>, fallback: AssistantIdentityFallback): AssistantIdentity {
  const [identity, setIdentity] = useState<AssistantIdentity>(() => identityFromRecord(null, fallback));

  useEffect(() => {
    let live = true;
    let pending = cache.get(fallback.key);
    if (!pending) {
      pending = load()
        .then((record) => identityFromRecord(record, fallback))
        .catch(() => {
          cache.delete(fallback.key);

          return identityFromRecord(null, fallback);
        });
      cache.set(fallback.key, pending);
    }
    void pending.then((next) => {
      if (live) setIdentity(next);
    });

    return () => {
      live = false;
    };
    // The fallback is the product's constant; `load` is its proxy call. Re-reading on every render
    // would defeat the cache, so the key alone decides.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fallback.key]);

  return identity;
}
