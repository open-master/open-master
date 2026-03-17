export type EmbeddingProvider = 'siliconflow' | 'openai' | 'custom';

export interface EmbeddingConfig {
  provider: EmbeddingProvider;
  apiKey: string;
  model: string;
  apiUrl: string;
  enabled: boolean;
}

export const DEFAULT_EMBEDDING_CONFIG: EmbeddingConfig = {
  provider: 'siliconflow',
  apiKey: '',
  model: 'BAAI/bge-m3',
  apiUrl: 'https://api.siliconflow.cn/v1',
  enabled: true,
};

export const EMBEDDING_PROVIDER_META: Record<
  EmbeddingProvider,
  { label: string; defaultUrl: string; defaultModel: string; models: string[]; placeholder: string }
> = {
  siliconflow: {
    label: '硅基流动 (SiliconFlow)',
    defaultUrl: 'https://api.siliconflow.cn/v1',
    defaultModel: 'BAAI/bge-m3',
    models: ['BAAI/bge-m3', 'BAAI/bge-large-zh-v1.5', 'BAAI/bge-large-en-v1.5'],
    placeholder: 'sk-...',
  },
  openai: {
    label: 'OpenAI',
    defaultUrl: 'https://api.openai.com/v1',
    defaultModel: 'text-embedding-3-small',
    models: ['text-embedding-3-small', 'text-embedding-3-large'],
    placeholder: 'sk-...',
  },
  custom: {
    label: '自定义 (OpenAI 兼容)',
    defaultUrl: '',
    defaultModel: '',
    models: [],
    placeholder: 'API Key',
  },
};

export const ALL_EMBEDDING_PROVIDERS: EmbeddingProvider[] = ['siliconflow', 'openai', 'custom'];
