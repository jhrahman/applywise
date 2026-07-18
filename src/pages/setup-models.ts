import type { AiProvider } from "@/types";

// The provider/model catalogue behind the Setup page's dropdowns. Kept out of
// Setup.tsx so it's importable as plain data — scripts/verify-model-lists.mjs
// asserts it against the extension's fallback chain, which a "keep in sync"
// comment can't do on its own.

// Providers whose models the fallback chain can hop across. The order it tries
// them in lives in extension/src/lib/ai/fallback.ts.
export const FALLBACK_PROVIDERS: AiProvider[] = [
  "gemini",
  "openrouter",
  "groq",
  "cerebras",
  "mistral",
  "cohere",
];

// Model IDs below are verified against each provider's own docs (see chat
// history / commit notes) rather than guessed — providers retire IDs over
// time though, so if one 404s, switch to "Custom model ID" on this page and
// grab the current one from the provider's own dashboard/docs.
export const MODELS: Record<AiProvider, { label: string; value: string }[]> = {
  // Ongoing free tier (rate-limited, no card required).
  gemini: [
    { label: "Gemini 3 Flash Preview — confirmed working, recommended", value: "gemini-3-flash-preview" },
    { label: "Gemini 3.5 Flash — flagship", value: "gemini-3.5-flash" },
    { label: "Gemini 3.1 Pro Preview — strongest reasoning", value: "gemini-3.1-pro-preview" },
    { label: "Gemini Flash Latest — always points at newest Flash", value: "gemini-flash-latest" },
    { label: "Gemini Pro Latest — always points at newest Pro", value: "gemini-pro-latest" },
    { label: "Gemini 3.1 Flash Lite — fastest, but shallower skill matching", value: "gemini-3.1-flash-lite" },
    {
      label: "Gemini Flash Lite Latest — fastest, but shallower skill matching",
      value: "gemini-flash-lite-latest",
    },
  ],
  // OpenRouter's ":free" model variants, ordered strongest first to match the
  // fallback chain. Verified against https://openrouter.ai/api/v1/models — all
  // six report zero prompt/completion pricing. The ":free" suffix is part of
  // the model ID and is what selects the free variant; dropping it silently
  // bills the paid one, so keep it.
  //
  // These are much slower than Gemini's (measured end-to-end: ~12s for hy3 up
  // to ~200s for nemotron-ultra), which is why the OpenRouter client uses its
  // own far higher timeout — see OPENROUTER_TIMEOUT_MS.
  //
  // One free-tier catch worth knowing: a 429 usually means that one model's
  // upstream host is busy (auto-fallback routes around it), but there's also a
  // per-account daily cap shared across every free model, which it can't route
  // around (see the OpenRouter rate-limit hint in extension/src/lib/ai/client.ts).
  openrouter: [
    {
      label: "Nemotron 3 Ultra 550B — strongest reasoning, recommended",
      value: "nvidia/nemotron-3-ultra-550b-a55b:free",
    },
    { label: "Nemotron 3 Super 120B — strong, faster", value: "nvidia/nemotron-3-super-120b-a12b:free" },
    { label: "Tencent HY3 — general purpose, fastest of the strong models", value: "tencent/hy3:free" },
    { label: "Gemma 4 31B — dense, dependable", value: "google/gemma-4-31b-it:free" },
    {
      label: "Gemma 4 26B A4B — fast, but shallower skill matching",
      value: "google/gemma-4-26b-a4b-it:free",
    },
    { label: "GPT-OSS 20B — smallest, shallowest skill matching", value: "openai/gpt-oss-20b:free" },
  ],
  // Groq's free, no-card tier on LPU hardware — the fastest of the free
  // providers. Values (and their order) mirror the fallback chain in
  // extension/src/lib/ai/fallback.ts exactly — verify-model-lists.mjs enforces
  // it. IDs verified against https://console.groq.com/docs/models.
  groq: [
    { label: "Llama 3.3 70B Versatile — reliable, recommended", value: "llama-3.3-70b-versatile" },
    { label: "GPT-OSS 120B — strong reasoning", value: "openai/gpt-oss-120b" },
    { label: "GPT-OSS 20B — fast, shallower skill matching", value: "openai/gpt-oss-20b" },
    { label: "Llama 3.1 8B Instant — fastest, shallowest matching", value: "llama-3.1-8b-instant" },
  ],
  // Cerebras — 1M tokens/day free, ultra-fast. Heads-up: the free tier caps
  // total context at ~8k tokens, so a long resume + our prompt can overflow and
  // error (auto-fallback then moves on). IDs from inference-docs.cerebras.ai.
  cerebras: [
    { label: "GLM 4.7 — strongest reasoning, recommended", value: "zai-glm-4.7" },
    { label: "GPT-OSS 120B — strong, general purpose", value: "gpt-oss-120b" },
    { label: "Gemma 4 31B — fast, shallower skill matching", value: "gemma-4-31b" },
  ],
  // Mistral's free Experiment tier. `-latest` aliases so a version bump doesn't
  // 404. IDs from docs.mistral.ai/models.
  mistral: [
    { label: "Mistral Large — flagship, recommended", value: "mistral-large-latest" },
    { label: "Magistral Medium — strong reasoning", value: "magistral-medium-latest" },
    { label: "Mistral Small — fast, shallower matching", value: "mistral-small-latest" },
    { label: "Ministral 8B — fastest, shallowest matching", value: "ministral-8b-latest" },
  ],
  // Cohere's free Trial key (1,000 calls/month, non-commercial), via its
  // OpenAI-compatible surface. IDs from docs.cohere.com.
  cohere: [
    { label: "Command A — flagship, recommended", value: "command-a-03-2025" },
    { label: "Command R+ — strong, general purpose", value: "command-r-plus-08-2024" },
    { label: "Command R — faster", value: "command-r-08-2024" },
    { label: "Command R7B — smallest, fastest", value: "command-r7b-12-2024" },
  ],
  // New-account trial credits (not an ongoing free tier), then pay-as-you-go.
  deepseek: [
    { label: "DeepSeek V4 Flash — fast, cheap", value: "deepseek-v4-flash" },
    { label: "DeepSeek V4 Pro — flagship reasoning", value: "deepseek-v4-pro" },
  ],
  glm: [
    { label: "GLM-5 Turbo — fast, cost-efficient", value: "glm-5-turbo" },
    { label: "GLM-5.2 — flagship, coding/agentic", value: "glm-5.2" },
    { label: "GLM-4.6 — previous generation", value: "glm-4.6" },
  ],
  // Paid API key required, no free tier.
  openai: [
    { label: "GPT-5.6 Luna — cost-sensitive", value: "gpt-5.6-luna" },
    { label: "GPT-5.6 Terra — balanced", value: "gpt-5.6-terra" },
    { label: "GPT-5.6 Sol — flagship reasoning", value: "gpt-5.6-sol" },
  ],
  anthropic: [
    { label: "Claude Haiku 4.5 — fast, economical", value: "claude-haiku-4-5-20251001" },
    { label: "Claude Sonnet 5 — agentic default", value: "claude-sonnet-5" },
    { label: "Claude Opus 4.8 — flagship", value: "claude-opus-4-8" },
  ],
  // xAI's Grok (api.x.ai) — paid, no free tier. Distinct from the Groq provider
  // above. IDs from docs.x.ai/developers/models (grok-4.5 is the current
  // recommended chat model; retired IDs redirect server-side).
  xai: [
    { label: "Grok 4.5 — flagship, recommended", value: "grok-4.5" },
    { label: "Grok 4.1 Fast — fast, agentic, 2M context", value: "grok-4.1-fast-reasoning" },
    { label: "Grok Code Fast 1 — coding-focused", value: "grok-code-fast-1" },
  ],
};

// Where to create/view an API key for each provider — shown as a hyperlink
// next to the API key field on Setup so a user isn't stuck guessing where to
// go. Official dashboard/key-management pages only.
export const PROVIDER_KEY_URLS: Record<AiProvider, string> = {
  gemini: "https://aistudio.google.com/api-keys",
  groq: "https://console.groq.com/keys",
  cerebras: "https://cloud.cerebras.ai",
  openrouter: "https://openrouter.ai/keys",
  mistral: "https://console.mistral.ai/api-keys",
  cohere: "https://dashboard.cohere.com/api-keys",
  deepseek: "https://platform.deepseek.com/api_keys",
  glm: "https://z.ai/manage-apikey/apikey-list",
  openai: "https://platform.openai.com/api-keys",
  anthropic: "https://console.anthropic.com/settings/keys",
  xai: "https://console.x.ai",
};

/** The provider's short display name (the part before "— free tier" etc.). */
export function providerDisplayName(provider: AiProvider): string {
  return PROVIDER_OPTIONS.find((o) => o.value === provider)?.label.split(" — ")[0] ?? provider;
}

export const PROVIDER_OPTIONS: { value: AiProvider; label: string }[] = [
  // Ongoing free tiers first, then trial credits, then paid.
  { value: "gemini", label: "Gemini — free tier" },
  { value: "groq", label: "Groq — free tier" },
  { value: "cerebras", label: "Cerebras — free tier" },
  { value: "openrouter", label: "OpenRouter — free tier" },
  { value: "mistral", label: "Mistral — free tier" },
  { value: "cohere", label: "Cohere — free trial (1k calls/mo)" },
  { value: "deepseek", label: "DeepSeek — free trial credits" },
  { value: "glm", label: "GLM (Zhipu / Z.ai) — free trial credits" },
  { value: "openai", label: "OpenAI — paid" },
  { value: "anthropic", label: "Anthropic — paid" },
  { value: "xai", label: "Grok (xAI) — paid" },
];
