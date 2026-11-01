import { createContext, useContext, useEffect, useRef, useState, type ReactNode, type ButtonHTMLAttributes } from 'react';
import { vault } from './bridge';
import { ConsolePortal } from '../ConsolePortal';
import { FloatingMenu } from '../FloatingMenu';

/**
 * The few UI parts the vault panels were written against in Portify (button, dialog, alert
 * dialog, dropdown, toast), rebuilt on the console's own theme variables so the panels carry
 * no product's palette. Same names and props as the originals, so the ported files read the
 * same as their source.
 */

const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ');

/* ---------------------------------------------------------------- Button */

type Variant = 'default' | 'outline' | 'ghost' | 'destructive' | 'secondary' | 'link';

const VARIANT: Record<Variant, string> = {
  default: 'border-transparent bg-[var(--ai-accent)] text-[var(--ai-accent-fg)]',
  outline: 'border-[var(--ai-border)] bg-transparent text-[var(--ai-fg)] hover:bg-[var(--ai-accent-soft)]',
  secondary: 'border-transparent bg-[var(--ai-accent-soft)] text-[var(--ai-fg)]',
  ghost: 'border-transparent bg-transparent text-[var(--ai-fg)] hover:bg-[var(--ai-accent-soft)]',
  destructive: 'border-transparent bg-[var(--ai-danger)] text-white',
  link: 'border-transparent bg-transparent text-[var(--ai-accent)] underline-offset-2 hover:underline',
};

export function Button({
  variant = 'default',
  size,
  className,
  asChild: _asChild,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'default' | 'lg' | 'icon'; asChild?: boolean }) {
  return (
    <button
      type="button"
      {...rest}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full border font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--ai-accent)] disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'px-3 py-1.5 text-xs' : size === 'icon' ? 'h-8 w-8 p-0' : 'px-4 py-2 text-sm',
        VARIANT[variant],
        className,
      )}
    />
  );
}

/* ---------------------------------------------------------------- Dialog */

const DialogCtx = createContext<{ close: () => void } | null>(null);

export function Dialog({ open, onOpenChange, children }: { open: boolean; onOpenChange?: (open: boolean) => void; children: ReactNode }) {
  const close = () => onOpenChange?.(false);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onOpenChange?.(false);
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [open, onOpenChange]);
  if (!open) return null;
  return <DialogCtx.Provider value={{ close }}>{children}</DialogCtx.Provider>;
}

/** The scrim and panel every console modal shares (see `ConsoleOverlay` in primitives). */
export function DialogContent({ className, children }: { className?: string; children: ReactNode }) {
  const ctx = useContext(DialogCtx);
  return (
    <ConsolePortal>
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[var(--ai-overlay,rgba(15,23,42,0.4))] p-4 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && ctx?.close()}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={cx(
          // A caller's own layout wins over the defaults it replaces (no class merger here).
          /(^|\s)flex(\s|$)/.test(className ?? '') ? 'flex' : 'grid',
          /max-w-/.test(className ?? '') ? null : 'max-w-lg',
          /overflow-hidden/.test(className ?? '') ? null : 'overflow-y-auto',
          'max-h-[90vh] w-full gap-4 rounded-[var(--ai-dialog-radius,1rem)] border border-[var(--ai-dialog-border,#e2e8f0)] bg-[var(--ai-dialog-bg,#ffffff)] p-6 text-[var(--ai-fg)] shadow-2xl backdrop-blur-xl',
          className?.replace(/(^|\s)(flex|sm:rounded-\S+)(?=\s|$)/g, ' '),
        )}
      >
        {children}
      </div>
    </div>
    </ConsolePortal>
  );
}

export const AlertDialog = Dialog;
export const AlertDialogContent = DialogContent;

export function DialogHeader({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx('space-y-1', className)}>{children}</div>;
}
export const AlertDialogHeader = DialogHeader;

export function DialogTitle({ className, children }: { className?: string; children: ReactNode }) {
  return <h2 className={cx('text-lg font-semibold', className)}>{children}</h2>;
}
export const AlertDialogTitle = DialogTitle;

export function DialogDescription({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx('text-sm text-[var(--ai-muted)]', className)}>{children}</div>;
}
export const AlertDialogDescription = DialogDescription;

export function DialogFooter({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx('flex flex-wrap justify-end gap-2', className)}>{children}</div>;
}
export const AlertDialogFooter = DialogFooter;

export function AlertDialogCancel({ className, children, onClick, disabled }: { className?: string; children: ReactNode; onClick?: () => void; disabled?: boolean }) {
  const ctx = useContext(DialogCtx);
  return (
    <Button variant="outline" className={className} disabled={disabled} onClick={() => { onClick?.(); ctx?.close(); }}>
      {children}
    </Button>
  );
}

/**
 * ⚠ Unlike Radix, the original's action closed the dialog before its handler ran; the ported
 * handlers all close it themselves (or keep it open on failure), so this only runs the handler.
 */
export function AlertDialogAction({ className, children, onClick, disabled }: { className?: string; children: ReactNode; onClick?: (e: React.MouseEvent) => void; disabled?: boolean }) {
  return (
    <Button className={className} disabled={disabled} onClick={(e) => onClick?.(e)}>
      {children}
    </Button>
  );
}

/* ---------------------------------------------------------- DropdownMenu */

const MenuCtx = createContext<{ open: boolean; setOpen: (o: boolean) => void; anchor: React.RefObject<HTMLSpanElement | null> } | null>(null);

export function DropdownMenu({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLSpanElement>(null);
  return (
    <MenuCtx.Provider value={{ open, setOpen, anchor }}>
      <span className="relative inline-block">{children}</span>
    </MenuCtx.Provider>
  );
}

/** `asChild` is accepted for parity: the trigger always wraps its child in one element. */
export function DropdownMenuTrigger({ children, asChild, ...rest }: { children: ReactNode; asChild?: boolean; className?: string; 'aria-label'?: string }) {
  const ctx = useContext(MenuCtx);
  const label = rest['aria-label'] ?? 'More actions';
  if (asChild) {
    // The ported triggers pass a <Button> as the child; clicks on it toggle the menu.
    return (
      <span ref={ctx?.anchor} onClick={() => ctx?.setOpen(!ctx.open)} aria-expanded={ctx?.open} className="inline-flex">
        {children}
      </span>
    );
  }
  return (
    <span ref={ctx?.anchor} className="inline-flex">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={ctx?.open}
        onClick={() => ctx?.setOpen(!ctx.open)}
        className={cx('rounded-full p-1.5 text-[var(--ai-muted)] outline-none hover:bg-[var(--ai-accent-soft)] focus-visible:ring-2 focus-visible:ring-[var(--ai-accent)]', rest.className)}
      >
        {children}
      </button>
    </span>
  );
}

/** Drawn on the body beside its trigger (see FloatingMenu), so a table's scroller cannot clip it. */
export function DropdownMenuContent({ children, align = 'end', className }: { children: ReactNode; align?: 'start' | 'end'; className?: string }) {
  const ctx = useContext(MenuCtx);
  if (!ctx) return null;
  return (
    <FloatingMenu anchor={ctx.anchor} open={ctx.open} onClose={() => ctx.setOpen(false)} align={align} className={className}>
      <MenuCtx.Provider value={ctx}>{children}</MenuCtx.Provider>
    </FloatingMenu>
  );
}

export function DropdownMenuItem({ children, onClick, onSelect, className, disabled }: { children: ReactNode; onClick?: () => void; onSelect?: () => void; className?: string; disabled?: boolean }) {
  const ctx = useContext(MenuCtx);
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={() => {
        ctx?.setOpen(false);
        (onSelect ?? onClick)?.();
      }}
      className={cx(
        'flex w-full items-center gap-2 whitespace-nowrap px-3 py-2 text-left text-sm outline-none hover:bg-[var(--ai-accent-soft)] focus-visible:bg-[var(--ai-accent-soft)] disabled:opacity-50',
        // The original's destructive items were `text-red-600`; the theme's danger replaces it.
        className?.includes('text-red') ? 'text-[var(--ai-danger)]' : className,
      )}
    >
      {children}
    </button>
  );
}

export function DropdownMenuSeparator() {
  return <div role="separator" className="my-1 h-px bg-[var(--ai-border)]" />;
}

/* ----------------------------------------------------------------- Toast */

export function useToast() {
  return {
    toast: (notice: { title: string; description?: string; variant?: string }) => vault().notify(notice),
  };
}
