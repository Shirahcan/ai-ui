import { useCallback, useEffect, useState } from 'react';
import { useConsole } from '../ConsoleContext';
import { Button, LoadError, Loading } from '../primitives';
import { ConsoleError } from '../ConsoleContext';
import { bindVault } from './bridge';
import { getVault, type VaultSnapshot } from './api';
import { AddCredentialWizard } from './AddCredentialWizard';
import { BudgetsPanel } from './BudgetsPanel';
import { CredentialsPanel } from './CredentialsPanel';
import { KillSwitchPanel } from './KillSwitchPanel';
import { RatesPanel } from './RatesPanel';
import { RetentionPanel } from './RetentionPanel';
import { TaskRoutesPanel } from './TaskRoutesPanel';
import { TrustKeysPanel } from './TrustKeysPanel';

/**
 * The estate's AI vault: the provider keys, their clearance for private data, spend caps,
 * retention, task routing, prices, trust keys and the emergency stop. Shared by every product,
 * so every change here affects all of them. Admin key only.
 *
 * Ported from Portify's `/admin/ai/vault` (owner, 2026-11-01) so every product's Site
 * management draws the same vault. `section` renders one part, for a product that lists the
 * parts in its own sidebar; without it, the whole vault scrolls as one page.
 */
export type AiVaultSectionKey = 'stop' | 'keys' | 'caps' | 'retention' | 'routing' | 'prices' | 'access';

export const AI_VAULT_SECTIONS: ReadonlyArray<{ key: AiVaultSectionKey; label: string }> = [
  { key: 'keys', label: 'Provider keys' },
  { key: 'routing', label: 'Task routing' },
  { key: 'prices', label: 'Prices' },
  { key: 'caps', label: 'Spend caps' },
  { key: 'retention', label: 'Retention' },
  { key: 'access', label: 'Trust keys' },
  { key: 'stop', label: 'Emergency stop' },
];

export function AiVault({ section }: { section?: AiVaultSectionKey }) {
  const { request, capabilities, notify, reportError } = useConsole();
  const [snapshot, setSnapshot] = useState<VaultSnapshot | null>(null);
  const [error, setError] = useState<ConsoleError | null>(null);
  const [adding, setAdding] = useState(false);

  // Bound on every render so the panels' module-level calls always reach THIS provider.
  bindVault({ request, notify, reportError });

  const load = useCallback(async () => {
    try {
      setSnapshot(await getVault());
      setError(null);
    } catch (e) {
      setError(e instanceof ConsoleError ? e : new ConsoleError('The vault could not be read.', 0, {}));
    }
  }, []);

  const allowed = capabilities?.can.estate === true;
  useEffect(() => {
    if (allowed) void load();
  }, [allowed, load]);

  if (capabilities && !allowed) {
    return (
      <p className="rounded-[var(--ai-radius)] border border-[var(--ai-border)] bg-[var(--ai-surface)] p-5 text-sm text-[var(--ai-muted)]">
        The AI vault is shared by every product, so it is managed from the product that holds the estate admin key.
      </p>
    );
  }
  if (error && !snapshot) return <LoadError error={error} onRetry={() => void load()} />;
  if (!snapshot) return <Loading />;

  const reload = () => void load();
  const show = (key: AiVaultSectionKey) => section === undefined || section === key;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-[var(--ai-radius)] border border-[var(--ai-border)] bg-[var(--ai-surface)] px-5 py-3 text-sm">
        <p className="min-w-0 flex-1 text-[var(--ai-muted)]">
          Changes here affect <strong className="text-[var(--ai-fg)]">every product</strong> that uses the shared AI service. The
          service records which console made each change.
        </p>
        <span className="flex gap-2">
          <Button onClick={reload}>Refresh</Button>
          {show('keys') ? (
            <Button tone="primary" onClick={() => setAdding(true)}>
              Add a key
            </Button>
          ) : null}
        </span>
      </div>

      {show('stop') ? <KillSwitchPanel state={snapshot.kill_switch} onChanged={reload} /> : null}
      {show('keys') ? <CredentialsPanel credentials={snapshot.credentials} summary={snapshot.credential_summary} onChanged={reload} /> : null}
      {show('caps') ? <BudgetsPanel budgets={snapshot.budgets} summary={snapshot.budget_summary} onChanged={reload} /> : null}
      {show('retention') ? (
        <RetentionPanel
          retention={snapshot.retention ?? []}
          summary={snapshot.retention_summary ?? { products: 0, configured: 0, default_days: 365, max_days: 3650, threads_past_window: 0 }}
          onChanged={reload}
        />
      ) : null}
      {show('routing') ? (
        <TaskRoutesPanel
          routes={snapshot.task_routes ?? []}
          summary={snapshot.task_route_summary ?? { routes: 0, configured: 0, unavailable_rungs: 0 }}
          credentials={snapshot.credentials}
          onChanged={reload}
        />
      ) : null}
      {show('prices') ? <RatesPanel rates={snapshot.rates ?? []} unpriced={snapshot.unpriced ?? []} onChanged={reload} /> : null}
      {show('access') ? <TrustKeysPanel trustKeys={snapshot.trust_keys} products={snapshot.products} onChanged={reload} /> : null}

      <AddCredentialWizard open={adding} onClose={() => setAdding(false)} onAdded={reload} />
    </div>
  );
}
