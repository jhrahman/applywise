// Mirrors the free-tier Gemini model list on the web app's Setup page
// (src/pages/Setup.tsx) — keep in sync if that list changes. This is the
// order tried when the configured model times out or is under high load, so
// a single busy/slow model doesn't fail the whole analysis outright.
export const GEMINI_FALLBACK_MODELS = [
  "gemini-3-flash-preview",
  "gemini-flash-latest",
  "gemini-3.1-flash-lite",
  "gemini-flash-lite-latest",
  "gemini-3.5-flash",
  "gemini-3.1-pro-preview",
  "gemini-pro-latest",
];

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
