'use client';

/**
 * Add a provider key to the estate's AI vault.
 *
 * ⚠ A WIZARD RATHER THAN A FORM, because every law in docs/WIZARD_STANDARD.md
 * applies here at once: eight fields, four real decisions, and consequences an
 * admin cannot see from a label. Two of those decisions are genuinely dangerous
 * if taken by guess, and both have cost this estate something:
 *
 *   - `kind`. A search key handed to the generation walk surfaces as a provider
 *     400, which the walk reads as "this provider failed" and retries past - so
 *     ONE misfiled row quietly costs a rung on every generation call in the
 *     estate, for every product.
 *   - `tier` = paid with no rate entry. The spend records as zero, so the budget
 *     caps never see it and the first anybody knows is the provider's invoice.
 *
 * ⚠ IT IS A MODAL, AND THE STANDARD ALLOWS THAT HERE: adding one key is
 * genuinely a sub-task of the vault page behind it, and the operator needs the
 * list they are adding to still in view when they come back.
 *
 * ⚠ `WizardShell` DOES NOT MAKE ITSELF A MODAL. `variant="modal"` only tunes
 * its internal flex and scroll classes so it FITS one; it renders no overlay and
 * no portal. Passing it alone - which this component did at first - puts the
 * whole wizard inline at the BOTTOM OF THE PAGE, below the last section, which
 * is what shipped and what this fixes. The Dialog is the caller's to provide.
 *
 * ⚠ MODAL SCROLL CONTRACT (prime directive). `DialogContent` carries
 * `flex flex-col overflow-hidden max-h-[90vh]`, the header is `shrink-0`, and
 * the shell's modal variant owns the ONLY inner scroller. `flex flex-col` is
 * required because twMerge drops `DialogContent`'s base `grid`.
 *
 * ⚠ AND THE BODY IS MOUNTED ONLY WHILE OPEN, which is not a nicety here. The
 * form holds a pasted provider API key in React state. With the state living in
 * an always-mounted component, closing with Escape or the dialog's own X went
 * round the `onCancel` that clears it, and the secret sat in memory until the
 * page was left. Radix unmounts closed content, so mounting the body here makes
 * "the key is discarded" true for EVERY close path rather than for the two
 * buttons that happened to call the handler.
 *
 * ⚠ NO DRAFT KEY, DELIBERATELY. Every other wizard in Portify resumes, and this
 * one must not: the draft would hold a live provider API key in a database row
 * that nothing ever reads again. An unfinished credential is cheap to retype and
 * a stored secret is not.
 */

import { ReviewCollapsible } from './wizard';
import { useMemo, useState } from 'react';
import { Boxes, Globe, KeyRound, ListOrdered, Mic, ShieldQuestion } from './icons';
import { WizardShell, WizardChoiceGroup, type WizardStepDefinition } from './wizard';
import { saveVaultCredential, type CredentialKind, type CredentialTier, type NewCredential } from './api';
import { reportErrorToPorter } from './bridge';
import { useToast } from './ui';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui';
import { productName, providerName } from './names';

/** The products that may be named in an allow-list. The service's closed set. */
const PRODUCTS = ['portify', 'mploynow', 'finance', 'studendly'] as const;

interface State {
  kind: CredentialKind | null;
  provider: string;
  model: string;
  label: string;
  apiKey: string;
  tier: CredentialTier | null;
  order: string;
  allowedProducts: string[];
  baseUrl: string;
  timeoutSeconds: string;
}

const EMPTY: State = {
  kind: null,
  provider: '',
  model: '',
  label: '',
  apiKey: '',
  tier: null,
  order: '100',
  allowedProducts: [],
  baseUrl: '',
  timeoutSeconds: '20',
};

const FIELD =
  'w-full rounded-xl border border-[var(--ai-border)] bg-[var(--ai-surface)] px-3 py-2 text-sm text-[var(--ai-fg)] outline-none focus:border-[var(--ai-accent)] placeholder:text-[var(--ai-muted)]';
const LABEL = 'block text-xs font-bold text-[var(--ai-fg)] mb-1.5';
const HINT = 'mt-1.5 text-xs text-[var(--ai-muted)]';

export function AddCredentialWizard({
  open,
  onClose,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="flex max-h-[90vh] w-full flex-col overflow-hidden sm:max-w-3xl sm:rounded-[var(--ai-radius)]">
        <DialogHeader className="shrink-0">
          <DialogTitle>Add a key to the AI vault</DialogTitle>
          <DialogDescription>Shared by every product that calls ai-service</DialogDescription>
        </DialogHeader>

        {/*
          Mounted only while open - see the note at the top. Each opening starts
          from an empty form, and no pasted key outlives a close.
        */}
        {open && <AddCredentialBody onClose={onClose} onAdded={onAdded} />}
      </DialogContent>
    </Dialog>
  );
}

function AddCredentialBody({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const { toast } = useToast();
  const [state, setState] = useState<State>(EMPTY);
  const [submitting, setSubmitting] = useState(false);

  const patch = (changes: Partial<State>) => setState((prev) => ({ ...prev, ...changes }));

  const registry = useMemo<WizardStepDefinition<State>[]>(
    () => [
      {
        id: 'purpose',
        title: 'What this key is for',
        icon: ShieldQuestion,
        validate: (s) => (s.kind === null ? 'Choose what this key is for to continue.' : null),
        render: ({ state: s, patch: p }) => (
          <div className="space-y-4">
            <p className="text-sm text-[var(--ai-muted)]">
              The vault keeps these apart, and it matters more than it looks. A search key
              cannot answer a prompt, so a search key filed as a generation key shows up to the
              waterfall as a provider that failed. It then retries past it - on every AI call in
              the estate, for every product, until somebody notices the extra latency.
            </p>
            <WizardChoiceGroup<CredentialKind>
              ariaLabel="What this key is for"
              value={s.kind}
              onSelect={(kind) => p({ kind })}
              options={[
                {
                  value: 'generation',
                  label: 'Answering questions',
                  description:
                    'A language model: Porter chat, classification, extraction, drafting. Needs a model id.',
                  icon: Boxes,
                },
                {
                  value: 'search',
                  label: 'Searching the web',
                  description:
                    'A search provider such as Tavily. Invisible to the generation waterfall by design, and needs no model.',
                  icon: Globe,
                },
                {
                  value: 'transcription',
                  label: 'Turning speech into text',
                  description:
                    "A speech-to-text model such as Groq Whisper, used for candidates' intro videos. Never used until you clear it for client data, because every recording is a person speaking.",
                  icon: Mic,
                },
              ]}
            />
          </div>
        ),
      },
      {
        id: 'provider',
        title: 'Which provider, and which model',
        icon: Boxes,
        validate: (s) => {
          if (s.provider.trim() === '') return 'Name the provider to continue.';
          if (s.kind === 'generation' && s.model.trim() === '') {
            return 'Give the model id - a generation key with no model has nothing to call.';
          }
          return null;
        },
        render: ({ state: s, patch: p }) => (
          <div className="space-y-5">
            <div>
              <label className={LABEL} htmlFor="vault-provider">
                Provider
              </label>
              <input
                id="vault-provider"
                className={FIELD}
                value={s.provider}
                onChange={(e) => p({ provider: e.target.value })}
                placeholder="gemini, groq, mistral, openai, claude, tavily"
                autoComplete="off"
              />
              <p className={HINT}>
                Lower case, exactly as the service names it. The adapter is chosen from this.
              </p>
            </div>

            {s.kind !== 'search' && (
              <div>
                <label className={LABEL} htmlFor="vault-model">
                  Model id
                </label>
                <input
                  id="vault-model"
                  className={FIELD}
                  value={s.model}
                  onChange={(e) => p({ model: e.target.value })}
                  placeholder={s.kind === 'transcription' ? 'whisper-large-v3-turbo' : 'gemini-2.5-flash, openai/gpt-oss-120b'}
                  autoComplete="off"
                />
                <p className={HINT}>
                  The provider&apos;s own id, not a friendly name. This is also what the rate table
                  prices the call by.
                </p>
              </div>
            )}

            <div>
              <label className={LABEL} htmlFor="vault-label">
                Label <span className="font-normal text-[var(--ai-muted)]">(optional)</span>
              </label>
              <input
                id="vault-label"
                className={FIELD}
                value={s.label}
                onChange={(e) => p({ label: e.target.value })}
                placeholder="primary, second account, search"
                autoComplete="off"
              />
              <p className={HINT}>
                A provider can hold several keys. The label is what tells them apart - and saving
                over the same provider and label <strong>rotates that key</strong> rather than
                adding another, which is how a key is replaced without losing a rung.
              </p>
            </div>
          </div>
        ),
      },
      {
        id: 'key',
        title: 'The key, and whether it is billed',
        icon: KeyRound,
        validate: (s) => {
          if (s.apiKey.trim().length < 8) return 'Paste the provider key to continue.';
          if (s.tier === null) return 'Say whether this key is billed.';
          return null;
        },
        render: ({ state: s, patch: p }) => (
          <div className="space-y-5">
            <div>
              <label className={LABEL} htmlFor="vault-key">
                API key
              </label>
              <input
                id="vault-key"
                type="password"
                className={FIELD}
                value={s.apiKey}
                onChange={(e) => p({ apiKey: e.target.value })}
                placeholder="Paste it here"
                autoComplete="off"
                spellCheck={false}
              />
              <p className={HINT}>
                Stored encrypted in the service and <strong>never shown again</strong>, to anyone,
                on any screen. What you will see afterwards is an eight-character fingerprint, which
                is enough to tell one key from another without putting a live secret on a screen.
              </p>
            </div>

            <div>
              <span className={LABEL}>Is this key billed?</span>
              <WizardChoiceGroup<CredentialTier>
                ariaLabel="Is this key billed"
                columns="two"
                value={s.tier}
                onSelect={(tier) => p({ tier })}
                options={[
                  {
                    value: 'free',
                    label: 'Free tier',
                    description: 'A free quota. Tried before the billed keys.',
                  },
                  {
                    value: 'paid',
                    label: 'Paid',
                    description: 'Real money per call. Tried last, after the free quotas.',
                  },
                ]}
              />
              {s.tier === 'paid' && (
                <p className="mt-3 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900">
                  Check that the service&apos;s rate table prices this provider and model. Without a
                  rate its spend records as <strong>zero</strong>, so the budget caps never see it
                  and the first anybody hears about the cost is the invoice.
                </p>
              )}
            </div>

            <p className="rounded-xl bg-[var(--ai-accent-soft)] border border-[var(--ai-border)] px-3 py-2 text-xs text-[var(--ai-muted)]">
              A new key is <strong>never</strong> cleared to handle client documents. That is a
              separate, named decision you make on the credential afterwards - &quot;billed&quot; and
              &quot;may be shown a passport&quot; are different facts, and one has never implied the
              other.
            </p>
          </div>
        ),
      },
      {
        id: 'placement',
        title: 'Who may use it, and where it sits',
        icon: ListOrdered,
        validate: (s) => {
          const order = Number(s.order);
          if (!Number.isFinite(order) || order < 0) return 'Give a position as a whole number.';
          return null;
        },
        render: ({ state: s, patch: p }) => (
          <div className="space-y-5">
            <div>
              <span className={LABEL}>Which products may use it</span>
              <p className="mb-2 text-xs text-[var(--ai-muted)]">
                Choose none to let <strong>every</strong> product use it, which is the usual answer -
                one shared key is the point of one vault. Naming products makes it a closed list:
                anything not named gets no access at all.
              </p>
              <div className="flex flex-wrap gap-2">
                {PRODUCTS.map((product) => {
                  const on = s.allowedProducts.includes(product);
                  return (
                    <button
                      key={product}
                      type="button"
                      onClick={() =>
                        p({
                          allowedProducts: on
                            ? s.allowedProducts.filter((x) => x !== product)
                            : [...s.allowedProducts, product],
                        })
                      }
                      className={
                        'whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold outline-none transition-colors ' +
                        (on
                          ? 'bg-[var(--ai-accent)] text-white'
                          : 'bg-[var(--ai-surface)] border border-[var(--ai-border)] text-[var(--ai-muted)] hover:border-[var(--ai-accent)]')
                      }
                    >
                      {productName(product)}
                    </button>
                  );
                })}
              </div>
              {s.allowedProducts.length > 0 && (
                <p className="mt-2 text-xs text-[var(--ai-muted)]">
                  Only {s.allowedProducts.map(productName).join(', ')} will see this key.
                </p>
              )}
            </div>

            <div>
              <label className={LABEL} htmlFor="vault-order">
                Position in the waterfall
              </label>
              <input
                id="vault-order"
                className={FIELD}
                inputMode="numeric"
                value={s.order}
                onChange={(e) => p({ order: e.target.value })}
              />
              <p className={HINT}>
                Lower is tried first. Free quotas belong above billed keys, so the cheap rungs are
                exhausted before money is spent.
              </p>
            </div>

            <details className="rounded-xl border border-[var(--ai-border)] bg-[var(--ai-surface)] px-3 py-2">
              <summary className="cursor-pointer text-xs font-bold text-[var(--ai-fg)] outline-none">
                Advanced: endpoint and timeout
              </summary>
              <div className="mt-3 space-y-4">
                <div>
                  <label className={LABEL} htmlFor="vault-base-url">
                    Base URL override
                  </label>
                  <input
                    id="vault-base-url"
                    className={FIELD}
                    value={s.baseUrl}
                    onChange={(e) => p({ baseUrl: e.target.value })}
                    placeholder="Leave empty for the provider default"
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label className={LABEL} htmlFor="vault-timeout">
                    Per-request timeout (seconds)
                  </label>
                  <input
                    id="vault-timeout"
                    className={FIELD}
                    inputMode="numeric"
                    value={s.timeoutSeconds}
                    onChange={(e) => p({ timeoutSeconds: e.target.value })}
                  />
                  <p className={HINT}>
                    How long this one rung may take before the walk moves on. It is not the
                    caller&apos;s overall budget.
                  </p>
                </div>
              </div>
            </details>
          </div>
        ),
      },
      {
        id: 'review',
        title: 'Check it before it goes in',
        icon: KeyRound,
        render: ({ state: s, goTo }) => (
          <div className="space-y-4">
            <p className="text-sm text-[var(--ai-muted)]">
              This key goes into the estate&apos;s shared vault. Every product that calls
              ai-service can use it unless you named a closed list, and its spend lands in the one
              ledger.
            </p>
            {/* The answers: a recap, collapsed (WIZARD_STANDARD §7.2); the summary names the money. */}
            <ReviewCollapsible
              title="What you entered"
              summary={[providerName(s.provider) || 'No provider', s.tier === 'paid' ? 'paid, real money per call' : 'free tier', s.allowedProducts.length === 0 ? 'every product' : `${s.allowedProducts.length} products`].join(', ')}
            >
            <dl className="divide-y divide-[var(--ai-border)]">
              {[
                [
                  'For',
                  s.kind === 'search'
                    ? 'Searching the web'
                    : s.kind === 'transcription'
                      ? 'Turning speech into text'
                      : 'Answering questions',
                  'purpose',
                ],
                ['Provider', providerName(s.provider) || '-', 'provider'],
                ...(s.kind !== 'search' ? [['Model', s.model || '-', 'provider'] as const] : []),
                ['Label', s.label || (s.kind ?? '-'), 'provider'],
                ['Billed', s.tier === 'paid' ? 'Paid - real money per call' : 'Free tier', 'key'],
                [
                  'Usable by',
                  s.allowedProducts.length === 0
                    ? 'Every product'
                    : s.allowedProducts.map(productName).join(', '),
                  'placement',
                ],
                ['Position', s.order, 'placement'],
                ['Client documents', 'Not cleared (decide separately)', 'key'],
              ].map(([label, value, step]) => (
                <div key={label as string} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <dt className="text-xs font-bold text-[var(--ai-muted)]">{label}</dt>
                  <dd className="flex items-center gap-3 text-sm text-[var(--ai-fg)]">
                    <span className="text-right">{value}</span>
                    <button
                      type="button"
                      onClick={() => goTo(step as string)}
                      className="whitespace-nowrap text-xs font-bold text-[var(--ai-accent)] outline-none hover:underline"
                    >
                      Edit
                    </button>
                  </dd>
                </div>
              ))}
            </dl>
            </ReviewCollapsible>
          </div>
        ),
      },
    ],
    [],
  );

  const submit = async () => {
    setSubmitting(true);
    try {
      const payload: NewCredential = {
        provider: state.provider.trim(),
        kind: state.kind ?? 'generation',
        model: state.kind !== 'search' && state.model.trim() !== '' ? state.model.trim() : null,
        label: state.label.trim() === '' ? null : state.label.trim(),
        api_key: state.apiKey.trim(),
        tier: state.tier ?? 'free',
        order: Number(state.order) || 100,
        base_url: state.baseUrl.trim() === '' ? null : state.baseUrl.trim(),
        timeout_seconds: Number(state.timeoutSeconds) || 20,
        enabled: true,
        allowed_products: state.allowedProducts.length === 0 ? null : state.allowedProducts,
      };

      const saved = await saveVaultCredential(payload);

      toast({
        title: `${providerName(saved.provider)} / ${saved.label ?? saved.kind} is in the vault`,
        description: `Fingerprint ${saved.key_fingerprint ?? '-'}. It is not cleared for client documents.`,
      });

      /*
       * Belt and braces: closing unmounts this body and takes the state with
       * it (see the note at the top), so this clears the pasted key in the
       * frame BEFORE the unmount rather than relying on the order of the two.
       */
      setState(EMPTY);
      onAdded();
      onClose();
      return true;
    } catch (error) {
      // The axios interceptors surface a real HTTP failure in Porter with the
      // service's own reason; this covers the rest.
      reportErrorToPorter(error as Error);
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <WizardShell<State>
      variant="modal"
      /*
       * ⚠ NO `heading`/`subheading`: the DialogHeader above carries them. Both
       * would render the title twice, which is the duplication the hoisting
       * directive exists to remove - and two h2s in one dialog is a real a11y
       * defect rather than a cosmetic one.
       */
      registry={registry}
      state={state}
      patch={patch}
      // Unmounting clears the state, including the pasted key, on every path.
      onCancel={onClose}
      cancelWarning="The key you pasted is discarded. Nothing is saved."
      onSubmit={submit}
      submitting={submitting}
      submitLabel={
        state.provider.trim() === ''
          ? 'Add to the vault'
          : `Add ${providerName(state.provider.trim())} to the vault`
      }
    />
  );
}
