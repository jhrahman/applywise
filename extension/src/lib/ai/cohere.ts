import { createOpenAiCompatibleClient } from "./openai-compatible";
import { isLiteModel } from "./fallback";
import type { AiClient } from "./client";

// Cohere — a free Trial key (1,000 calls/month, 20 RPM, non-commercial). Cohere
// ships an OpenAI-compatible surface at /compatibility/v1, so it wraps the same
// way as the other providers rather than needing its native /v2/chat shape.
export function createCohereClient(apiKey: string, model: string): AiClient {
  const lite = isLiteModel("cohere", model);

  return createOpenAiCompatibleClient({
    baseUrl: "https://api.cohere.ai/compatibility/v1/chat/completions",
    apiKey,
    model,
    providerName: "Cohere",
    thoroughMatchPrompt: lite,
  });
}
