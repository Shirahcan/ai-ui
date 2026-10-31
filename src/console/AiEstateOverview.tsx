import { useState } from 'react';
import { ConsoleError, useConsole, useConsoleResource } from './ConsoleContext';
import { Button, Confirm, Dialog, Field, INPUT, LoadError, Loading, Pill, Section, Stat, Table, Td } from './primitives';
import { count, dollars, type BudgetState, type EstateState } from './types';

/**
 * Every product side by side, the estate-wide AI switch, and every product's spend cap.
 *
 * ⚠ RENDERS ONLY FOR A PRODUCT HOLDING THE ESTATE ADMIN KEY (owner, 2026-10-31: Portify only).
 * Every other product's console sees its own row through its status card instead.
 */
export function AiEstateOverview() {
  const { capabilities, request, productName } = useConsole();
  const allowed = capabilities?.can.estate === true;
  const { data, error, loading, reload, setData } = useConsoleResource<EstateState>(allowed ? 'estate' : null);
  const [stopping, setStopping] = useState<'stop' | 'resume' | null>(null);
  const [capFor, setCapFor] = useState<BudgetState | null>(null);

  if (!allowed) return null;

  return (
    <div className="space-y-6">
      <Section
        title="Every product"
        description="This month's AI use across the estate, each product's switch and its cap."
        actions={
          data ? (
            data.global.stopped ? (
              <Button tone="primary" onClick={() => setStopping('resume')}>Resume AI everywhere</Button>
            ) : (
              <Button tone="danger" onClick={() => setStopping('stop')}>Stop AI everywhere</Button>
            )
          ) : null
        }
      >
        {error && !data ? (
          <LoadError error={error} onRetry={reload} />
        ) : loading && !data ? (
          <Loading />
        ) : data ? (
          <div className="space-y-5">
            {data.global.stopped ? (
              <p role="alert" className="rounded-lg border border-[var(--ai-danger)] px-4 py-3 text-sm text-[var(--ai-danger)]">
                <strong>AI is stopped for every product</strong>
                {data.global.detail?.by ? ` by ${data.global.detail.by}` : ''}
                {data.global.detail?.reason ? `: ${data.global.detail.reason}` : ''}.
              </p>
            ) : null}
            <div className="grid grid-cols-2 gap-5">
              <Stat label="Calls this month" value={count(data.month.calls)} />
              <Stat label="Spend this month" value={dollars(data.month.cost_micros)} />
            </div>
            <Table wide head={['Product', 'Status', 'Calls', 'Spend', 'Cap', '']}>
              {data.products.map((p) => (
                <tr key={p.product}>
                  <Td className="font-medium">{productName(p.product)}</Td>
                  <Td>
                    {p.switch.refusing ? <Pill tone="bad">{p.switch.stopped ? 'Paused' : data.global.stopped ? 'Stopped' : 'Over cap'}</Pill> : <Pill tone="good">On</Pill>}
                  </Td>
                  <Td className="tabular-nums">{count(p.month.calls)}</Td>
                  <Td className="tabular-nums font-semibold">{dollars(p.month.cost_micros)}</Td>
                  <Td className="whitespace-nowrap">{p.budget.armed ? `${p.budget.hard_micros ? dollars(p.budget.hard_micros) : 'alert only'} / ${p.budget.period}` : 'None'}</Td>
                  <Td className="text-right">
                    <Button onClick={() => setCapFor(p.budget)}>Set cap</Button>
                  </Td>
                </tr>
              ))}
            </Table>
          </div>
        ) : null}
      </Section>

      {stopping === 'stop' ? (
        <Confirm
          title="Stop AI for every product?"
          body="Every AI feature in every product stops answering until someone resumes it here."
          verb="Stop AI everywhere"
          danger
          reason="Why are you stopping it?"
          onClose={() => setStopping(null)}
          onConfirm={async (reason) => {
            await request('POST', 'vault/kill', { body: { scope: 'global', reason } });
            setData(await request<EstateState>('GET', 'estate'));
          }}
        />
      ) : stopping === 'resume' ? (
        <Confirm
          title="Resume AI everywhere?"
          body="Products that were paused on their own stay paused."
          verb="Resume AI everywhere"
          onClose={() => setStopping(null)}
          onConfirm={async () => {
            await request('POST', 'vault/kill/resume', { body: { scope: 'global' } });
            setData(await request<EstateState>('GET', 'estate'));
          }}
        />
      ) : null}

      {capFor ? <CapForm budget={capFor} name={productName(capFor.product)} onClose={() => setCapFor(null)} onSaved={reload} /> : null}
    </div>
  );
}

function CapForm({ budget, name, onClose, onSaved }: { budget: BudgetState; name: string; onClose: () => void; onSaved: () => void }) {
  const { request } = useConsole();
  const toText = (m: number | null) => (m === null ? '' : String(m / 1_000_000));
  const [period, setPeriod] = useState<'day' | 'month'>(budget.period ?? 'month');
  const [soft, setSoft] = useState(toText(budget.soft_micros));
  const [hard, setHard] = useState(toText(budget.hard_micros));
  const [notify, setNotify] = useState(budget.notify_to ?? '');
  const [problem, setProblem] = useState<{ field: string | null; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const micros = (s: string) => (s.trim() === '' ? null : Math.round(Number(s) * 1_000_000));
  const invalid = [soft, hard].some((s) => s.trim() !== '' && !(Number(s) >= 0));

  return (
    <Dialog
      title={`${name}: spend cap`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            tone="primary"
            disabled={busy || invalid}
            onClick={async () => {
              setBusy(true);
              setProblem(null);
              try {
                await request('PUT', 'vault/budgets', {
                  body: { product: budget.product, period, soft_micros: micros(soft), hard_micros: micros(hard), notify_to: notify.trim() || null },
                  quiet: true,
                });
                onSaved();
                onClose();
              } catch (e) {
                const err = e as ConsoleError;
                setProblem({ field: err.field, message: err.message });
                setBusy(false);
              }
            }}
          >
            Save cap
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Period">
          {(id) => (
            <select id={id} className={INPUT} value={period} onChange={(e) => setPeriod(e.target.value as 'day' | 'month')}>
              <option value="month">Per month</option>
              <option value="day">Per day</option>
            </select>
          )}
        </Field>
        <Field label="Alert at (USD)" hint="An email goes out; nothing is refused.">
          {(id) => <input id={id} inputMode="decimal" className={INPUT} value={soft} onChange={(e) => setSoft(e.target.value)} />}
        </Field>
        <Field label="Refuse at (USD)" hint="Every AI call is refused once spend reaches this. Leave empty to only alert.">
          {(id) => <input id={id} inputMode="decimal" className={INPUT} value={hard} onChange={(e) => setHard(e.target.value)} />}
        </Field>
        <Field label="Alert email" error={problem?.message ?? null} hint="Required when either amount is set.">
          {(id) => <input id={id} type="email" className={INPUT} value={notify} onChange={(e) => setNotify(e.target.value)} />}
        </Field>
      </div>
    </Dialog>
  );
}
