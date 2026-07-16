import { createOpenAiCompatibleClient } from "./openai-compatible";
import type { AiClient } from "./client";

export function createGlmClient(apiKey: string, model: string): AiClient {
  return createOpenAiCompatibleClient({
    baseUrl: "https://api.z.ai/api/paas/v4/chat/completions",
    apiKey,
    model,
    providerName: "GLM",
  });
}
