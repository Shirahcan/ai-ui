/**
 * How a product, a provider or a status is WRITTEN, as distinct from how it is
 * stored.
 *
 * ⚠ THE STORED VALUES ARE LOWERCASE AND MUST STAY THAT WAY. `portify`,
 * `mploynow`, `gemini`, `github_models` are the service's closed product set and
 * the `provider` column its adapter factory keys off - capitalising one on the
 * way to the API would simply fail to match a credential, and the symptom would
 * be "no credential available" rather than anything about spelling. Everything
 * here is for rendering only.
 *
 * ⚠ AND IT IS A MAP, NOT `ucfirst()`. Almost every name in this estate is a
 * brand with its own capitalisation, and the mechanical version gets most of
 * them wrong: "Openai", "Openrouter", "Github_models", "Sambanova", "Mploynow".
 * A console that misspells the products it administers reads as one nobody
 * owns.
 */

/**
 * ⚠ ONE ENTRY PER NAME THE ESTATE ACTUALLY USES. A name missing from here falls
 * back to title case, which is right for a plain word and wrong for a brand - so
 * a new provider is added HERE in the same change that adds its credential,
 * not left to the fallback.
 */
const PRODUCTS: Record<string, string> = {
  portify: 'Portify',
  mploynow: 'MployNow',
  // The service's product key is `finance`; the product is the finance suite.
  finance: 'Finance Suite',
  studendly: 'Studendly',
};

const PROVIDERS: Record<string, string> = {
  gemini: 'Gemini',
  groq: 'Groq',
  mistral: 'Mistral',
  cerebras: 'Cerebras',
  sambanova: 'SambaNova',
  openrouter: 'OpenRouter',
  github_models: 'GitHub Models',
  openai: 'OpenAI',
  claude: 'Claude',
  grok: 'Grok',
  tavily: 'Tavily',
};

/**
 * Title case for a name nobody has written down yet.
 *
 * Splits on underscores and spaces so `some_new_provider` reads as
 * "Some New Provider" rather than as a slug with a capital letter.
 */
function titleCase(value: string): string {
  return value
    .split(/[\s_]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function productName(product: string | null | undefined): string {
  if (!product) return '';

  return PRODUCTS[product] ?? titleCase(product);
}

export function providerName(provider: string | null | undefined): string {
  if (!provider) return '';

  return PROVIDERS[provider] ?? titleCase(provider);
}

/** Every product, written out, for a sentence that lists them all. */
export function productList(products: readonly string[]): string {
  return products.map(productName).join(', ');
}

/**
 * A short status or tier label, sentence-cased.
 *
 * ⚠ THE TABLE ALREADY SAID "Answering" AND "Every product" IN ONE ROW AND
 * "free", "no", "in rotation" IN THE NEXT, which is the inconsistency that makes
 * a screen look unfinished even when every word in it is correct. One helper, so
 * a new status cannot arrive in the other style.
 */
export function label(value: string | null | undefined): string {
  if (!value) return '';

  return value.charAt(0).toUpperCase() + value.slice(1);
}
