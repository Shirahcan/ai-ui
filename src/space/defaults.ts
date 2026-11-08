/**
 * What every product gets unless it says otherwise (1.43; owner 2026-11-08: "message format and card
 * buttons should have proper defaults (which most products will use)").
 *
 * A product with nothing special passes no mapper and no handlers: its messages are read in the shape
 * the kit hands back (the neutral turn, or a product shape like Porter's, which these also read), and its
 * cards navigate, start an intake, cancel and stay settled across reloads on their own.
 */
import type { AssistantActionState, AssistantMessageHandlers } from '../components/AssistantMessageBody';
import type { AssistantChatIntro } from '../components/AssistantChat';
import type { PanelMessage } from '../types';

/** A card's settled outcome, as the space keeps it on the turn (`card_state`). */
export interface SpaceCardState {
  card?: AssistantActionState;
  summary?: string;
  run_id?: string;
}

type Raw = Record<string, unknown>;

const text = (...values: unknown[]): string => {
  for (const v of values) if (typeof v === 'string') return v;
  return '';
};

/**
 * A message from the space, or from a turn, as the panel draws it.
 *
 * Reads the neutral turn (`content` or `body`, `structured.kind/meta`, `created_at`) and the product
 * shapes already in use (Porter's `kind`, `meta`, `is_grounded`, `confidence`, `attachments`). The words
 * are never re-derived and the time is the service's record, copied.
 */
export function defaultToPanelMessage(raw: unknown): PanelMessage {
  const m = (raw && typeof raw === 'object' ? raw : {}) as Raw;
  const s = (m.structured && typeof m.structured === 'object' ? m.structured : {}) as Raw;
  const grounded = m.is_grounded ?? m.grounded ?? s.grounded;
  const attachments = Array.isArray(m.attachments) && m.attachments.length > 0 ? m.attachments : undefined;

  return {
    id: text(m.id),
    role: m.role === 'user' ? 'user' : 'assistant',
    text: text(m.content, m.text, m.body),
    kind: typeof (m.kind ?? s.kind) === 'string' ? ((m.kind ?? s.kind) as string) : undefined,
    meta: (m.meta ?? s.meta) ?? undefined,
    ...(typeof grounded === 'boolean' ? { grounded } : {}),
    at: typeof m.created_at === 'string' ? m.created_at : typeof m.at === 'string' ? m.at : null,
    ...(attachments ? { attachments: attachments as PanelMessage['attachments'] } : {}),
  };
}

/** The welcome when a product writes none: named by the assistant, the questions come from the space. */
export function defaultIntro(assistantName: string): AssistantChatIntro {
  return {
    greeting: `Hi, I'm ${assistantName}.`,
    body: 'Ask me anything about your account, or pick a question below.',
  };
}

export interface DefaultHandlerDeps {
  /** In-app navigation (the product's router). */
  navigate: (url: string) => void;
  /** Ask the assistant, keeping the up-arrow ring in step. */
  ask: (text: string) => void;
  /** A card's outcome as the space holds it. */
  cardState: (messageId: string) => SpaceCardState | undefined;
  /** Record a card's outcome on its turn, so a reload or another device shows it settled. */
  keepCardState: (messageId: string, state: SpaceCardState) => void;
}

/**
 * The card buttons every product gets: links and "Open" go where they point, an intake card starts the
 * intake in the chat, Cancel settles the card and is kept, and a card already settled stays settled.
 * A product's own handlers are laid over these, key by key.
 */
export function defaultHandlers({ navigate, ask, cardState, keepCardState }: DefaultHandlerDeps): AssistantMessageHandlers {
  return {
    onCta: (cta) => {
      if (cta.href) navigate(cta.href);
    },
    onNavigate: (url) => navigate(url),
    onStartIntake: (seedText) => ask(seedText),
    onCancelAction: ({ messageId }) => keepCardState(messageId, { card: 'cancelled' }),
    onCancelOperation: (messageId) => keepCardState(messageId, { card: 'cancelled' }),
    actionState: (messageId) => cardState(messageId)?.card,
    actionSummary: (messageId) => cardState(messageId)?.summary,
  };
}
