import type { InterviewQA, JobPosting, MatchAnalysis } from "../types";
import { buildInterviewQuestionsPrompt, buildMatchAnalysisPrompt } from "./prompt";
import {
  extractJsonPayload,
  interviewQuestionsJsonSchema,
  interviewQuestionsSchema,
  parseMatchAnalysis,
  matchAnalysisThoroughJsonSchema,
} from "./schema";
import {
  assertOk,
  fetchWithTimeout,
  INTERVIEW_QUESTIONS_TEMPERATURE,
  MATCH_ANALYSIS_TEMPERATURE,
  type AiClient,
} from "./client";

/**
 * Several providers (OpenAI itself, plus DeepSeek/GLM/xAI, all of which
 * document themselves as OpenAI-compatible) share the same chat-completions
 * request/response shape. `useJsonSchema` is OpenAI-specific — structured
 * output support via `response_format: json_schema` isn't confirmed for the
 * others, so they instead rely on the prompt's own JSON instructions plus
 * markdown-fence-stripping + zod validation at the boundary (the same
 * fallback path OpenAI itself uses if this flag is off).
 */
export function createOpenAiCompatibleClient(options: {
  baseUrl: string;
  apiKey: string;
  model: string;
  providerName: string;
  useJsonSchema?: boolean;
}): AiClient {
  const { baseUrl, apiKey, model, providerName, useJsonSchema = false } = options;

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
    if (useJsonSchema) {
      body.response_format = {
        type: "json_schema",
        json_schema: { name: schemaName, schema: jsonSchema, strict: false },
      };
    }

    const response = await fetchWithTimeout(baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    const responseBody = await response.text();
    assertOk(response, responseBody, providerName);

    const data = JSON.parse(responseBody);
    const text: string | undefined = data.choices?.[0]?.message?.content;
    if (!text) throw new Error(`${providerName} response had no content.`);
    return text;
  }

  return {
    async generateMatchAnalysis(resumeText: string, job: JobPosting): Promise<MatchAnalysis> {
      // The prompt always asks the model to reason through requirementAnalysis
      // before scoring; the thorough schema exposes that field for providers
      // that use structured output (OpenAI). Providers that don't (DeepSeek/
      // GLM/xAI) still produce it from the prompt, and zod strips it on parse.
      const prompt = buildMatchAnalysisPrompt(resumeText, job);
      const text = await call(prompt, "match_analysis", matchAnalysisThoroughJsonSchema, MATCH_ANALYSIS_TEMPERATURE);
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
      return interviewQuestionsSchema.parse(extractJsonPayload(text));
    },
  };
}
