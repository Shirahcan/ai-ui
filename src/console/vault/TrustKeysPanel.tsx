'use client';

/**
 * Which products may call ai-service, and whether they actually can.
 *
 * ⚠ `can_call` AND `ever_used` ARE THE TWO FIELDS THAT MATTER. finance-suite ran
 * for weeks on production with no working trust key, and because its callers
 * catch broadly, every AI feature it had degraded silently rather than anybody
 * being told. "Issued but never used" is the exact shape of that fault, and it is
 * invisible unless a screen says so.
 *
 * ⚠ THIS SCREEN CANNOT MINT AN ADMIN KEY. Everything else a leaked admin key
 * could do is undone by rotating it; a second admin key minted for itself would
 * survive the rotation, and nothing in a key listing would look wrong about it.
 * Admin keys come from `ai:issue-key <product> --admin`, over SSH, only.
 */

import { useState } from 'react';
import { Copy, KeyRound, MoreVertical, Trash2 } from './icons';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui';
import { Button } from './ui';
import { useToast } from './ui';
import { reportErrorToPorter } from './bridge';
import {
  issueTrustKey,
  revokeTrustKey,
  type IssuedTrustKey,
  type VaultProductKeyState,
  type VaultTrustKey,
} from './api';
import { productList, productName } from './names';

const GLASS =
  'bg-[var(--ai-surface)] border border-[var(--ai-border)] rounded-[var(--ai-radius)]';
const FIELD =
  'w-full rounded-xl border border-[var(--ai-border)] bg-[var(--ai-surface)] px-3 py-2 text-sm text-[var(--ai-fg)] outline-none focus:border-[var(--ai-accent)] placeholder:text-[var(--ai-muted)]';

export function TrustKeysPanel({
  trustKeys,
  products,
  onChanged,
}: {
  trustKeys: VaultTrustKey[];
  products: VaultProductKeyState[];
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [issueFor, setIssueFor] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [issued, setIssued] = useState<IssuedTrustKey | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<VaultTrustKey | null>(null);
  const [busy, setBusy] = useState(false);

  const copy = async (value: string, what: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: `${what} copied` });
    } catch (error) {
      reportErrorToPorter(error as Error);
    }
  };

  const issue = async () => {
    if (!issueFor) return;
    setBusy(true);
    try {
      const result = await issueTrustKey(issueFor, label.trim() === '' ? undefined : label.trim());
      setIssued(result);
      setIssueFor(null);
      setLabel('');
      onChanged();
    } catch (error) {
      reportErrorToPorter(error as Error);
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (key: VaultTrustKey) => {
    setBusy(true);
    try {
      const result = await revokeTrustKey(key.id);
      toast({
        title: `${productName(key.product)}'s key is revoked`,
        description:
          result.warning ??
          `${result.remaining_active_call_keys} working key${result.remaining_active_call_keys === 1 ? '' : 's'} left.`,
        variant: result.warning ? 'destructive' : undefined,
      });
      setRevokeTarget(null);
      onChanged();
    } catch (error) {
      reportErrorToPorter(error as Error);
    } finally {
      setBusy(false);
    }
  };

  const mute = products.filter((p) => !p.can_call);

  return (
    <section className={`${GLASS} p-5 sm:p-6`}>
      <h2 className="text-base font-bold text-[var(--ai-fg)] mb-1">Who may call the AI</h2>
      <p className="mb-4 text-xs text-[var(--ai-muted)]">
        One trust key per product, minted here and set in that product&apos;s environment. A product
        with no working key has every AI call refused.
      </p>

      {mute.length > 0 && (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <strong>{productList(mute.map((p) => p.product))}</strong> cannot call the AI at all. Every
          AI feature in {mute.length === 1 ? 'it' : 'them'} is failing silently right now, because
          callers catch broadly and degrade rather than reporting it.
        </p>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        {products.map((p) => (
          <button
            key={p.product}
            type="button"
            onClick={() => setIssueFor(p.product)}
            className="whitespace-nowrap rounded-full border border-[var(--ai-border)] bg-[var(--ai-surface)] px-3 py-1.5 text-xs font-bold text-[var(--ai-fg)] outline-none hover:border-[var(--ai-accent)] hover:text-[var(--ai-accent)]"
          >
            <KeyRound className="mr-1.5 inline h-3.5 w-3.5" />
            Issue a key for {productName(p.product)}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-left text-xs font-bold text-[var(--ai-muted)]">
              <th className="py-2 pr-3">Product</th>
              <th className="py-2 pr-3">Label</th>
              <th className="py-2 pr-3">Kind</th>
              <th className="py-2 pr-3">Last seen</th>
              <th className="py-2 pr-3">State</th>
              <th className="py-2 w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--ai-border)]">
            {trustKeys.map((k) => (
              <tr key={k.id} className={k.is_active ? undefined : 'opacity-50'}>
                <td className="py-2.5 pr-3 font-bold text-[var(--ai-fg)]">{productName(k.product)}</td>
                <td className="py-2.5 pr-3 text-[var(--ai-muted)]">{k.label ?? '-'}</td>
                <td className="py-2.5 pr-3">
                  {k.is_admin ? (
                    <span className="whitespace-nowrap rounded-full bg-violet-100 px-2 py-0.5 text-xs font-bold text-violet-900">
                      Manages the vault
                    </span>
                  ) : (
                    <span className="text-xs text-[var(--ai-muted)]">Calls the AI</span>
                  )}
                </td>
                <td className="py-2.5 pr-3 text-xs text-[var(--ai-muted)]">
                  {k.last_seen_at ? (
                    new Date(k.last_seen_at).toLocaleString()
                  ) : (
                    <span className="font-bold text-amber-700">Never used</span>
                  )}
                </td>
                <td className="py-2.5 pr-3">
                  <span
                    className={
                      'text-xs font-bold ' + (k.is_active ? 'text-emerald-700' : 'text-[var(--ai-muted)]')
                    }
                  >
                    {k.is_active ? 'Active' : 'Revoked'}
                  </span>
                </td>
                <td className="py-2.5">
                  {k.is_active && (
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        aria-label={`Actions for ${productName(k.product)}'s key`}
                        className="rounded-full p-1.5 text-[var(--ai-muted)] outline-none hover:bg-[var(--ai-accent-soft)]"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => void copy(String(k.id), 'Key id')}>
                          <Copy className="mr-2 h-4 w-4" />
                          Copy id
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-[var(--ai-danger)]"
                          onClick={() => setRevokeTarget(k)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Revoke
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Issue */}
      <Dialog open={issueFor !== null} onOpenChange={(o) => !o && setIssueFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Issue a trust key for {productName(issueFor)}</DialogTitle>
            <DialogDescription>
              The key is shown once on the next screen and cannot be shown again - it is stored only
              as a hash. You will need to put it in that product&apos;s environment and rebuild its
              config cache before it starts working.
            </DialogDescription>
          </DialogHeader>

          <div>
            <label className="block text-xs font-bold text-[var(--ai-fg)] mb-1.5" htmlFor="key-label">
              Label <span className="font-normal text-[var(--ai-muted)]">(optional)</span>
            </label>
            <input
              id="key-label"
              className={FIELD}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={`${issueFor ?? ''} prod`}
            />
            <p className="mt-1.5 text-xs text-[var(--ai-muted)]">
              A note for whoever reads this table later. Never the key itself.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIssueFor(null)} className="whitespace-nowrap">
              Cancel
            </Button>
            <Button onClick={() => void issue()} disabled={busy} className="whitespace-nowrap">
              {busy ? 'Minting...' : 'Mint the key'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/*
        ⚠ THE ONE TIME THIS VALUE EXISTS. There is deliberately no "show key"
        anywhere else, and this dialog does not persist it: closing it loses it,
        which is the honest behaviour for a secret the service cannot reprint.
      */}
      <Dialog open={issued !== null} onOpenChange={(o) => !o && setIssued(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copy this key now</DialogTitle>
            <DialogDescription>
              It is shown once. Closing this dialog loses it, and the service cannot print it again -
              a service that could re-print a key is a service an attacker can read keys out of.
            </DialogDescription>
          </DialogHeader>

          <code className="block break-all rounded-xl bg-slate-900 px-3 py-3 text-xs text-slate-100">
            {issued?.key_shown_once}
          </code>

          <p className="text-xs text-[var(--ai-muted)]">
            Set it as <code className="rounded bg-[var(--ai-accent-soft)] px-1">AI_SERVICE_TRUST_KEY</code> in{' '}
            {productName(issued?.trust_key.product)}, then rebuild that product&apos;s config cache.
          </p>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => void copy(issued?.key_shown_once ?? '', 'Trust key')}
              className="whitespace-nowrap"
            >
              <Copy className="mr-2 h-4 w-4" />
              Copy
            </Button>
            <Button onClick={() => setIssued(null)} className="whitespace-nowrap">
              I have saved it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke */}
      <AlertDialog open={revokeTarget !== null} onOpenChange={(o) => !o && setRevokeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke {productName(revokeTarget?.product)}&apos;s key?</AlertDialogTitle>
            <AlertDialogDescription>
              That key stops working immediately. If it is the only working key that product has,
              every AI call it makes will be refused from this moment - and its callers will degrade
              quietly rather than telling anybody.
              {revokeTarget?.is_admin && (
                <>
                  <br />
                  <br />
                  This is a key that <strong>manages the vault</strong>. A replacement can only be
                  minted over SSH, with{' '}
                  <code>php artisan ai:issue-key {revokeTarget.product} --admin</code>.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="bg-[var(--ai-danger)] hover:bg-[var(--ai-danger)]"
              onClick={() => revokeTarget && void revoke(revokeTarget)}
            >
              Revoke it
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
