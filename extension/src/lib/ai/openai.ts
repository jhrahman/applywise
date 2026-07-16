import { createOpenAiCompatibleClient } from "./openai-compatible";
import type { AiClient } from "./client";

export function createOpenAiClient(apiKey: string, model: string): AiClient {
  return createOpenAiCompatibleClient({
    baseUrl: "https://api.openai.com/v1/chat/completions",
    apiKey,
    model,
    providerName: "OpenAI",
    useJsonSchema: true,
  });
}
