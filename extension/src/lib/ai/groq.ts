import { createOpenAiCompatibleClient } from "./openai-compatible";
import { isLiteModel } from "./fallback";
import type { AiClient } from "./client";

// Groq (groq.com) — a genuine free, no-card tier on LPU hardware, and a
// different company from the Grok/xAI provider (api.x.ai). Fully
// OpenAI-compatible, so it's a thin wrapper like the other free providers.
export function createGroqClient(apiKey: string, model: string): AiClient {
  // Lite models get the anti-skim "thorough" prompt, same as Gemini/OpenRouter.
  const lite = isLiteModel("groq", model);

  // gpt-oss are reasoning models: they spend thousands of hidden tokens thinking
  // before the answer, so Groq's default completion cap (~3k) lets that reasoning
  // truncate the JSON (verified live: finish_reason "length", empty/partial
  // content). Raising max_tokens fixes them. But raise it *only* for those
  // models — a large max_tokens inflates the per-minute token estimate, and on
  // the free tier that trips a non-retryable 413 on the lower-TPM non-reasoning
  // Llama models (also verified live). Those don't need the headroom anyway.
  const isReasoning = model.includes("gpt-oss");

  return createOpenAiCompatibleClient({
    baseUrl: "https://api.groq.com/openai/v1/chat/completions",
    apiKey,
    model,
    providerName: "Groq",
    thoroughMatchPrompt: lite,
    maxTokens: isReasoning ? 8192 : undefined,
  });
}
