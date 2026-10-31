/**
 * What ai-service answers on the console routes, as the product's proxy forwards it
 * (`shirahcan/ai-client` `ConsoleRoutes::mount`). Fields a screen does not read are omitted.
 */

export interface ConsoleCapabilities {
  product: string;
  is_admin: boolean;
  can: {
    pause_self: boolean;
    edit_templates: boolean;
    edit_voice: boolean;
    edit_shared_templates: boolean;
    estate: boolean;
  };
}

export interface BudgetState {
  product: string;
  armed: boolean;
  period: 'day' | 'month' | null;
  soft_micros: number | null;
  hard_micros: number | null;
  notify_to: string | null;
  spend_micros: number | null;
  refusing: boolean;
  state: string;
}

export interface SwitchDetail {
  by?: string | null;
  reason?: string | null;
  at?: string | null;
}

export interface ProductState {
  product: string;
  switch: {
    stopped: boolean;
    detail: SwitchDetail | null;
    global_stopped: boolean;
    refusing: boolean;
  };
  budget: BudgetState;
}

export interface EstateState {
  global: { stopped: boolean; detail: SwitchDetail | null };
  products: Array<ProductState & { month: { calls: number; cost_micros: number } }>;
  month: { calls: number; cost_micros: number };
}

export interface UsageGroup {
  calls: number;
  tokens_total: number;
  spend_micros: number;
  spend: string;
  [key: string]: string | number | boolean | null;
}

export interface UsageReport {
  from: string;
  to: string;
  totals: UsageGroup & { savings?: string; savings_is_estimate?: boolean };
  by_product: UsageGroup[];
  by_provider: UsageGroup[];
  by_task: UsageGroup[];
  by_model: UsageGroup[];
  latency: { p50: number; p95: number; samples: number };
  daily: Array<{ date: string; calls: number; tokens_total: number; spend_micros: number; spend: string }>;
  by_outcome: Array<Record<string, string | number>> | Record<string, number>;
}

export interface UsageCall {
  id: number;
  created_at: string | null;
  task: string | null;
  outcome: string | null;
  provider: string | null;
  model: string | null;
  tier: string | null;
  latency_ms: number | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  cost_usd: number;
  error: string | null;
}

export interface Page<T> {
  meta: { page: number; per_page?: number; total: number; last_page: number };
  items: T[];
}

export interface TemplateRow {
  key: string;
  version: number;
  mode: string;
  route_key: string | null;
  sensitive: boolean;
  source?: 'sync' | 'console';
  updated_by?: string | null;
  updated_at?: string | null;
}

export interface TemplateVersion {
  version: number;
  is_active: boolean;
  source: 'sync' | 'console';
  updated_by: string | null;
  created_at: string | null;
  mode: string;
  task: string;
  route_key: string | null;
  sensitive: boolean;
  system: string;
  prompt: string;
  variables: string[];
}

export interface TemplateDetail {
  key: string;
  shared: boolean;
  live: TemplateVersion;
  versions: TemplateVersion[];
  editable: string[];
}

export interface Persona {
  id: number;
  key: string;
  audience: string | null;
  label: string;
  voice: string;
  version: number;
  is_active: boolean;
  updated_by: string | null;
  created_at: string | null;
}

export interface KnowledgeEntry {
  slug: string;
  status: string;
  audiences: string[] | null;
  expires_at: string | null;
  question: string | null;
  aliases: string[];
  description: string | null;
  answer: string | null;
  updated_at: string | null;
}

export interface FeedbackVote {
  id: number;
  conversation_id: string;
  turn_id: string | number;
  sentiment: 'positive' | 'negative';
  reason_code: string | null;
  reason_text: string | null;
  created_at: string | null;
  answer?: string | null;
  audience?: string | null;
}

/** Money on the wire is integer micro-dollars; screens show dollars. */
export function dollars(micros: number | null | undefined): string {
  const value = (micros ?? 0) / 1_000_000;
  return value.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: value !== 0 && Math.abs(value) < 1 ? 4 : 2,
  });
}

export function count(n: number | null | undefined): string {
  return (n ?? 0).toLocaleString();
}
