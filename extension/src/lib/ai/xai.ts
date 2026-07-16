import { createOpenAiCompatibleClient } from "./openai-compatible";
import type { AiClient } from "./client";

export function createXaiClient(apiKey: string, model: string): AiClient {
  return createOpenAiCompatibleClient({
    baseUrl: "https://api.x.ai/v1/chat/completions",
    apiKey,
    model,
    providerName: "Grok",
  });
}
