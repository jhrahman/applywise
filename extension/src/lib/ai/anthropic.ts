import type { InterviewQA, JobPosting, MatchAnalysis } from "../types";
import { buildInterviewQuestionsPrompt, buildMatchAnalysisPrompt } from "./prompt";
import {
  extractJsonPayload,
  interviewQuestionsSchema,
  matchAnalysisSchema,
} from "./schema";
import {
  assertOk,
  fetchWithTimeout,
  INTERVIEW_QUESTIONS_TEMPERATURE,
  MATCH_ANALYSIS_TEMPERATURE,
  type AiClient,
} from "./client";

const URL_ = "https://api.anthropic.com/v1/messages";

async function callAnthropic(
  apiKey: string,
  model: string,
  prompt: string,
  temperature: number
): Promise<string> {
  const response = await fetchWithTimeout(URL_, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      // Required for direct browser-origin calls — Anthropic blocks
      // cross-origin requests by default since keys aren't meant to live
      // client-side; this is a deliberate opt-in by the key's owner.
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      temperature,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const body = await response.text();
  assertOk(response, body, "Anthropic");

  const data = JSON.parse(body);
  const text: string | undefined = data.content?.[0]?.text;
  if (!text) throw new Error("Anthropic response had no content.");
  return text;
}

export function createAnthropicClient(apiKey: string, model: string): AiClient {
  return {
    async generateMatchAnalysis(resumeText: string, job: JobPosting): Promise<MatchAnalysis> {
      const prompt = buildMatchAnalysisPrompt(resumeText, job);
      const text = await callAnthropic(apiKey, model, prompt, MATCH_ANALYSIS_TEMPERATURE);
      return matchAnalysisSchema.parse(extractJsonPayload(text));
    },

    async generateInterviewQuestions(resumeText: string, job: JobPosting): Promise<InterviewQA[]> {
      const prompt = buildInterviewQuestionsPrompt(resumeText, job);
      const text = await callAnthropic(apiKey, model, prompt, INTERVIEW_QUESTIONS_TEMPERATURE);
      return interviewQuestionsSchema.parse(extractJsonPayload(text));
    },
  };
}
