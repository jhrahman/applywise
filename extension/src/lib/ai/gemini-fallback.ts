// Mirrors the free-tier Gemini model list on the web app's Setup page
// (src/pages/Setup.tsx) — keep in sync if that list changes.
//
// Split into two tiers rather than one flat list: a side-by-side test (same
// resume, same posting) showed meaningfully shallower skill matching from
// flash-lite vs. flash-preview/3.5-flash — "lite" tiers trade reasoning
// depth for speed/cost across every provider, and matching skills against a
// resume is exactly the kind of multi-step reasoning that trade-off hurts.
// So the fallback strategy (see withGeminiFallback in background.ts) retries
// every full-reasoning model — each one more than once, with a short pause,
// since "busy" is often transient — before ever touching a lite model. Lite
// models are only used if every full-reasoning model is confirmed down.
export const GEMINI_PREFERRED_MODELS = [
  "gemini-3-flash-preview",
  "gemini-flash-latest",
  "gemini-3.5-flash",
  "gemini-3.1-pro-preview",
  "gemini-pro-latest",
];

export const GEMINI_LITE_MODELS = ["gemini-3.1-flash-lite", "gemini-flash-lite-latest"];

export function isLiteGeminiModel(model: string): boolean {
  return GEMINI_LITE_MODELS.includes(model);
}

// Try each model once, then move straight to the next one. There are several
// strong models in the list, so on a "busy" error it's faster to hop to the
// next good model immediately than to sit and re-poke the same busy one —
// which was adding noticeable dead time to every analysis for little gain.
export const RETRIES_PER_PREFERRED_MODEL = 1;
export const RETRY_BACKOFF_MS = 0;

/**
 * Only errors that plausibly go away by trying a different model are worth
 * retrying — a bad API key or malformed request will fail identically on
 * every model, so those still surface immediately instead of burning through
 * the whole fallback list first.
 */
export function isRetryableGeminiError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message;
  return (
    /timed out/i.test(msg) ||
    /rate limit reached \(429\)/i.test(msg) ||
    /API error 50[0234]/i.test(msg) ||
    /overloaded/i.test(msg) ||
    /Could not reach/i.test(msg)
  );
}
