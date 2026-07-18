import type { InterviewQA, JobPosting, MatchAnalysis } from "../types";
import { buildInterviewQuestionsPrompt, buildMatchAnalysisPrompt } from "./prompt";
import {
  extractJsonPayload,
  interviewQuestionsJsonSchema,
  parseInterviewQuestions,
  parseMatchAnalysis,
  matchAnalysisThoroughJsonSchema,
} from "./schema";
import {
  assertOk,
  AiRequestError,
  fetchTextWithTimeout,
  INTERVIEW_QUESTIONS_TEMPERATURE,
  MATCH_ANALYSIS_TEMPERATURE,
  type AiClient,
} from "./client";

/**
 * Several providers (OpenAI itself, plus DeepSeek/GLM/xAI/OpenRouter, all of
 * which document themselves as OpenAI-compatible) share the same
 * chat-completions request/response shape.
 *
 * `useJsonSchema` requests structured output via `response_format: json_schema`
 * — supported by OpenAI, and by some OpenRouter models but not others (see
 * openrouter.ts). Providers without it rely on the prompt's own JSON
 * instructions, and on extractJsonPayload digging the payload back out of
 * whatever prose the model wrapped it in, plus zod validation at the boundary
 * (the same fallback path OpenAI itself uses if this flag is off).
 */
export function createOpenAiCompatibleClient(options: {
  baseUrl: string;
  apiKey: string;
  model: string;
  providerName: string;
  useJsonSchema?: boolean;
  /** Adds the anti-skim emphasis to the match prompt — for lite/fast models. */
  thoroughMatchPrompt?: boolean;
  /**
   * Per-attempt cap on every request this client makes; defaults to
   * fetchTextWithTimeout's own. It covers interview questions as well as match
   * analysis — a provider slow enough to need a custom cap (OpenRouter) is
   * slow on both calls, and leaving the second on the default just guarantees
   * it times out.
   */
  timeoutMs?: number;
  /**
   * Caps the completion length via `max_tokens`. Matters most for *reasoning*
   * models (e.g. Groq's gpt-oss): they spend thousands of hidden tokens
   * reasoning before emitting the answer, and a provider's default completion
   * cap can be low enough (Groq's gpt-oss default is ~3k) that the reasoning
   * exhausts it and the JSON comes back truncated or empty. A generous value
   * gives the reasoning room *and* leaves space for the full JSON. Left unset
   * for providers where it's risky — notably OpenAI, whose newer reasoning
   * models reject `max_tokens` in favour of `max_completion_tokens`.
   */
  maxTokens?: number;
  /** Extra request headers (e.g. OpenRouter's attribution headers). */
  extraHeaders?: Record<string, string>;
}): AiClient {
  const {
    baseUrl,
    apiKey,
    model,
    providerName,
    useJsonSchema = false,
    thoroughMatchPrompt = false,
    timeoutMs,
    maxTokens,
    extraHeaders,
  } = options;

  async function call(
    prompt: string,
    schemaName: string,
    jsonSchema: unknown,
    temperature: number
  ): Promise<string> {
    const body: Record<string, unknown> = {
      model,
      messages: [{ role: "user", content: prompt }],
      temperature,
    };
    if (maxTokens != null) body.max_tokens = maxTokens;
    if (useJsonSchema) {
      body.response_format = {
        type: "json_schema",
        json_schema: { name: schemaName, schema: jsonSchema, strict: false },
      };
    }

    const { response, body: responseBody } = await fetchTextWithTimeout(
      baseUrl,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          ...extraHeaders,
        },
        body: JSON.stringify(body),
      },
      timeoutMs
    );

    assertOk(response, responseBody, providerName);

    const data = JSON.parse(responseBody);

    // OpenRouter proxies to third-party hosts and reports an upstream failure
    // as an `error` object inside a 200 response, which assertOk can't see.
    // Surfacing it as an AiRequestError keeps it on the same path as a real
    // HTTP error, so the fallback chain can react to it.
    if (data.error) {
      const detail = data.error.message ?? JSON.stringify(data.error).slice(0, 200);
      throw new AiRequestError(`${providerName} API error ${data.error.code ?? ""}: ${detail}`.trim());
    }

    const text: string | undefined = data.choices?.[0]?.message?.content;
    if (!text) {
      // Distinct from a transport failure: the call succeeded but produced no
      // content (a reasoning model can burn its whole budget before answering).
      // isRetryableAiError matches this wording so a fallback chain moves on.
      throw new AiRequestError(`${providerName} returned an empty response (model: ${model}).`);
    }
    return text;
  }

  return {
    async generateMatchAnalysis(resumeText: string, job: JobPosting): Promise<MatchAnalysis> {
      // The prompt always asks the model to reason through requirementAnalysis
      // before scoring; the thorough schema exposes that field for providers
      // that use structured output. Providers that don't still produce it from
      // the prompt, and zod strips it on parse.
      const prompt = buildMatchAnalysisPrompt(resumeText, job, { thorough: thoroughMatchPrompt });
      const text = await call(
        prompt,
        "match_analysis",
        matchAnalysisThoroughJsonSchema,
        MATCH_ANALYSIS_TEMPERATURE
      );
      return parseMatchAnalysis(extractJsonPayload(text));
    },

    async generateInterviewQuestions(resumeText: string, job: JobPosting): Promise<InterviewQA[]> {
      const prompt = buildInterviewQuestionsPrompt(resumeText, job);
      const text = await call(
        prompt,
        "interview_questions",
        interviewQuestionsJsonSchema,
        INTERVIEW_QUESTIONS_TEMPERATURE
      );
      return parseInterviewQuestions(extractJsonPayload(text));
    },
  };
}
