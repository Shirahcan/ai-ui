/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';

// Read through Vite rather than node:fs: this package carries no Node types (it is a browser library).
const SOURCES = import.meta.glob('../src/editor/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

/**
 * ⚠ A DEFAULT IMPORT FROM A TIPTAP PACKAGE BREAKS EVERY PRODUCT'S JEST (1.62.2). The CJS bundle interops in Node mode,
 * where `default` is the whole `module.exports`, so `StarterKit.configure` was not a function under Portify's jest
 * while Next (ESM) rendered fine: every round-trip test went red the moment the editor moved here. Named imports
 * resolve the same in both formats.
 */
describe('the editor entry imports TipTap by name', () => {
  it('has no default import from any @tiptap package', () => {
    expect(Object.keys(SOURCES).length).toBeGreaterThan(3);
    const offenders = Object.entries(SOURCES)
      .flatMap(([f, source]) => (source.match(/^import\s+[A-Za-z_$][\w$]*\s*(,\s*\{[^}]*\})?\s+from\s+'@tiptap\/[^']+';/gm) ?? []).map((line) => `${f}: ${line}`));

    expect(offenders).toEqual([]);
  });
});
