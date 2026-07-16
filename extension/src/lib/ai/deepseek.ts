import { createOpenAiCompatibleClient } from "./openai-compatible";
import type { AiClient } from "./client";

export function createDeepSeekClient(apiKey: string, model: string): AiClient {
  return createOpenAiCompatibleClient({
    baseUrl: "https://api.deepseek.com/chat/completions",
    apiKey,
    model,
    providerName: "DeepSeek",
  });
}
