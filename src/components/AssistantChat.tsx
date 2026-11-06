import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { formatZonedDate, useDisplayTimezone } from '@shirahcan/calendar-ui';
import { type AssistantThread } from './AssistantHistory';
import { ThreadList } from './ThreadList';
import { answerTime, dayLabel, elapsed, sameDay } from '../chatTime';
import {
  AssistantMessageBody,
  type AssistantMessageHandlers,
} from './AssistantMessageBody';
import {
  AssistantFeedback,
  type AssistantFeedbackPayload,
} from './AssistantFeedback';
import { AssistantIntro } from './AssistantIntro';
import { AssistantPanel } from './AssistantPanel';
import { AssistantSurface, type AssistantSurfaceAttributes } from './AssistantSurface';
import { Composer } from './Composer';
import { MessageAttachmentChips, withoutAttachedLine, type ComposerAttachmentsConfig } from './ComposerAttachments';
import { HumanCheck } from './HumanCheck';
import { MessageActions } from './MessageActions';
import { MessageBubble } from './MessageBubble';
import { ASSISTANT_GEOMETRY } from '../geometry';
import { readFollowUps, readKind, readMeta, readReadFrom } from '../messages/kinds';
import { canReadAloud, speak, stopSpeaking } from '../speech/readAloud';
import type { ComposerMentionsConfig, ComposerSlashCommand } from './ComposerPicker';
import { downloadConversationText, printConversation, readRenderedTurns } from '../conversationCopy';
import { CollapseIcon, DownloadIcon, ExpandIcon, MenuIcon, PencilIcon, PlusIcon, PrintIcon } from '../icons';
import { themeToVars, type AssistantTheme } from '../theme';
import type { MarkdownTheme } from '../markdown';
import type { AttachmentChip, PanelMessage } from '../types';
import type { AssistantInputKind, AssistantTurnOptions } from '../useAssistantConversation';
import type { DictationConfig } from '../dictation/session';
import type { AssistantHumanCheck } from '../useAssistantConversation';

/**
 * THE assistant panel. Not parts of one - the whole thing, drawn here.
 *
 * ⚠ IT EXISTS BECAUSE SHARING THE PARTS WAS NOT SHARING THE PANEL, AND THE
 * OWNER HAD TO SAY SO THREE TIMES. P18a-d gave three products the same bubble,
 * composer, intro, feedback control and history list. P18e then gave them the
 * same card size, because identical parts in different frames still did not look
 * like one product. Both were true and neither was enough: what stayed
 * duplicated was the ASSEMBLY - which slot holds what, which geometry constant
 * goes on which element, which colour class is appended to it. Measured before
 * this file existed: three panels, 1,821 lines between them, passing 25
 * `*ClassName` props. Duplicate composition drifts exactly like duplicate code,
 * and it had - Porter drew an assistant answer as unbubbled prose and Mira drew
 * it as a grey box, because `bubbleClassName` was a free string that no type, no
 * test and no lint rule had an opinion about.
 *
 * ⚠ SO A PRODUCT PASSES A PALETTE AND ITS DATA, AND NOTHING ELSE. There is no
 * className slot on this component, no geometry constant a product has to
 * remember to concatenate, and no layout decision left outside this file. The
 * theme is hex values (`AssistantTheme`), which cannot change the shape of
 * anything; the only classes a product may supply are `theme.card`, for the
 * POSITION, shadow and blur that genuinely differ (Porter floats above a stack
 * of two buttons behind glass; Mira floats above one on a flat card).
 *
 * ⚠ AND THE MESSAGE BODY IS NOT A SLOT EITHER. The first cut of this file
 * kept a `renderMessageBody` hatch "for Porter's action modules and CTA cards",
 * which was the same mistake one level down: ai-service sends the same `kind`
 * and `meta` to every product, and the frames those things are drawn in are no
 * more immigration-shaped than a bubble is. Leaving them to the product is
 * precisely why MployNow had no renderer for a confirm card or a data table at
 * all. `AssistantMessageBody` draws every kind; `handlers` says what the buttons
 * DO, and a handler that is not supplied hides its control rather than rendering
 * a dead button. The one thing a product still supplies is the FIELDS of an
 * action's own form, because "add a case note" is a Portify form - the card
 * around it is drawn here.
 *
 * ⚠ SO THE ONLY SLOT LEFT IS `footer`, the line under the composer that exists
 * in one product (Mira's "Sign in to raise a tracked support request"). Anything
 * that is a COLOUR belongs in the theme and anything that is a SHAPE belongs in
 * this file.
 *
 * ⚠ IT STILL NEVER CALLS ai-service. The service holds every provider key in
 * the estate and is loopback-only; `onSend` is the product's own turn.
 *
 * ```tsx
 * <AssistantChat
 *   theme={MIRA_THEME}
 *   title="Mira"
 *   messages={rows}
 *   busy={pending}
 *   onSend={send}
 *   intro={{ greeting: 'Hi, I am Mira.', prompts }}
 * />
 * ```
 */

/** A header control that is the PRODUCT's, expressed as data rather than markup. */
export interface AssistantChatAction {
  key: string;
  label: string;
  onClick: () => void;
  /** Renders as a toggle. */
  pressed?: boolean;
  title?: string;
}

/**
 * The conversation list, and everything the panel needs to draw it.
 *
 * ⚠ PASSING THIS IS WHAT PUTS "New conversation" AND THE RECENT LIST IN THE SIDEBAR (the
 * menu button beside the name, since 1.25.0), and the open
 * or closed state of the history view lives in this component. Both products
 * used to carry their own `showHistory` boolean and their own loading, failed
 * and empty states for the same list.
 */
export interface AssistantChatThreads {
  items: AssistantThread[];
  activeId?: string | null;
  onSelect: (id: string) => void;
  onDelete?: (id: string) => void;
  deleting?: boolean;
  deleteFailed?: boolean;
  /** Defaults to `ready`. A product that fetches on open reports it here. */
  status?: 'loading' | 'ready' | 'failed';
  /** Shown as "Try again" on a failed load. Also called when History opens. */
  onReload?: () => void;
  emptyTitle?: string;
  emptyBody?: string;
  /** The product's icon library, since this package depends on none. */
  icon?: ReactNode;
  deleteIcon?: ReactNode;
  /** Starting a fresh thread. Omit it and no "New" control is drawn. */
  onNew?: () => void;

  /*
   * 1.37.0 (owner 2026-11-06): a list that scales and can be found in. Each control appears only when
   * its handler is supplied.
   */
  /** Group under Pinned, Today, Yesterday, Previous 7 days, Older (viewer's calendar). */
  groupByDay?: boolean;
  /** Rename, from the row's kebab. */
  onRename?: (id: string, title: string) => void;
  /** Pin or unpin, from the row's kebab. */
  onPin?: (id: string, pinned: boolean) => void;
  /** A search box over the list: called (debounced, 2+ characters) with the words; '' clears. */
  onSearch?: (q: string) => void;
  /** What the product's search found, for the words it was last given. */
  search?: {
    status: 'idle' | 'loading' | 'ready' | 'failed';
    results: AssistantThread[];
    /** The service stopped at the newest conversations; say so rather than imply the rest do not exist. */
    capped?: boolean;
  };
  /** More, older conversations exist: a "Load older conversations" button at the end. */
  hasMore?: boolean;
  onLoadMore?: () => void;
  loadingMore?: boolean;
}

/**
 * Rating an answer.
 *
 * ⚠ THE CONTROL IS DRAWN HERE, NOT PASSED IN. Both products already used the
 * estate's `AssistantFeedback`, and both still styled it with six class props
 * each and decided for themselves which rows could be rated - so the same
 * control sat at different sizes, in different colours, under different rules
 * about whether an optimistic row could be rated. The product supplies the call
 * and nothing else.
 */
export interface AssistantChatFeedback {
  onSubmit: (payload: AssistantFeedbackPayload & { messageId: string }) => Promise<void>;
  /**
   * Which rows may be rated.
   *
   * ⚠ THE DEFAULT EXCLUDES A ROW THE SERVER HAS NOT ACKNOWLEDGED. An optimistic
   * id is this tab's placeholder, so there is nothing for feedback to be about
   * yet and posting it would 404 against an id the backend never issued.
   */
  canRate?: (message: PanelMessage) => boolean;
  upIcon?: ReactNode;
  downIcon?: ReactNode;
  maxTextLength?: number;
}

export interface AssistantChatIntro {
  greeting: string;
  body?: ReactNode;
  prompts?: string[];
  promptsLabel?: string;
}

export interface AssistantChatComposer {
  placeholder?: string;
  maxLength?: number;
  id?: string;
  name?: string;
  /** The recall ring the arrow keys walk. */
  history?: string[];
  /** Send is unavailable but the box still accepts what is typed. */
  sendDisabled?: boolean;
  /** Enter mid-answer sends, for a product whose turn loop supersedes. */
  sendWhileBusy?: boolean;
  /**
   * Files on a message (1.29.0): the paperclip, drag-and-drop and paste. Omit it and there is none.
   * The product's `onUpload` stores the file; `onSend` then receives the chips with the text.
   */
  /** Speak instead of typing (1.32.0): a microphone in the composer. The product's route transcribes. */
  dictation?: DictationConfig;
  attachments?: ComposerAttachmentsConfig & {
    /** The words sent when a message is files alone. Default "Here is a file." */
    emptyText?: string;
  };
}

/**
 * The panel's optional extras (1.34.0, owner 2026-11-06). Each is off until a product asks for it, so
 * a product that upgrades sees no change; Portify turns them on behind its own gate.
 */
export interface AssistantChatExtras {
  /** A speaker on each answer: the browser reads it aloud, on the device. */
  readAloud?: boolean;
  /** BCP 47 voice language, e.g. `fr-CA`. Defaults to the page's `lang`. */
  speechLang?: string;
  /** Hands-free conversation (needs `composer.dictation`): talk, it sends, the answer is read back. */
  handsFree?: boolean;
  /** Edit on the person's latest question: it goes back into the box to change and send. */
  editLast?: boolean;
  /** "Ask again" on the latest answer: the same question, sent again as a new turn. */
  askAgain?: boolean;
  /** "@" in the box: the product's search (cases, clients, meetings), written into the message. */
  mentions?: ComposerMentionsConfig;
  /** "/" at the start of the box: what the assistant can do here. */
  slashCommands?: ComposerSlashCommand[];
  /** "Use this" on an answer: where its words can go (the message box, a note, an email). */
  useThis?: Array<{ key: string; label: string; onUse: (text: string, message: PanelMessage) => void }>;
  /** Chips naming the records an answer was read from (`meta.read_from`); `onOpenSource` opens one in-app. */
  sources?: boolean;
  onOpenSource?: (href: string) => void;
  /**
   * When each message was said (1.37.0, owner 2026-11-06): the time on each answer's action row, a
   * quiet divider at each new day, "working for 2 min" on background work, and times in the exports.
   * Reads `PanelMessage.at`, in the viewer's clock (calendar-ui `useDisplayTimezone`), zone named.
   */
  timeline?: boolean;
}

export interface AssistantChatProps {
  /** The product's palette. Hex values; no classes but `card`. */
  theme: AssistantTheme;

  title: ReactNode;
  subtitle?: ReactNode;
  label?: string;
  onClose?: () => void;
  closeLabel?: string;

  messages: PanelMessage[];
  busy?: boolean;
  stage?: string | null;
  error?: string | null;
  /** A soft, non-error line above the list. */
  notice?: ReactNode;

  /**
   * The person's words. With files, the second argument carries them as the turn options
   * `useAssistantConversation().send` takes, so `onSend={conversation.send}` still fits.
   */
  onSend: (text: string, turn?: AssistantTurnOptions) => void;
  onStop?: () => void;
  onRetry?: () => void;

  intro?: AssistantChatIntro;
  onPrompt?: (prompt: string) => void;
  /** Replaces the intro entirely: a skeleton while a thread restores. */
  renderEmpty?: () => ReactNode;

  threads?: AssistantChatThreads;
  /**
   * The product's own items, listed in the sidebar under "New conversation" (Porter: "What Porter
   * knows about you"). Since 1.25.0 they are no longer header buttons.
   */
  actions?: AssistantChatAction[];
  /**
   * What this conversation is about, shown beside the close button. Defaults to the active thread's
   * title from `threads`; long titles are cut with an ellipsis and kept whole in the tooltip.
   */
  conversationTitle?: string | null;

  composer?: AssistantChatComposer;
  markdownTheme?: MarkdownTheme;

  /** What this product's actions DO. The cards they live in are drawn here. */
  handlers?: AssistantMessageHandlers;
  /** Rating an answer. Omit it and no thumbs are drawn. */
  feedback?: AssistantChatFeedback;
  /** One line under the composer. */
  footer?: ReactNode;
  /** Read aloud, hands-free, edit, ask again, "@", "/", "Use this", sources (1.34.0). */
  extras?: AssistantChatExtras;
  /**
   * The bot check for a panel anybody can reach: pass `conversation.humanCheck` straight through.
   * The panel draws it, pads it only while Cloudflare asks for a click, and says why a question
   * is waiting. A product writes no Turnstile code of its own.
   */
  humanCheck?: AssistantHumanCheck;
  /**
   * A copy or export the browser refused (clipboard blocked, print view failed). Not an API error, so the
   * product reports it its own way (Portify: `reportErrorToPorter`). Omitted, the failure is silent.
   */
  onClientError?: (error: unknown) => void;
  /** Offer the two "Export conversation" items in the menu. Default true. */
  exportable?: boolean;
  /**
   * An "Expand" button in the header (1.37.0, owner 2026-11-06): a large, viewport-bounded view for
   * wide tables and long answers. Escape or the same button returns to the small panel. Uncontrolled
   * unless `expanded` is passed; `onExpandedChange` hears every change either way.
   */
  expandable?: boolean;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
}

/**
 * The sidebar's entrance (1.37.2): a drawer slides in from the card's edge and its scrim fades in.
 *
 * ⚠ A STYLE ELEMENT, NOT TAILWIND KEYFRAMES. An arbitrary `animate-[...]` class needs keyframes in the
 * PRODUCT's Tailwind config, which this package cannot add; these few rules travel with the panel.
 * Motion is skipped for a reader who asked the system for less of it.
 */
const SIDEBAR_MOTION = `
@keyframes aiui-slide-in { from { transform: translateX(-100%); } to { transform: translateX(0); } }
@keyframes aiui-fade-in { from { opacity: 0; } to { opacity: 1; } }
.aiui-slide-in { animation: aiui-slide-in 220ms cubic-bezier(0.2, 0.8, 0.2, 1); }
.aiui-fade-in { animation: aiui-fade-in 180ms ease-out; }
@media (prefers-reduced-motion: reduce) { .aiui-slide-in, .aiui-fade-in { animation: none; } }
`;

/** Shown while a question waits on the bot check. It sends itself; nobody presses Send again. */
const HUMAN_CHECK_NOTICE =
  'Just a moment - checking your browser. If a "Verify you are human" box appears below, tick it and your question will send.';

/**
 * A row the server has acknowledged and that has something to rate.
 *
 * ⚠ AN OPTIMISTIC ID IS NOT A MESSAGE YET. Both products prefix one (`tmp-`,
 * `local-`); rating it would post against an id the backend never issued.
 */
function defaultCanRate(message: PanelMessage): boolean {
  return (
    message.role === 'assistant'
    && message.streaming !== true
    && message.text.trim() !== ''
    && !message.id.startsWith('tmp-')
    && !message.id.startsWith('local-')
  );
}

const FEEDBACK_BUTTON =
  'inline-flex h-7 w-7 items-center justify-center rounded-full text-[var(--ai-muted)]'
  + ' outline-none transition-colors hover:text-[var(--ai-accent)] disabled:opacity-50';
const FEEDBACK_CHIP =
  'whitespace-nowrap rounded-full border border-[var(--ai-border)] px-2 py-0.5 text-[11px]'
  + ' text-[var(--ai-muted)] outline-none transition-colors hover:bg-[var(--ai-accent-soft)]';
const FEEDBACK_CHIP_ON =
  'whitespace-nowrap rounded-full bg-[var(--ai-accent)] px-2 py-0.5 text-[11px]'
  + ' text-[var(--ai-accent-fg)] outline-none';
const FEEDBACK_SUBMIT =
  'whitespace-nowrap rounded-full bg-[var(--ai-accent)] px-3 py-1.5 text-[11px] font-semibold'
  + ' text-[var(--ai-accent-fg)] outline-none disabled:opacity-50';

export function AssistantChat({
  theme,
  title,
  subtitle,
  label,
  onClose,
  closeLabel = 'Close assistant',
  messages,
  busy = false,
  stage = null,
  error = null,
  notice,
  onSend,
  onStop,
  onRetry,
  intro,
  onPrompt,
  renderEmpty,
  threads,
  actions,
  conversationTitle,
  composer,
  markdownTheme,
  handlers,
  feedback,
  footer,
  humanCheck,
  onClientError,
  exportable = true,
  extras,
  expandable = false,
  expanded: expandedProp,
  onExpandedChange,
  ...attributes
}: AssistantChatProps & AssistantSurfaceAttributes) {
  /*
   * The conversations sidebar (owner, 2026-11-02): "New" and "History" left the header for a menu
   * button beside the assistant's name, like other chat apps. It holds a new conversation, the
   * product's own items and the recent conversations.
   */
  const [menuOpen, setMenuOpen] = useState(false);
  // The large view (1.37.0): controlled when the product passes `expanded`, else kept here.
  const [expandedState, setExpandedState] = useState(false);
  const isExpanded = expandable && (expandedProp ?? expandedState);
  const setExpanded = (next: boolean) => {
    setExpandedState(next);
    onExpandedChange?.(next);
  };
  // The reader's clock: this device's zone, or the one picked with "Show times in" (calendar-ui).
  const { timezone: zone } = useDisplayTimezone();
  const canExport = exportable && messages.some((m) => m.role === 'assistant' && m.text.trim() !== '');
  const hasMenu = Boolean(threads) || Boolean(actions?.length) || canExport;
  const activeTitle = (conversationTitle ?? threads?.items.find((t) => t.id === threads?.activeId)?.title ?? '').trim();
  const conversationRef = useRef<HTMLDivElement>(null);
  const assistantName = typeof title === 'string' ? title : 'Assistant';
  // Follow-ups belong to the answer the person is replying to: the newest message, when it is the assistant's.
  const last = messages[messages.length - 1];
  const followUpsFor = last?.role === 'assistant' && last.streaming !== true ? last.id : null;

  /** Export what is on screen, as drawn (owner, 2026-11-03): a print view for PDF, or a text file. */
  const exportAs = (how: 'pdf' | 'text') => {
    setMenuOpen(false);
    const container = conversationRef.current;
    if (!container) return;
    try {
      const turns = readRenderedTurns(container, { user: 'You', assistant: assistantName }, zone);
      const name = activeTitle !== '' ? activeTitle : `Conversation with ${assistantName}`;
      if (how === 'pdf') printConversation(name, turns);
      else downloadConversationText(name, turns);
    } catch (error) {
      onClientError?.(error);
    }
  };

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);

    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  // Escape leaves the large view, after the sidebar (which closes first if it is open).
  const collapseRef = useRef<() => void>(() => {});
  collapseRef.current = () => setExpanded(false);
  useEffect(() => {
    if (!isExpanded || menuOpen) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') collapseRef.current();
    };
    window.addEventListener('keydown', onKey);

    return () => window.removeEventListener('keydown', onKey);
  }, [isExpanded, menuOpen]);
  /*
   * ⚠ THE DRAFT LIVES HERE, NOT IN THE PANEL BELOW. `AssistantPanel.send`
   * refuses to send while busy, which is right for a panel with no supersede
   * path - but Porter's turn loop folds a mid-answer correction INTO the running
   * question, and reaching that used to mean each product writing its own
   * composer from scratch. Owning the draft is what lets `sendWhileBusy` be a
   * flag here rather than a reason to override the whole slot.
   */
  const [draft, setDraft] = useState('');

  /*
   * Read aloud and hands-free (1.34.0). One answer speaks at a time; in hands-free the microphone is
   * held closed while it does, or it would write the assistant's own voice into the box.
   */
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [handsFreeOn, setHandsFreeOn] = useState(false);
  const readAloudOn = (extras?.readAloud === true || extras?.handsFree === true) && canReadAloud();
  const say = (message: PanelMessage) => {
    if (speakingId === message.id) {
      stopSpeaking();
      setSpeakingId(null);
      return;
    }
    const started = speak(message.text, { lang: extras?.speechLang, onEnd: () => setSpeakingId((id) => (id === message.id ? null : id)) });
    setSpeakingId(started ? message.id : null);
  };
  // Hands-free: a finished answer is read back once, then the microphone reopens.
  const spokenRef = useRef<string | null>(null);
  useEffect(() => {
    if (!handsFreeOn || !last || last.role !== 'assistant' || last.streaming === true || last.text.trim() === '') return;
    if (spokenRef.current === last.id) return;
    spokenRef.current = last.id;
    const started = speak(last.text, { lang: extras?.speechLang, onEnd: () => setSpeakingId((id) => (id === last.id ? null : id)) });
    if (started) setSpeakingId(last.id);
  }, [handsFreeOn, last, extras?.speechLang]);
  useEffect(() => () => stopSpeaking(), []);
  const toggleHandsFree = () => {
    setHandsFreeOn((on) => {
      if (on) {
        stopSpeaking();
        setSpeakingId(null);
      } else if (last) {
        // Turning it on does not read out the answer already on screen.
        spokenRef.current = last.id;
      }
      return !on;
    });
  };
  const lastUserIndex = messages.map((m) => m.role).lastIndexOf('user');
  const lastUser = lastUserIndex >= 0 ? messages[lastUserIndex] : undefined;

  /*
   * When each message was said (1.37.0). A divider goes over the first dated row of each day in the
   * viewer's zone, and each answer's time names the question it answered. Off unless the product asks.
   */
  const timeline = extras?.timeline === true;
  const times = useMemo(() => {
    const dividers = new Map<string, { label: string; full: string }>();
    const asked = new Map<string, string>();
    if (!timeline) return { dividers, asked };
    let lastDated: string | null = null;
    let question: string | null = null;
    for (const m of messages) {
      if (m.role === 'user' && m.at) question = m.at;
      if (m.role === 'assistant' && question) asked.set(m.id, question);
      if (!m.at) continue;
      if (lastDated === null || !sameDay(lastDated, m.at, zone)) {
        const label = dayLabel(m.at, zone);
        if (label) dividers.set(m.id, { label, full: formatZonedDate(m.at, zone, 'long') });
      }
      lastDated = m.at;
    }

    return { dividers, asked };
  }, [timeline, messages, zone]);

  const answerTimeFor = (message: PanelMessage): { label: string; detail: string; iso: string } | undefined => {
    if (!timeline || !message.at || message.streaming === true) return undefined;
    const label = answerTime(message.at, zone);
    if (!label) return undefined;
    const question = times.asked.get(message.id);
    const askedLabel = question ? answerTime(question, zone) : null;
    const took = question ? elapsed(question, message.at) : null;
    const detail = askedLabel && took ? `Asked ${askedLabel}, answered ${took} later` : `Answered ${label}`;

    return { label, detail, iso: message.at };
  };

  const plain = theme.assistantBubble === 'plain';

  /*
   * ⚠ THE WIDTH DEPENDS ON THE KIND, exactly as Porter's has since it shipped.
   * An action form, a research answer and a table set their own layout inside the
   * bubble, and 85% of a 34rem panel is not enough to hold one. Prose keeps the
   * cap, which is what makes the two speakers tell apart by shape.
   */
  const WIDE_KINDS = ['action_module', 'research', 'data_table', 'data_tables'];

  const assistantBubble = (message: PanelMessage): string => {
    if (plain) {
      return `w-full text-[15px] leading-relaxed text-[var(--ai-bubble-assistant-fg)]`;
    }

    const wide = WIDE_KINDS.includes(readKind(message.kind));
    const shape = wide
      ? ASSISTANT_GEOMETRY.bubbleSurfaceWide
      : ASSISTANT_GEOMETRY.bubbleSurface;

    return `${shape} border-[var(--ai-bubble-assistant-border)]`
      + ' bg-[var(--ai-bubble-assistant-bg)] text-[var(--ai-bubble-assistant-fg)]';
  };

  const userBubble =
    `${ASSISTANT_GEOMETRY.bubble} border border-[var(--ai-bubble-user-border)]`
    + ' bg-[var(--ai-bubble-user-bg)] text-[var(--ai-bubble-user-fg)]';

  const toggleMenu = () => {
    if (!menuOpen) threads?.onReload?.();
    setMenuOpen((open) => !open);
  };

  // A draft put back for editing (the pencil): its next send is recorded as an edit.
  const editingRef = useRef(false);

  const send = (text: string, files: AttachmentChip[] = [], input: AssistantInputKind = 'typed') => {
    let trimmed = text.trim();
    if (trimmed === '' && files.length > 0) {
      trimmed = composer?.attachments?.emptyText ?? (files.length > 1 ? 'Here are some files.' : 'Here is a file.');
    }
    if (trimmed === '') return;
    setDraft('');
    const how: AssistantInputKind = input;
    editingRef.current = false;
    // How it was asked rides along (1.36.0); a product that ignores it sees the same text as before.
    onSend(trimmed, files.length > 0 ? { attachments: files, input: how } : { input: how });
  };

  return (
    <AssistantSurface
      title={title}
      subtitle={subtitle}
      label={label ?? (typeof title === 'string' ? title : undefined)}
      onClose={onClose}
      closeLabel={closeLabel}
      className={theme.card}
      style={themeToVars(theme)}
      leading={
        hasMenu ? (
          <button
            type="button"
            onClick={toggleMenu}
            aria-label={menuOpen ? 'Close the menu' : 'Open the menu: new conversation and history'}
            aria-expanded={menuOpen}
            aria-controls="assistant-sidebar"
            title="Menu"
            className="-ml-2 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--ai-fg)] outline-none transition-colors hover:bg-[var(--ai-accent-soft)] focus-visible:bg-[var(--ai-accent-soft)]"
          >
            <MenuIcon />
          </button>
        ) : undefined
      }
      actions={
        activeTitle !== '' || expandable ? (
          <>
            {activeTitle !== '' ? (
              <span
                className={`block min-w-0 ${isExpanded ? 'max-w-[32rem]' : 'max-w-[14rem]'} truncate text-sm font-medium text-[var(--ai-muted)]`}
                title={activeTitle}
              >
                {activeTitle}
              </span>
            ) : null}
            {expandable ? (
              <button
                type="button"
                onClick={() => setExpanded(!isExpanded)}
                aria-label={isExpanded ? 'Back to the small panel' : 'Expand'}
                aria-pressed={isExpanded}
                title={isExpanded ? 'Back to the small panel' : 'Expand'}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--ai-muted)] outline-none transition-colors hover:bg-[var(--ai-accent-soft)] hover:text-[var(--ai-fg)] focus-visible:bg-[var(--ai-accent-soft)]"
              >
                {isExpanded ? <CollapseIcon /> : <ExpandIcon />}
              </button>
            ) : null}
          </>
        ) : undefined
      }
      expanded={isExpanded}
      {...attributes}
    >
      {/*
        ⚠ THE CONVERSATION FILLS THE CARD IN BOTH SIZES (owner, 2026-11-06). 1.37.0 boxed it into a
        centred column inside the large view, which left empty strips either side AND anchored the
        sidebar to the column instead of the card's edge. The large card's own width keeps lines readable.
      */}
      <div ref={conversationRef} className="relative flex min-h-0 flex-1 flex-col">
        <style>{SIDEBAR_MOTION}</style>
        <AssistantPanel
          messages={messages}
          busy={busy}
          stage={stage}
          error={error}
          onSend={send}
          onStop={onStop}
          onRetry={onRetry}
          label={typeof title === 'string' ? title : 'Assistant conversation'}
          className="flex min-h-0 flex-1 flex-col"
          listClassName={ASSISTANT_GEOMETRY.list}
          header={
            notice || humanCheck?.waiting ? (
              <p className="mx-5 mt-5 rounded-xl bg-[var(--ai-accent-soft)] px-3 py-2 text-sm text-[var(--ai-muted)]">
                {notice || HUMAN_CHECK_NOTICE}
              </p>
            ) : undefined
          }
          renderDivider={(message) => {
            const divider = times.dividers.get(message.id);
            if (!divider) return null;

            // Quiet, outside every copy source: Copy and Export never read it.
            return (
              <div
                role="separator"
                aria-label={divider.full}
                data-ai-no-copy=""
                className="my-2 flex items-center gap-3 px-5 text-[11px] font-medium text-[var(--ai-muted)]"
              >
                <span aria-hidden="true" className="h-px flex-1 bg-[var(--ai-border)]" />
                <span>{divider.label}</span>
                <span aria-hidden="true" className="h-px flex-1 bg-[var(--ai-border)]" />
              </div>
            );
          }}
          renderBubble={(message) => {
            /*
             * ⚠ ONLY AN ASSISTANT ROW GETS A BODY RENDERER. A person's own
             * words never pass through Markdown or a kind switch - somebody
             * typing `**` means those characters, and a question pasted from a
             * document must not come back reinterpreted.
             */
            // The marked wrapper is what Copy and Export read: the words as drawn, never the controls.
            const body =
              message.role === 'user' ? (
                <div
                  data-ai-copy-source=""
                  data-ai-export-role="user"
                  data-ai-export-at={timeline && message.at ? message.at : undefined}
                  title={timeline && message.at ? `Sent ${answerTime(message.at, zone) ?? ''}`.trim() : undefined}
                >
                  {/* Files as chips (their NAMES reach Copy and Export; never their contents). */}
                  {message.attachments && message.attachments.length > 0 ? (
                    <MessageAttachmentChips attachments={message.attachments} />
                  ) : null}
                  <p className="whitespace-pre-wrap">
                    {message.attachments && message.attachments.length > 0
                      ? withoutAttachedLine(message.text)
                      : message.text}
                  </p>
                </div>
              ) : (
                <div
                  data-ai-copy-source=""
                  data-ai-export-role="assistant"
                  data-ai-export-at={timeline && message.at ? message.at : undefined}
                >
                  <AssistantMessageBody
                    message={message}
                    handlers={handlers}
                    markdownTheme={markdownTheme}
                  />
                  {timeline && message.streaming === true && message.at && (message.deferred?.length ?? 0) > 0 ? (
                    <StillWorkingFor since={message.at} />
                  ) : null}
                </div>
              );
            const rateable = feedback !== undefined && (feedback.canRate ?? defaultCanRate)(message);
            const isLatestAnswer = message.id === followUpsFor;
            const finished = message.streaming !== true && message.text.trim() !== '';

            return (
              <MessageBubble
                message={{ ...message, content: body }}
                markdownTheme={markdownTheme}
                className={`${ASSISTANT_GEOMETRY.row} ${
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
                bubbleClassName={assistantBubble(message)}
                userBubbleClassName={userBubble}
                contentClassName="break-words [&_a]:break-words"
                confidenceClassName={`${ASSISTANT_GEOMETRY.caveat} text-[var(--ai-muted)]`}
                footer={
                  message.role === 'user' ? (
                    extras?.editLast && message.id === lastUser?.id && !busy ? (
                      <div data-ai-no-copy="" className="mt-1 flex justify-end">
                        <button
                          type="button"
                          onClick={() => { editingRef.current = true; setDraft(withoutAttachedLine(message.text)); }}
                          aria-label="Edit this question"
                          title="Edit"
                          className="inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-full px-2 text-xs text-[var(--ai-muted)] outline-none transition-colors hover:text-[var(--ai-accent)] focus-visible:text-[var(--ai-accent)]"
                        >
                          <PencilIcon /> Edit
                        </button>
                      </div>
                    ) : undefined
                  ) : message.role === 'assistant' ? (
                    <MessageActions
                      canCopy={message.streaming !== true && message.text.trim() !== ''}
                      feedback={
                        rateable && feedback ? (
                          <AssistantFeedback
                            onSubmit={(payload) =>
                              feedback.onSubmit({ ...payload, messageId: message.id })
                            }
                            maxTextLength={feedback.maxTextLength}
                            upIcon={feedback.upIcon}
                            downIcon={feedback.downIcon}
                            className=""
                            buttonClassName={FEEDBACK_BUTTON}
                            chipClassName={FEEDBACK_CHIP}
                            chipSelectedClassName={FEEDBACK_CHIP_ON}
                            submitClassName={FEEDBACK_SUBMIT}
                          />
                        ) : undefined
                      }
                      followUps={message.id === followUpsFor ? readFollowUps(readMeta(message.meta)) : []}
                      onFollowUp={(followUp: string) => send(followUp, [], 'follow_up')}
                      busy={busy}
                      onCopyError={onClientError}
                      onSpeak={readAloudOn && finished ? () => say(message) : undefined}
                      speaking={speakingId === message.id}
                      onAskAgain={extras?.askAgain && isLatestAnswer && lastUser ? () => send(withoutAttachedLine(lastUser.text), [], 'ask_again') : undefined}
                      useThis={finished ? (extras?.useThis ?? []).map((t) => ({ key: t.key, label: t.label, onUse: () => t.onUse(message.text, message) })) : []}
                      sources={extras?.sources && finished ? readReadFrom(readMeta(message.meta)) : []}
                      onOpenSource={extras?.onOpenSource}
                      time={answerTimeFor(message)}
                    />
                  ) : undefined
                }
              />
            );
          }}
          renderComposer={({ onStop: stop }) => (
            <Composer
              value={draft}
              onChange={setDraft}
              onSend={(files, input) => send(draft, files, editingRef.current ? 'edit' : input)}
              attachments={composer?.attachments}
              dictation={composer?.dictation}
              handsFree={extras?.handsFree && readAloudOn ? { active: handsFreeOn, suspended: speakingId !== null, onToggle: toggleHandsFree } : undefined}
              mentions={extras?.mentions}
              slashCommands={extras?.slashCommands}
              busy={busy}
              onStop={onStop ? stop : undefined}
              sendDisabled={composer?.sendDisabled}
              sendWhileBusy={composer?.sendWhileBusy}
              history={composer?.history}
              maxLength={composer?.maxLength}
              placeholder={composer?.placeholder ?? 'Ask a question...'}
              id={composer?.id}
              name={composer?.name}
              className={`${ASSISTANT_GEOMETRY.composer} border-t border-[var(--ai-border)]`}
              // The border and focus ring belong to the composer's box now, not the textarea.
              textareaClassName={`${ASSISTANT_GEOMETRY.composerInput} text-[var(--ai-fg)] outline-none`}
              buttonClassName={`${ASSISTANT_GEOMETRY.composerButton}
                bg-[var(--ai-accent)] text-[var(--ai-accent-fg)] outline-none
                transition-opacity hover:opacity-90 disabled:opacity-50`}
              stopClassName={`${ASSISTANT_GEOMETRY.composerButton}
                border border-[var(--ai-border)] bg-[var(--ai-surface)]
                text-[var(--ai-muted)] outline-none transition-colors
                hover:bg-[var(--ai-accent-soft)]`}
            />
          )}
          renderEmpty={() =>
            renderEmpty?.() ??
            (intro ? (
              <AssistantIntro
                className={ASSISTANT_GEOMETRY.intro}
                greeting={intro.greeting}
                greetingClassName={`${ASSISTANT_GEOMETRY.introGreeting} text-[var(--ai-fg)]`}
                prompts={intro.prompts}
                onPrompt={onPrompt}
                promptsLabel={intro.promptsLabel ?? 'Try asking'}
                promptsLabelClassName={`${ASSISTANT_GEOMETRY.introPromptsLabel} text-[var(--ai-muted)]`}
                promptsClassName={ASSISTANT_GEOMETRY.introPrompts}
                promptClassName={`${ASSISTANT_GEOMETRY.introPrompt} border
                  border-[var(--ai-border)] bg-[var(--ai-surface)] text-[var(--ai-muted)]
                  transition-colors hover:border-[var(--ai-accent)] hover:text-[var(--ai-accent)]`}
              >
                {intro.body ? (
                  <p className={`${ASSISTANT_GEOMETRY.introBody} text-[var(--ai-muted)]`}>
                    {intro.body}
                  </p>
                ) : null}
              </AssistantIntro>
            ) : null)
          }
        />

        {menuOpen && hasMenu ? (
          <>
            {/* The scrim closes the sidebar, as in every chat app; Escape does too. */}
            <button
              type="button"
              aria-label="Close the menu"
              onClick={() => setMenuOpen(false)}
              className="aiui-fade-in absolute inset-0 z-10 cursor-default bg-black/20 outline-none"
            />
            <nav
              id="assistant-sidebar"
              aria-label="Conversations"
              // Slides in from the card's left edge, as a drawer does (owner, 2026-11-06).
              className="aiui-slide-in absolute inset-y-0 left-0 z-20 flex w-[min(22rem,90%)] flex-col border-r border-[var(--ai-border)] shadow-xl"
              /*
               * ⚠ ALMOST OPAQUE ON PURPOSE (owner, 2026-11-02). A product's surface may be translucent
               * glass (Porter's is), and a sidebar painted with it alone let the conversation show
               * through its rows. The page's base colour at 94% plus a blur keeps a hint of depth while
               * the text behind stays unreadable; the theme colour tints it on top.
               */
              style={{
                backgroundColor: 'color-mix(in srgb, Canvas 94%, transparent)',
                backgroundImage: 'linear-gradient(var(--ai-surface), var(--ai-surface))',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
              }}
            >
              <div className="shrink-0 space-y-1 p-3">
                {threads?.onNew ? (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      threads.onNew?.();
                    }}
                    className="flex w-full items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold text-[var(--ai-fg)] outline-none transition-colors hover:bg-[var(--ai-accent-soft)] focus-visible:bg-[var(--ai-accent-soft)]"
                  >
                    <PlusIcon /> New conversation
                  </button>
                ) : null}
                {canExport ? (
                  <>
                    <button type="button" onClick={() => exportAs('pdf')} className="flex w-full items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-left text-sm text-[var(--ai-fg)] outline-none transition-colors hover:bg-[var(--ai-accent-soft)] focus-visible:bg-[var(--ai-accent-soft)]">
                      <PrintIcon /> Export conversation as PDF
                    </button>
                    <button type="button" onClick={() => exportAs('text')} className="flex w-full items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-left text-sm text-[var(--ai-fg)] outline-none transition-colors hover:bg-[var(--ai-accent-soft)] focus-visible:bg-[var(--ai-accent-soft)]">
                      <DownloadIcon /> Export conversation as text
                    </button>
                  </>
                ) : null}
                {actions?.map((action) => (
                  <button
                    key={action.key}
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      action.onClick();
                    }}
                    title={action.title}
                    aria-pressed={action.pressed}
                    className="flex w-full items-center gap-2 truncate rounded-xl px-3 py-2 text-left text-sm text-[var(--ai-fg)] outline-none transition-colors hover:bg-[var(--ai-accent-soft)] focus-visible:bg-[var(--ai-accent-soft)]"
                  >
                    {action.label}
                  </button>
                ))}
              </div>
              {threads ? (
                <div className="flex min-h-0 flex-1 flex-col border-t border-[var(--ai-border)]">
                  <p className="shrink-0 px-5 pb-1 pt-3 text-xs font-semibold text-[var(--ai-muted)]">Recent conversations</p>
                  <ThreadList
                    threads={threads}
                    zone={zone}
                    onSelect={(id) => {
                      setMenuOpen(false);
                      threads.onSelect(id);
                    }}
                  />
                </div>
              ) : null}
            </nav>
          </>
        ) : null}
      </div>

      {humanCheck ? (
        <HumanCheck siteKey={humanCheck.siteKey} onToken={humanCheck.onToken} resetSignal={humanCheck.resetSignal} />
      ) : null}
      {footer}
    </AssistantSurface>
  );
}

/**
 * "Still working, 2 min so far" under an answer whose work is running in the background (1.37.0).
 *
 * ⚠ A CURSOR ALONE SAYS NOTHING ABOUT TIME. A long data list can take minutes, and a reader who
 * cannot tell 10 seconds from 10 minutes cannot decide whether to wait or ask again. It ticks every
 * 30 s, which is as fine as a minute-level label needs, and is not part of any copy or export.
 */
function StillWorkingFor({ since }: { since: string }) {
  const [now, setNow] = useState(() => new Date().toISOString());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date().toISOString()), 30_000);

    return () => window.clearInterval(t);
  }, []);
  const took = elapsed(since, now);
  if (!took) return null;

  return (
    <p data-ai-no-copy="" className="mt-1 text-[11px] text-[var(--ai-muted)]" aria-live="off">
      Still working, {took} so far
    </p>
  );
}
