import type { ProviderSettings } from "../types";
import type { AiClient } from "./client";
import { createGeminiClient } from "./gemini";
import { createOpenAiClient } from "./openai";
import { createAnthropicClient } from "./anthropic";
import { createDeepSeekClient } from "./deepseek";
import { createGlmClient } from "./glm";
import { createXaiClient } from "./xai";

export type { AiClient } from "./client";
export { AiRequestError } from "./client";

export function getAiClient(settings: ProviderSettings): AiClient {
  switch (settings.provider) {
    case "gemini":
      return createGeminiClient(settings.apiKey, settings.model);
    case "openai":
      return createOpenAiClient(settings.apiKey, settings.model);
    case "anthropic":
      return createAnthropicClient(settings.apiKey, settings.model);
    case "deepseek":
      return createDeepSeekClient(settings.apiKey, settings.model);
    case "glm":
      return createGlmClient(settings.apiKey, settings.model);
    case "xai":
      return createXaiClient(settings.apiKey, settings.model);
  }
}
