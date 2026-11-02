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
import { ProductPicker } from './ProductPicker';
import { ConsoleSidebar, type ConsoleSidebarGroup } from './ConsoleSidebar';
import { AiVault, AI_VAULT_SECTIONS, type AiVaultSectionKey } from './vault/AiVault';
import type { ConsoleCapabilities } from './types';
import { BookOpen, Clock, DollarSign, FileText, Gauge, KeyRound, Layers, ListIcon, MessageVoice, OctagonX, Route, ShieldCheck, ThumbsUp, Wallet } from './vault/icons';

/** One icon per section, so the collapsed sidebar is a rail of recognisable glyphs. */
const TAB_ICONS: Record<string, (p: { className?: string }) => React.ReactElement> = {
  overview: Gauge,
  calls: ListIcon,
  prompts: FileText,
  voice: MessageVoice,
  knowledge: BookOpen,
  feedback: ThumbsUp,
  estate: Layers,
  'vault.keys': KeyRound,
  'vault.routing': Route,
  'vault.prices': DollarSign,
  'vault.caps': Wallet,
  'vault.retention': Clock,
  'vault.access': ShieldCheck,
  'vault.stop': OctagonX,
};

function tabIcon(key: string) {
  const Icon = TAB_ICONS[key];
  return Icon ? <Icon className="h-4 w-4" /> : undefined;
}

export type AiConsoleTab = 'overview' | 'calls' | 'prompts' | 'voice' | 'knowledge' | 'feedback' | 'estate' | `vault.${AiVaultSectionKey}`;

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

/** The sections that show ONE product's AI, so the product picker sits above them. */
const PRODUCT_SECTIONS: ReadonlyArray<AiConsoleTab> = ['overview', 'calls', 'prompts', 'voice', 'knowledge', 'feedback'];

/**
 * One section of the console by name, for a product that routes each section to its own URL.
 * Product sections carry the product picker above them when the console may switch products
 * (pass `picker={false}` to draw `<ProductPicker />` somewhere else, e.g. a top bar).
 */
export function AiConsoleSection({ tab, picker = true }: { tab: AiConsoleTab; picker?: boolean }): ReactNode {
  if (picker && PRODUCT_SECTIONS.includes(tab)) {
    return (
      <div className="space-y-4">
        <div className="flex justify-end empty:hidden">
          <ProductPicker />
        </div>
        {sectionBody(tab)}
      </div>
    );
  }
  return sectionBody(tab);
}

function sectionBody(tab: AiConsoleTab): ReactNode {
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
    default:
      // `vault.<section>`: one part of the estate's AI vault.
      return <AiVault section={tab.slice('vault.'.length) as AiVaultSectionKey} />;
  }
}

/**
 * The AI area's sidebar groups for this product: its own sections, then the AI vault's parts
 * when it holds the estate admin key. One list, so every product's sidebar matches.
 */
export function aiConsoleSidebarGroups(capabilities: ConsoleCapabilities | null, hrefFor: (tab: AiConsoleTab) => string): ConsoleSidebarGroup[] {
  const estate = capabilities?.can.estate === true;
  const main = AI_CONSOLE_TABS.filter((t) => !t.estateOnly || estate).map((t) => ({ key: t.key, label: t.label, href: hrefFor(t.key), icon: tabIcon(t.key) }));
  if (!estate) return [{ items: main }];
  const vault = AI_VAULT_SECTIONS.map((v) => {
    const key = `vault.${v.key}` as AiConsoleTab;
    return { key, label: v.label, href: hrefFor(key), icon: tabIcon(key) };
  });
  return [{ items: main }, { label: 'AI vault', items: vault }];
}

/**
 * The whole console with its own tab bar. A product whose shell owns tabs (Portify's top bar)
 * instead renders `AiConsoleSection` per route and reads `useConsoleTabs()` for the list.
 */
export function AiConsole({ initialTab = 'overview', storageKey = 'ai-console.sidebar' }: { initialTab?: AiConsoleTab; storageKey?: string }) {
  const { capabilities, capabilitiesError } = useConsole();
  const [tab, setTab] = useState<AiConsoleTab>(initialTab);

  if (capabilitiesError) return <LoadError error={capabilitiesError} />;
  if (!capabilities) return <Loading />;

  return (
    <ConsoleSidebar
      ariaLabel="AI sections"
      groups={aiConsoleSidebarGroups(capabilities, (t) => `#${t}`)}
      activeKey={tab}
      storageKey={storageKey}
      renderLink={(item, props) => (
        <button
          type="button"
          className={`w-full text-left ${props.className}`}
          aria-current={props['aria-current']}
          aria-label={props['aria-label']}
          title={props.title}
          onClick={() => setTab(item.key as AiConsoleTab)}
        >
          {props.children}
        </button>
      )}
    >
      <AiConsoleSection tab={tab} />
    </ConsoleSidebar>
  );
}

/** The tabs this product may see, or null until its capabilities have loaded. */
export function useConsoleTabs() {
  const { capabilities } = useConsole();
  if (!capabilities) return null;
  return AI_CONSOLE_TABS.filter((t) => !t.estateOnly || capabilities.can.estate);
}
