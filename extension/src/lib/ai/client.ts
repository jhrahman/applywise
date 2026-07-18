import type { InterviewQA, JobPosting, MatchAnalysis, ProviderSettings } from "../types";

export interface AiClient {
  generateMatchAnalysis(resumeText: string, job: JobPosting): Promise<MatchAnalysis>;
  generateInterviewQuestions(resumeText: string, job: JobPosting): Promise<InterviewQA[]>;
}

export class AiRequestError extends Error {}

/**
 * The provider answered, but the body isn't usable: not JSON, or JSON that
 * doesn't fit the schema.
 *
 * Its own type rather than a bare Error so the fallback chain can recognise it
 * (see isRetryableAiError). Whether a model wraps its JSON in prose or drops a
 * required field is a quirk of that model, not of the request — so, unlike a
 * bad API key, the next model in the chain has a real chance of succeeding and
 * this is worth retrying. It extends AiRequestError so describeAiError()
 * surfaces the message as-is; keep messages user-readable.
 */
export class AiResponseFormatError extends AiRequestError {}

// Match scoring should behave like a computation over the resume/posting
// text, not a creative task — a low temperature minimizes sampling noise so
// re-analyzing the same resume against the same posting gives (close to) the
// same score. Interview questions benefit from more variety, so they keep a
// higher temperature.
export const MATCH_ANALYSIS_TEMPERATURE = 0.1;
export const INTERVIEW_QUESTIONS_TEMPERATURE = 0.5;

// Gemini and OpenRouter match analysis can fall back across several models
// (see fallback.ts) — a bounded per-attempt timeout means a stuck/overloaded
// model gets abandoned for the next one instead of hanging the analysis.
//
// These values look far larger than the 20s/30s they replaced, but they are
// not a loosening — they're the first values that actually apply. The old
// timeout cleared its timer as soon as fetch() resolved, which happens when
// response *headers* arrive (measured: 0.7s), leaving the model's entire
// generation phase unbounded. Nothing was ever capped at 20s, so the 20s was
// never tested against real generation times. fetchTextWithTimeout below now
// holds the timer until the body is read, which makes the number real for the
// first time — so it has to clear a genuinely working model's slowest run, or
// it would start killing analyses that succeed today.
//
// Measured end-to-end match-analysis times on OpenRouter's free tier: hy3
// 13s, gemma-4-26b 22s, nemotron-super-120b 55s, gpt-oss-20b 105s,
// nemotron-ultra-550b 196s. Free endpoints are heavily shared and slow, hence
// OpenRouter's own far higher cap. Gemini's is set well above its typical few
// seconds while still bounding a true hang.
export const MATCH_ANALYSIS_TIMEOUT_MS = 90_000;

// Lite models additionally get the anti-skim nudge and are the last resort in
// the fallback chain — nothing follows them, so a timeout here means total
// failure. Give that path extra headroom so a large enumeration finishes
// instead of getting killed mid-reasoning.
export const MATCH_ANALYSIS_THOROUGH_TIMEOUT_MS = 120_000;

// A timeout only costs real time when a model is genuinely stuck: the common
// free-tier failure is a 429, which comes back in ~0.3s and hops to the next
// model immediately. So this is generous enough for the slowest measured model
// (196s, and 220s on a longer resume) rather than tuned to hop early. Stays
// under Chrome's 5-minute MV3 service-worker ceiling. Applies to interview
// questions too, not just match analysis — same models, same slowness.
export const OPENROUTER_TIMEOUT_MS = 240_000;

/**
 * Fetches and reads the full body under a single deadline.
 *
 * The body read is the point: `fetch` resolves once headers are in, but an LLM
 * sends headers almost immediately and then streams for as long as it takes to
 * generate. Timing out only the fetch therefore bounds nothing that matters.
 * The timer is cleared after `.text()` completes, so `timeoutMs` covers the
 * whole exchange.
 */
export async function fetchTextWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs = 90_000
): Promise<{ response: Response; body: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    const body = await response.text();
    return { response, body };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new AiRequestError(
        `Request to ${new URL(input).host} timed out after ${Math.round(timeoutMs / 1000)}s.`
      );
    }
    throw new AiRequestError(
      `Could not reach ${new URL(input).host}. This may be a CORS or network issue — see the README's CORS note.`
    );
  } finally {
    clearTimeout(timer);
  }
}

const RATE_LIMIT_HINTS: Record<string, string> = {
  Gemini:
    "Check your usage at https://aistudio.google.com/usage — free-tier quotas vary a lot by model. " +
    "Try a lighter/flash-lite model on the Setup page, or wait a bit and retry (per-minute limits reset quickly; daily limits reset at midnight Pacific time).",
  // Two separate limits, and the difference decides whether falling back helps.
  // Verified live: one ":free" model returned "temporarily rate-limited
  // upstream" while other free models answered fine in the same run — so a 429
  // is usually that one model's upstream host, and auto-fallback routes around
  // it. The per-account daily cap on free models is the case it can't route
  // around, since that limits every free model at once.
  OpenRouter:
    "A \":free\" model is usually rate-limited on its own upstream host, so leaving auto-fallback on (Setup page) lets another free model take over. " +
    "If every free model is limited, you've likely hit the shared daily cap on free models instead — check https://openrouter.ai/activity. It resets daily, and adding credits raises it.",
  // Genuine free tiers — a 429 usually means you hit the per-minute/day cap on
  // the model you picked; auto-fallback (Setup page) hops to another free model
  // in the same provider, which clears a per-model hiccup but not an
  // account-wide cap.
  Groq:
    "Groq's free tier is rate-limited per minute and per day — check your usage at https://console.groq.com/settings/limits. " +
    "Leave auto-fallback on (Setup page) to hop to another free Groq model, or wait for the per-minute window to reset.",
  Cerebras:
    "Cerebras' free tier caps requests per minute (and total context at ~8k tokens) — see https://cloud.cerebras.ai. " +
    "The per-minute limit is account-wide across models, so if every free model is limited, wait for the window to reset rather than switching models.",
  Mistral:
    "Mistral's free Experiment tier is rate-limited — check https://console.mistral.ai. " +
    "Auto-fallback (Setup page) tries other free Mistral models; a persistent limit means waiting for the window to reset.",
  Cohere:
    "Cohere's free Trial key allows ~20 requests/minute and 1,000 calls/month, shared across every model — see https://dashboard.cohere.com. " +
    "That cap is account-wide, so switching models won't route around it; wait for the window to reset or move to another provider.",
  OpenAI: "Check your usage and rate limits at https://platform.openai.com/usage.",
  Anthropic: "Check your usage and rate limits at https://console.anthropic.com/settings/usage.",
  DeepSeek: "Check your usage and rate limits at https://platform.deepseek.com/usage.",
  GLM: "Check your usage and rate limits at https://z.ai/model-api.",
  Grok: "Check your usage and rate limits at https://console.x.ai.",
};

/**
 * Google's 429 body includes structured details (which quota was hit, its
 * limit, and how long to wait) buried in error.details[]. Surface that
 * instead of a generic message so "quota exceeded" is actually diagnosable
 * (e.g. a free-tier key with a per-model limit of 0 looks identical to a
 * genuinely exhausted quota unless you see the metric name).
 */
function extractQuotaDetail(body: string): string | null {
  try {
    const data = JSON.parse(body);
    const details: unknown[] = data?.error?.details ?? [];
    const parts: string[] = [];

    for (const d of details) {
      const detail = d as Record<string, unknown>;
      if (detail["@type"] === "type.googleapis.com/google.rpc.QuotaFailure") {
        const violations = (detail.violations as Record<string, unknown>[]) ?? [];
        for (const v of violations) {
          parts.push(`quota "${v.quotaId}" (limit: ${v.quotaValue ?? "0"})`);
        }
      }
      if (detail["@type"] === "type.googleapis.com/google.rpc.RetryInfo" && detail.retryDelay) {
        parts.push(`retry after ${detail.retryDelay}`);
      }
    }

    return parts.length > 0 ? parts.join(", ") : null;
  } catch {
    return null;
  }
}

export function assertOk(response: Response, body: string, provider: string): void {
  if (response.status === 429) {
    const hint = RATE_LIMIT_HINTS[provider] ?? "Wait a bit and try again.";
    const quotaDetail = extractQuotaDetail(body);
    const detailSuffix = quotaDetail ? ` [${quotaDetail}]` : ` Raw response: ${body.slice(0, 250)}`;
    throw new AiRequestError(`${provider} rate limit reached (429). ${hint}${detailSuffix}`);
  }
  if (!response.ok) {
    throw new AiRequestError(`${provider} API error ${response.status}: ${body.slice(0, 300)}`);
  }
}

export type { ProviderSettings };
