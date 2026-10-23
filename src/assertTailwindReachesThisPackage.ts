/**
 * Say so, loudly, when the host's Tailwind is not generating this package's classes.
 *
 * ⚠ WHY THIS EXISTS RATHER THAN A SHIPPED STYLESHEET. This package emits ~40 Tailwind
 * utilities of its own for the parts a product does not override, and Tailwind generates
 * only what it finds by scanning `content` - which excludes `node_modules`. The README has
 * documented the one line needed since 1.3, and it has still bitten three adopters,
 * because the failure is INVISIBLE: a host that happens to use the same utilities elsewhere
 * renders correctly BY COINCIDENCE, and the one that does not loses `min-h-0`, whose
 * absence stops the message list shrinking and therefore scrolling at all.
 *
 * ⚠ THE OBVIOUS ALTERNATIVE WAS COSTED AND DECLINED, 2026-10-23. `calendar-ui` and
 * `video-embed` each ship `dist/styles.css` with namespaced classes (`cal-*`, `ve-*`) and
 * need no host scanning, which makes them look like the pattern to copy. For this package
 * it would mean adding Tailwind and a CSS build step to a tsup-only bundle, rewriting every
 * component's class names, and changing the rendered appearance of Porter's live panel - and
 * it buys only the ability to run in a host with no Tailwind, which no consumer in this
 * estate is. ⚠ Auto-importing a stylesheet from the entry point is worse still: the CJS
 * build exists so a product's jest can `require()` this package, and a `.css` side-effect
 * import breaks exactly that.
 *
 * So the fix is to make the silent failure loud, in the only place that can actually detect
 * it - the running app. Development only, once per page, and it costs a detached element.
 */

let alreadyChecked = false;

/**
 * ⚠ READ WITHOUT DEPENDING ON NODE'S TYPES. This package has no `@types/node` and should
 * not grow one for a single env read: it is a browser component library, and bundlers
 * replace `process.env.NODE_ENV` as a string at build time whether or not Node types exist.
 */
function isProduction(): boolean {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;

  return env?.env?.NODE_ENV === 'production';
}

/**
 * ⚠ THE MARKER IS `self-start`, AND THE TWO REJECTED CANDIDATES ARE THE INTERESTING PART.
 *
 * Not `min-h-0`, the load-bearing one: `min-height` computes to `0px` on a plain element
 * anyway, so the class is indistinguishable from its own absence. The class whose loss
 * actually breaks the panel is the one class that cannot be used to detect itself.
 *
 * Not `rounded-full` either, which was the first attempt and failed its own test: jsdom does
 * not expand the `border-radius` SHORTHAND into `borderTopLeftRadius`, so the check reported
 * "not generated" against a stylesheet that plainly generated it. A marker has to be a
 * LONGHAND to be readable everywhere the check runs.
 *
 * `align-self` is a longhand, `self-start` sets it to `flex-start`, and its default is
 * `auto`.
 */
const MARKER_CLASS = 'self-start';

const ADVICE = [
  '[ai-ui] The host is not generating this package\'s Tailwind classes, so the assistant',
  'panel will render wrongly - most visibly, the message list will not scroll, because',
  '`min-h-0` is missing and a flex child will not shrink below its content without it.',
  '',
  'Tailwind 3 - add this to `content` in tailwind.config:',
  "  './node_modules/@shirahcan/ai-ui/dist/**/*.{js,cjs,mjs}'",
  '',
  'Tailwind 4 - add this to the stylesheet that imports tailwind:',
  '  @source "../node_modules/@shirahcan/ai-ui/dist";',
  '',
  'This message appears in development only.',
].join('\n');

/**
 * Called on panel mount. Returns silently in production, and whenever there is no DOM to
 * ask (SSR, a jsdom-less test), because an answer we cannot get is not a failure to report.
 */
export function assertTailwindReachesThisPackage(): void {
  if (alreadyChecked) return;
  if (isProduction()) return;
  if (typeof document === 'undefined' || typeof getComputedStyle !== 'function') return;

  alreadyChecked = true;

  const probe = document.createElement('div');
  probe.className = MARKER_CLASS;
  probe.setAttribute('aria-hidden', 'true');
  // Out of the way and out of the layout, so a probe can never be seen or measured.
  probe.style.position = 'absolute';
  probe.style.visibility = 'hidden';
  probe.style.pointerEvents = 'none';

  try {
    document.body.appendChild(probe);
    const alignSelf = getComputedStyle(probe).alignSelf;

    /*
     * ⚠ "NOT THE DEFAULT" RATHER THAN "EQUALS flex-start". A product may legitimately
     * redefine the utility, and a check that insisted on one value would cry wolf at a host
     * whose classes work perfectly. The question here is only whether the class resolves to
     * ANYTHING, which is what distinguishes "not generated" from "generated differently".
     */
    const resolved = alignSelf !== '' && alignSelf !== 'auto' && alignSelf !== 'normal';

    if (!resolved) {
      // eslint-disable-next-line no-console -- the whole purpose is to be seen
      console.error(ADVICE);
    }
  } catch {
    // A DOM that refuses a detached div tells us nothing about Tailwind. Stay quiet.
  } finally {
    probe.remove();
  }
}

/** Test seam: the check runs once per page, so a second case needs the flag cleared. */
export function resetTailwindCheckForTests(): void {
  alreadyChecked = false;
}
