'use client';

import { useState } from 'react';
import { Settings, Plus, MessageSquarePlus, Trash2 } from 'lucide-react';
import { getMasterById } from '@/lib/master/registry';
import { useAppStore } from '@/lib/store';
import { cn } from '@/lib/utils';

export function Sidebar() {
  const {
    currentView,
    setCurrentView,
    selectedMasterId,
    selectMaster,
    activeMasterIds,
    customMasters,
    sidebarCollapsed,
    setShowAddMasterModal,
    newChatForMaster,
    masterChatKeys,
    removeMaster,
  } = useAppStore();

  const [confirmTarget, setConfirmTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const collapsed = sidebarCollapsed;

  const activeMasters = activeMasterIds
    .map((id) => getMasterById(id, customMasters))
    .filter(Boolean) as import('@/lib/master/types').Master[];

  return (
    <aside
      className={cn(
        'flex h-full shrink-0 flex-col border-r border-sidebar-border bg-sidebar-background transition-all duration-200',
        collapsed ? 'w-[54px]' : 'w-[220px]'
      )}
    >
      {/* Sidebar header */}
      <div className={cn('shrink-0 px-3 pb-1.5 pt-3', collapsed ? 'pt-3' : 'pt-3')}>
        {!collapsed ? (
          <div className="flex items-center justify-between">
            <span className="pl-0.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/50">
              角色
            </span>
            <button
              onClick={() => setShowAddMasterModal(true)}
              className="no-drag flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-accent hover:text-foreground"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <div className="flex justify-center">
            <button
              onClick={() => setShowAddMasterModal(true)}
              title="添加角色"
              className="no-drag flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-accent hover:text-foreground"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Master list */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        <div className={cn(collapsed && 'px-0')}>
          {activeMasters.map((m) => (
            <div key={m.id} className="group relative">
              <button
                onClick={() => selectMaster(m.id)}
                title={collapsed ? `${m.name} — ${m.title}` : undefined}
                className={cn(
                  'flex w-full items-center gap-2 rounded-lg transition-colors',
                  collapsed ? 'justify-center px-0 py-2' : 'px-2.5 py-2 text-left',
                  selectedMasterId === m.id && currentView === 'chat'
                    ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50'
                )}
              >
                <span className={cn('shrink-0', collapsed ? 'text-lg' : 'text-base')}>
                  {m.avatar}
                </span>
                {!collapsed && (
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] leading-tight">{m.name}</p>
                    <p className="truncate text-[11px] leading-tight text-muted-foreground/50">
                      {m.title}
                    </p>
                  </div>
                )}
              </button>

              {/* Hover actions */}
              {!collapsed && (
                <div className="absolute right-1 top-1/2 flex -translate-y-1/2 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmTarget({ id: m.id, name: m.name });
                    }}
                    title="新对话"
                    className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/40 hover:bg-accent hover:text-foreground"
                  >
                    <MessageSquarePlus className="h-3 w-3" />
                  </button>
                  {!m.isSystem && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeMaster(m.id);
                      }}
                      title="移除"
                      className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/40 hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Bottom: Settings */}
      <div className="shrink-0 p-2">
        <button
          onClick={() => setCurrentView('settings')}
          title={collapsed ? '设置' : undefined}
          className={cn(
            'flex w-full items-center rounded-lg transition-colors',
            collapsed ? 'justify-center py-2' : 'gap-2.5 px-2.5 py-2',
            currentView === 'settings'
              ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
              : 'text-sidebar-foreground/50 hover:bg-sidebar-accent/50'
          )}
        >
          <Settings className="h-4 w-4 shrink-0" />
          {!collapsed && <span className="text-[13px]">设置</span>}
        </button>
      </div>
      {confirmTarget && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setConfirmTarget(null)}
          />
          <div className="relative z-10 mx-4 w-full max-w-sm rounded-2xl border border-border bg-background p-6 shadow-2xl">
            <h3 className="text-[15px] font-semibold">开启新对话</h3>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
              当前与{confirmTarget.name}
              的对话记录将被清除，但已保存的记忆不受影响。确定开启新对话吗？
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setConfirmTarget(null)}
                className="rounded-lg border border-border px-4 py-2 text-[13px] font-medium transition-colors hover:bg-accent"
              >
                取消
              </button>
              <button
                onClick={() => {
                  const chatKey =
                    masterChatKeys[confirmTarget.id] ?? 0;
                  fetch('/api/chat-history', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      masterId: confirmTarget.id,
                      chatKey,
                    }),
                  }).catch(() => {});
                  selectMaster(confirmTarget.id);
                  newChatForMaster(confirmTarget.id);
                  setConfirmTarget(null);
                }}
                className="rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
