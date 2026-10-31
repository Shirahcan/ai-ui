import { useState, type ReactNode } from 'react';
import { useConsole } from './ConsoleContext';
import { AiEstateOverview } from './AiEstateOverview';
import { AiFeedbackInbox } from './AiFeedbackInbox';
import { AiKnowledgeBrowser } from './AiKnowledgeBrowser';
import { AiPromptTemplates } from './AiPromptTemplates';
import { AiRecentCalls } from './AiRecentCalls';
import { AiStatusCard } from './AiStatusCard';
import { AiUsageOverview } from './AiUsageOverview';
import { AiVoiceEditor } from './AiVoiceEditor';
import { LoadError, Loading } from './primitives';

export type AiConsoleTab = 'overview' | 'calls' | 'prompts' | 'voice' | 'knowledge' | 'feedback' | 'estate';

/** The console's sections, in order, with the words a tab bar shows. */
export const AI_CONSOLE_TABS: ReadonlyArray<{ key: AiConsoleTab; label: string; estateOnly?: boolean }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'calls', label: 'Calls' },
  { key: 'prompts', label: 'Prompts' },
  { key: 'voice', label: 'Voice' },
  { key: 'knowledge', label: 'Knowledge' },
  { key: 'feedback', label: 'Feedback' },
  { key: 'estate', label: 'All products', estateOnly: true },
];

/** One section of the console by name, for a product that routes each section to its own URL. */
export function AiConsoleSection({ tab }: { tab: AiConsoleTab }): ReactNode {
  switch (tab) {
    case 'overview':
      return (
        <div className="space-y-6">
          <AiStatusCard />
          <AiUsageOverview />
        </div>
      );
    case 'calls':
      return <AiRecentCalls />;
    case 'prompts':
      return <AiPromptTemplates />;
    case 'voice':
      return <AiVoiceEditor />;
    case 'knowledge':
      return <AiKnowledgeBrowser />;
    case 'feedback':
      return <AiFeedbackInbox />;
    case 'estate':
      return <AiEstateOverview />;
  }
}

/**
 * The whole console with its own tab bar. A product whose shell owns tabs (Portify's top bar)
 * instead renders `AiConsoleSection` per route and reads `useConsoleTabs()` for the list.
 */
export function AiConsole({ initialTab = 'overview' }: { initialTab?: AiConsoleTab }) {
  const tabs = useConsoleTabs();
  const { capabilitiesError } = useConsole();
  const [tab, setTab] = useState<AiConsoleTab>(initialTab);

  if (capabilitiesError) return <LoadError error={capabilitiesError} />;
  if (tabs === null) return <Loading />;

  return (
    <div className="space-y-6">
      <div role="tablist" aria-label="AI console" className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`whitespace-nowrap rounded-full border px-4 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--ai-accent)] ${
              tab === t.key
                ? 'border-transparent bg-[var(--ai-accent)] text-[var(--ai-accent-fg)]'
                : 'border-[var(--ai-border)] text-[var(--ai-fg)] hover:bg-[var(--ai-accent-soft)]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        <AiConsoleSection tab={tab} />
      </div>
    </div>
  );
}

/** The tabs this product may see, or null until its capabilities have loaded. */
export function useConsoleTabs() {
  const { capabilities } = useConsole();
  if (!capabilities) return null;
  return AI_CONSOLE_TABS.filter((t) => !t.estateOnly || capabilities.can.estate);
}
