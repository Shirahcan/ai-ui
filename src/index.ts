/**
 * `@shirahcan/ai-ui` - the front-end half of ai-service.
 *
 * ⚠ IT NEVER CALLS ai-service. The service holds every AI provider key in the
 * estate and is loopback-only by design, so a browser cannot reach it and must
 * not be able to. Everything here talks to the PRODUCT's own routes, which
 * proxy the turn server-side with the product's trust key.
 *
 * ⚠ IT OWNS THE PANEL'S MECHANICS AND NONE OF ITS CHROME. 1.0 owned no
 * layout at all, on the reasoning that a shared panel "would be forked within a
 * month". The measurement that reversed it (P13): the package had ZERO
 * consumers while FOUR hand-built panels already existed, and only one of them
 * streamed - so the fork had already happened, and the narrowing's only real
 * effect was that the SSE lessons in here reached nobody. 1.1 therefore ships
 * `<AssistantPanel>`: the turn lifecycle, the scroll that does not fight the
 * reader, Stop, the error row and the `aria-live` region. The bubble, the
 * composer, the empty state, the header and the footer are SLOTS, and the
 * palette is CSS custom properties - so there is nothing left worth forking.
 *
 * Pairs with `shirahcan/ai-client` on the server side, exactly as
 * `@shirahcan/calendar-ui` pairs with `shirahcan/calendar-client`.
 */

export { useAssistantStream } from './useAssistantStream';
export type { AssistantStreamOptions } from './useAssistantStream';

export { useTurnCancel } from './useTurnCancel';
export type { TurnCancel, TurnCancelOptions } from './useTurnCancel';

export { useAutoscroll } from './useAutoscroll';
export type { Autoscroll, AutoscrollOptions } from './useAutoscroll';

export { readSseFrames, parseFrame, isAbortError } from './sse';

export { assistantMarkdownComponents, assistantRemarkPlugins } from './markdown';
export { emphasiseFiguresInText, remarkEmphasiseFigures } from './emphasiseFigures';
export type { MarkdownTheme } from './markdown';

export { AssistantMessage } from './components/AssistantMessage';
export type { AssistantMessageProps } from './components/AssistantMessage';

export { ConfirmCard } from './components/ConfirmCard';
export type { ConfirmCardProps } from './components/ConfirmCard';

export { GroundedAnswer } from './components/GroundedAnswer';
export type { GroundedAnswerProps, GroundedAnswerSection } from './components/GroundedAnswer';

export { AssistantFeedback, ASSISTANT_FEEDBACK_REASONS } from './components/AssistantFeedback';
export type {
  AssistantFeedbackProps,
  AssistantFeedbackPayload,
  AssistantFeedbackReason,
} from './components/AssistantFeedback';

export { OnDemandAsk } from './components/OnDemandAsk';
export type { OnDemandAskProps } from './components/OnDemandAsk';

export { AssistantSurface } from './components/AssistantSurface';
export type {
  AssistantSurfaceAttributes,
  AssistantSurfaceProps,
} from './components/AssistantSurface';

export { ASSISTANT_GEOMETRY, ASSISTANT_PANEL_SIZE } from './geometry';

export { AssistantHistory, groupThreads } from './components/AssistantHistory';
// When a chat message was said (1.37.0): the shared words for it, through calendar-ui.
export { answerTime, dayKey, dayLabel, elapsed, fullTime, sameDay, shiftDay } from './chatTime';
export type {
  AssistantHistoryProps,
  AssistantThread,
} from './components/AssistantHistory';

export { AssistantLauncher } from './components/AssistantLauncher';
export { AssistantThreadSkeleton } from './components/AssistantThreadSkeleton';
export { AssistantDock } from './components/AssistantDock';
export type { AssistantCorner, AssistantDockProps } from './components/AssistantDock';
export type { AssistantLauncherProps } from './components/AssistantLauncher';

export { AssistantIntro } from './components/AssistantIntro';
export type { AssistantIntroProps } from './components/AssistantIntro';

export { AssistantPanel } from './components/AssistantPanel';
export type { AssistantPanelProps, ComposerSlotProps } from './components/AssistantPanel';

export { MessageBubble } from './components/MessageBubble';
export type { MessageBubbleProps } from './components/MessageBubble';

export { Composer } from './components/Composer';
export type { ComposerProps } from './components/Composer';

export { StreamingCursor, STREAMING_CURSOR_CLASS } from './components/StreamingCursor';
export type { StreamingCursorProps } from './components/StreamingCursor';

export { StopButton } from './components/StopButton';
export type { StopButtonProps } from './components/StopButton';

export { aiVar, AI_UI_CSS_VARIABLES } from './theme';
export type { AiUiCssVariable } from './theme';

export { DEFAULT_EVENT_NAMES } from './types';
export {
  acceptsFile,
  formatBytes,
  MessageAttachmentChips,
  withoutAttachedLine,
} from './components/ComposerAttachments';
export type { ComposerAttachmentsConfig } from './components/ComposerAttachments';
export type {
  AssistantTurnState,
  AttachmentChip,
  DeferredWork,
  PanelMessage,
  StreamEventNames,
  StreamFrame,
  ToolTrailEntry,
  TurnPhase,
} from './types';

export { AssistantChat } from './components/AssistantChat';
export type {
  AssistantChatAction,
  AssistantChatComposer,
  AssistantChatFeedback,
  AssistantChatIntro,
  AssistantChatProps,
  AssistantChatExtras,
  AssistantChatThreads,
} from './components/AssistantChat';

export { AssistantMessageBody } from './components/AssistantMessageBody';
export type {
  AssistantActionConfirm,
  AssistantActionLaunch,
  AssistantActionModule,
  AssistantActionState,
  AssistantMessageBodyProps,
  AssistantMessageHandlers,
  AssistantOperationRun,
} from './components/AssistantMessageBody';
export { OperationConfirm } from './messages/OperationConfirm';

export { themeToVars, panelLookStyle, ASSISTANT_CARD_SHADOW } from './theme';
export type { AssistantTheme } from './theme';

export type {
  AssistantCta,
  AssistantGrounded,
  AssistantMessageKind,
  AssistantMeta,
  AssistantOperation,
  AssistantOperationChange,
  AssistantSource,
  AssistantTable,
  AssistantTableColumn,
} from './messages/kinds';

export { ActionConfirm } from './messages/ActionConfirm';
export type {
  AssistantActionOutcome,
  AssistantActionResult,
  AssistantRunCheck,
} from './messages/ActionConfirm';

export {
  ChatIcon, CheckIcon, CollapseIcon, CopyIcon, DownloadIcon, ExpandIcon, MoreVerticalIcon, PinIcon, PrintIcon, SearchIcon,
  ThumbDownIcon, ThumbUpIcon, TrashIcon,
} from './icons';

export { MessageActions } from './components/MessageActions';
export type { MessageActionsProps } from './components/MessageActions';
export {
  cleanClone,
  conversationAsHtml,
  conversationAsText,
  copyRendered,
  downloadConversationText,
  htmlToPlainText,
  printConversation,
  readRenderedTurns,
} from './conversationCopy';
export type { ExportedTurn } from './conversationCopy';
export { readFollowUps, readReadFrom } from './messages/kinds';

// 1.34.0: read aloud, hands-free, "@" / "/" in the box, the keyboard shortcut.
export { canReadAloud, plainForSpeech, speak, stopSpeaking } from './speech/readAloud';
export type { SpeakOptions } from './speech/readAloud';
export { useHandsFree } from './dictation/useHandsFree';
export type { HandsFreeState } from './dictation/useHandsFree';
export { useComposerPicker, ComposerPickerList } from './components/ComposerPicker';
export type { ComposerMention, ComposerMentionsConfig, ComposerSlashCommand } from './components/ComposerPicker';
export { useAssistantShortcut } from './useAssistantShortcut';

// 1.35.0: Markdown as editor HTML (pure); the TipTap extension is `@shirahcan/ai-ui/editor`.
export { markdownToEditorHtml, looksLikeMarkdown } from './editor/markdownToEditorHtml';

export { DEFERRED_LISTEN_MS, openDeferred, useAssistantConversation } from './useAssistantConversation';
export type {
  AssistantConversation,
  AssistantConversationOptions,
  AssistantHumanCheck,
  AssistantTurnOptions,
  AssistantInputKind,
} from './useAssistantConversation';
export { useComposerHistory } from './useComposerHistory';
export { useAssistantThreads } from './useAssistantThreads';
export type { AssistantThreadRow, AssistantThreadsApi, AssistantThreadsOptions } from './useAssistantThreads';
export type { ComposerHistory, ComposerHistoryOptions } from './useComposerHistory';
// Assistant spaces (1.43): the panel's data through the person's space, the kit's AssistantRoutes.
export { createAssistantSpaceClient } from './space/client';
export { AssistantMemoryPanel, defaultMemoryCategories } from './components/AssistantMemoryPanel';
export { AssistantSpacePanel } from './components/AssistantSpacePanel';
export { defaultHandlers, defaultIntro, defaultToPanelMessage } from './space/defaults';
export type { DefaultHandlerDeps, SpaceCardState } from './space/defaults';
export type { AssistantSpaceAdapter, AssistantSpacePanelProps, SpacePanelControls } from './components/AssistantSpacePanel';
export type { AssistantMemoryPanelProps } from './components/AssistantMemoryPanel';
export type {
  AssistantSpaceClient,
  AssistantSpaceClientOptions,
  AssistantSpaceFetcher,
  AssistantMemoryFact,
  AssistantVote,
  SpaceMethod,
} from './space/client';
export { HumanCheck } from './components/HumanCheck';
export type { HumanCheckProps } from './components/HumanCheck';

// Live dictation (1.32.0): speak instead of typing, phrase by phrase through the product's own route.
export {
  useDictation,
  DictationButton,
  DictationStatus,
  DictationSession,
  DEFAULT_DICTATION_LABELS,
  PhraseChunker,
  DEFAULT_CHUNK_POLICY,
  encodeWav,
  Resampler,
  DICTATION_SAMPLE_RATE,
  applyCommands,
  insertPhrase,
  joinAt,
  stitchPiece,
} from './dictation';
export type {
  Dictation,
  DictationButtonProps,
  DictationConfig,
  DictationContext,
  DictationLabels,
  DictationState,
  ChunkPolicy,
  Phrase,
  Insertion,
} from './dictation';

// The base assistant on any screen (1.42.0, owner 2026-11-08): ONE shell for every assistant and surface;
// the assistant's name, avatar and greeting are data from its ai-service record, colours the product's theme.
export { AssistantBox, AssistantNotice } from './components/AssistantBox';
export type { AssistantBoxProps } from './components/AssistantBox';
export { useAssistantIdentity, identityFromRecord, greetingFor, resetAssistantIdentityCache } from './surface/useAssistantIdentity';
export type { AssistantIdentity, AssistantIdentityFallback, AssistantSurfaceInfo } from './surface/useAssistantIdentity';
