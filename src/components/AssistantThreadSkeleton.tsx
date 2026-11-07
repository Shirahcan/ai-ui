import { aiVar } from '../theme';

/**
 * Placeholder bubbles while a thread is fetched: restoring the last conversation on open, or opening one from
 * the list. `label` says which ("Restoring your last conversation...").
 *
 * Pass it as `AssistantChat`'s `renderEmpty` until the conversation hook reports `ready`, so the panel never
 * flashes its welcome view, or a blank one, in front of a thread that is about to arrive.
 *
 * Moved out of Portify (1.39.0, owner 2026-11-07: Mira mirrors Porter 1:1). It takes the theme's colours, so
 * each product's skeleton matches its own bubbles rather than Porter's blue.
 */
export function AssistantThreadSkeleton({ label }: { label: string }) {
  const assistant = { background: aiVar('--ai-accent-soft') };
  const person = { background: aiVar('--ai-bubble-user-bg') };

  return (
    <div className="space-y-3" aria-live="polite" aria-busy="true">
      <p className="text-sm" style={{ color: aiVar('--ai-muted') }}>{label}</p>
      <div className="flex justify-start">
        <div className="h-16 w-3/4 animate-pulse rounded-2xl" style={assistant} />
      </div>
      <div className="flex justify-end">
        <div className="h-10 w-1/2 animate-pulse rounded-2xl" style={person} />
      </div>
      <div className="flex justify-start">
        <div className="h-12 w-2/3 animate-pulse rounded-2xl" style={assistant} />
      </div>
    </div>
  );
}
