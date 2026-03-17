'use client';

import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Sidebar } from '@/components/layout/sidebar';
import { ChatTopBar, ChatView } from '@/components/chat/chat-view';
import { SettingsView } from '@/components/settings/settings-view';
import { AddMasterModal } from '@/components/master/add-master-modal';
import { useAppStore } from '@/lib/store';
import { cn } from '@/lib/utils';

export default function Home() {
  const currentView = useAppStore((s) => s.currentView);
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const sidebarWidthClass = sidebarCollapsed ? 'w-[54px]' : 'w-[220px]';

  // Full-screen settings view to match Codex style
  if (currentView === 'settings') {
    return (
      <div className="flex h-screen w-full overflow-hidden bg-background">
        <SettingsView />
        <AddMasterModal />
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <header className="drag-region flex h-[52px] shrink-0 items-center border-b border-border/60">
        <div className={cn('flex h-full shrink-0 items-center gap-3 pl-[72px] pr-4', sidebarWidthClass)}>
          <button
            onClick={toggleSidebar}
            title={sidebarCollapsed ? '展开边栏' : '收起边栏'}
            className="no-drag flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/55 transition-colors hover:bg-accent hover:text-foreground"
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>
        </div>
        <div className="flex min-w-0 flex-1 items-center px-4">
          <ChatTopBar />
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-hidden">
          <ChatView />
        </main>
      </div>
      <AddMasterModal />
    </div>
  );
}
