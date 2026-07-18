import { AiResponseFormatError } from "./client";
import type { AiProvider, ProviderSettings } from "../types";

// Model lists mirror the ones on the web app's Setup page (src/pages/Setup.tsx)
// — keep in sync if that list changes.
//
// Each provider that can fall back is split into two tiers rather than one flat
// list: a side-by-side test (same resume, same posting) showed meaningfully
// shallower skill matching from flash-lite vs. flash-preview/3.5-flash — "lite"
// tiers trade reasoning depth for speed/cost across every provider, and matching
// skills against a resume is exactly the kind of multi-step reasoning that
// trade-off hurts. So the fallback strategy (see withModelFallback in
// background.ts) tries every full-reasoning model before ever touching a lite
// one. Lite models are only used if every full-reasoning model is confirmed
// down.
export interface ModelTiers {
  /** Full-reasoning models, strongest first. */
  preferred: string[];
  /** Last-resort models, tried once each only after `preferred` is exhausted. */
  lite: string[];
}

// Only providers with a free tier worth hopping across get a fallback chain.
// The paid ones (OpenAI/Anthropic/xAI) and the trial-credit ones
// (DeepSeek/GLM) have nothing to fall back *to* — a busy model there is not a
// quota problem, and silently spending the user's money on a model they didn't
// pick would be worse than surfacing the error.
export const FALLBACK_MODELS: Partial<Record<AiProvider, ModelTiers>> = {
  gemini: {
    preferred: [
      "gemini-3-flash-preview",
      "gemini-flash-latest",
      "gemini-3.5-flash",
      "gemini-3.1-pro-preview",
      "gemini-pro-latest",
    ],
    lite: ["gemini-3.1-flash-lite", "gemini-flash-lite-latest"],
  },
  // OpenRouter's ":free" variants, ordered by reasoning capacity (verified
  // against the live /api/v1/models catalog — all six report zero prompt and
  // completion pricing). The nemotron pair leads on raw parameter count, then
  // hy3 and the dense gemma-4-31b.
  //
  // The lite tier is where the small/sparse models land: gemma-4-26b-a4b
  // activates only ~4B of its 26B per token, and gpt-oss-20b is the smallest
  // of the set — both skim exactly the way Gemini's flash-lite tier does.
  openrouter: {
    preferred: [
      "nvidia/nemotron-3-ultra-550b-a55b:free",
      "nvidia/nemotron-3-super-120b-a12b:free",
      "tencent/hy3:free",
      "google/gemma-4-31b-it:free",
    ],
    lite: ["google/gemma-4-26b-a4b-it:free", "openai/gpt-oss-20b:free"],
  },
};

/** Whether this provider has a free-tier model chain worth falling back across. */
export function providerSupportsFallback(provider: AiProvider): boolean {
  return provider in FALLBACK_MODELS;
}

// Model IDs that self-identify as a fast/lightweight tier. This catches the
// case the static lists above can't: a user who picks a flash-lite (or other
// small) model directly as their main model — via the model dropdown or the
// custom-model-ID field — instead of only reaching one through the fallback
// chain. Those models skim the same way, so they need the same anti-skim
// prompt and longer timeout. Deliberately conservative substrings so a
// full-reasoning model ("gemini-flash-latest", "gemini-3.5-flash") never
// matches.
const LITE_MODEL_PATTERN =
  /flash-?lite|(?:^|[-/])lite(?:$|[-:])|(?:^|[-/])mini(?:$|[-:])|(?:^|[-/])nano(?:$|[-:])|-a4b|gpt-oss-20b/i;

export function isLiteModel(provider: AiProvider, model: string): boolean {
  if (FALLBACK_MODELS[provider]?.lite.includes(model)) return true;
  return LITE_MODEL_PATTERN.test(model);
}

/**
 * The fallback toggle is a global switch, but it only has meaning for the
 * providers above. Settings saved before the toggle shipped have no
 * `fallbackEnabled` field at all — those default to enabled, since Gemini
 * fallback was unconditional back then and turning it off under existing users
 * would be a silent regression.
 */
export function isFallbackEnabled(settings: ProviderSettings): boolean {
  return (settings.fallbackEnabled ?? true) && providerSupportsFallback(settings.provider);
}

/**
 * The full model order to attempt: the user's configured model always leads
 * (so their explicit choice is never demoted), then the remaining
 * full-reasoning models, then lite as a last resort. Returns just the
 * configured model when fallback is off or unsupported.
 */
export function buildModelOrder(settings: ProviderSettings): string[] {
  if (!isFallbackEnabled(settings)) return [settings.model];
  const tiers = FALLBACK_MODELS[settings.provider]!;
  const configured = settings.model;
  return [
    configured,
    ...tiers.preferred.filter((m) => m !== configured),
    ...tiers.lite.filter((m) => m !== configured),
  ];
}

// Try each model once, then move straight to the next one. There are several
// strong models in the list, so on a "busy" error it's faster to hop to the
// next good model immediately than to sit and re-poke the same busy one —
// which was adding noticeable dead time to every analysis for little gain.
export const RETRIES_PER_PREFERRED_MODEL = 1;
export const RETRY_BACKOFF_MS = 0;

export interface AttemptInfo {
  model: string;
  attemptNumber: number;
  maxAttempts: number;
  previousModel: string | null;
  usingLiteFallback: boolean;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runs `attempt` with the configured model first; on a timeout/429/high-load
 * error from a provider with a free-tier chain (Gemini, OpenRouter), keeps
 * retrying — the same model a couple more times (a "busy" error is often
 * transient), then the next full-reasoning model, and so on through every
 * model in the provider's `preferred` tier before touching a "lite" one at
 * all. Lite models are a last resort tried once each, only once every
 * full-reasoning model is confirmed down.
 *
 * Runs exactly once — no model hopping — when the user has switched the
 * fallback toggle off, when the provider has no free-tier chain (the paid and
 * trial-credit ones), or on a non-retryable error such as a bad API key, since
 * switching models can't fix any of those. `onAttempt` fires before every
 * attempt so the caller can surface live progress.
 *
 * Lives here rather than in the background worker so it stays free of any
 * chrome API import, and can therefore be exercised directly against real
 * providers (see scripts/verify-openrouter.mjs).
 */
export async function withModelFallback<T>(
  settings: ProviderSettings,
  attempt: (settings: ProviderSettings) => Promise<T>,
  onAttempt?: (info: AttemptInfo) => void
): Promise<{ result: T; modelUsed: string }> {
  const modelOrder = buildModelOrder(settings);
  const canFallBack = isFallbackEnabled(settings);
  const configured = settings.model;

  let previousModel: string | null = null;
  let lastErr: unknown;

  for (let mi = 0; mi < modelOrder.length; mi++) {
    const model = modelOrder[mi];
    const isLastModel = mi === modelOrder.length - 1;
    const lite = isLiteModel(settings.provider, model);
    const maxAttempts = lite ? 1 : RETRIES_PER_PREFERRED_MODEL;

    for (let attemptNumber = 1; attemptNumber <= maxAttempts; attemptNumber++) {
      onAttempt?.({
        model,
        attemptNumber,
        maxAttempts,
        previousModel: attemptNumber === 1 ? previousModel : null,
        usingLiteFallback: lite && model !== configured,
      });
      try {
        const result = await attempt({ ...settings, model });
        return { result, modelUsed: model };
      } catch (err) {
        lastErr = err;
        if (!canFallBack || !isRetryableAiError(err)) throw err;
        const isLastAttemptForModel = attemptNumber === maxAttempts;
        if (isLastAttemptForModel && isLastModel) throw err;
        if (!isLastAttemptForModel) await sleep(RETRY_BACKOFF_MS);
      }
    }
    previousModel = model;
  }
  throw lastErr;
}

/**
 * Only errors that plausibly go away by trying a different model are worth
 * retrying — a bad API key or malformed request will fail identically on
 * every model, so those still surface immediately instead of burning through
 * the whole fallback list first.
 */
export function isRetryableAiError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;

  // A reply that isn't JSON, or is JSON of the wrong shape, reflects how this
  // particular model formats its answer — a different model will likely get it
  // right. Without this the chain gave up on the very first model whenever a
  // prompt-only model wrapped its JSON in "Here is the analysis:".
  if (err instanceof AiResponseFormatError) return true;

  const msg = err.message;
  return (
    /timed out/i.test(msg) ||
    /rate limit reached \(429\)/i.test(msg) ||
    /API error 50[0234]/i.test(msg) ||
    /overloaded/i.test(msg) ||
    /Could not reach/i.test(msg) ||
    // OpenRouter routes to third-party hosts that sometimes return 200 with an
    // empty completion (typically a reasoning model that spent its budget
    // before emitting content). Nothing about that is specific to the request,
    // so the next model in the chain is very likely to succeed.
    /returned an empty response/i.test(msg)
  );
}
