import type { AiProvider } from "@/types";

// The provider/model catalogue behind the Setup page's dropdowns. Kept out of
// Setup.tsx so it's importable as plain data — scripts/verify-model-lists.mjs
// asserts it against the extension's fallback chain, which a "keep in sync"
// comment can't do on its own.

// Providers whose models the fallback chain can hop across. The order it tries
// them in lives in extension/src/lib/ai/fallback.ts.
export const FALLBACK_PROVIDERS: AiProvider[] = ["gemini", "openrouter"];

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
  xai: [
    { label: "Grok Code Fast 1 — fast, coding-focused", value: "grok-code-fast-1" },
    { label: "Grok 4.5 — flagship", value: "grok-4.5" },
  ],
};

export const PROVIDER_OPTIONS: { value: AiProvider; label: string }[] = [
  { value: "gemini", label: "Gemini — free tier" },
  { value: "openrouter", label: "OpenRouter — free tier" },
  { value: "deepseek", label: "DeepSeek — free trial credits" },
  { value: "glm", label: "GLM (Zhipu / Z.ai) — free trial credits" },
  { value: "openai", label: "OpenAI — paid" },
  { value: "anthropic", label: "Anthropic — paid" },
  { value: "xai", label: "Grok (xAI) — paid" },
];
