/**
 * `@shirahcan/ai-ui/console`: Site management's AI console, shared by every product.
 *
 * Backend: `ConsoleRoutes::mount('...')` from `shirahcan/ai-client` >= 1.37 in the product's
 * admin auth group. Frontend: an `AiConsoleProvider` pointed at that prefix, themed with the
 * same `AssistantTheme` as the product's chat panel, then `<AiConsole />` or single sections.
 */
export { AiConsoleProvider, ALL_PRODUCTS, ConsoleError, useConsole, useConsoleAcross, useConsoleResource } from './ConsoleContext';
export { ProductPicker, ScopeNote } from './ProductPicker';
export { AssistBox, LineDiff, diffLines } from './AssistBox';
export type { AssistField } from './AssistBox';
export type { AiConsoleProviderProps, ConsoleContextValue, ConsoleFetcher, RequestOptions } from './ConsoleContext';

export { AiConsole, AiConsoleSection, AI_CONSOLE_TABS, aiConsoleSidebarGroups, useConsoleTabs } from './AiConsole';
export { ConsoleSidebar } from './ConsoleSidebar';
export type { ConsoleSidebarGroup, ConsoleSidebarItem, ConsoleSidebarProps } from './ConsoleSidebar';
export { AiVault, AI_VAULT_SECTIONS } from './vault/AiVault';
export type { AiVaultSectionKey } from './vault/AiVault';
export type { AiConsoleTab } from './AiConsole';

export { AiStatusCard } from './AiStatusCard';
export { AiUsageOverview } from './AiUsageOverview';
export { AiRecentCalls } from './AiRecentCalls';
export { AiPromptTemplates } from './AiPromptTemplates';
export { AiVoiceEditor } from './AiVoiceEditor';
export { AiAssistantView } from './AiAssistantView';
export { AiKnowledgeBrowser } from './AiKnowledgeBrowser';
export { AiFeedbackInbox } from './AiFeedbackInbox';
export { AiGapInbox, type AssistantGap } from './AiGapInbox';
export { AiEstateOverview } from './AiEstateOverview';

export { dollars } from './types';
export type * from './types';
