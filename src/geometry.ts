/**
 * The SHAPE of an assistant panel: one set of dimensions, paddings and type sizes
 * for every product in the estate.
 *
 * ⚠ THIS IS THE HALF P18a-d DID NOT FIX, AND THE OWNER HAD TO SAY SO TWICE.
 * Sharing the feedback control, the bubble, the intro, the composer and the history
 * list made every PART the same and left every panel a different SIZE and shape:
 * Porter's card is 34rem by 40rem with a 1.75rem radius, a 20px list and a 15px
 * bubble; Mira's was 400px by 560px with a 16px radius, a 16px list and a 14px
 * bubble. Two panels built from identical components still did not look like one
 * product, and a layout change still had to be made twice.
 *
 * ⚠ GEOMETRY IS SHARED. COLOUR IS NOT. That is the whole split, and it is why
 * there is nothing in this file but structure - no `bg-`, no `text-slate-`, no
 * border colour, no shadow. A product composes its own palette ON TOP:
 *
 * ```tsx
 * className={`${ASSISTANT_GEOMETRY.bubble} border border-white bg-white/80 text-slate-700`}
 * className={`${ASSISTANT_GEOMETRY.bubble} bg-gray-100 text-[#152237]`}
 * ```
 *
 * ⚠ PORTIFY'S VALUES ARE THE SOURCE, which makes Portify's adoption a no-op and
 * every other product's adoption a visible change. That is the owner's decision:
 * Porter is the blueprint. It does NOT make Portify the owner - a change here
 * changes every product, which is the point of it being here.
 */
export const ASSISTANT_GEOMETRY = {
  /** The scrolling message list. `min-h-0` is load-bearing in a flex column. */
  list: 'flex-1 min-h-0 space-y-3 overflow-y-auto p-5',

  /** One speaker's row. */
  row: 'flex w-full',

  /**
   * The bubble.
   *
   * ⚠ `max-w-[85%]` IS NOT DECORATION. A bubble that can reach the full width of a
   * 34rem panel gives the eye no edge to return to, and the two speakers stop being
   * distinguishable by shape.
   */
  bubble: 'max-w-[85%] rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed',
  /** For a row that sets its own layout inside: a data table, an action module. */
  bubbleWide: 'w-full rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed',
  /** The ungrounded caveat under an answer. */
  caveat: 'mt-1.5 block text-[11px] font-bold uppercase tracking-wider',

  /** The typing area and its two controls. */
  composer: 'flex items-end gap-2.5 p-3.5',
  composerInput: 'flex-1 resize-none overflow-y-auto rounded-2xl px-4 py-3 text-sm leading-6',
  composerButton: 'shrink-0 rounded-full px-6 py-3 text-sm font-semibold whitespace-nowrap',

  /** The header: the panel's name, its actions, and the way out. */
  header: 'flex items-center justify-between px-5 py-3.5',
  headerTitle: 'text-base font-semibold',
  headerSubtitle: 'text-xs',
  headerActions: 'flex items-center gap-2',
  headerAction: 'rounded-full px-4 py-1.5 text-sm font-semibold outline-none whitespace-nowrap',
  headerClose: 'rounded-full px-2 text-2xl leading-none outline-none',

  /** The empty state. */
  intro: 'space-y-3',
  introGreeting: 'text-sm font-semibold',
  introBody: 'text-sm leading-relaxed',
  introPromptsLabel: 'text-xs font-medium uppercase tracking-wide',
  introPrompts: 'space-y-1.5',
  introPrompt: 'block w-full rounded-xl px-3 py-2 text-left text-sm outline-none',

  /** Thread history. */
  historyList: 'space-y-1 p-2',
  historyRow: 'flex items-center gap-2 rounded-xl px-2 py-1.5',
  historyIcon: 'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
  historyTitle: 'block truncate text-sm font-medium',
  historyMeta: 'block text-xs',
  historyConfirmRow: 'flex items-center gap-2 rounded-xl px-3 py-2.5',
  historyConfirmButton: 'rounded-full px-3 py-1 text-xs font-semibold outline-none whitespace-nowrap',
} as const;

/**
 * The floating card's own dimensions, as inline style rather than classes.
 *
 * ⚠ INLINE ON PURPOSE, AND THIS IS THE ONE PLACE IN THE PACKAGE WHERE THAT IS THE
 * RIGHT ANSWER. Classes compose by appending, and two `h-` utilities in one
 * attribute are decided by whichever rule happens to come later in the compiled
 * stylesheet - so a product that passed its own height would win or lose
 * unpredictably between builds. The dimensions are the thing the owner asked to be
 * the same everywhere, so they are set where a class cannot quietly beat them.
 *
 * ⚠ `--floating-dock-offset` IS READ, NOT ASSUMED. A product that lifts its
 * floating controls (a cookie bar, a sticky footer) sets that variable, and the
 * panel's maximum height has to come down by the same amount or it runs off the top.
 */
export const ASSISTANT_PANEL_SIZE = {
  width: '34rem',
  height: '40rem',
  maxWidth: 'calc(100vw - 2.5rem)',
  maxHeight: 'calc(100vh - 12rem - var(--floating-dock-offset, 0px))',
  borderRadius: '1.75rem',
} as const;
