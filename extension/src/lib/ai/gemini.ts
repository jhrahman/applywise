import type { InterviewQA, JobPosting, MatchAnalysis } from "../types";
import { buildInterviewQuestionsPrompt, buildMatchAnalysisPrompt } from "./prompt";
import {
  extractJsonPayload,
  interviewQuestionsJsonSchema,
  interviewQuestionsSchema,
  matchAnalysisJsonSchema,
  matchAnalysisSchema,
} from "./schema";
import { assertOk, fetchWithTimeout, type AiClient } from "./client";

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

async function callGemini(
  apiKey: string,
  model: string,
  prompt: string,
  responseSchema: unknown
): Promise<string> {
  const response = await fetchWithTimeout(`${BASE_URL}/${model}:generateContent`, {
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
        temperature: 0.4,
      },
    }),
  });

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
      const prompt = buildMatchAnalysisPrompt(resumeText, job);
      const text = await callGemini(apiKey, model, prompt, matchAnalysisJsonSchema);
      return matchAnalysisSchema.parse(extractJsonPayload(text));
    },

    async generateInterviewQuestions(resumeText: string, job: JobPosting): Promise<InterviewQA[]> {
      const prompt = buildInterviewQuestionsPrompt(resumeText, job);
      const text = await callGemini(apiKey, model, prompt, interviewQuestionsJsonSchema);
      return interviewQuestionsSchema.parse(extractJsonPayload(text));
    },
  };
}
