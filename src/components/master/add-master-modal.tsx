'use client';

import { useState } from 'react';
import { X, Check, Plus, Sparkles, User } from 'lucide-react';
import { SYSTEM_MASTERS } from '@/lib/master/registry';
import { useAppStore } from '@/lib/store';
import type { Master } from '@/lib/master/types';
import { cn } from '@/lib/utils';

type Tab = 'system' | 'custom';

const AVATAR_OPTIONS = ['🧠', '🎭', '📚', '🔬', '💡', '🎯', '🌍', '🎵', '⚡', '🔮', '🏛️', '🚀'];

function SystemMasterList({ onClose }: { onClose: () => void }) {
  const { activeMasterIds, addMasterById, selectMaster } = useAppStore();

  return (
    <div className="grid grid-cols-1 gap-2">
      {SYSTEM_MASTERS.map((m) => {
        const isAdded = activeMasterIds.includes(m.id);
        return (
          <div
            key={m.id}
            className="flex items-center gap-3 rounded-xl border border-border bg-card/50 p-3 transition-colors hover:bg-accent/30"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-xl">
              {m.avatar}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-medium leading-tight">{m.name}</p>
              <p className="text-[12px] text-muted-foreground">{m.title} · {m.era}</p>
              <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground/60">
                {m.description}
              </p>
            </div>
            {isAdded ? (
              <button
                onClick={() => {
                  selectMaster(m.id);
                  onClose();
                }}
                className="flex items-center gap-1 rounded-lg bg-primary/10 px-3 py-1.5 text-[12px] font-medium text-primary"
              >
                <Check className="h-3 w-3" /> 对话
              </button>
            ) : (
              <button
                onClick={() => {
                  addMasterById(m.id);
                  selectMaster(m.id);
                  onClose();
                }}
                className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground hover:bg-primary/90"
              >
                <Plus className="h-3 w-3" /> 添加
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function CustomMasterForm({ onClose }: { onClose: () => void }) {
  const { addCustomMaster } = useAppStore();
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [avatar, setAvatar] = useState('🧠');
  const [greeting, setGreeting] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');

  const canSubmit = name.trim() && systemPrompt.trim();

  const handleCreate = () => {
    if (!canSubmit) return;
    const master: Master = {
      id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: name.trim(),
      nameEn: name.trim(),
      title: title.trim() || '自定义角色',
      era: '',
      avatar,
      description: '',
      systemPrompt: systemPrompt.trim(),
      knowledgeBase: '',
      greeting: greeting.trim() || `你好，我是${name.trim()}。有什么可以帮你的？`,
      traits: [],
      expertise: [],
      isSystem: false,
    };
    addCustomMaster(master);
    onClose();
  };

  return (
    <div className="space-y-4">
      {/* Avatar */}
      <div>
        <label className="text-[12px] font-medium text-muted-foreground">头像</label>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {AVATAR_OPTIONS.map((a) => (
            <button
              key={a}
              onClick={() => setAvatar(a)}
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-lg text-lg transition-all',
                avatar === a
                  ? 'bg-primary/10 ring-2 ring-primary'
                  : 'bg-secondary hover:bg-accent'
              )}
            >
              {a}
            </button>
          ))}
        </div>
      </div>

      {/* Name */}
      <div>
        <label className="text-[12px] font-medium text-muted-foreground">
          名称 <span className="text-destructive">*</span>
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="如：产品导师、写作教练、研究助手…"
          className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2 text-[13px] placeholder:text-muted-foreground/30 focus:border-ring focus:outline-none"
        />
      </div>

      {/* Title */}
      <div>
        <label className="text-[12px] font-medium text-muted-foreground">头衔</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="如：增长顾问、写作伙伴、学习教练…"
          className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2 text-[13px] placeholder:text-muted-foreground/30 focus:border-ring focus:outline-none"
        />
      </div>

      {/* Greeting */}
      <div>
        <label className="text-[12px] font-medium text-muted-foreground">开场白</label>
        <input
          value={greeting}
          onChange={(e) => setGreeting(e.target.value)}
          placeholder="角色的问候语…"
          className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2 text-[13px] placeholder:text-muted-foreground/30 focus:border-ring focus:outline-none"
        />
      </div>

      {/* System Prompt */}
      <div>
        <label className="text-[12px] font-medium text-muted-foreground">
          提示词 <span className="text-destructive">*</span>
        </label>
        <textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          placeholder={'描述角色的身份、性格、说话风格、专业领域等…\n\n例如：你是一位擅长产品规划与用户研究的导师，回答清晰、务实、结构化…'}
          rows={6}
          className="mt-1.5 w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-[13px] leading-relaxed placeholder:text-muted-foreground/30 focus:border-ring focus:outline-none"
        />
      </div>

      {/* Submit */}
      <button
        onClick={handleCreate}
        disabled={!canSubmit}
        className="w-full rounded-lg bg-primary py-2.5 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
      >
        创建角色
      </button>
    </div>
  );
}

export function AddMasterModal() {
  const { showAddMasterModal, setShowAddMasterModal } = useAppStore();
  const [tab, setTab] = useState<Tab>('system');

  if (!showAddMasterModal) return null;

  const handleClose = () => {
    setShowAddMasterModal(false);
    setTab('system');
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative z-10 mx-4 flex max-h-[80vh] w-full max-w-lg flex-col rounded-2xl border border-border bg-background shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-[16px] font-semibold">添加角色</h2>
          <button
            onClick={handleClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground/50 hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex shrink-0 gap-1 border-b border-border px-5 pt-2">
          <button
            onClick={() => setTab('system')}
            className={cn(
              'flex items-center gap-1.5 border-b-2 px-3 pb-2.5 text-[13px] font-medium transition-colors',
              tab === 'system'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <Sparkles className="h-3.5 w-3.5" />
            系统角色
          </button>
          <button
            onClick={() => setTab('custom')}
            className={cn(
              'flex items-center gap-1.5 border-b-2 px-3 pb-2.5 text-[13px] font-medium transition-colors',
              tab === 'custom'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <User className="h-3.5 w-3.5" />
            自定义角色
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {tab === 'system' ? (
            <SystemMasterList onClose={handleClose} />
          ) : (
            <CustomMasterForm onClose={handleClose} />
          )}
        </div>
      </div>
    </div>
  );
}
