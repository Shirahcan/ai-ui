import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AssistantTheme } from '../theme';
import type { PanelMessage } from '../types';
import type { AssistantSpaceClient } from '../space/client';
import { useAssistantConversation, type AssistantTurnOptions } from '../useAssistantConversation';
import { useAssistantThreads } from '../useAssistantThreads';
import { useComposerHistory } from '../useComposerHistory';
import {
  AssistantChat,
  type AssistantChatAction,
  type AssistantChatComposer,
  type AssistantChatExtras,
  type AssistantChatIntro,
} from './AssistantChat';
import type { AssistantMessageHandlers } from './AssistantMessageBody';
import { AssistantMemoryPanel, type AssistantMemoryPanelProps } from './AssistantMemoryPanel';
import { AssistantThreadSkeleton } from './AssistantThreadSkeleton';

/**
 * THE assistant panel every product mounts (1.43, Portify plan assistant-spaces-2026-11-08 S3c; owner
 * 2026-11-08: "it should be a true (completely) shared component ... each product should embed/integrate
 * the panel the same way, providing the necessary specifics").
 *
 * The product passes four things: the space client (its proxy to the kit's `AssistantRoutes`), the
 * assistant's name, its theme as VALUES, and an adapter with its true specifics. Everything else is here
 * and cannot be left out: the stream with Stop and interrupt, restore, the loading window, the queued
 * notice, the up-arrow ring, the conversation list (paged, pins, search, rename, delete), "What
 * {assistant} knows about you", votes, Expand, the composer's dictation and files when the adapter
 * offers them.
 *
 * ⚠ KEYED ON THE ACCOUNT. A different person must never see the previous one's thread, memory or ring;
 * remounting is the one reset that cannot miss a field.
 */
export interface SpacePanelControls {
  /** The thread on screen (the space's ai-service id), or null for a new one. */
  conversationId: string | null;
  /** Ask, keeping the up-arrow ring in step. */
  ask: (text: string, turn?: AssistantTurnOptions) => void;
  /** Reopen a thread (a background run wrote its reply into it). */
  open: (conversationId: string) => Promise<void>;
  /** The thread has restored and the loading window has passed: a queued ask may go now. */
  ready: boolean;
  busy: boolean;
}

export interface AssistantSpaceAdapter {
  /** The product's message as the panel draws it (Porter: cards, provenance, file chips). */
  toPanelMessage: (raw: unknown) => PanelMessage;
  /** Tidy a reloaded thread before it is drawn (Porter drops a result repeated under its card). */
  prepareMessages?: (messages: unknown[]) => unknown[];
  /** Merged into every turn: the page the person is on, their timezone. */
  turnBody?: () => Record<string, unknown>;
  /** Enter mid-answer folds the correction into the running question. Default true. */
  supersede?: boolean;
  intro: AssistantChatIntro;
  composer?: Omit<AssistantChatComposer, 'history' | 'sendDisabled' | 'sendWhileBusy'>;
  extras?: AssistantChatExtras;
  expandable?: boolean;
  /** What a card's buttons DO in this product. Built per render with the panel's controls. */
  handlers?: (panel: SpacePanelControls) => AssistantMessageHandlers;
  /** Extra menu items beyond "What {assistant} knows about you". */
  actions?: AssistantChatAction[];
  /** "What {assistant} knows about you". Default on; it shows only when memory answers. */
  memory?: boolean;
  memoryCategories?: AssistantMemoryPanelProps['categories'];
  onAnswer?: (raw: unknown, conversationId: string) => void;
  /** The product's error surface; receives the server's own reason. */
  onError: (error: unknown) => void;
  onNotice?: (message: string) => void;
  /** Called whenever readiness changes, with the controls: a product's queued "ask about this" goes here. */
  onReady?: (panel: SpacePanelControls) => void;
  /** Drawn after the panel (a product's action dialog host), with the controls. */
  renderAfter?: (panel: SpacePanelControls) => ReactNode;
}

export interface AssistantSpacePanelProps {
  client: AssistantSpaceClient;
  /** The signed-in account; the panel remounts when it changes. */
  accountKey: string;
  /** The assistant's display name ("Porter", "Mira"): the header, the memory view, the notices. */
  assistantName: string;
  theme: AssistantTheme;
  adapter: AssistantSpaceAdapter;
  onClose: () => void;
  closeLabel?: string;
  /** Attributes on the panel's root (Porter's `data-porter-ui`, which its screen snapshot excludes). */
  rootAttributes?: Record<`data-${string}`, string>;
}

/** The panel opens in a loading state and may reveal the welcome view only after this (a settling session). */
const MIN_LOADING_MS = 1000;

export function AssistantSpacePanel(props: AssistantSpacePanelProps) {
  return <SpacePanel key={props.accountKey} {...props} />;
}

function SpacePanel({ client, accountKey, assistantName, theme, adapter, onClose, closeLabel, rootAttributes }: AssistantSpacePanelProps) {
  const adapterRef = useRef(adapter);
  adapterRef.current = adapter;

  const [notice, setNotice] = useState<string | null>(null);
  const [minLoadingElapsed, setMinLoadingElapsed] = useState(false);
  const [showMemory, setShowMemory] = useState(false);
  const [hasMemory, setHasMemory] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);

  /*
   * ⚠ A VOTE NAMES THE SERVICE'S TURN. A product's message may carry its own id (Porter's feedback and
   * action modules key on it) beside `ai_turn_id`; the space routes take the service id.
   */
  const turnIds = useRef(new Map<string, string>());
  const toPanelMessage = useCallback((raw: unknown): PanelMessage => {
    const message = adapterRef.current.toPanelMessage(raw);
    const r = raw as { ai_turn_id?: unknown; id?: unknown } | null;
    const serviceId = typeof r?.ai_turn_id === 'string' ? r.ai_turn_id : typeof r?.id === 'string' ? r.id : null;
    if (serviceId) turnIds.current.set(message.id, serviceId);
    return message;
  }, []);

  const history = useComposerHistory({ load: client.inputHistory, accountKey });
  const reloadThreads = useRef<() => void>(() => {});

  const conversation = useAssistantConversation({
    ...client.conversation,
    sendUrl: client.conversation.sendUrl,
    body: () => adapterRef.current.turnBody?.() ?? {},
    toPanelMessage,
    supersede: adapter.supersede ?? true,
    loadConversation: async (id) => {
      const thread = await client.loadConversation(id);
      const prepare = adapterRef.current.prepareMessages;
      return { id: thread.id, messages: prepare ? prepare(thread.messages) : thread.messages };
    },
    onRestoreFailed: () => setNotice("Couldn't reopen your last conversation, so this is a fresh one."),
    onAnswer: (raw, answeredIn) => {
      reloadThreads.current();
      history.reload();
      adapterRef.current.onAnswer?.(raw, answeredIn);
    },
  });

  const threads = useAssistantThreads(client.threads, { enabled: true, fetchNow: conversation.conversationId !== null, accountKey });
  useEffect(() => {
    reloadThreads.current = threads.reload;
  }, [threads.reload]);

  useEffect(() => {
    const timer = setTimeout(() => setMinLoadingElapsed(true), MIN_LOADING_MS);
    return () => clearTimeout(timer);
  }, []);

  // "What {assistant} knows about you" shows when memory answers, empty or not; only a failing or
  // switched-off service hides it (a control that opens onto nothing reads as broken).
  const memoryOn = adapter.memory ?? true;
  // Read through a ref: a product that builds its client per render must not refetch on every keystroke.
  const clientRef = useRef(client);
  clientRef.current = client;
  useEffect(() => {
    if (!memoryOn) return undefined;
    let live = true;
    clientRef.current.memory
      .list()
      .then(() => live && setHasMemory(true))
      .catch(() => live && setHasMemory(false));
    return () => {
      live = false;
    };
  }, [memoryOn]);

  const ready = conversation.ready && (conversation.messages.length > 0 || minLoadingElapsed);

  const ask = useCallback(
    (text: string, turn?: AssistantTurnOptions) => {
      const trimmed = text.trim();
      if (trimmed === '') return;
      history.remember(trimmed);
      setNotice(null);
      conversation.send(trimmed, turn);
    },
    [history, conversation],
  );

  const controls: SpacePanelControls = useMemo(
    () => ({ conversationId: conversation.conversationId, ask, open: conversation.open, ready, busy: conversation.busy }),
    [conversation.conversationId, ask, conversation.open, ready, conversation.busy],
  );

  useEffect(() => {
    adapterRef.current.onReady?.(controls);
    // Readiness is the signal; the controls object changes with every keystroke's re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const removeConversation = (id: string) => {
    setDeleting(true);
    setDeleteFailed(false);
    client
      .eraseConversation(id)
      .then(() => {
        conversation.forget(id);
        threads.reload();
      })
      .catch((error: unknown) => {
        setDeleteFailed(true);
        adapterRef.current.onError(error);
      })
      .finally(() => setDeleting(false));
  };

  const menuActions: AssistantChatAction[] = [
    ...(memoryOn && hasMemory
      ? [{ key: 'memory', label: `What ${assistantName} knows about you`, title: `What ${assistantName} remembers about you`, onClick: () => setShowMemory(true) }]
      : []),
    ...(adapter.actions ?? []),
  ];

  return (
    <>
      <AssistantChat
        theme={theme}
        title={assistantName}
        label={assistantName}
        onClose={onClose}
        closeLabel={closeLabel ?? `Close ${assistantName}`}
        onClientError={(error) => adapter.onError(error)}
        {...(rootAttributes ?? {})}
        messages={conversation.messages}
        busy={conversation.busy}
        stage={conversation.stage}
        error={conversation.error}
        notice={notice ?? (conversation.queued ? 'Sending as soon as your conversation finishes loading...' : null)}
        onSend={ask}
        onStop={conversation.stop}
        onRetry={conversation.retry}
        onPrompt={(prompt: string) => ask(prompt, { input: 'suggestion' })}
        intro={adapter.intro}
        renderEmpty={
          !ready
            ? () => <AssistantThreadSkeleton label={conversation.ready ? 'Getting your assistant ready...' : 'Restoring your last conversation...'} />
            : undefined
        }
        composer={{
          placeholder: 'Ask a question...',
          ...(adapter.composer ?? {}),
          history: history.history,
          // ⚠ sendDisabled, never disabled: somebody who types before the thread restores keeps their words.
          sendDisabled: !ready,
          sendWhileBusy: adapter.supersede ?? true,
        }}
        actions={menuActions.length > 0 ? menuActions : undefined}
        threads={{
          activeId: conversation.conversationId,
          onSelect: (id) => void conversation.open(id),
          onDelete: removeConversation,
          deleting,
          deleteFailed,
          onNew: conversation.startNew,
          items: threads.items,
          status: threads.status,
          onReload: threads.reload,
          groupByDay: threads.groupByDay,
          onSearch: threads.onSearch,
          search: threads.search,
          onRename: threads.onRename,
          onPin: threads.onPin,
          hasMore: threads.hasMore,
          onLoadMore: threads.onLoadMore,
          loadingMore: threads.loadingMore,
        }}
        expandable={adapter.expandable ?? true}
        handlers={adapter.handlers?.(controls)}
        extras={adapter.extras ? { ...adapter.extras, timeline: true } : { timeline: true }}
        feedback={{
          onSubmit: async ({ messageId, sentiment, reasonCode, reasonText }) => {
            const turnId = turnIds.current.get(messageId);
            if (!conversation.conversationId || !turnId) return;
            await client.vote(
              conversation.conversationId,
              turnId,
              sentiment === 'positive' ? { sentiment } : { sentiment, reason_code: reasonCode, reason_text: reasonText },
            );
          },
        }}
        overlay={
          showMemory ? (
            <AssistantMemoryPanel
              memory={client.memory}
              assistantName={assistantName}
              onClose={() => setShowMemory(false)}
              onError={adapter.onError}
              onNotice={adapter.onNotice}
              categories={adapter.memoryCategories}
            />
          ) : undefined
        }
      />
      {adapter.renderAfter?.(controls)}
    </>
  );
}
