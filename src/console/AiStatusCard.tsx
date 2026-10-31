import { useState } from 'react';
import { useConsole, useConsoleResource } from './ConsoleContext';
import { Button, Confirm, LoadError, Loading, Pill, Section } from './primitives';
import { dollars, type ProductState } from './types';

/**
 * Is this product's AI on, and how close is it to its cap.
 *
 * ⚠ IT SHOWS WHICH SWITCH IS DOWN. A global stop and this product's own stop look the same
 * from the generation path ("refusing"), but only one of them can be lifted from here. Saying
 * "off" without saying which would make Resume look broken during a global stop.
 */
export function AiStatusCard() {
  const { request, capabilities, productName } = useConsole();
  const { data, error, loading, reload, setData } = useConsoleResource<ProductState>('state');
  const [asking, setAsking] = useState<'pause' | 'resume' | null>(null);

  if (error && !data) return <LoadError error={error} onRetry={reload} />;
  if (loading && !data) return <Loading />;
  if (!data) return null;

  const { switch: sw, budget } = data;
  const canPause = capabilities?.can.pause_self === true;
  const name = productName(data.product);

  const status = sw.global_stopped ? (
    <Pill tone="bad">Off for every product</Pill>
  ) : sw.stopped ? (
    <Pill tone="bad">Paused</Pill>
  ) : budget.refusing ? (
    <Pill tone="bad">Over its cap</Pill>
  ) : (
    <Pill tone="good">On</Pill>
  );

  const hard = budget.hard_micros;
  const spent = budget.spend_micros ?? 0;
  const share = hard ? Math.min(1, spent / hard) : null;

  return (
    <Section
      title={`${name} AI`}
      description="Whether this product's AI answers, and what it has spent against its cap."
      actions={
        canPause ? (
          sw.stopped ? (
            <Button tone="primary" onClick={() => setAsking('resume')}>
              Resume AI
            </Button>
          ) : (
            <Button tone="danger" onClick={() => setAsking('pause')}>
              Pause AI
            </Button>
          )
        ) : null
      }
    >
      <div className="grid gap-5 sm:grid-cols-3">
        <div>
          <div className="text-sm text-[var(--ai-muted)]">Status</div>
          <div className="mt-1.5">{status}</div>
          {sw.global_stopped && sw.stopped === false ? (
            <p className="mt-2 text-xs text-[var(--ai-muted)]">Stopped estate-wide{sw.detail?.reason ? `: ${sw.detail.reason}` : ''}. Only an estate admin can resume it.</p>
          ) : sw.stopped && sw.detail ? (
            <p className="mt-2 text-xs text-[var(--ai-muted)]">
              Paused by <strong>{sw.detail.by ?? 'someone'}</strong>
              {sw.detail.reason ? `: ${sw.detail.reason}` : ''}
            </p>
          ) : null}
        </div>

        <div className="sm:col-span-2">
          <div className="text-sm text-[var(--ai-muted)]">Spend this {budget.period ?? 'month'}</div>
          {budget.armed ? (
            <>
              <div className="mt-1 text-2xl font-bold tabular-nums">
                {dollars(spent)}
                {hard ? <span className="text-base font-medium text-[var(--ai-muted)]"> of {dollars(hard)}</span> : null}
              </div>
              {share !== null ? (
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--ai-accent-soft)]" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(share * 100)} aria-label="Share of the hard cap spent">
                  <div className={`h-full rounded-full ${share >= 0.9 ? 'bg-[var(--ai-danger)]' : 'bg-[var(--ai-accent)]'}`} style={{ width: `${share * 100}%` }} />
                </div>
              ) : null}
              <p className="mt-1.5 text-xs text-[var(--ai-muted)]">{budget.state}</p>
            </>
          ) : (
            <p className="mt-1 text-sm">
              <strong>No cap set.</strong> This product is never refused on cost.
              {capabilities?.can.estate ? ' Set one under Caps.' : ' An estate admin can set one.'}
            </p>
          )}
        </div>
      </div>

      {asking === 'pause' ? (
        <Confirm
          title={`Pause ${name} AI?`}
          body={`Every AI feature in ${name} stops answering until someone resumes it. Other products keep working.`}
          verb="Pause AI"
          danger
          reason="Why are you pausing it?"
          onClose={() => setAsking(null)}
          onConfirm={async (reason) => setData(await request<ProductState>('POST', 'pause', { body: { reason } }))}
        />
      ) : asking === 'resume' ? (
        <Confirm
          title={`Resume ${name} AI?`}
          body={sw.global_stopped ? 'This lifts this product\'s own pause. The estate-wide stop stays on until an estate admin lifts it.' : `${name}'s AI features start answering again.`}
          verb="Resume AI"
          onClose={() => setAsking(null)}
          onConfirm={async () => setData(await request<ProductState>('POST', 'resume', { body: {} }))}
        />
      ) : null}
    </Section>
  );
}
