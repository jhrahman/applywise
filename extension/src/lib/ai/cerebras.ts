import { createOpenAiCompatibleClient } from "./openai-compatible";
import { isLiteModel } from "./fallback";
import type { AiClient } from "./client";

// Cerebras — 1M tokens/day free, no card, ultra-fast. OpenAI-compatible.
// Caveat: the free tier caps total context at ~8,192 tokens, which a long
// resume plus our match-analysis prompt can exceed; when it does, the request
// errors and the fallback chain moves on to the next model/provider.
export function createCerebrasClient(apiKey: string, model: string): AiClient {
  const lite = isLiteModel("cerebras", model);

  return createOpenAiCompatibleClient({
    baseUrl: "https://api.cerebras.ai/v1/chat/completions",
    apiKey,
    model,
    providerName: "Cerebras",
    thoroughMatchPrompt: lite,
  });
}
