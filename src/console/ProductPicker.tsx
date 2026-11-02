import { ALL_PRODUCTS, useConsole, type ConsoleError } from './ConsoleContext';
import { INPUT } from './primitives';

/**
 * Which product the AI sections show (Site management v2, owner 2026-11-02: "since Portify has
 * master admin access, each sub-tab should surface every product via select items, e.g. Portify,
 * MployNow, ..., All products").
 *
 * Rendered only for a console holding the estate admin key (`can.act_for_products`); every other
 * console shows its own product and draws nothing here. `allowAll` is false on a section that has
 * no list to merge (the status card).
 */
export function ProductPicker({ allowAll = true, className = '' }: { allowAll?: boolean; className?: string }) {
  const { capabilities, products, product, setProduct } = useConsole();
  if (capabilities?.can.act_for_products !== true || products.length < 2 || product === null) return null;

  const value = !allowAll && product === ALL_PRODUCTS ? (capabilities.product ?? '') : product;

  return (
    <label className={`inline-flex items-center gap-2 text-sm ${className}`}>
      <span className="whitespace-nowrap text-[var(--ai-muted)]">Product</span>
      <select aria-label="Product" className={`${INPUT} w-auto`} value={value} onChange={(e) => setProduct(e.target.value)}>
        {products.map((p) => (
          <option key={p.key} value={p.key}>
            {p.label}
            {p.own ? ' (this site)' : ''}
          </option>
        ))}
        {allowAll ? <option value={ALL_PRODUCTS}>All products</option> : null}
      </select>
    </label>
  );
}

/** A one-line note under a section's title while it shows another product or every product. */
export function ScopeNote({ failed = [] }: { failed?: Array<{ product: string; error: ConsoleError }> }) {
  const { viewingOther, allProducts, product, productName } = useConsole();
  if (!viewingOther || product === null) return null;

  return (
    <>
    {allProducts && failed.length ? (
      <p className="mb-3 rounded-lg bg-[#fee2e2] px-3 py-2 text-sm text-[var(--ai-danger)]">
        Not shown: {failed.map((f) => `${productName(f.product)} (${f.error.message})`).join('; ')}
      </p>
    ) : null}
    <p className="mb-3 rounded-lg bg-[var(--ai-accent-soft)] px-3 py-2 text-sm">
      {allProducts ? (
        <>Showing <strong>every product</strong>, read-only. Pick one product to change anything.</>
      ) : (
        <>Showing <strong>{productName(product)}</strong>. Changes you make here apply to {productName(product)}, and are recorded with your name.</>
      )}
    </p>
    </>
  );
}
