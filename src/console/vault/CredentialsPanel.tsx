'use client';

/**
 * The vault's credentials: what they are, whether they are in rotation, and who
 * cleared them to see a client's documents.
 *
 * ⚠ NO KEY IS RENDERED HERE, IN ANY FORM. Not masked, not a prefix, not a
 * length. The fingerprint is eight characters of a one-way hash: it answers
 * "is this the key I just pasted, or the old one?" and shares none of it. A
 * `sk-...4f2a` mask hands out real characters of a live secret to anybody who
 * can see the screen, or a screenshot of it.
 */

import { useState } from 'react';
import { MoreVertical, Copy, ShieldCheck, ShieldOff, Power, PowerOff } from './icons';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui';
import { useToast } from './ui';
import { reportErrorToPorter } from './bridge';
import {
  setSensitiveClearance,
  updateVaultCredential,
  type VaultCredential,
} from './api';
import { label, productList, providerName } from './names';

const GLASS =
  'bg-[var(--ai-surface)] border border-[var(--ai-border)] rounded-[var(--ai-radius)]';

export function CredentialsPanel({
  credentials,
  summary,
  onChanged,
}: {
  credentials: VaultCredential[];
  summary: { total: number; generation: number; search: number; enabled: number; sensitive_cleared: number };
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [clearTarget, setClearTarget] = useState<VaultCredential | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const copy = async (value: string, what: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: `${what} copied` });
    } catch (error) {
      // A clipboard failure is not an API error, so Porter has to be told.
      reportErrorToPorter(error as Error);
    }
  };

  const toggleEnabled = async (credential: VaultCredential) => {
    setBusyId(credential.id);
    try {
      await updateVaultCredential(credential.id, { enabled: !credential.enabled });
      toast({
        title: credential.enabled
          ? `${providerName(credential.provider)} is out of rotation`
          : `${providerName(credential.provider)} is back in rotation`,
        description: 'This affects every product that calls ai-service.',
      });
      onChanged();
    } catch (error) {
      reportErrorToPorter(error as Error);
    } finally {
      setBusyId(null);
    }
  };

  const applyClearance = async (credential: VaultCredential, clear: boolean) => {
    setBusyId(credential.id);
    try {
      await setSensitiveClearance(credential.id, clear);
      toast({
        title: clear
          ? `${providerName(credential.provider)} may now be shown client documents`
          : `Clearance withdrawn from ${providerName(credential.provider)}`,
        description: clear ? 'Recorded against your name and the time.' : undefined,
      });
      onChanged();
    } catch (error) {
      reportErrorToPorter(error as Error);
    } finally {
      setBusyId(null);
      setClearTarget(null);
    }
  };

  return (
    <section className={`${GLASS} p-5 sm:p-6`}>
      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-1">
        <h2 className="text-base font-bold text-[var(--ai-fg)]">Provider keys</h2>
        <p className="text-xs text-[var(--ai-muted)]">
          {summary.total} in the vault · {summary.enabled} in rotation · {summary.generation} answering ·{' '}
          {summary.search} searching
        </p>
      </div>

      {/*
        ⚠ ZERO CLEARED CREDENTIALS IS A STATE TO EXPLAIN, NOT HIDE. With none,
        every task the service marks sensitive refuses with
        no_compliant_credential - and that refusal is correct behaviour rather
        than a fault to debug.
      */}
      {summary.sensitive_cleared === 0 ? (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          No key is cleared to handle client documents, so anything involving a passport, a bank
          statement or an IRCC letter will refuse rather than send it to a provider. That is the
          safe answer, not a fault - clear a key only when that provider is contractually allowed
          to see client personal data.
        </p>
      ) : (
        <p className="mb-4 text-xs text-[var(--ai-muted)]">
          {summary.sensitive_cleared} key{summary.sensitive_cleared === 1 ? '' : 's'} may be shown
          client documents.
        </p>
      )}

      {credentials.length === 0 ? (
        <p className="py-8 text-center text-sm text-[var(--ai-muted)]">
          The vault is empty, so no AI call in the estate can be answered. Add a provider key to
          start.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="text-left text-xs font-bold text-[var(--ai-muted)]">
                <th className="py-2 pr-3">#</th>
                <th className="py-2 pr-3">Provider</th>
                <th className="py-2 pr-3">For</th>
                <th className="py-2 pr-3">Tier</th>
                <th className="py-2 pr-3">Used by</th>
                <th className="py-2 pr-3">Key</th>
                <th className="py-2 pr-3">Documents</th>
                <th className="py-2 pr-3">State</th>
                <th className="py-2 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--ai-border)]">
              {credentials.map((c) => (
                <tr key={c.id} className={busyId === c.id ? 'opacity-50' : undefined}>
                  <td className="py-2.5 pr-3 text-[var(--ai-muted)]">{c.order}</td>
                  <td className="py-2.5 pr-3">
                    <span className="font-bold text-[var(--ai-fg)]">{providerName(c.provider)}</span>
                    {c.label && <span className="text-[var(--ai-muted)]"> / {c.label}</span>}
                    {c.model && <div className="text-xs text-[var(--ai-muted)]">{c.model}</div>}
                  </td>
                  <td className="py-2.5 pr-3 text-[var(--ai-muted)]">
                    {c.kind === 'search' ? 'Searching' : c.kind === 'transcription' ? 'Transcribing' : 'Answering'}
                  </td>
                  <td className="py-2.5 pr-3">
                    <span
                      className={
                        'whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold ' +
                        (c.tier === 'paid' ? 'bg-amber-100 text-amber-900' : 'bg-[var(--ai-accent-soft)] text-[var(--ai-muted)]')
                      }
                    >
                      {label(c.tier)}
                    </span>
                  </td>
                  <td className="py-2.5 pr-3 text-xs text-[var(--ai-muted)]">
                    {/* Null means every product, and that is spelled out rather
                        than rendered as an empty cell. */}
                    {c.allowed_products === null ? 'Every product' : productList(c.allowed_products)}
                  </td>
                  <td className="py-2.5 pr-3">
                    {c.key_set ? (
                      <code className="rounded bg-[var(--ai-accent-soft)] px-1.5 py-0.5 text-xs text-[var(--ai-fg)]">
                        {c.key_fingerprint}
                      </code>
                    ) : (
                      <span className="text-xs font-bold text-[var(--ai-danger)]">no key</span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3">
                    {c.sensitive_ok ? (
                      <span
                        className="whitespace-nowrap text-xs font-bold text-emerald-700"
                        title={`Cleared by ${c.sensitive_cleared_by ?? 'unknown'}`}
                      >
                        Cleared
                      </span>
                    ) : (
                      <span className="text-xs text-[var(--ai-muted)]">No</span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3">
                    <span
                      className={
                        'whitespace-nowrap text-xs font-bold ' +
                        (c.enabled ? 'text-emerald-700' : 'text-[var(--ai-muted)]')
                      }
                    >
                      {c.enabled ? 'In rotation' : 'Off'}
                    </span>
                  </td>
                  <td className="py-2.5">
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        aria-label={`Actions for ${providerName(c.provider)}`}
                        className="rounded-full p-1.5 text-[var(--ai-muted)] outline-none hover:bg-[var(--ai-accent-soft)]"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => void copy(String(c.id), 'Credential id')}>
                          <Copy className="mr-2 h-4 w-4" />
                          Copy id
                        </DropdownMenuItem>
                        {c.key_fingerprint && (
                          <DropdownMenuItem
                            onClick={() => void copy(c.key_fingerprint ?? '', 'Fingerprint')}
                          >
                            <Copy className="mr-2 h-4 w-4" />
                            Copy fingerprint
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => void toggleEnabled(c)}>
                          {c.enabled ? (
                            <>
                              <PowerOff className="mr-2 h-4 w-4" />
                              Take out of rotation
                            </>
                          ) : (
                            <>
                              <Power className="mr-2 h-4 w-4" />
                              Put back in rotation
                            </>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {c.sensitive_ok ? (
                          <DropdownMenuItem
                            className="text-[var(--ai-danger)]"
                            onClick={() => void applyClearance(c, false)}
                          >
                            <ShieldOff className="mr-2 h-4 w-4" />
                            Withdraw document clearance
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => setClearTarget(c)}>
                            <ShieldCheck className="mr-2 h-4 w-4" />
                            Clear for client documents
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/*
        ⚠ THE CONFIRM NAMES THE CONSEQUENCE OUT LOUD. An operator clearing a row
        from a list of ids has no way to know which provider they just allowed to
        receive client identity documents, and "paid" has never implied "allowed".
      */}
      <AlertDialog open={clearTarget !== null} onOpenChange={(open) => !open && setClearTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Allow {providerName(clearTarget?.provider)} to receive client documents?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Real client passports, bank statements and IRCC letters may be sent to{' '}
              <strong>{providerName(clearTarget?.provider)}</strong> as images. Only clear it if that provider is
              contractually allowed to hold client personal data - a paid plan is a billing fact,
              not a contractual one, and a consumer plan with training on by default can be both
              billed and non-compliant.
              <br />
              <br />
              Your name and the time are recorded against this decision.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Leave it uncleared</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => clearTarget && void applyClearance(clearTarget, true)}
            >
              Yes, it is cleared for client data
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
