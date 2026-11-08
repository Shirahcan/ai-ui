import { useConsoleResource } from './ConsoleContext';
import { Empty, LoadError, Loading, Pill, Section, Stat, Table, Td } from './primitives';

interface AssistantRecord {
  key: string;
  product_name: string;
  display_name: string;
  voice_persona_key: string | null;
  look?: { avatar_url?: string; greetings?: Record<string, string> };
  surfaces: { key: string; mode: 'conversation' | 'grounded' | 'silent'; label: string; description: string }[];
  identity: { audience: string | null; text: string; version: number; updated_at: string | null }[];
  status: string;
}

const MODE: Record<string, { tone: 'accent' | 'good' | 'muted'; words: string }> = {
  conversation: { tone: 'accent', words: 'Full voice' },
  grounded: { tone: 'good', words: 'Identity and knowledge; voice in its replies' },
  silent: { tone: 'muted', words: 'Nothing added' },
};

/**
 * The product's assistant as every surface runs it (1.42.0): its name, where it works and in which
 * mode, and which identity version each audience gets. Read-only: the identity and voice rows are
 * edited in Voice (key `identity` and the voice key), the surfaces come from the product's code.
 */
export function AiAssistantView() {
  const { data, error, loading, reload } = useConsoleResource<{ assistants?: AssistantRecord[] }>('assistants');

  if (loading && !data) return <Loading />;
  if (error && !data) return <LoadError error={error} onRetry={reload} />;

  const assistants = data?.assistants ?? [];
  if (assistants.length === 0) {
    return (
      <Section title="Assistant" description="One assistant for every place it works: the chat, builders, drafts.">
        <Empty>No assistant is published for this product yet. Run ai:assistant-sync on the product after setting AI_ASSISTANT.</Empty>
      </Section>
    );
  }

  return (
    <div className="space-y-6">
      {assistants.map((a) => (
        <Section
          key={a.key}
          title={a.display_name}
          description={`The assistant inside ${a.product_name}. Every surface below gets the same identity, knowledge and rules; each adds only its own skill.`}
        >
          <div className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Key" value={a.key} />
            <Stat label="Voice" value={a.voice_persona_key ?? 'none'} hint="Edited in Voice" />
            <Stat label="Surfaces" value={a.surfaces.length} />
            <Stat label="Status" value={a.status === 'active' ? 'Active' : 'Paused'} />
          </div>

          <h3 className="mb-2 text-sm font-semibold">Who it is, per audience</h3>
          <Table head={['Audience', 'Version', 'Identity']} empty={<Empty>No identity published: every surface says only its product's name. Add rows with key "identity" in Voice.</Empty>}>
            {a.identity.map((row) => (
              <tr key={`${row.audience ?? '*'}-${row.version}`}>
                <Td>{row.audience ?? 'Everyone'}</Td>
                <Td>v{row.version}</Td>
                <Td className="whitespace-pre-line text-sm">{row.text}</Td>
              </tr>
            ))}
          </Table>

          <h3 className="mb-2 mt-6 text-sm font-semibold">Where it works</h3>
          <Table head={['Surface', 'Mode', 'What it does here']} empty={<Empty>No surfaces registered yet.</Empty>}>
            {a.surfaces.map((s) => (
              <tr key={s.key}>
                <Td>
                  <div className="font-medium">{s.label}</div>
                  <div className="text-xs text-[var(--ai-muted)]">{s.key}</div>
                </Td>
                <Td>
                  <Pill tone={MODE[s.mode]?.tone ?? 'muted'}>{MODE[s.mode]?.words ?? s.mode}</Pill>
                </Td>
                <Td className="text-sm">{s.description}</Td>
              </tr>
            ))}
          </Table>
        </Section>
      ))}
    </div>
  );
}
