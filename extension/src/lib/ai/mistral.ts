import { createOpenAiCompatibleClient } from "./openai-compatible";
import { isLiteModel } from "./fallback";
import type { AiClient } from "./client";

// Mistral La Plateforme — free "Experiment" tier (rate-limited, no card),
// covering every model. Its /v1/chat/completions endpoint is OpenAI-compatible.
export function createMistralClient(apiKey: string, model: string): AiClient {
  const lite = isLiteModel("mistral", model);

  // Magistral is a reasoning model; give it completion headroom so its thinking
  // doesn't truncate the JSON (same failure mode as Groq's gpt-oss). Applied
  // only to the reasoning model — see the TPM rationale in groq.ts for why a
  // blanket max_tokens is a bad idea on free tiers.
  const isReasoning = model.includes("magistral");

  return createOpenAiCompatibleClient({
    baseUrl: "https://api.mistral.ai/v1/chat/completions",
    apiKey,
    model,
    providerName: "Mistral",
    thoroughMatchPrompt: lite,
    // NB: structured output (useJsonSchema) was tried here to pin the scratchpad
    // the way it did for Cohere, but reverted — verified live, Mistral's
    // constrained decoding returned atsNotes as an array of objects instead of
    // strings (failing the parse on 2 of 3 runs of one case) and did not
    // converge the score. Prompt-only is erratic but doesn't crash, which for a
    // last-resort lite model is the safer trade.
    maxTokens: isReasoning ? 8192 : undefined,
  });
}
