import { vault } from './bridge';

/**
 * The vault API the panels were written against, over the console routes (`vault/*`,
 * proxied by ai-client's ConsoleRoutes to ai-service's /v1/admin). Same names, arguments
 * and return shapes as Portify's original module, which read one snapshot its own controller
 * assembled; here the snapshot is assembled from the service's own listings.
 */

export type CredentialKind = 'generation' | 'search' | 'transcription';
export type CredentialTier = 'free' | 'paid';

export interface VaultCredential {
  id: number;
  provider: string;
  kind: CredentialKind;
  model: string | null;
  label: string | null;
  tier: CredentialTier;
  order: number;
  enabled: boolean;
  base_url: string | null;
  timeout_seconds: number | null;
  /** `null` means EVERY product, which is the permissive reading. */
  allowed_products: string[] | null;
  sensitive_ok: boolean;
  sensitive_cleared_by: string | null;
  sensitive_cleared_at: string | null;
  key_fingerprint: string | null;
  key_set: boolean;
  created_at: string | null;
  updated_at: string | null;
}

export interface VaultBudget {
  product: string;
  /** False means this product will NEVER be refused on cost. */
  armed: boolean;
  period: 'day' | 'month' | null;
  soft_micros: number | null;
  hard_micros: number | null;
  notify_to: string | null;
  period_started_at?: string | null;
  spend_micros: number | null;
  refusing: boolean;
  soft_alerted_this_period?: boolean;
  hard_alerted_this_period?: boolean;
  state: string;
}

export interface KillDetail {
  at: string;
  by: string | null;
  reason: string | null;
}

export interface KillSwitchState {
  global: { stopped: boolean; detail: KillDetail | null };
  products: {
    product: string;
    /** This product's OWN switch. */
    stopped: boolean;
    detail: KillDetail | null;
    /** What the generation path actually gets - also true under a global stop. */
    refusing: boolean;
  }[];
}

export interface VaultTrustKey {
  id: number;
  product: string;
  label: string | null;
  is_active: boolean;
  is_admin: boolean;
  last_seen_at: string | null;
  created_at: string | null;
  /** A key never seen is a key the product does not have. */
  ever_used: boolean;
}

export interface VaultProductKeyState {
  product: string;
  active_keys: number;
  admin_keys: number;
  last_seen_at: string | null;
  can_call: boolean;
}

/** One audience of a product that has its OWN window; every other audience inherits the product's. */
export interface VaultRetentionAudience {
  audience: string;
  days: number;
  set_by?: string | null;
  set_at?: string | null;
  threads_held: number;
}

/** How long one product keeps its assistant transcripts, and whether anybody decided it. */
export interface VaultRetention {
  product: string;
  days: number;
  /** False: this is the service's default, not a decision. The panel says so in words. */
  configured: boolean;
  set_by?: string | null;
  set_at?: string | null;
  audiences: VaultRetentionAudience[];
  threads_held: number;
  threads_past_window: number;
  threads_unstamped: number;
  state: string;
}

export interface VaultRetentionSummary {
  products: number;
  configured: number;
  default_days: number;
  max_days: number;
  threads_past_window: number;
}

/** One rung of a task's preferred-model ladder. `model: null` means any model of that provider. */
export interface VaultRouteStep {
  provider: string;
  model: string | null;
  /** Whether an enabled credential can serve this rung. An unavailable rung is skipped silently. */
  available?: boolean;
}

/**
 * Which models one task (or verdict tier) tries first, in order. A route NARROWS
 * nothing: the named rungs move to the front and every other eligible key still
 * follows, so a rung with no key is skipped rather than an outage.
 */
export interface VaultTaskRoute {
  route_key: string;
  /** False means nobody has decided it and it runs on the shipped default. */
  configured: boolean;
  steps: VaultRouteStep[];
  default_steps: VaultRouteStep[];
  set_by: string | null;
  updated_at: string | null;
}

export interface VaultTaskRouteSummary {
  routes: number;
  configured: number;
  unavailable_rungs: number;
}

export type RateKind = 'tokens' | 'search' | 'transcription';

/**
 * One dated price. All money is MICRO-dollars: tokens per 1,000 tokens, search
 * per call, transcription per hour of audio. `source: 'default'` is the price
 * the service ships with; `'set'` was entered on this console.
 */
export interface VaultRateEntry {
  source: 'default' | 'set';
  id: number | null;
  from: string;
  in: number | null;
  out: number | null;
  long: { above: number; in: number; out: number } | null;
  basic: number | null;
  advanced: number | null;
  per_hour: number | null;
  set_by: string | null;
}

export interface VaultRate {
  kind: RateKind;
  /** A model name or prefix for tokens; the provider for search and transcription. */
  match: string;
  /** True when at least one price was set here rather than shipped. */
  configured: boolean;
  current: VaultRateEntry | null;
  next: VaultRateEntry | null;
  entries: VaultRateEntry[];
}

/** An enabled PAID key nothing prices: its spend records as zero and no cap sees it. */
export interface VaultUnpricedKey {
  id: number;
  provider: string;
  model: string | null;
  kind: string;
}

export interface NewVaultRate {
  kind: RateKind;
  match: string;
  effective_from: string;
  in_micros?: number;
  out_micros?: number;
  long_above_tokens?: number;
  long_in_micros?: number;
  long_out_micros?: number;
  basic_micros?: number;
  advanced_micros?: number;
  per_hour_micros?: number;
}

export interface VaultSnapshot {
  credentials: VaultCredential[];
  credential_summary: {
    total: number;
    generation: number;
    search: number;
    enabled: number;
    sensitive_cleared: number;
  };
  budgets: VaultBudget[];
  budget_summary: { products: number; armed: number; refusing: number };
  kill_switch: KillSwitchState;
  trust_keys: VaultTrustKey[];
  products: VaultProductKeyState[];
  retention: VaultRetention[];
  retention_summary: VaultRetentionSummary;
  task_routes: VaultTaskRoute[];
  task_route_summary: VaultTaskRouteSummary;
  rates: VaultRate[];
  unpriced: VaultUnpricedKey[];
  rate_summary: { priced: number; configured: number; unpriced: number };
}

/**
 * ⚠ ONE REQUEST FOR THE WHOLE SCREEN. The four pictures are read together, and
 * four round trips would make the screen's state four separate moments - with a
 * kill switch that could be stale against the credential list beside it.
 */
export interface NewCredential {
  provider: string;
  kind: CredentialKind;
  model?: string | null;
  label?: string | null;
  api_key: string;
  tier: CredentialTier;
  order?: number;
  base_url?: string | null;
  timeout_seconds?: number;
  enabled?: boolean;
  allowed_products?: string[] | null;
}

export interface IssuedTrustKey {
  trust_key: { id: number; product: string; label: string | null; is_admin: boolean };
  /** ⚠ Shown ONCE. Never store it; the service cannot print it again. */
  key_shown_once: string;
  next_step: string;
}

export async function getVault(): Promise<VaultSnapshot> {
  const { request } = vault();
  const [creds, budgets, kill, keys, retention, routes, rates] = await Promise.all([
    request<{ credentials: VaultCredential[]; summary: VaultSnapshot['credential_summary'] }>('GET', 'vault/credentials'),
    request<{ budgets: VaultBudget[]; summary: VaultSnapshot['budget_summary'] }>('GET', 'vault/budgets'),
    request<KillSwitchState>('GET', 'vault/kill'),
    request<{ trust_keys: VaultTrustKey[]; products: VaultProductKeyState[] }>('GET', 'vault/trust-keys'),
    request<{ retention: VaultRetention[]; summary: VaultRetentionSummary }>('GET', 'vault/retention'),
    request<{ routes: VaultTaskRoute[]; summary: VaultTaskRouteSummary }>('GET', 'vault/task-routes'),
    request<{ rates: VaultRate[]; unpriced: VaultUnpricedKey[]; summary: VaultSnapshot['rate_summary'] }>('GET', 'vault/rates'),
  ]);
  return {
    credentials: creds.credentials ?? [],
    credential_summary: creds.summary,
    budgets: budgets.budgets ?? [],
    budget_summary: budgets.summary,
    kill_switch: kill,
    trust_keys: keys.trust_keys ?? [],
    products: keys.products ?? [],
    retention: retention.retention ?? [],
    retention_summary: retention.summary,
    task_routes: routes.routes ?? [],
    task_route_summary: routes.summary,
    rates: rates.rates ?? [],
    unpriced: rates.unpriced ?? [],
    rate_summary: rates.summary,
  };
}

export async function saveVaultCredential(payload: NewCredential): Promise<VaultCredential> {
  return (await vault().request<{ credential: VaultCredential }>('POST', 'vault/credentials', { body: payload })).credential;
}

export async function updateVaultCredential(
  id: number,
  changes: Partial<Pick<VaultCredential, 'model' | 'tier' | 'order' | 'enabled' | 'base_url' | 'timeout_seconds' | 'allowed_products'>> & { api_key?: string },
): Promise<VaultCredential> {
  return (await vault().request<{ credential: VaultCredential }>('PATCH', `vault/credentials/${id}`, { body: changes })).credential;
}

/** The kit stamps `decided_by` with the signed-in admin; revoking needs no name. */
export async function setSensitiveClearance(id: number, sensitiveOk: boolean): Promise<VaultCredential> {
  return (await vault().request<{ credential: VaultCredential }>('POST', `vault/credentials/${id}/sensitive`, { body: { sensitive_ok: sensitiveOk } })).credential;
}

export async function setVaultBudget(payload: {
  product: string;
  period: 'day' | 'month';
  soft_micros: number | null;
  hard_micros: number | null;
  notify_to?: string | null;
}): Promise<VaultBudget> {
  return (await vault().request<{ budget: VaultBudget }>('PUT', 'vault/budgets', { body: payload })).budget;
}

export async function setVaultRetention(payload: {
  product: string;
  days: number;
  audience?: string | null;
}): Promise<{ retention: VaultRetention; threads_restamped: number; previous_days: number | null; erased_by_next_prune: number }> {
  return vault().request('PUT', 'vault/retention', { body: payload });
}

export async function setVaultTaskRoute(payload: {
  route_key: string;
  steps: Array<{ provider: string; model: string | null }>;
}): Promise<VaultTaskRoute> {
  return (await vault().request<{ route: VaultTaskRoute }>('PUT', 'vault/task-routes', { body: payload })).route;
}

export async function resetVaultTaskRoute(routeKey: string): Promise<VaultTaskRoute> {
  return (await vault().request<{ route: VaultTaskRoute }>('POST', 'vault/task-routes/reset', { body: { route_key: routeKey } })).route;
}

export async function addVaultRate(payload: NewVaultRate): Promise<VaultRate> {
  return (await vault().request<{ rate: VaultRate }>('POST', 'vault/rates', { body: payload })).rate;
}

export async function deleteVaultRate(id: number): Promise<VaultRate> {
  return (await vault().request<{ rate: VaultRate }>('DELETE', `vault/rates/${id}`)).rate;
}

/** One switch: `stop` throws it (reason required by the service), otherwise it is released. */
export async function setKillSwitch(payload: { scope: string; stop: boolean; reason?: string }): Promise<KillSwitchState> {
  return payload.stop
    ? vault().request<KillSwitchState>('POST', 'vault/kill', { body: { scope: payload.scope, reason: payload.reason } })
    : vault().request<KillSwitchState>('POST', 'vault/kill/resume', { body: { scope: payload.scope } });
}

export async function issueTrustKey(product: string, label?: string): Promise<IssuedTrustKey> {
  return vault().request<IssuedTrustKey>('POST', 'vault/trust-keys', { body: { product, label } });
}

export async function revokeTrustKey(id: number): Promise<{
  revoked: boolean;
  product: string;
  remaining_active_call_keys: number;
  warning: string | null;
}> {
  return vault().request('DELETE', `vault/trust-keys/${id}`);
}

export function money(micros: number | null | undefined): string {
  if (micros === null || micros === undefined) return '-';
  return `$${(micros / 1_000_000).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Dollars typed by a human to the micros the ledger speaks. */
export function toMicros(dollars: string): number | null {
  const trimmed = dollars.trim();
  if (trimmed === '') return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 1_000_000);
}
