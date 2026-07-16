import type { InterviewQA, JobPosting, MatchAnalysis } from "../types";
import { buildInterviewQuestionsPrompt, buildMatchAnalysisPrompt } from "./prompt";
import {
  extractJsonPayload,
  interviewQuestionsJsonSchema,
  interviewQuestionsSchema,
  matchAnalysisSchema,
  matchAnalysisThoroughGeminiJsonSchema,
} from "./schema";
import {
  assertOk,
  fetchWithTimeout,
  INTERVIEW_QUESTIONS_TEMPERATURE,
  MATCH_ANALYSIS_TEMPERATURE,
  MATCH_ANALYSIS_THOROUGH_TIMEOUT_MS,
  MATCH_ANALYSIS_TIMEOUT_MS,
  type AiClient,
} from "./client";
import { isLiteGeminiModel } from "./gemini-fallback";

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

async function callGemini(
  apiKey: string,
  model: string,
  prompt: string,
  responseSchema: unknown,
  temperature: number,
  timeoutMs?: number
): Promise<string> {
  const response = await fetchWithTimeout(
    `${BASE_URL}/${model}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema,
          temperature,
        },
      }),
    },
    timeoutMs
  );

  const body = await response.text();
  assertOk(response, body, "Gemini");

  const data = JSON.parse(body);
  const text: string | undefined = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini response had no content.");
  return text;
}

export function createGeminiClient(apiKey: string, model: string): AiClient {
  return {
    async generateMatchAnalysis(resumeText: string, job: JobPosting): Promise<MatchAnalysis> {
      // Every Gemini model gets the reasoning scratchpad (schema + prompt) so
      // it enumerates requirements before scoring — this is what keeps the
      // score stable run-to-run. Lite models additionally get the anti-skim
      // nudge and a longer timeout, since they skim more and are the slower
      // last resort in the fallback chain.
      const lite = isLiteGeminiModel(model);
      const prompt = buildMatchAnalysisPrompt(resumeText, job, { thorough: lite });
      const text = await callGemini(
        apiKey,
        model,
        prompt,
        matchAnalysisThoroughGeminiJsonSchema,
        MATCH_ANALYSIS_TEMPERATURE,
        lite ? MATCH_ANALYSIS_THOROUGH_TIMEOUT_MS : MATCH_ANALYSIS_TIMEOUT_MS
      );
      return matchAnalysisSchema.parse(extractJsonPayload(text));
    },

    async generateInterviewQuestions(resumeText: string, job: JobPosting): Promise<InterviewQA[]> {
      const prompt = buildInterviewQuestionsPrompt(resumeText, job);
      const text = await callGemini(
        apiKey,
        model,
        prompt,
        interviewQuestionsJsonSchema,
        INTERVIEW_QUESTIONS_TEMPERATURE
      );
      return interviewQuestionsSchema.parse(extractJsonPayload(text));
    },
  };
}
