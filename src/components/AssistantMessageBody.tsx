import type { ReactNode } from 'react';
import { AssistantMessage } from './AssistantMessage';
import { ConfirmCard } from './ConfirmCard';
import {
  CtaRow,
  ConsentCard,
  DataTable,
  LaunchCard,
  ModuleCard,
  PendingWork,
  SourceList,
} from '../messages/blocks';
import {
  readCtas,
  readKind,
  readMeta,
  readSources,
  readString,
  readTables,
  type AssistantCta,
  type AssistantSource,
  type AssistantTable,
} from '../messages/kinds';
import type { MarkdownTheme } from '../markdown';
import type { PanelMessage } from '../types';

/**
 * What an assistant message LOOKS like, for every kind ai-service can send.
 *
 * ⚠ IT REPLACES A PRODUCT-SHAPED ESCAPE HATCH. The first cut of `AssistantChat`
 * kept a `renderMessageBody` slot "for Porter's action modules and CTA cards",
 * which was the same mistake one level down: the frames those things are drawn
 * in are no more immigration-shaped than a bubble is, and leaving them to the
 * product left MployNow with no renderer for them at all. ai-service sends the
 * same `kind` and `meta` to every product; only one product had ever drawn them.
 *
 * ⚠ THE LINE IS FRAME VERSUS DOMAIN, AND IT IS WORTH STATING EXACTLY. Every
 * card, button, table, source list and consent layout is drawn here. What a
 * product supplies is what HAPPENS - the handler behind a CTA, the route a
 * record opens at - plus the FIELDS of an action's own form, because "add a case
 * note" is a Portify form and "shortlist this candidate" is a MployNow one. The
 * card around those fields is still drawn here.
 *
 * ⚠ A HANDLER THAT IS NOT SUPPLIED HIDES ITS CONTROL, it does not render a dead
 * button. A product adopting this incrementally shows exactly the actions it has
 * wired, and a reader is never offered something that does nothing.
 */

export interface AssistantActionLaunch {
  messageId: string;
  moduleId: string;
  presentation: 'modal' | 'page';
  draftBody?: string;
}

export interface AssistantActionConfirm {
  messageId: string;
  actionId: string;
  moduleId: string;
  params: Record<string, unknown>;
  timezone: string | null;
}

export interface AssistantActionModule {
  messageId: string;
  moduleId: string;
  context: Record<string, unknown>;
}

/** How far an action on one message has got. */
export type AssistantActionState = 'pending' | 'done' | 'cancelled';

export interface AssistantMessageHandlers {
  onCta?: (cta: AssistantCta, message: PanelMessage) => void;
  onLaunchAction?: (launch: AssistantActionLaunch) => void;

  onConfirmAction?: (confirm: AssistantActionConfirm) => void;
  onCancelAction?: (confirm: AssistantActionConfirm) => void;
  /** Offered only when the service said `can_refine`. */
  onRefineAction?: (confirm: AssistantActionConfirm) => void;
  /** Offered only when the service said `can_explain`. */
  onExplainAction?: (confirm: AssistantActionConfirm) => void;

  onStartIntake?: (seedText: string, message: PanelMessage) => void;

  /** The reader agreed to let the assistant read their current screen. */
  onConsent?: (question: string, message: PanelMessage) => void;
  onDeclineConsent?: (message: PanelMessage) => void;

  onOpenResearch?: (taskId: string) => void;
  onOpenSource?: (source: AssistantSource) => void;
  onOpenTable?: (table: AssistantTable, message: PanelMessage) => void;

  /** The fields of an action's own form. The card around them is drawn here. */
  renderActionFields?: (module: AssistantActionModule) => ReactNode;

  /** How far this message's action has got, so a re-mount never lies about it. */
  actionState?: (messageId: string) => AssistantActionState | undefined;
  /** The one message with a request in flight. */
  busyMessageId?: string | null;
}

export interface AssistantMessageBodyProps {
  message: PanelMessage;
  handlers?: AssistantMessageHandlers;
  markdownTheme?: MarkdownTheme;
}

export function AssistantMessageBody({
  message,
  handlers = {},
  markdownTheme,
}: AssistantMessageBodyProps) {
  const kind = readKind(message.kind);
  const meta = readMeta(message.meta);
  const busy = handlers.busyMessageId === message.id;
  const state = handlers.actionState?.(message.id);

  /*
   * ⚠ THE PROSE IS ALWAYS DRAWN FIRST, FOR EVERY KIND. The service sends the
   * sentence AND the structure, and the sentence is what makes the card make
   * sense ("I can send these three options to Maria - shall I?"). A kind branch
   * that replaced the text instead of preceding it is how a confirm card ends up
   * asking about something the reader was never told.
   */
  const prose =
    message.text.trim() === '' ? null : (
      <AssistantMessage
        text={message.text}
        streaming={message.streaming}
        theme={markdownTheme}
        className="break-words [&_a]:break-words"
      />
    );

  const confirm: AssistantActionConfirm = {
    messageId: message.id,
    actionId: readString(meta.action_id) ?? '',
    moduleId: readString(meta.module_id) ?? '',
    params: meta.params ?? {},
    timezone: meta.timezone ?? null,
  };

  return (
    <>
      {prose}

      {kind === 'action_cta' && handlers.onCta ? (
        <CtaRow ctas={readCtas(meta)} onSelect={(cta) => handlers.onCta?.(cta, message)} />
      ) : null}

      {kind === 'action_launch' && handlers.onLaunchAction ? (
        <LaunchCard
          intro={readString(meta.launch_intro)}
          label={readString(meta.launch_label) ?? 'Open'}
          busy={busy}
          done={state === 'done'}
          onLaunch={() =>
            handlers.onLaunchAction?.({
              messageId: message.id,
              moduleId: readString(meta.module_id) ?? '',
              presentation: meta.presentation === 'page' ? 'page' : 'modal',
              draftBody: readString(meta.draft_body) ?? undefined,
            })
          }
        />
      ) : null}

      {kind === 'action_confirm' && handlers.onConfirmAction ? (
        <ConfirmCard
          title={readString(meta.launch_label) ?? 'Shall I go ahead?'}
          confirmLabel={readString(meta.confirm_label) ?? 'Yes, do it'}
          outcome={state ?? 'pending'}
          busy={busy}
          onConfirm={() => handlers.onConfirmAction?.(confirm)}
          onCancel={() => handlers.onCancelAction?.(confirm)}
        >
          {/*
            ⚠ REFINE AND EXPLAIN ARE OFFERED ONLY WHEN THE SERVICE SAID SO. They
            cost a turn each, and a card that offers to explain something the
            backend cannot explain fails after the reader has committed to asking.
          */}
          {meta.can_refine === true && handlers.onRefineAction ? (
            <button
              type="button"
              onClick={() => handlers.onRefineAction?.(confirm)}
              className="mr-3 text-sm underline underline-offset-2 outline-none"
            >
              Change something
            </button>
          ) : null}
          {meta.can_explain === true && handlers.onExplainAction ? (
            <button
              type="button"
              onClick={() => handlers.onExplainAction?.(confirm)}
              className="text-sm underline underline-offset-2 outline-none"
            >
              Explain this
            </button>
          ) : null}
        </ConfirmCard>
      ) : null}

      {kind === 'action_module' && handlers.renderActionFields ? (
        <ModuleCard title={readString(meta.launch_label) ?? undefined}>
          {handlers.renderActionFields({
            messageId: message.id,
            moduleId: readString(meta.module_id) ?? '',
            context: meta.context ?? {},
          })}
        </ModuleCard>
      ) : null}

      {kind === 'intake_cta' && handlers.onStartIntake ? (
        <LaunchCard
          intro={readString(meta.intake_intro)}
          label="Start this"
          busy={busy}
          done={state === 'done'}
          onLaunch={() =>
            handlers.onStartIntake?.(readString(meta.seed_text) ?? message.text, message)
          }
        />
      ) : null}

      {kind === 'data_table' || kind === 'data_tables'
        ? readTables(meta).map((table, index) => (
            <DataTable
              key={table.id ?? index}
              table={table}
              onOpen={
                table.href && handlers.onOpenTable
                  ? () => handlers.onOpenTable?.(table, message)
                  : undefined
              }
            />
          ))
        : null}

      {kind === 'research_dispatched' ? (
        <PendingWork
          label="Looking into this"
          topic={readString(meta.research_topic) ?? undefined}
          onOpen={
            meta.research_task_id && handlers.onOpenResearch
              ? () => handlers.onOpenResearch?.(readString(meta.research_task_id) ?? '')
              : undefined
          }
        />
      ) : null}

      {kind === 'research' ? (
        <SourceList sources={readSources(meta)} onOpen={handlers.onOpenSource} />
      ) : null}

      {kind === 'it_snapshot_request' && handlers.onConsent ? (
        <ConsentCard
          title="May I look at this page?"
          detail="I would read the structure of the screen you are on - never what you have typed, and never your files."
          confirmLabel="Look at my screen"
          busy={busy}
          settled={
            state === 'done' ? 'agreed' : state === 'cancelled' ? 'declined' : undefined
          }
          onConfirm={() =>
            handlers.onConsent?.(
              readString(meta.it_question) ?? 'Please diagnose the problem on this page.',
              message,
            )
          }
          onDecline={() => handlers.onDeclineConsent?.(message)}
        />
      ) : null}

      {/*
        ⚠ A GUIDE'S LINKED ACTION RIDES ANY KIND. `module_launch` arrives
        alongside research answers and plain prose, not only on `action_launch`,
        so it is tested for on every message rather than inside one branch.
      */}
      {meta.module_launch && handlers.onLaunchAction ? (
        <LaunchCard
          label={meta.module_launch.label ?? 'Open'}
          busy={busy}
          done={state === 'done'}
          onLaunch={() =>
            handlers.onLaunchAction?.({
              messageId: message.id,
              moduleId: meta.module_launch?.module_id ?? '',
              presentation: 'modal',
              draftBody: meta.module_launch?.draft_body,
            })
          }
        />
      ) : null}
    </>
  );
}
