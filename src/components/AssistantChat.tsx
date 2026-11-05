import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AssistantHistory, type AssistantThread } from './AssistantHistory';
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
import { readFollowUps, readKind, readMeta } from '../messages/kinds';
import { downloadConversationText, printConversation, readRenderedTurns } from '../conversationCopy';
import { ChatIcon, DownloadIcon, MenuIcon, PlusIcon, PrintIcon, TrashIcon } from '../icons';
import { themeToVars, type AssistantTheme } from '../theme';
import type { MarkdownTheme } from '../markdown';
import type { AttachmentChip, PanelMessage } from '../types';
import type { AssistantTurnOptions } from '../useAssistantConversation';
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
}

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
  ...attributes
}: AssistantChatProps & AssistantSurfaceAttributes) {
  /*
   * The conversations sidebar (owner, 2026-11-02): "New" and "History" left the header for a menu
   * button beside the assistant's name, like other chat apps. It holds a new conversation, the
   * product's own items and the recent conversations.
   */
  const [menuOpen, setMenuOpen] = useState(false);
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
      const turns = readRenderedTurns(container, { user: 'You', assistant: assistantName });
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
  /*
   * ⚠ THE DRAFT LIVES HERE, NOT IN THE PANEL BELOW. `AssistantPanel.send`
   * refuses to send while busy, which is right for a panel with no supersede
   * path - but Porter's turn loop folds a mid-answer correction INTO the running
   * question, and reaching that used to mean each product writing its own
   * composer from scratch. Owning the draft is what lets `sendWhileBusy` be a
   * flag here rather than a reason to override the whole slot.
   */
  const [draft, setDraft] = useState('');

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

  const send = (text: string, files: AttachmentChip[] = []) => {
    let trimmed = text.trim();
    if (trimmed === '' && files.length > 0) {
      trimmed = composer?.attachments?.emptyText ?? (files.length > 1 ? 'Here are some files.' : 'Here is a file.');
    }
    if (trimmed === '') return;
    setDraft('');
    // Without files the call is exactly what it always was, so a product's own checks still hold.
    if (files.length > 0) onSend(trimmed, { attachments: files });
    else onSend(trimmed);
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
        activeTitle !== '' ? (
          <span
            className="block min-w-0 max-w-[14rem] truncate text-sm font-medium text-[var(--ai-muted)]"
            title={activeTitle}
          >
            {activeTitle}
          </span>
        ) : undefined
      }
      {...attributes}
    >
      <div ref={conversationRef} className="relative flex min-h-0 flex-1 flex-col">
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
                <div data-ai-copy-source="" data-ai-export-role="user">
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
                <div data-ai-copy-source="" data-ai-export-role="assistant">
                  <AssistantMessageBody
                    message={message}
                    handlers={handlers}
                    markdownTheme={markdownTheme}
                  />
                </div>
              );
            const rateable = feedback !== undefined && (feedback.canRate ?? defaultCanRate)(message);

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
                  message.role === 'assistant' ? (
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
                      onFollowUp={send}
                      busy={busy}
                      onCopyError={onClientError}
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
              onSend={(files) => send(draft, files)}
              attachments={composer?.attachments}
              dictation={composer?.dictation}
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
              className="absolute inset-0 z-10 cursor-default bg-black/20 outline-none"
            />
            <nav
              id="assistant-sidebar"
              aria-label="Conversations"
              className="absolute inset-y-0 left-0 z-20 flex w-[min(22rem,90%)] flex-col border-r border-[var(--ai-border)] shadow-xl"
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
 * The conversation list, with the three states a product used to draw itself.
 *
 * ⚠ A FAILED LOAD SAYS SO AND OFFERS ANOTHER GO. The alternative - an empty
 * list after a failed request - tells somebody their conversations are gone.
 */
function ThreadList({
  threads,
  onSelect,
}: {
  threads: AssistantChatThreads;
  onSelect: (id: string) => void;
}) {
  const status = threads.status ?? 'ready';

  if (status === 'loading') {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-sm text-[var(--ai-muted)]">
        Loading your conversations...
      </div>
    );
  }

  if (status === 'failed') {
    return (
      <div className="flex-1 space-y-2 p-4 text-sm text-[var(--ai-muted)]">
        <p>Could not load your conversations.</p>
        {threads.onReload ? (
          <button
            type="button"
            onClick={threads.onReload}
            className={`${ASSISTANT_GEOMETRY.historyConfirmButton} bg-[var(--ai-accent)] text-[var(--ai-accent-fg)]`}
          >
            Try again
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <AssistantHistory
        threads={threads.items}
        activeId={threads.activeId}
        onSelect={onSelect}
        onDelete={threads.onDelete}
        deleting={threads.deleting}
        deleteFailed={threads.deleteFailed}
        empty={
          <div className="flex flex-col items-center gap-1 px-6 py-12 text-center">
            <p className="text-sm font-medium text-[var(--ai-muted)]">
              {threads.emptyTitle ?? 'No conversations yet'}
            </p>
            <p className="text-xs text-[var(--ai-muted)]">
              {threads.emptyBody ?? 'Anything you ask here is kept so you can pick it up again.'}
            </p>
          </div>
        }
        icon={threads.icon ?? <ChatIcon />}
        deleteIcon={threads.deleteIcon ?? <TrashIcon />}
        className={ASSISTANT_GEOMETRY.historyList}
        rowClassName={`${ASSISTANT_GEOMETRY.historyRow} transition-colors hover:bg-[var(--ai-accent-soft)]`}
        iconClassName={`${ASSISTANT_GEOMETRY.historyIcon} bg-[var(--ai-accent-soft)] text-[var(--ai-accent)]`}
        activeIconClassName={`${ASSISTANT_GEOMETRY.historyIcon} bg-[var(--ai-accent)] text-[var(--ai-accent-fg)]`}
        titleClassName={`${ASSISTANT_GEOMETRY.historyTitle} text-[var(--ai-fg)]`}
        metaClassName={`${ASSISTANT_GEOMETRY.historyMeta} text-[var(--ai-muted)]`}
        currentClassName="font-semibold text-[var(--ai-accent)]"
        deleteClassName="shrink-0 rounded-full p-1.5 text-[var(--ai-muted)] outline-none transition-colors hover:bg-red-50 hover:text-[var(--ai-danger)]"
        confirmRowClassName={`${ASSISTANT_GEOMETRY.historyConfirmRow} bg-red-50 text-[var(--ai-danger)]`}
        confirmClassName={`${ASSISTANT_GEOMETRY.historyConfirmButton} bg-[var(--ai-danger)] text-white disabled:opacity-50`}
        cancelClassName={`${ASSISTANT_GEOMETRY.historyConfirmButton} border border-[var(--ai-border)] text-[var(--ai-muted)] disabled:opacity-50`}
      />
    </div>
  );
}
