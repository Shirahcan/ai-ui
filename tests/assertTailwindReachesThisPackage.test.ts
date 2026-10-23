import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assertTailwindReachesThisPackage,
  resetTailwindCheckForTests,
} from '../src/assertTailwindReachesThisPackage';

/**
 * The check that tells a host its Tailwind is not scanning this package.
 *
 * ⚠ WHY THIS IS TESTED AT ALL. The thing being guarded is a SILENT failure that has bitten
 * three adopters, so a guard that silently did nothing would be indistinguishable from the
 * bug it was added for. Both positions are asserted, and so is the once-per-page behaviour -
 * a check that fired on every panel mount would be noise, and noise gets filtered.
 */
describe('assertTailwindReachesThisPackage', () => {
  let error: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetTailwindCheckForTests();
    error = vi.spyOn(console, 'error').mockImplementation(() => {});
    document.head.querySelectorAll('style[data-test-tw]').forEach((n) => n.remove());
  });

  afterEach(() => {
    error.mockRestore();
    document.head.querySelectorAll('style[data-test-tw]').forEach((n) => n.remove());
  });

  /** Stand in for the host's generated stylesheet. */
  function generate(css: string): void {
    const style = document.createElement('style');
    style.setAttribute('data-test-tw', '');
    style.textContent = css;
    document.head.appendChild(style);
  }

  it('complains when the marker class resolves to nothing', () => {
    assertTailwindReachesThisPackage();

    expect(error).toHaveBeenCalledTimes(1);
    const said = String(error.mock.calls[0]?.[0] ?? '');
    // The message has to carry the FIX, not just the diagnosis: a reader who sees this has
    // no reason to know which of two Tailwind majors they are on.
    expect(said).toContain('@shirahcan/ai-ui');
    expect(said).toContain('@source');
    expect(said).toContain('min-h-0');
  });

  it('stays quiet when the host does generate the class', () => {
    generate('.self-start { align-self: flex-start; }');

    assertTailwindReachesThisPackage();

    expect(error).not.toHaveBeenCalled();
  });

  /**
   * ⚠ A PRODUCT MAY REDEFINE THE UTILITY, and a check that insisted on `flex-start` would
   * cry wolf at a host whose classes work perfectly. The question is only whether the class
   * resolves to anything at all.
   */
  it('accepts a host that defines the class differently', () => {
    generate('.self-start { align-self: start; }');

    assertTailwindReachesThisPackage();

    expect(error).not.toHaveBeenCalled();
  });

  it('speaks once per page, however many panels mount', () => {
    assertTailwindReachesThisPackage();
    assertTailwindReachesThisPackage();
    assertTailwindReachesThisPackage();

    expect(error).toHaveBeenCalledTimes(1);
  });

  it('leaves no probe element behind', () => {
    const before = document.body.childElementCount;

    assertTailwindReachesThisPackage();

    expect(document.body.childElementCount).toBe(before);
  });
});
