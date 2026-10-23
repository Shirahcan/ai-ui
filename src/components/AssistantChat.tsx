import { useState, type ReactNode } from 'react';
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
import { MessageBubble } from './MessageBubble';
import { ASSISTANT_GEOMETRY } from '../geometry';
import { readKind } from '../messages/kinds';
import { themeToVars, type AssistantTheme } from '../theme';
import type { MarkdownTheme } from '../markdown';
import type { PanelMessage } from '../types';

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
 * ⚠ PASSING THIS IS WHAT PUTS "New" AND "History" IN THE HEADER, and the open
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

  onSend: (text: string) => void;
  onStop?: () => void;
  onRetry?: () => void;

  intro?: AssistantChatIntro;
  onPrompt?: (prompt: string) => void;
  /** Replaces the intro entirely: a skeleton while a thread restores. */
  renderEmpty?: () => ReactNode;

  threads?: AssistantChatThreads;
  actions?: AssistantChatAction[];

  composer?: AssistantChatComposer;
  markdownTheme?: MarkdownTheme;

  /** What this product's actions DO. The cards they live in are drawn here. */
  handlers?: AssistantMessageHandlers;
  /** Rating an answer. Omit it and no thumbs are drawn. */
  feedback?: AssistantChatFeedback;
  /** One line under the composer. */
  footer?: ReactNode;
}

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

/** The estate's header control: text in the panel's own colour, washed on hover. */
const HEADER_ACTION =
  `${ASSISTANT_GEOMETRY.headerAction} text-[var(--ai-fg)] transition-colors`
  + ' hover:bg-[var(--ai-accent-soft)] focus-visible:bg-[var(--ai-accent-soft)]';

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
  composer,
  markdownTheme,
  handlers,
  feedback,
  footer,
  ...attributes
}: AssistantChatProps & AssistantSurfaceAttributes) {
  const [showHistory, setShowHistory] = useState(false);
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
    `${ASSISTANT_GEOMETRY.bubble} bg-[var(--ai-bubble-user-bg)] text-[var(--ai-bubble-user-fg)]`;

  const openHistory = () => {
    setShowHistory(true);
    threads?.onReload?.();
  };

  const send = (text: string) => {
    const trimmed = text.trim();
    if (trimmed === '') return;
    setDraft('');
    onSend(trimmed);
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
      actions={
        <>
          {actions?.map((action) => (
            <button
              key={action.key}
              type="button"
              onClick={action.onClick}
              title={action.title}
              aria-pressed={action.pressed}
              className={HEADER_ACTION}
            >
              {action.label}
            </button>
          ))}

          {threads?.onNew ? (
            <button
              type="button"
              onClick={() => {
                setShowHistory(false);
                threads.onNew?.();
              }}
              className={HEADER_ACTION}
            >
              New
            </button>
          ) : null}

          {threads ? (
            <button
              type="button"
              onClick={() => (showHistory ? setShowHistory(false) : openHistory())}
              aria-pressed={showHistory}
              className={HEADER_ACTION}
            >
              {showHistory ? 'Back' : 'History'}
            </button>
          ) : null}
        </>
      }
      {...attributes}
    >
      {showHistory && threads ? (
        <ThreadList
          threads={threads}
          onSelect={(id) => {
            setShowHistory(false);
            threads.onSelect(id);
          }}
        />
      ) : (
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
            notice ? (
              <p className="mx-5 mt-5 rounded-xl bg-[var(--ai-accent-soft)] px-3 py-2 text-sm text-[var(--ai-muted)]">
                {notice}
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
            const body =
              message.role === 'user' ? undefined : (
                <AssistantMessageBody
                  message={message}
                  handlers={handlers}
                  markdownTheme={markdownTheme}
                />
              );

            return (
              <MessageBubble
                message={body === undefined ? message : { ...message, content: body }}
                markdownTheme={markdownTheme}
                className={`${ASSISTANT_GEOMETRY.row} ${
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
                bubbleClassName={assistantBubble(message)}
                userBubbleClassName={userBubble}
                contentClassName="break-words [&_a]:break-words"
                confidenceClassName={`${ASSISTANT_GEOMETRY.caveat} text-[var(--ai-muted)]`}
                footer={
                  feedback && (feedback.canRate ?? defaultCanRate)(message) ? (
                    <AssistantFeedback
                      onSubmit={(payload) =>
                        feedback.onSubmit({ ...payload, messageId: message.id })
                      }
                      maxTextLength={feedback.maxTextLength}
                      upIcon={feedback.upIcon}
                      downIcon={feedback.downIcon}
                      className="mt-1.5"
                      buttonClassName={FEEDBACK_BUTTON}
                      chipClassName={FEEDBACK_CHIP}
                      chipSelectedClassName={FEEDBACK_CHIP_ON}
                      submitClassName={FEEDBACK_SUBMIT}
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
              onSend={() => send(draft)}
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
              textareaClassName={`${ASSISTANT_GEOMETRY.composerInput} border
                border-[var(--ai-border)] bg-[var(--ai-surface)] text-[var(--ai-fg)]
                outline-none focus:border-[var(--ai-accent)]`}
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
      )}

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
        icon={threads.icon}
        deleteIcon={threads.deleteIcon}
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
