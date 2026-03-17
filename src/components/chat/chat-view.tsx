'use client';

import { useChat } from '@ai-sdk/react';
import { TextStreamChatTransport } from 'ai';
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { ArrowUp, ChevronDown, Check, RotateCcw, Trash2, Volume2, Square, Loader2, Copy, CheckCheck } from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { getMasterById } from '@/lib/master/registry';
import {
  getApiKeyForProvider,
  ALL_PROVIDERS,
  PROVIDER_LABELS,
  DEFAULT_MODELS,
} from '@/lib/ai/provider';
import { cn } from '@/lib/utils';
import { useTTS } from '@/lib/tts/use-tts';

function useClickOutside(ref: React.RefObject<HTMLElement | null>, handler: () => void) {
  useEffect(() => {
    const listener = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) handler();
    };
    document.addEventListener('mousedown', listener);
    return () => document.removeEventListener('mousedown', listener);
  }, [ref, handler]);
}

function ModelDropdown() {
  const { providerConfig, setProviderConfig } = useAppStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false));

  const configuredProviders = ALL_PROVIDERS.filter(
    (p) => !!getApiKeyForProvider(p, providerConfig)
  );

  const shortModel = providerConfig.selectedModel.includes('/')
    ? providerConfig.selectedModel.split('/').pop()!
    : providerConfig.selectedModel;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="no-drag flex items-center gap-1.5 rounded-lg px-2 py-1 transition-colors hover:bg-accent"
      >
        <span className="text-[13px] text-muted-foreground">
          {shortModel}
          <span className="mx-1 text-muted-foreground/30">|</span>
          {PROVIDER_LABELS[providerConfig.selectedProvider]}
        </span>
        <ChevronDown className={cn('h-3 w-3 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-72 rounded-xl border border-border bg-popover shadow-lg">
          {configuredProviders.length === 0 ? (
            <div className="p-4 text-center">
              <p className="text-[12px] text-muted-foreground">尚未配置 API Key</p>
              <button
                className="mt-2 text-[12px] text-primary hover:underline"
                onClick={() => {
                  setOpen(false);
                  useAppStore.getState().setCurrentView('settings');
                }}
              >
                前往设置
              </button>
            </div>
          ) : (
            <div className="max-h-80 overflow-y-auto p-1.5">
              {configuredProviders.map((provider) => (
                <div key={provider}>
                  <p className="px-2.5 pb-0.5 pt-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/40">
                    {PROVIDER_LABELS[provider]}
                  </p>
                  {DEFAULT_MODELS[provider].map((modelId) => {
                    const isActive =
                      providerConfig.selectedProvider === provider &&
                      providerConfig.selectedModel === modelId;
                    const label = modelId.includes('/') ? modelId.split('/').pop()! : modelId;
                    return (
                      <button
                        key={modelId}
                        onClick={() => {
                          setProviderConfig({ selectedProvider: provider, selectedModel: modelId });
                          setOpen(false);
                        }}
                        className={cn(
                          'flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[12px] transition-colors',
                          isActive ? 'bg-accent font-medium' : 'hover:bg-accent/50'
                        )}
                      >
                        <span>{label}</span>
                        {isActive && <Check className="h-3 w-3 text-primary" />}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NewChatConfirmDialog({
  open,
  masterName,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  masterName: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onCancel}
      />
      <div className="relative z-10 mx-4 w-full max-w-sm rounded-2xl border border-border bg-background p-6 shadow-2xl">
        <h3 className="text-[15px] font-semibold">开启新对话</h3>
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
          当前与{masterName}的对话记录将被清除，但已保存的记忆不受影响。确定开启新对话吗？
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg border border-border px-4 py-2 text-[13px] font-medium transition-colors hover:bg-accent"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            className="rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            确定
          </button>
        </div>
      </div>
    </div>
  );
}

export function ChatTopBar() {
  const { selectedMasterId, customMasters, newChatForMaster, masterChatKeys } =
    useAppStore();
  const master = selectedMasterId
    ? getMasterById(selectedMasterId, customMasters)
    : null;
  const [showNewChatConfirm, setShowNewChatConfirm] = useState(false);

  const handleNewChat = useCallback(() => {
    if (!selectedMasterId) return;
    const chatKey = masterChatKeys[selectedMasterId] ?? 0;
    fetch('/api/chat-history', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ masterId: selectedMasterId, chatKey }),
    }).catch(() => {});
    newChatForMaster(selectedMasterId);
    setShowNewChatConfirm(false);
  }, [selectedMasterId, masterChatKeys, newChatForMaster]);

  return (
    <>
      <div className="flex min-w-0 flex-1 items-center justify-between">
        <div className="flex min-w-0 items-center">
          {master && (
            <div className="no-drag flex min-w-0 items-center gap-2 px-2 py-1">
              <span className="shrink-0 text-base">{master.avatar}</span>
              <span className="truncate text-[13px] font-medium">
                {master.name}
              </span>
            </div>
          )}
          <span className="mx-1 text-[13px] text-muted-foreground/30">
            &gt;
          </span>
          <ModelDropdown />
        </div>
        {selectedMasterId && (
          <button
            onClick={() => setShowNewChatConfirm(true)}
            title="新对话"
            className="no-drag flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground/40 transition-colors hover:bg-accent hover:text-foreground"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <NewChatConfirmDialog
        open={showNewChatConfirm}
        masterName={master?.name ?? '角色'}
        onConfirm={handleNewChat}
        onCancel={() => setShowNewChatConfirm(false)}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Per-master chat instance — stays mounted across tab switches      */
/* ------------------------------------------------------------------ */

function ConfirmDialog({
  open,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative z-10 mx-4 w-full max-w-sm rounded-2xl border border-border bg-background p-6 shadow-2xl">
        <h3 className="text-[15px] font-semibold">删除对话</h3>
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
          此操作将同时清除对应的记忆，当前角色将不再记得这段对话内容。确定删除吗？
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg border border-border px-4 py-2 text-[13px] font-medium transition-colors hover:bg-accent"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            className="rounded-lg px-4 py-2 text-[13px] font-semibold text-destructive transition-colors hover:bg-destructive/10"
          >
            确定删除
          </button>
        </div>
      </div>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      title="复制"
      className={cn(
        'flex h-6 items-center gap-1 rounded-md px-1.5 text-[12px] transition-colors',
        copied
          ? 'text-green-500'
          : 'text-muted-foreground/40 hover:text-muted-foreground'
      )}
    >
      {copied ? <CheckCheck className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

function msgText(
  msg: { parts?: Array<{ type: string; text?: string }>; content?: string }
): string {
  return (
    msg.parts
      ?.filter((p): p is { type: 'text'; text: string } => p.type === 'text')
      .map((p) => p.text)
      .join('') ||
    msg.content ||
    ''
  );
}

function MasterChatInstance({
  masterId,
  chatKey,
  isVisible,
}: {
  masterId: string;
  chatKey: number;
  isVisible: boolean;
}) {
  const { providerConfig, customMasters, ttsConfig } = useAppStore();
  const master = getMasterById(masterId, customMasters);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState('');
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const { play: ttsPlay, stop: ttsStop, playingId: ttsPlayingId, loading: ttsLoading } = useTTS(masterId);
  const historyLoadedRef = useRef(false);
  const messagesRef = useRef<unknown[]>([]);
  const prevStatusRef = useRef('ready');

  const transport = useMemo(
    () =>
      new TextStreamChatTransport({
        api: '/api/chat',
        fetch: async (url, init) => {
          const store = useAppStore.getState();
          const config = store.providerConfig;
          const body = JSON.parse((init?.body as string) || '{}');
          body.masterId = masterId;
          body.provider = config.selectedProvider;
          body.model = config.selectedModel;
          body.apiKey = getApiKeyForProvider(config.selectedProvider, config);
          body.customMasters = store.customMasters;
          body.embeddingConfig = store.embeddingConfig;
          return fetch(url, { ...init, body: JSON.stringify(body) });
        },
      }),
    [masterId]
  );

  const { messages, sendMessage, setMessages, status, error } = useChat({
    transport,
  });

  messagesRef.current = messages;

  const isLoading = status === 'streaming' || status === 'submitted';

  useEffect(() => {
    historyLoadedRef.current = false;
    fetch(
      `/api/chat-history?masterId=${encodeURIComponent(masterId)}&chatKey=${chatKey}`
    )
      .then((r) => r.json())
      .then((data) => {
        if (
          data.messages?.length > 0 &&
          (messagesRef.current as unknown[]).length === 0
        ) {
          const restored = (
            data.messages as { role: string; content: string }[]
          ).map((m, i) => ({
            id: `hist-${i}-${Date.now()}`,
            role: m.role as 'user' | 'assistant',
            content: m.content,
            parts: [{ type: 'text' as const, text: m.content }],
          }));
          setMessages(restored);
        }
      })
      .catch(() => {})
      .finally(() => {
        historyLoadedRef.current = true;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [masterId, chatKey]);

  useEffect(() => {
    if (!historyLoadedRef.current) return;
    if (status !== 'ready') return;

    const toSave = messages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: msgText(m as Parameters<typeof msgText>[0]),
    }));

    fetch('/api/chat-history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ masterId, chatKey, messages: toSave }),
    }).catch(() => {});
  }, [messages, status, masterId, chatKey]);

  useEffect(() => {
    const wasStreaming = prevStatusRef.current === 'streaming';
    prevStatusRef.current = status;

    if (!wasStreaming || status !== 'ready') return;
    if (!historyLoadedRef.current) return;
    if (messages.length < 2) return;

    const lastAstIdx = messages.length - 1;
    const lastAst = messages[lastAstIdx];
    const lastUsr = messages[lastAstIdx - 1];
    if (lastAst?.role !== 'assistant' || lastUsr?.role !== 'user') return;

    const store = useAppStore.getState();
    const config = store.providerConfig;

    const userContent = msgText(lastUsr as Parameters<typeof msgText>[0]);
    const assistantContent = msgText(lastAst as Parameters<typeof msgText>[0]);

    if (store.ttsConfig.autoPlay && store.ttsConfig.apiKey && assistantContent && isVisible) {
      ttsPlay(lastAst.id, assistantContent);
    }
    const apiKey = getApiKeyForProvider(config.selectedProvider, config);

    const LLM_BASE_URLS: Record<string, string> = {
      openai: 'https://api.openai.com/v1',
      openrouter: 'https://openrouter.ai/api/v1',
      deepseek: 'https://api.deepseek.com/v1',
      kimi: 'https://api.moonshot.cn/v1',
    };

    void (async () => {
      const memoryPayload = {
        masterId,
        messages: [
          { role: 'user', content: userContent },
          { role: 'assistant', content: assistantContent },
        ],
        provider: config.selectedProvider,
        model: config.selectedModel,
        apiKey,
        embeddingConfig: store.embeddingConfig,
      };

      const runMemoryExtract = async () => {
        const res = await fetch('/api/memory/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(memoryPayload),
        });

        const text = await res.text();
        let data: { extracted?: number; saved?: number; error?: string } | null = null;
        try {
          data = text ? JSON.parse(text) : null;
        } catch {
          data = null;
        }

        if (!res.ok) {
          throw new Error(data?.error || text || `HTTP ${res.status}`);
        }

        return data;
      };

      try {
        let memoryResult = await runMemoryExtract();
        const savedCount = memoryResult?.saved ?? memoryResult?.extracted ?? 0;

        // Graphiti add-episode 会同时占用同一组 LLM / Embedding 资源，
        // 提取结果为 0 时延迟重试一次，减少并发导致的偶发失败。
        if (savedCount === 0) {
          await new Promise((resolve) => setTimeout(resolve, 1500));
          memoryResult = await runMemoryExtract();
        }
      } catch (err) {
        console.error('[memory] extract failed:', err);
      }

      try {
        const res = await fetch('/api/graphiti/add-episode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            masterId,
            content: `User: ${userContent}\nAssistant: ${assistantContent}`,
            sourceDescription: 'conversation',
            llmConfig: {
              provider: config.selectedProvider,
              model: config.selectedModel,
              apiKey,
              apiUrl: LLM_BASE_URLS[config.selectedProvider],
            },
            embeddingConfig: {
              provider: store.embeddingConfig.provider,
              model: store.embeddingConfig.model,
              apiKey: store.embeddingConfig.apiKey,
              apiUrl: store.embeddingConfig.apiUrl,
            },
          }),
        });

        if (!res.ok) {
          const text = await res.text().catch(() => '');
          console.error('[graphiti] add-episode failed:', res.status, text);
        }
      } catch (err) {
        console.error('[graphiti] add-episode error:', err);
      }
    })();
  }, [status, messages, masterId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (isVisible && scrollRef.current) {
      const el = scrollRef.current;
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    }
  }, [isVisible]);

  const hasApiKey = !!getApiKeyForProvider(
    providerConfig.selectedProvider,
    providerConfig
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!input.trim() || isLoading || !hasApiKey) return;
      sendMessage({ text: input });
      setInput('');
    },
    [input, isLoading, hasApiKey, sendMessage]
  );

  const executeDelete = useCallback(
    (messageId: string) => {
      const idx = messages.findIndex((m) => m.id === messageId);
      if (idx === -1) return;

      const toRemove = new Set<number>();
      const msg = messages[idx];
      let userIdx = -1;

      if (msg.role === 'user') {
        userIdx = idx;
        toRemove.add(idx);
        if (
          idx + 1 < messages.length &&
          messages[idx + 1].role === 'assistant'
        ) {
          toRemove.add(idx + 1);
        }
      } else if (msg.role === 'assistant') {
        toRemove.add(idx);
        if (idx - 1 >= 0 && messages[idx - 1].role === 'user') {
          userIdx = idx - 1;
          toRemove.add(idx - 1);
        }
      }

      if (userIdx >= 0) {
        const userText = msgText(
          messages[userIdx] as Parameters<typeof msgText>[0]
        );
        if (userText) {
          fetch('/api/memory', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ masterId, content: userText }),
          }).catch(() => {});
        }
      }

      setMessages(messages.filter((_, i) => !toRemove.has(i)));
    },
    [messages, setMessages, masterId]
  );

  if (!master) return null;

  const lastUserIdx = messages.findLastIndex((m) => m.role === 'user');
  const canDelete = (idx: number) => {
    if (!isLoading) return true;
    return idx < lastUserIdx;
  };

  return (
    <div className="flex h-full flex-col">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto" ref={scrollRef}>
        <div className="mx-auto max-w-[640px] px-4 py-6">
          {!hasApiKey ? (
            <div className="flex flex-col items-center py-24 text-center">
              <p className="text-[15px] font-medium">配置 API Key 开始对话</p>
              <p className="mt-1.5 text-[13px] text-muted-foreground">
                前往设置页面配置你的 API Key
              </p>
              <button
                className="mt-4 rounded-lg bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground hover:bg-primary/90"
                onClick={() => useAppStore.getState().setCurrentView('settings')}
              >
                前往设置
              </button>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center py-20 text-center">
              <span className="text-4xl">{master.avatar}</span>
              <h2 className="mt-3 text-[17px] font-semibold">{master.name}</h2>
              {master.era && (
                <p className="mt-1 text-[12px] text-muted-foreground">
                  {master.era}
                </p>
              )}
              <p className="mt-3 max-w-md text-[14px] leading-relaxed text-muted-foreground">
                {master.greeting}
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {messages.map((message, msgIdx) => {
                const text = msgText(
                  message as Parameters<typeof msgText>[0]
                );
                const isUser = message.role === 'user';
                const deletable = canDelete(msgIdx);

                return (
                  <div key={message.id} className="group relative">
                    {isUser ? (
                      <div className="flex justify-end">
                        <div className="relative max-w-[80%]">
                          <div className="whitespace-pre-wrap rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-[14px] leading-relaxed text-primary-foreground select-text">
                            {text}
                          </div>
                          {text && (
                            <div className="mt-1 flex justify-end">
                              <CopyButton text={text} />
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-3">
                        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-[13px]">
                          {master.avatar}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="whitespace-pre-wrap text-[14px] leading-relaxed select-text">
                            {text}
                          </div>
                          {text && (
                            <div className="mt-1.5 flex items-center gap-0.5">
                              <CopyButton text={text} />
                              {ttsConfig.apiKey && (
                                <button
                                  onClick={() => ttsPlay(message.id, text)}
                                  title={ttsPlayingId === message.id ? '停止播放' : '朗读'}
                                  className={cn(
                                    'flex h-6 items-center gap-1 rounded-md px-1.5 text-[12px] transition-colors',
                                    ttsPlayingId === message.id
                                      ? 'text-primary'
                                      : 'text-muted-foreground/40 hover:text-muted-foreground'
                                  )}
                                >
                                  {ttsLoading && ttsPlayingId === message.id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : ttsPlayingId === message.id ? (
                                    <Square className="h-3 w-3 fill-current" />
                                  ) : (
                                    <Volume2 className="h-3.5 w-3.5" />
                                  )}
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {deletable && (
                      <button
                        onClick={() => setPendingDeleteId(message.id)}
                        title="删除此轮对话"
                        className={cn(
                          'absolute top-1 flex h-6 w-6 items-center justify-center rounded-md',
                          'text-transparent transition-colors',
                          'group-hover:text-muted-foreground/30 group-hover:hover:bg-destructive/10 group-hover:hover:text-destructive',
                          isUser ? '-left-7' : '-right-7'
                        )}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                );
              })}

              {isLoading &&
                messages[messages.length - 1]?.role !== 'assistant' && (
                  <div className="flex gap-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-[13px]">
                      {master.avatar}
                    </div>
                    <div className="flex items-center gap-1 py-2">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/30 [animation-delay:0ms]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/30 [animation-delay:150ms]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/30 [animation-delay:300ms]" />
                    </div>
                  </div>
                )}
            </div>
          )}
          {error && (
            <div className="mt-4 rounded-lg bg-destructive/10 px-4 py-3 text-[13px] text-destructive">
              {error.message}
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={pendingDeleteId !== null}
        onConfirm={() => {
          if (pendingDeleteId) executeDelete(pendingDeleteId);
          setPendingDeleteId(null);
        }}
        onCancel={() => setPendingDeleteId(null)}
      />

      {/* Input */}
      <div className="shrink-0 px-4 py-3">
        <form onSubmit={handleSubmit} className="mx-auto max-w-[640px]">
          <div className="relative">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e as unknown as React.FormEvent);
                }
              }}
              placeholder={`向 ${master.name} 提问…`}
              className="w-full resize-none rounded-xl border border-input bg-background px-4 py-3 pr-12 text-[14px] placeholder:text-muted-foreground/40 focus:border-ring focus:outline-none"
              rows={1}
              disabled={!hasApiKey}
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading || !hasApiKey}
              className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-opacity disabled:opacity-20"
            >
              <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  ChatView — all active masters mounted simultaneously              */
/* ------------------------------------------------------------------ */

export function ChatView() {
  const selectedMasterId = useAppStore((s) => s.selectedMasterId);
  const activeMasterIds = useAppStore((s) => s.activeMasterIds);
  const masterChatKeys = useAppStore((s) => s.masterChatKeys);

  return (
    <div className="relative h-full">
      {activeMasterIds.map((id) => {
        const chatKey = masterChatKeys[id] ?? 0;
        const isSelected = selectedMasterId === id;
        return (
          <div
            key={`${id}-${chatKey}`}
            className={cn('h-full flex-col', isSelected ? 'flex' : 'hidden')}
          >
            <MasterChatInstance
              masterId={id}
              chatKey={chatKey}
              isVisible={isSelected}
            />
          </div>
        );
      })}

      {!selectedMasterId && (
        <div className="flex h-full items-center justify-center">
          <div className="text-center">
            <p className="text-[15px] font-medium text-muted-foreground/60">
              选择一个角色开始对话
            </p>
            <p className="mt-1 text-[13px] text-muted-foreground/40">
              从左侧选择或添加新的角色
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
