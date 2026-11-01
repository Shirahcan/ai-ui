import type { ConsoleError } from '../ConsoleContext';

/**
 * The vault panels' line to the console they are mounted in.
 *
 * ⚠ MODULE-LEVEL ON PURPOSE. The panels were ported from Portify, where `reportErrorToPorter`
 * and the API calls are plain functions called from `catch` blocks and handlers, not hooks.
 * `AiVault` binds this to its provider when it mounts, so those call sites stay as they were
 * and the port stays reviewable line by line against the original.
 */
export interface VaultBridge {
  request: <T>(method: string, path: string, options?: { query?: Record<string, unknown>; body?: unknown; quiet?: boolean }) => Promise<T>;
  reportError: (error: unknown) => void;
  notify: (notice: { title: string; description?: string; variant?: string }) => void;
}

let bridge: VaultBridge | null = null;

export function bindVault(next: VaultBridge): void {
  bridge = next;
}

export function vault(): VaultBridge {
  if (!bridge) throw new Error('The AI vault must be rendered by <AiVault> inside <AiConsoleProvider>.');
  return bridge;
}

/** `reportErrorToPorter` in the original: a ConsoleError was already reported by the request layer. */
export function reportErrorToPorter(error: unknown): void {
  if (error && typeof error === 'object' && (error as ConsoleError).name === 'ConsoleError') return;
  bridge?.reportError(error);
}
