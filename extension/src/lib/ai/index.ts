import { getProviderApiKey, type ProviderSettings } from "../types";
import type { AiClient } from "./client";
import { createGeminiClient } from "./gemini";
import { createOpenRouterClient } from "./openrouter";
import { createGroqClient } from "./groq";
import { createCerebrasClient } from "./cerebras";
import { createMistralClient } from "./mistral";
import { createCohereClient } from "./cohere";
import { createOpenAiClient } from "./openai";
import { createAnthropicClient } from "./anthropic";
import { createDeepSeekClient } from "./deepseek";
import { createGlmClient } from "./glm";
import { createXaiClient } from "./xai";
import { createHuggingFaceClient } from "./huggingface";

export type { AiClient } from "./client";
export { AiRequestError } from "./client";

export function getAiClient(settings: ProviderSettings): AiClient {
  const apiKey = getProviderApiKey(settings);
  switch (settings.provider) {
    case "gemini":
      return createGeminiClient(apiKey, settings.model);
    case "openrouter":
      return createOpenRouterClient(apiKey, settings.model);
    case "groq":
      return createGroqClient(apiKey, settings.model);
    case "cerebras":
      return createCerebrasClient(apiKey, settings.model);
    case "mistral":
      return createMistralClient(apiKey, settings.model);
    case "cohere":
      return createCohereClient(apiKey, settings.model);
    case "openai":
      return createOpenAiClient(apiKey, settings.model);
    case "anthropic":
      return createAnthropicClient(apiKey, settings.model);
    case "deepseek":
      return createDeepSeekClient(apiKey, settings.model);
    case "glm":
      return createGlmClient(apiKey, settings.model);
    case "xai":
      return createXaiClient(apiKey, settings.model);
    case "huggingface":
      return createHuggingFaceClient(apiKey, settings.model);
  }
}
