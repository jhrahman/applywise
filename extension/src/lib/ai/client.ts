import type { InterviewQA, JobPosting, MatchAnalysis, ProviderSettings } from "../types";

export interface AiClient {
  generateMatchAnalysis(resumeText: string, job: JobPosting): Promise<MatchAnalysis>;
  generateInterviewQuestions(resumeText: string, job: JobPosting): Promise<InterviewQA[]>;
}

export class AiRequestError extends Error {}

// Match scoring should behave like a computation over the resume/posting
// text, not a creative task — a low temperature minimizes sampling noise so
// re-analyzing the same resume against the same posting gives (close to) the
// same score. Interview questions benefit from more variety, so they keep a
// higher temperature.
export const MATCH_ANALYSIS_TEMPERATURE = 0.1;
export const INTERVIEW_QUESTIONS_TEMPERATURE = 0.5;

// Gemini match analysis can fall back across several models (see
// gemini-fallback.ts) — a shorter per-attempt timeout means a stuck/
// overloaded model gets abandoned for the next one sooner instead of eating
// most of a 30s wait every single retry. Other providers/calls keep
// fetchWithTimeout's default since they have no fallback to fall through to.
export const MATCH_ANALYSIS_TIMEOUT_MS = 15_000;

export async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs = 30_000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    return response;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new AiRequestError(`Request to ${new URL(input).host} timed out.`);
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
