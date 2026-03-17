import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';

export type ProviderType =
  | 'anthropic'
  | 'openai'
  | 'openrouter'
  | 'deepseek'
  | 'kimi';

export function getLanguageModel(
  provider: ProviderType,
  modelId: string,
  apiKey: string
) {
  switch (provider) {
    case 'anthropic': {
      const anthropic = createAnthropic({ apiKey });
      return anthropic(modelId);
    }
    case 'openai': {
      const openai = createOpenAI({ apiKey });
      return openai(modelId);
    }
    case 'openrouter': {
      const openrouter = createOpenRouter({ apiKey });
      return openrouter.chat(modelId);
    }
    case 'deepseek': {
      const deepseek = createOpenAICompatible({
        name: 'deepseek',
        apiKey,
        baseURL: 'https://api.deepseek.com',
      });
      return deepseek.chatModel(modelId);
    }
    case 'kimi': {
      const kimi = createOpenAICompatible({
        name: 'kimi',
        apiKey,
        baseURL: 'https://api.moonshot.cn/v1',
      });
      return kimi.chatModel(modelId);
    }
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

export const PROVIDER_LABELS: Record<ProviderType, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  openrouter: 'OpenRouter',
  deepseek: 'DeepSeek',
  kimi: 'Kimi',
};

export const DEFAULT_MODELS: Record<ProviderType, string[]> = {
  anthropic: [
    'claude-sonnet-4-20250514',
    'claude-3-5-haiku-20241022',
    'claude-opus-4-20250514',
  ],
  openai: [
    'gpt-4o',
    'gpt-4o-mini',
    'o1-preview',
  ],
  openrouter: [
    'anthropic/claude-sonnet-4-20250514',
    'anthropic/claude-3.5-haiku',
    'openai/gpt-4o',
    'openai/o1-preview',
    'google/gemini-2.5-pro-preview',
    'deepseek/deepseek-r1',
    'meta-llama/llama-4-maverick',
    'mistralai/mistral-large',
  ],
  deepseek: [
    'deepseek-chat',
    'deepseek-reasoner',
  ],
  kimi: [
    'moonshot-v1-8k',
    'moonshot-v1-32k',
    'moonshot-v1-128k',
  ],
};

export const ALL_PROVIDERS: ProviderType[] = [
  'anthropic',
  'openai',
  'openrouter',
  'deepseek',
  'kimi',
];

export function getApiKeyForProvider(
  provider: ProviderType,
  config: {
    anthropicApiKey?: string;
    openaiApiKey?: string;
    openrouterApiKey?: string;
    deepseekApiKey?: string;
    kimiApiKey?: string;
  }
): string {
  switch (provider) {
    case 'anthropic': return config.anthropicApiKey ?? '';
    case 'openai': return config.openaiApiKey ?? '';
    case 'openrouter': return config.openrouterApiKey ?? '';
    case 'deepseek': return config.deepseekApiKey ?? '';
    case 'kimi': return config.kimiApiKey ?? '';
    default: return '';
  }
}
