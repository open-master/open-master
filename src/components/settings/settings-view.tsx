'use client';

import { useState, useRef, useCallback } from 'react';
import {
  ArrowLeft, Eye, EyeOff, Sun, Moon, Monitor,
  Palette, Cpu, Brain, Check, ChevronDown, Trash2, Volume2,
  Mic, Upload, X, Loader2, Play, Square, Trash,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { useAppStore } from '@/lib/store';
import {
  DEFAULT_MODELS,
  PROVIDER_LABELS,
  ALL_PROVIDERS,
  getApiKeyForProvider,
  type ProviderType,
} from '@/lib/ai/provider';
import {
  EMBEDDING_PROVIDER_META,
  ALL_EMBEDDING_PROVIDERS,
  type EmbeddingProvider,
} from '@/lib/memory/types';
import { cn } from '@/lib/utils';
import {
  TTS_MODELS,
  VOICE_OPTIONS,
  MASTER_DEFAULT_VOICES,
  type ClonedVoice,
} from '@/lib/tts/types';
import { SYSTEM_MASTERS } from '@/lib/master/registry';

type ApiKeyField =
  | 'anthropicApiKey'
  | 'openaiApiKey'
  | 'openrouterApiKey'
  | 'deepseekApiKey'
  | 'kimiApiKey';

const PROVIDER_META: Record<ProviderType, { field: ApiKeyField; placeholder: string; url: string }> = {
  anthropic: { field: 'anthropicApiKey', placeholder: 'sk-ant-...', url: 'console.anthropic.com' },
  openai: { field: 'openaiApiKey', placeholder: 'sk-...', url: 'platform.openai.com' },
  openrouter: { field: 'openrouterApiKey', placeholder: 'sk-or-...', url: 'openrouter.ai' },
  deepseek: { field: 'deepseekApiKey', placeholder: 'sk-...', url: 'platform.deepseek.com' },
  kimi: { field: 'kimiApiKey', placeholder: 'sk-...', url: 'platform.moonshot.cn' },
};

type SettingsTab = 'appearance' | 'model' | 'memory' | 'tts';

export function SettingsView() {
  const { theme, setTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<SettingsTab>('appearance');
  const { providerConfig, setProviderConfig, embeddingConfig, setEmbeddingConfig, ttsConfig, setTtsConfig, setCurrentView, customMasters, activeMasterIds } = useAppStore();
  const [activeProvider, setActiveProvider] = useState<ProviderType>(providerConfig.selectedProvider);
  const [showKey, setShowKey] = useState(false);
  const [showEmbeddingKey, setShowEmbeddingKey] = useState(false);
  const [showTtsKey, setShowTtsKey] = useState(false);
  const [clearingMemory, setClearingMemory] = useState(false);

  const [cloneModal, setCloneModal] = useState<{ masterId: string; masterName: string; avatar: string } | null>(null);
  const [cloneFile, setCloneFile] = useState<File | null>(null);
  const [cloneStep, setCloneStep] = useState<'idle' | 'uploading' | 'cloning' | 'done' | 'error'>('idle');
  const [cloneError, setCloneError] = useState('');
  const [cloneAudioUrl, setCloneAudioUrl] = useState<string | null>(null);
  const [clonePlaying, setClonePlaying] = useState(false);
  const cloneAudioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetCloneState = useCallback(() => {
    setCloneFile(null);
    setCloneStep('idle');
    setCloneError('');
    if (cloneAudioRef.current) {
      cloneAudioRef.current.pause();
      cloneAudioRef.current = null;
    }
    if (cloneAudioUrl) URL.revokeObjectURL(cloneAudioUrl);
    setCloneAudioUrl(null);
    setClonePlaying(false);
  }, [cloneAudioUrl]);

  const openCloneModal = useCallback((masterId: string, masterName: string, avatar: string) => {
    const existing = (ttsConfig.clonedVoices || []).find(v => v.masterId === masterId);
    if (existing && !confirm(`${masterName}已有复刻音色，重新复刻将覆盖当前音色，确定继续吗？`)) {
      return;
    }
    resetCloneState();
    setCloneModal({ masterId, masterName, avatar });
  }, [resetCloneState, ttsConfig.clonedVoices]);

  const closeCloneModal = useCallback(() => {
    resetCloneState();
    setCloneModal(null);
  }, [resetCloneState]);

  const handleCloneFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const validTypes = ['audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/x-wav'];
    if (!validTypes.includes(file.type) && !file.name.match(/\.(mp3|m4a|wav)$/i)) {
      setCloneError('仅支持 mp3、m4a、wav 格式');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setCloneError('文件大小不能超过 20MB');
      return;
    }
    setCloneError('');
    setCloneFile(file);
  }, []);

  const handleStartClone = useCallback(async () => {
    if (!cloneModal || !cloneFile || !ttsConfig.apiKey) return;

    const voiceId = `${cloneModal.masterId}-clone-${Date.now()}`;
    setCloneStep('uploading');
    setCloneError('');

    try {
      const uploadForm = new FormData();
      uploadForm.append('apiKey', ttsConfig.apiKey);
      uploadForm.append('file', cloneFile);

      const uploadRes = await fetch('/api/voice-clone/upload', {
        method: 'POST',
        body: uploadForm,
      });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok || !uploadData.fileId) {
        throw new Error(uploadData.error || '上传音频失败');
      }

      setCloneStep('cloning');
      const cloneRes = await fetch('/api/voice-clone/clone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: ttsConfig.apiKey,
          fileId: uploadData.fileId,
          voiceId,
          model: ttsConfig.model,
        }),
      });
      const cloneData = await cloneRes.json();
      if (!cloneRes.ok || cloneData.error) {
        throw new Error(cloneData.error || '音色复刻失败');
      }

      if (cloneData.audioBase64) {
        const bytes = Uint8Array.from(atob(cloneData.audioBase64), c => c.charCodeAt(0));
        const blob = new Blob([bytes], { type: 'audio/mpeg' });
        setCloneAudioUrl(URL.createObjectURL(blob));
      }

      const newVoice: ClonedVoice = {
        voiceId: cloneData.voiceId || voiceId,
        masterId: cloneModal.masterId,
        masterName: cloneModal.masterName,
        fileName: cloneFile.name,
        createdAt: Date.now(),
      };
      const updatedCloned = [
        ...(ttsConfig.clonedVoices || []).filter(v => v.masterId !== cloneModal.masterId),
        newVoice,
      ];
      setTtsConfig({
        clonedVoices: updatedCloned,
        masterVoices: { ...ttsConfig.masterVoices, [cloneModal.masterId]: newVoice.voiceId },
      });

      setCloneStep('done');
    } catch (err) {
      setCloneError(err instanceof Error ? err.message : String(err));
      setCloneStep('error');
    }
  }, [cloneModal, cloneFile, ttsConfig, setTtsConfig]);

  const toggleClonePreview = useCallback(() => {
    if (!cloneAudioUrl) return;
    if (clonePlaying && cloneAudioRef.current) {
      cloneAudioRef.current.pause();
      setClonePlaying(false);
      return;
    }
    const audio = new Audio(cloneAudioUrl);
    cloneAudioRef.current = audio;
    audio.onended = () => setClonePlaying(false);
    audio.play();
    setClonePlaying(true);
  }, [cloneAudioUrl, clonePlaying]);

  const handleDeleteClonedVoice = useCallback((voiceId: string, masterId: string) => {
    const updatedCloned = (ttsConfig.clonedVoices || []).filter(v => v.voiceId !== voiceId);
    const updates: Partial<typeof ttsConfig> = { clonedVoices: updatedCloned };
    if (ttsConfig.masterVoices[masterId] === voiceId) {
      updates.masterVoices = { ...ttsConfig.masterVoices, [masterId]: MASTER_DEFAULT_VOICES[masterId] || 'male-qn-jingying' };
    }
    setTtsConfig(updates);
  }, [ttsConfig, setTtsConfig]);

  const renderAppearanceTab = () => (
    <div className="mx-auto max-w-3xl">
      <h2 className="mb-6 text-[22px] font-bold text-foreground">外观</h2>
      
      <div className="overflow-hidden rounded-xl border border-border bg-card/40">
        <div className="flex items-center justify-between border-b border-border/50 p-5">
          <div className="pr-6">
            <div className="text-[14px] font-medium text-foreground">主题</div>
            <div className="mt-1 text-[13px] text-muted-foreground">使用浅色、深色，或匹配系统设置</div>
          </div>
          <div className="flex items-center rounded-lg bg-secondary/50 p-1">
            {[
              { value: 'light', icon: Sun, label: '浅色' },
              { value: 'dark', icon: Moon, label: '深色' },
              { value: 'system', icon: Monitor, label: '系统' },
            ].map(({ value, icon: Icon, label }) => (
              <button
                key={value}
                onClick={() => setTheme(value)}
                className={cn(
                  'flex items-center gap-2 rounded-md px-3.5 py-1.5 text-[13px] font-medium transition-all',
                  theme === value
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  const renderModelTab = () => {
    const meta = PROVIDER_META[activeProvider];
    const apiKey = getApiKeyForProvider(activeProvider, providerConfig);

    return (
      <div className="mx-auto max-w-3xl">
        <h2 className="mb-6 text-[22px] font-bold text-foreground">模型服务</h2>
        
        {/* Provider Selector Section */}
        <div className="mb-8 overflow-hidden rounded-xl border border-border bg-card/40">
          <div className="flex items-center justify-between p-5">
            <div className="pr-6">
              <div className="text-[14px] font-medium text-foreground">当前服务商</div>
              <div className="mt-1 text-[13px] text-muted-foreground">选择默认用于对话的大模型服务</div>
            </div>
            <div className="relative w-48">
              <select
                value={activeProvider}
                onChange={(e) => setActiveProvider(e.target.value as ProviderType)}
                className="w-full appearance-none rounded-lg border border-border bg-background px-3 py-2 pr-10 text-[13px] font-medium focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {ALL_PROVIDERS.map((p) => (
                  <option key={p} value={p}>
                    {PROVIDER_LABELS[p]}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            </div>
          </div>
        </div>

        <h3 className="mb-3 text-[14px] font-semibold text-muted-foreground">
          {PROVIDER_LABELS[activeProvider]} 配置
        </h3>
        
        {/* Provider Detail Section */}
        <div className="overflow-hidden rounded-xl border border-border bg-card/40">
          {/* API Key */}
          <div className="flex items-center justify-between border-b border-border/50 p-5">
            <div className="w-1/3 pr-6">
              <div className="text-[14px] font-medium text-foreground">API 密钥</div>
              <div className="mt-1 text-[13px] text-muted-foreground">
                <a href={`https://${meta.url}`} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                  获取密钥
                </a>
              </div>
            </div>
            <div className="relative flex-1">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) =>
                  setProviderConfig({ [meta.field]: e.target.value } as Record<string, string>)
                }
                placeholder={meta.placeholder}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 pr-10 text-[13px] placeholder:text-muted-foreground/30 focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Model Selection */}
          <div className="flex items-center justify-between border-b border-border/50 p-5">
            <div className="w-1/3 pr-6">
              <div className="text-[14px] font-medium text-foreground">默认模型</div>
              <div className="mt-1 text-[13px] text-muted-foreground">对话时使用的模型</div>
            </div>
            <div className="relative flex-1">
              <select
                value={
                  DEFAULT_MODELS[activeProvider].includes(providerConfig.selectedModel)
                    ? providerConfig.selectedModel
                    : ''
                }
                onChange={(e) => {
                  if (e.target.value) {
                    setProviderConfig({
                      selectedProvider: activeProvider,
                      selectedModel: e.target.value,
                    });
                  }
                }}
                className="w-full appearance-none rounded-lg border border-border bg-background px-3 py-2 pr-10 text-[13px] font-medium focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="" disabled>选择预设模型...</option>
                {DEFAULT_MODELS[activeProvider].map((modelId) => {
                  const label = modelId.includes('/') ? modelId.split('/').pop()! : modelId;
                  return (
                    <option key={modelId} value={modelId}>
                      {label}
                    </option>
                  );
                })}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            </div>
          </div>

          {/* Custom Model ID */}
          {['openrouter', 'deepseek', 'kimi'].includes(activeProvider) && (
            <div className="flex items-center justify-between p-5">
              <div className="w-1/3 pr-6">
                <div className="text-[14px] font-medium text-foreground">自定义模型 ID</div>
                <div className="mt-1 text-[13px] text-muted-foreground">如果下拉列表没有需要的模型</div>
              </div>
              <div className="flex-1">
                <input
                  value={
                    providerConfig.selectedProvider === activeProvider &&
                    !DEFAULT_MODELS[activeProvider].includes(providerConfig.selectedModel)
                      ? providerConfig.selectedModel
                      : ''
                  }
                  onChange={(e) =>
                    setProviderConfig({
                      selectedProvider: activeProvider,
                      selectedModel: e.target.value,
                    })
                  }
                  placeholder="手动输入模型 ID"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-[13px] placeholder:text-muted-foreground/30 focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const embeddingMeta = EMBEDDING_PROVIDER_META[embeddingConfig.provider];

  const handleClearMemory = async () => {
    if (!confirm('确定要清除所有对话记忆吗？此操作不可撤销。')) return;
    setClearingMemory(true);
    try {
      await fetch('/api/memory', { method: 'DELETE' });
    } catch { /* ignore */ }
    setClearingMemory(false);
  };

  const renderMemoryTab = () => (
    <div className="mx-auto max-w-3xl">
      <h2 className="mb-6 text-[22px] font-bold text-foreground">记忆</h2>

      {/* Enable toggle */}
      <div className="mb-8 overflow-hidden rounded-xl border border-border bg-card/40">
        <div className="flex items-center justify-between p-5">
          <div className="pr-6">
            <div className="text-[14px] font-medium text-foreground">启用对话记忆</div>
            <div className="mt-1 text-[13px] text-muted-foreground">
              角色将记住你之前聊过的内容，提供更个性化的对话
            </div>
          </div>
          <button
            onClick={() => setEmbeddingConfig({ enabled: !embeddingConfig.enabled })}
            className={cn(
              'relative h-6 w-11 shrink-0 rounded-full transition-colors',
              embeddingConfig.enabled ? 'bg-primary' : 'bg-muted-foreground/20'
            )}
          >
            <span
              className={cn(
                'absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform',
                embeddingConfig.enabled && 'translate-x-5'
              )}
            />
          </button>
        </div>
      </div>

      {/* Embedding Provider */}
      <h3 className="mb-3 text-[14px] font-semibold text-muted-foreground">
        Embedding 配置
      </h3>
      <div className="overflow-hidden rounded-xl border border-border bg-card/40">
        {/* Provider */}
        <div className="flex items-center justify-between border-b border-border/50 p-5">
          <div className="w-1/3 pr-6">
            <div className="text-[14px] font-medium text-foreground">Embedding 服务商</div>
            <div className="mt-1 text-[13px] text-muted-foreground">用于记忆向量化的 API</div>
          </div>
          <div className="relative flex-1">
            <select
              value={embeddingConfig.provider}
              onChange={(e) => {
                const p = e.target.value as EmbeddingProvider;
                const meta = EMBEDDING_PROVIDER_META[p];
                setEmbeddingConfig({
                  provider: p,
                  apiUrl: meta.defaultUrl,
                  model: meta.defaultModel,
                });
              }}
              className="w-full appearance-none rounded-lg border border-border bg-background px-3 py-2 pr-10 text-[13px] font-medium focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {ALL_EMBEDDING_PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {EMBEDDING_PROVIDER_META[p].label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          </div>
        </div>

        {/* API Key */}
        <div className="flex items-center justify-between border-b border-border/50 p-5">
          <div className="w-1/3 pr-6">
            <div className="text-[14px] font-medium text-foreground">API 密钥</div>
            {embeddingConfig.provider === 'siliconflow' && (
              <div className="mt-1 text-[13px] text-muted-foreground">
                <a href="https://cloud.siliconflow.cn" target="_blank" rel="noreferrer" className="text-primary hover:underline">
                  获取密钥
                </a>
              </div>
            )}
          </div>
          <div className="relative flex-1">
            <input
              type={showEmbeddingKey ? 'text' : 'password'}
              value={embeddingConfig.apiKey}
              onChange={(e) => setEmbeddingConfig({ apiKey: e.target.value })}
              placeholder={embeddingMeta.placeholder}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 pr-10 text-[13px] placeholder:text-muted-foreground/30 focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <button
              type="button"
              onClick={() => setShowEmbeddingKey(!showEmbeddingKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showEmbeddingKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Model */}
        <div className="flex items-center justify-between border-b border-border/50 p-5">
          <div className="w-1/3 pr-6">
            <div className="text-[14px] font-medium text-foreground">Embedding 模型</div>
          </div>
          <div className="relative flex-1">
            {embeddingMeta.models.length > 0 ? (
              <>
                <select
                  value={embeddingConfig.model}
                  onChange={(e) => setEmbeddingConfig({ model: e.target.value })}
                  className="w-full appearance-none rounded-lg border border-border bg-background px-3 py-2 pr-10 text-[13px] font-medium focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {embeddingMeta.models.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              </>
            ) : (
              <input
                value={embeddingConfig.model}
                onChange={(e) => setEmbeddingConfig({ model: e.target.value })}
                placeholder="输入模型名称"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-[13px] placeholder:text-muted-foreground/30 focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              />
            )}
          </div>
        </div>

        {/* Custom API URL */}
        {embeddingConfig.provider === 'custom' && (
          <div className="flex items-center justify-between border-b border-border/50 p-5">
            <div className="w-1/3 pr-6">
              <div className="text-[14px] font-medium text-foreground">API 地址</div>
              <div className="mt-1 text-[13px] text-muted-foreground">OpenAI 兼容的 /v1 端点</div>
            </div>
            <div className="flex-1">
              <input
                value={embeddingConfig.apiUrl}
                onChange={(e) => setEmbeddingConfig({ apiUrl: e.target.value })}
                placeholder="https://api.example.com/v1"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-[13px] placeholder:text-muted-foreground/30 focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>
        )}

        {/* Clear Memory */}
        <div className="flex items-center justify-between p-5">
          <div className="w-1/3 pr-6">
            <div className="text-[14px] font-medium text-foreground">清除记忆</div>
            <div className="mt-1 text-[13px] text-muted-foreground">删除所有角色的对话记忆数据</div>
          </div>
          <button
            onClick={handleClearMemory}
            disabled={clearingMemory}
            className="flex items-center gap-1.5 rounded-lg border border-destructive/30 px-3 py-1.5 text-[13px] font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-40"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {clearingMemory ? '清除中…' : '清除所有记忆'}
          </button>
        </div>
      </div>
    </div>
  );

  const allMasters = [
    ...SYSTEM_MASTERS.filter((m) => activeMasterIds.includes(m.id)),
    ...customMasters.filter((m) => activeMasterIds.includes(m.id)),
  ];

  const renderTtsTab = () => (
    <div className="mx-auto max-w-3xl">
      <h2 className="mb-6 text-[22px] font-bold text-foreground">语音合成</h2>

      <div className="mb-8 overflow-hidden rounded-xl border border-border bg-card/40">
        <div className="flex items-center justify-between p-5">
          <div className="pr-6">
            <div className="text-[14px] font-medium text-foreground">启用语音合成</div>
            <div className="mt-1 text-[13px] text-muted-foreground">
              使用 MiniMax TTS 为角色回复生成语音
            </div>
          </div>
          <button
            onClick={() => setTtsConfig({ enabled: !ttsConfig.enabled })}
            className={cn(
              'relative h-6 w-11 shrink-0 rounded-full transition-colors',
              ttsConfig.enabled ? 'bg-primary' : 'bg-muted-foreground/20'
            )}
          >
            <span
              className={cn(
                'absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform',
                ttsConfig.enabled && 'translate-x-5'
              )}
            />
          </button>
        </div>
      </div>

      <h3 className="mb-3 text-[14px] font-semibold text-muted-foreground">
        MiniMax 配置
      </h3>
      <div className="mb-8 overflow-hidden rounded-xl border border-border bg-card/40">
        <div className="flex items-center justify-between border-b border-border/50 p-5">
          <div className="w-1/3 pr-6">
            <div className="text-[14px] font-medium text-foreground">API 密钥</div>
            <div className="mt-1 text-[13px] text-muted-foreground">
              <a href="https://platform.minimaxi.com/user-center/basic-information/interface-key" target="_blank" rel="noreferrer" className="text-primary hover:underline">
                获取密钥
              </a>
            </div>
          </div>
          <div className="relative flex-1">
            <input
              type={showTtsKey ? 'text' : 'password'}
              value={ttsConfig.apiKey}
              onChange={(e) => setTtsConfig({ apiKey: e.target.value })}
              placeholder="eyJ..."
              className="w-full rounded-lg border border-input bg-background px-3 py-2 pr-10 text-[13px] placeholder:text-muted-foreground/30 focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <button
              type="button"
              onClick={() => setShowTtsKey(!showTtsKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showTtsKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between border-b border-border/50 p-5">
          <div className="w-1/3 pr-6">
            <div className="text-[14px] font-medium text-foreground">语音模型</div>
            <div className="mt-1 text-[13px] text-muted-foreground">HD 音质更好，Turbo 更快</div>
          </div>
          <div className="relative flex-1">
            <select
              value={ttsConfig.model}
              onChange={(e) => setTtsConfig({ model: e.target.value })}
              className="w-full appearance-none rounded-lg border border-border bg-background px-3 py-2 pr-10 text-[13px] font-medium focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {TTS_MODELS.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          </div>
        </div>

        <div className="flex items-center justify-between border-b border-border/50 p-5">
          <div className="w-1/3 pr-6">
            <div className="text-[14px] font-medium text-foreground">语速</div>
            <div className="mt-1 text-[13px] text-muted-foreground">{ttsConfig.speed.toFixed(1)}x</div>
          </div>
          <div className="flex flex-1 items-center gap-3">
            <span className="text-[12px] text-muted-foreground">0.5x</span>
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.1}
              value={ttsConfig.speed}
              onChange={(e) => setTtsConfig({ speed: parseFloat(e.target.value) })}
              className="flex-1 accent-primary"
            />
            <span className="text-[12px] text-muted-foreground">2.0x</span>
          </div>
        </div>

        <div className="flex items-center justify-between p-5">
          <div className="pr-6">
            <div className="text-[14px] font-medium text-foreground">自动朗读</div>
            <div className="mt-1 text-[13px] text-muted-foreground">
              角色回复后自动播放语音
            </div>
          </div>
          <button
            onClick={() => setTtsConfig({ autoPlay: !ttsConfig.autoPlay })}
            className={cn(
              'relative h-6 w-11 shrink-0 rounded-full transition-colors',
              ttsConfig.autoPlay ? 'bg-primary' : 'bg-muted-foreground/20'
            )}
          >
            <span
              className={cn(
                'absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform',
                ttsConfig.autoPlay && 'translate-x-5'
              )}
            />
          </button>
        </div>
      </div>

      <h3 className="mb-3 text-[14px] font-semibold text-muted-foreground">
        角色音色
      </h3>
      <div className="overflow-hidden rounded-xl border border-border bg-card/40">
        {allMasters.map((m, i) => {
          const masterCloned = (ttsConfig.clonedVoices || []).filter(v => v.masterId === m.id);
          const currentVoice = ttsConfig.masterVoices[m.id] || MASTER_DEFAULT_VOICES[m.id] || 'male-qn-jingying';
          return (
            <div
              key={m.id}
              className={cn(
                'flex items-center justify-between p-5',
                i < allMasters.length - 1 && 'border-b border-border/50'
              )}
            >
              <div className="flex items-center gap-2.5 pr-4 shrink-0">
                <span className="text-[16px]">{m.avatar}</span>
                <div className="text-[14px] font-medium text-foreground">{m.name}</div>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative w-52">
                  <select
                    value={currentVoice}
                    onChange={(e) =>
                      setTtsConfig({
                        masterVoices: { ...ttsConfig.masterVoices, [m.id]: e.target.value },
                      })
                    }
                    className="w-full appearance-none rounded-lg border border-border bg-background px-3 py-2 pr-10 text-[13px] font-medium focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    {masterCloned.map((cv) => (
                      <option key={cv.voiceId} value={cv.voiceId}>
                        🎙 复刻音色
                      </option>
                    ))}
                    {VOICE_OPTIONS.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.label} ({v.lang})
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                </div>
                {masterCloned.length > 0 && masterCloned.some(cv => cv.voiceId === currentVoice) && (
                  <button
                    onClick={() => handleDeleteClonedVoice(currentVoice, m.id)}
                    title="删除复刻音色"
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                  >
                    <Trash className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  onClick={() => openCloneModal(m.id, m.name, m.avatar)}
                  disabled={!ttsConfig.apiKey}
                  title={ttsConfig.apiKey ? '复刻专属音色' : '请先配置 API 密钥'}
                  className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-primary/30 px-2.5 py-1.5 text-[12px] font-medium text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Mic className="h-3.5 w-3.5" />
                  {masterCloned.length > 0 ? '重新复刻' : '复刻'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {cloneModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-lg rounded-2xl border border-border bg-background p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">{cloneModal.avatar}</span>
                <h3 className="text-[16px] font-semibold text-foreground">
                  为{cloneModal.masterName}复刻专属音色
                </h3>
              </div>
              <button
                onClick={closeCloneModal}
                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {cloneStep === 'idle' || cloneStep === 'error' ? (
              <>
                <div className="mb-4">
                  <div className="text-[13px] text-muted-foreground mb-3">
                    上传你有权使用的音频片段，系统将为当前角色生成专属音色。请勿上传未经授权的真人录音。
                  </div>
                  <div className="rounded-lg border-2 border-dashed border-border p-6 text-center transition-colors hover:border-primary/50">
                    {cloneFile ? (
                      <div className="flex items-center justify-center gap-2">
                        <Volume2 className="h-5 w-5 text-primary" />
                        <span className="text-[13px] font-medium text-foreground">{cloneFile.name}</span>
                        <span className="text-[12px] text-muted-foreground">
                          ({(cloneFile.size / 1024 / 1024).toFixed(1)} MB)
                        </span>
                        <button
                          onClick={() => { setCloneFile(null); setCloneError(''); }}
                          className="ml-2 rounded p-1 text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div
                        onClick={() => fileInputRef.current?.click()}
                        className="cursor-pointer"
                      >
                        <Upload className="mx-auto h-8 w-8 text-muted-foreground/50 mb-2" />
                        <div className="text-[13px] font-medium text-foreground">点击选择音频文件</div>
                        <div className="mt-1 text-[12px] text-muted-foreground">
                          支持 mp3、m4a、wav，时长 10秒~5分钟，≤20MB
                        </div>
                      </div>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".mp3,.m4a,.wav,audio/mpeg,audio/mp4,audio/wav"
                      onChange={handleCloneFileSelect}
                      className="hidden"
                    />
                  </div>
                </div>

                {cloneError && (
                  <div className="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
                    {cloneError}
                  </div>
                )}

                <div className="flex justify-end gap-3">
                  <button
                    onClick={closeCloneModal}
                    className="rounded-lg border border-border px-4 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleStartClone}
                    disabled={!cloneFile}
                    className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Mic className="h-4 w-4" />
                    开始复刻
                  </button>
                </div>
              </>
            ) : cloneStep === 'uploading' || cloneStep === 'cloning' ? (
              <div className="py-8 text-center">
                <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary mb-3" />
                <div className="text-[14px] font-medium text-foreground">
                  {cloneStep === 'uploading' ? '正在上传音频…' : '正在复刻音色…'}
                </div>
                <div className="mt-1 text-[13px] text-muted-foreground">
                  {cloneStep === 'uploading' ? '上传到 MiniMax 服务器' : '复刻过程可能需要数十秒'}
                </div>
              </div>
            ) : cloneStep === 'done' ? (
              <div className="py-4">
                <div className="mb-4 flex items-center justify-center gap-2 text-green-600">
                  <Check className="h-5 w-5" />
                  <span className="text-[14px] font-medium">音色复刻成功！</span>
                </div>

                {cloneAudioUrl && (
                  <div className="mb-4 flex items-center justify-center">
                    <button
                      onClick={toggleClonePreview}
                      className="flex items-center gap-2 rounded-lg border border-primary/30 px-4 py-2 text-[13px] font-medium text-primary transition-colors hover:bg-primary/10"
                    >
                      {clonePlaying ? (
                        <><Square className="h-3.5 w-3.5 fill-current" /> 停止试听</>
                      ) : (
                        <><Play className="h-3.5 w-3.5 fill-current" /> 播放试听</>
                      )}
                    </button>
                  </div>
                )}

                <div className="text-center text-[13px] text-muted-foreground mb-4">
                  已自动设为{cloneModal.masterName}的默认音色
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={closeCloneModal}
                    className="rounded-lg bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    完成
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex h-full w-full bg-background">
      <div className="flex w-[240px] shrink-0 flex-col border-r border-border bg-sidebar-background">
        <div className="drag-region h-[52px] shrink-0" />
        
        <div className="px-3 pb-6 pt-2">
          <button
            onClick={() => setCurrentView('chat')}
            className="no-drag mb-6 flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            返回应用
          </button>

          <nav className="space-y-1">
            <button
              onClick={() => setActiveTab('appearance')}
              className={cn(
                'no-drag flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] transition-colors',
                activeTab === 'appearance'
                  ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50'
              )}
            >
              <Palette className="h-4 w-4 shrink-0" />
              外观
            </button>
            <button
              onClick={() => setActiveTab('model')}
              className={cn(
                'no-drag flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] transition-colors',
                activeTab === 'model'
                  ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50'
              )}
            >
              <Cpu className="h-4 w-4 shrink-0" />
              模型服务
            </button>
            <button
              onClick={() => setActiveTab('memory')}
              className={cn(
                'no-drag flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] transition-colors',
                activeTab === 'memory'
                  ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50'
              )}
            >
              <Brain className="h-4 w-4 shrink-0" />
              记忆
            </button>
            <button
              onClick={() => setActiveTab('tts')}
              className={cn(
                'no-drag flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] transition-colors',
                activeTab === 'tts'
                  ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50'
              )}
            >
              <Volume2 className="h-4 w-4 shrink-0" />
              语音合成
            </button>
          </nav>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="drag-region h-[52px] shrink-0" />
        <div className="p-10 pb-20">
          {activeTab === 'appearance' && renderAppearanceTab()}
          {activeTab === 'model' && renderModelTab()}
          {activeTab === 'memory' && renderMemoryTab()}
          {activeTab === 'tts' && renderTtsTab()}
          
          <div className="mt-16 text-center">
            <p className="text-[12px] text-muted-foreground/40">
              所有配置和记忆数据仅保存在本地，不会上传到任何服务器
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
