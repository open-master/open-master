'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  X, RefreshCw, Send, StopCircle, ChevronRight,
  Clock, MessageSquare, Cpu, Loader2, AlertCircle,
  ChevronDown, ChevronUp, Wrench, Bot, Plus,
} from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { cn } from '@/lib/utils';

interface Session {
  key: string;
  kind: string;
  displayName?: string;
  channel?: string;
  running?: boolean;
  updatedAt?: number;
  lastActivityMs?: number;
  messageCount?: number;
  totalTokens?: number;
  model?: string;
}

interface UsageLog {
  ts: number;
  role: string;
  content?: string;
  tokens?: number;
  tool?: string;
  toolInput?: unknown;
  toolResult?: unknown;
  isError?: boolean;
}

function timeAgo(ts?: number) {
  if (!ts) return '—';
  const diff = Date.now() - ts;
  if (diff < 60_000) return `${Math.round(diff / 1000)}s 前`;
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m 前`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h 前`;
  return `${Math.round(diff / 86_400_000)}d 前`;
}

function isRunning(s: Session) {
  if (s.running === true) return true;
  const ts = s.lastActivityMs ?? s.updatedAt ?? 0;
  return Date.now() - ts < 20_000;
}

function agentNameOf(s: Session) {
  const parts = s.key.split(':');
  if (parts[0] === 'agent' && parts[1]) return parts[1];
  return null;
}

// ── 工具调用折叠卡片 ────────────────────────────────────────────────────────
function ToolCard({ log }: { log: UsageLog }) {
  const [open, setOpen] = useState(false);
  const toolName = log.tool || '工具调用';
  const hasDetail = log.toolInput != null || log.toolResult != null || log.content;

  let summary = '';
  if (log.role === 'toolResult' || log.role === 'tool_result') {
    if (typeof log.content === 'string' && log.content.length > 0) {
      summary = log.content.slice(0, 80).replace(/\n/g, ' ');
      if (log.content.length > 80) summary += '…';
    } else if (log.toolResult != null) {
      const raw = JSON.stringify(log.toolResult);
      summary = raw.slice(0, 80) + (raw.length > 80 ? '…' : '');
    }
  } else {
    if (log.toolInput != null) {
      const raw = JSON.stringify(log.toolInput);
      summary = raw.slice(0, 80) + (raw.length > 80 ? '…' : '');
    } else if (typeof log.content === 'string') {
      summary = log.content.slice(0, 80) + (log.content.length > 80 ? '…' : '');
    }
  }

  const isResult = log.role === 'toolResult' || log.role === 'tool_result';

  return (
    <div className={cn('rounded-xl border text-[11px]', isResult ? 'border-border/30 bg-muted/30' : 'border-border/40 bg-amber-50/50 dark:bg-amber-950/20')}>
      <button onClick={() => hasDetail && setOpen(o => !o)} className="flex w-full items-center gap-2 px-3 py-2 text-left">
        <Wrench className={cn('h-3 w-3 shrink-0', isResult ? 'text-muted-foreground/60' : 'text-amber-600')} />
        <span className={cn('font-medium', isResult ? 'text-muted-foreground' : 'text-amber-700 dark:text-amber-400')}>
          {isResult ? `↩ ${toolName} 结果` : `⚙ ${toolName}`}
        </span>
        {summary && <span className="flex-1 truncate text-muted-foreground/50">{summary}</span>}
        {hasDetail && (open
          ? <ChevronUp className="ml-auto h-3 w-3 shrink-0 text-muted-foreground/40" />
          : <ChevronDown className="ml-auto h-3 w-3 shrink-0 text-muted-foreground/40" />
        )}
      </button>
      {open && hasDetail && (
        <div className="border-t border-border/30 px-3 py-2">
          {log.toolInput != null && (
            <pre className="mb-2 overflow-x-auto whitespace-pre-wrap break-all rounded-md bg-muted/50 p-2 text-[10px] text-muted-foreground">
              {JSON.stringify(log.toolInput, null, 2)}
            </pre>
          )}
          {log.content != null && (
            <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-md bg-muted/50 p-2 text-[10px] text-muted-foreground">
              {String(log.content)}
            </pre>
          )}
          {log.toolResult != null && (
            <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-md bg-muted/50 p-2 text-[10px] text-muted-foreground">
              {JSON.stringify(log.toolResult, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

// ── 消息气泡 ────────────────────────────────────────────────────────────────
function LogBubble({ log }: { log: UsageLog }) {
  const isTool = log.role === 'tool' || log.role === 'toolResult' || log.role === 'tool_result' || log.tool != null;
  if (isTool) return <ToolCard log={log} />;

  const isUser = log.role === 'user';
  const isAssistant = log.role === 'assistant';

  return (
    <div className={cn('rounded-xl px-3 py-2.5 text-[12px]',
      isUser ? 'ml-10 bg-primary/10' : isAssistant ? 'mr-6 bg-muted' : 'bg-muted/40 text-muted-foreground italic')}>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[10px] font-semibold text-muted-foreground">
          {isUser ? '用户' : isAssistant ? 'Agent' : log.role}
        </span>
        <span className="text-[10px] text-muted-foreground/40">
          {log.ts ? new Date(log.ts).toLocaleTimeString() : ''}
          {log.tokens ? ` · ${log.tokens}t` : ''}
        </span>
      </div>
      {log.content ? (
        <div className={cn(
          'prose prose-sm max-w-none leading-relaxed dark:prose-invert',
          '[&_h4]:mt-2 [&_h4]:mb-1 [&_h4]:text-[13px] [&_h4]:font-semibold',
          '[&_h3]:mt-2 [&_h3]:mb-1 [&_h3]:text-[13px] [&_h3]:font-semibold',
          '[&_h2]:mt-2 [&_h2]:mb-1 [&_h2]:text-[14px] [&_h2]:font-bold',
          '[&_p]:my-0.5 [&_p]:text-[12px]',
          '[&_ul]:my-1 [&_ul]:pl-4 [&_li]:my-0 [&_li]:text-[12px]',
          '[&_ol]:my-1 [&_ol]:pl-4',
          '[&_code]:rounded [&_code]:bg-muted/70 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[11px]',
          '[&_pre]:my-1.5 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-muted/70 [&_pre]:p-2',
          '[&_strong]:font-semibold',
        )}>
          <ReactMarkdown>{log.content}</ReactMarkdown>
        </div>
      ) : (
        <p className="text-muted-foreground/40">—</p>
      )}
    </div>
  );
}

// ── Agent 选择弹窗 ─────────────────────────────────────────────────────────────
interface AgentPickerProps {
  sessions: Session[];
  onClose: () => void;
  onSelect: (sessionKey: string) => void;
}

function AgentPicker({ sessions, onClose, onSelect }: AgentPickerProps) {
  const agentSessions = sessions.filter(s => agentNameOf(s) !== null);
  const [selected, setSelected] = useState(agentSessions[0]?.key ?? '');

  const handleConfirm = () => {
    if (selected) { onSelect(selected); onClose(); }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="w-[380px] max-w-[92vw] overflow-hidden rounded-2xl border border-border bg-background shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="border-b border-border/60 px-5 py-4">
          <p className="text-[14px] font-semibold">打开 Agent</p>
          <p className="mt-0.5 text-[12px] text-muted-foreground">选择要查看的 Agent</p>
        </div>

        <div className="px-5 py-4">
          <div className="grid grid-cols-2 gap-1.5 max-h-[240px] overflow-y-auto">
            {agentSessions.length === 0 && (
              <p className="col-span-2 text-[11px] text-muted-foreground/50">暂无 Agent Session</p>
            )}
            {agentSessions.map(s => {
              const name = agentNameOf(s) || s.key;
              const active = isRunning(s);
              return (
                <button
                  key={s.key}
                  onClick={() => setSelected(s.key)}
                  className={cn(
                    'flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-[12px] transition-colors',
                    selected === s.key
                      ? 'border-primary/40 bg-primary/10 text-primary font-medium'
                      : 'border-border/50 bg-muted/30 hover:bg-accent',
                  )}
                >
                  <div className={cn('h-2 w-2 shrink-0 rounded-full', active ? 'animate-pulse bg-green-500' : selected === s.key ? 'bg-primary' : 'bg-muted-foreground/30')} />
                  {name}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-border/60 px-5 py-3">
          <button onClick={onClose} className="text-[12px] text-muted-foreground hover:text-foreground">取消</button>
          <button
            onClick={handleConfirm}
            disabled={!selected}
            className="rounded-xl bg-primary px-5 py-2 text-[12px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
          >
            确认
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 主页面 ────────────────────────────────────────────────────────────────────

export default function OpenClawPanelPage() {
  const { djConfig } = useAppStore();
  const endpoint = djConfig.openclawEndpoint?.trim() || '';
  const token    = djConfig.openclawToken?.trim()    || '';
  const password = djConfig.openclawPassword?.trim() || '';

  const [sessions,    setSessions]    = useState<Session[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [selected,    setSelected]    = useState<Session | null>(null);
  const [logs,        setLogs]        = useState<UsageLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [sendMsg,     setSendMsg]     = useState('');
  const [sending,     setSending]     = useState(false);
  const [actionMsg,   setActionMsg]   = useState<string | null>(null);
  const [showPicker,  setShowPicker]  = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const command = useCallback(async (method: string, params: unknown) => {
    const res = await fetch('/api/openclaw/command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint, token, password, method, params }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'command failed');
    return data.result;
  }, [endpoint, token, password]);

  const loadSessions = useCallback(async () => {
    if (!endpoint) { setError('请先在设置中配置 WebSocket 地址'); return; }
    setLoading(true); setError(null);
    try {
      const result = await command('sessions.list', {}) as { sessions?: Session[] };
      const list = result?.sessions ?? [];
      list.sort((a, b) => ((b.lastActivityMs ?? b.updatedAt ?? 0) - (a.lastActivityMs ?? a.updatedAt ?? 0)));
      setSessions(list);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, [command, endpoint]);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  const loadLogs = useCallback(async (session: Session) => {
    setLogsLoading(true); setLogs([]);
    try {
      const result = await command('sessions.usage.logs', { key: session.key, limit: 200 }) as { logs?: UsageLog[] };
      setLogs(result?.logs ?? []);
      setTimeout(() => logsEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch { setLogs([]); }
    finally { setLogsLoading(false); }
  }, [command]);

  const selectSession = useCallback((s: Session) => {
    setSelected(s); setSendMsg(''); setActionMsg(null); loadLogs(s);
  }, [loadLogs]);

  const handleSend = useCallback(async () => {
    if (!selected || !sendMsg.trim() || sending) return;
    setSending(true); setActionMsg(null);
    try {
      await command('chat.send', { sessionKey: selected.key, message: sendMsg.trim(), deliver: true, idempotencyKey: `om-${Date.now()}` });
      setActionMsg('✅ 消息已发送'); setSendMsg('');
      setTimeout(() => loadLogs(selected), 1500);
    } catch (e) { setActionMsg(`❌ ${e instanceof Error ? e.message : '发送失败'}`); }
    finally { setSending(false); }
  }, [selected, sendMsg, sending, command, loadLogs]);

  const handleAbort = useCallback(async () => {
    if (!selected) return;
    try { await command('chat.abort', { sessionKey: selected.key }); setActionMsg('✅ 已中止'); loadSessions(); }
    catch (e) { setActionMsg(`❌ ${e instanceof Error ? e.message : '中止失败'}`); }
  }, [selected, command, loadSessions]);

  const closeWindow = useCallback(() => {
    const api = (window as unknown as { electronAPI?: { closeClawPanel?: () => void } }).electronAPI;
    if (api?.closeClawPanel) api.closeClawPanel();
    else window.close();
  }, []);

  const handlePickerSelect = useCallback((sessionKey: string) => {
    const target = sessions.find(s => s.key === sessionKey);
    if (target) selectSession(target);
  }, [sessions, selectSession]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      {/* 标题栏 */}
      <div
        className="flex shrink-0 items-center justify-between border-b border-border/60 px-5 py-3.5"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div className="flex items-center gap-2.5" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <div className="w-16" />
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10">
            <Cpu className="h-3.5 w-3.5 text-primary" />
          </div>
          <span className="text-[14px] font-semibold">OpenClaw 管理</span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{sessions.length} sessions</span>
          <button
            onClick={() => setShowPicker(true)}
            className="flex items-center gap-1 rounded-lg bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary hover:bg-primary/20"
          >
            <Bot className="h-3 w-3" />
            <Plus className="h-2.5 w-2.5" />
            打开 Agent
          </button>
        </div>

        <div className="flex items-center gap-1.5" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <button
            onClick={loadSessions}
            disabled={loading}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent disabled:opacity-40"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          </button>
          <button
            onClick={closeWindow}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* 主体 */}
      <div className="flex min-h-0 flex-1">
        {/* Session 列表 */}
        <div className="flex w-[300px] shrink-0 flex-col border-r border-border/60">
          {error ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
              <AlertCircle className="h-8 w-8 text-destructive/60" />
              <p className="text-[12px] text-muted-foreground">{error}</p>
              <button onClick={loadSessions} className="text-[12px] text-primary hover:underline">重试</button>
            </div>
          ) : loading && sessions.length === 0 ? (
            <div className="flex flex-1 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/50" />
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              {sessions.map(s => {
                const active = isRunning(s);
                const ts     = s.lastActivityMs ?? s.updatedAt ?? 0;
                const label  = s.displayName || agentNameOf(s) || s.key;
                return (
                  <button
                    key={s.key}
                    onClick={() => selectSession(s)}
                    className={cn(
                      'flex w-full items-start gap-3 border-b border-border/30 px-4 py-3 text-left transition-colors hover:bg-accent/50',
                      selected?.key === s.key && 'bg-accent',
                    )}
                  >
                    <div className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', active ? 'animate-pulse bg-green-500' : 'bg-muted-foreground/25')} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="truncate text-[12px] font-medium">{label}</span>
                        <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/40" />
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1"><Clock className="h-2.5 w-2.5" />{timeAgo(ts)}</span>
                        {s.messageCount != null && (
                          <span className="flex items-center gap-1"><MessageSquare className="h-2.5 w-2.5" />{s.messageCount}</span>
                        )}
                        <span className="truncate text-muted-foreground/50">{s.channel} · {s.kind}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
              {sessions.length === 0 && (
                <p className="mt-10 text-center text-[12px] text-muted-foreground/40">暂无 Session</p>
              )}
            </div>
          )}
        </div>

        {/* 详情 */}
        {selected ? (
          <div className="flex min-w-0 flex-1 flex-col">
            {/* Session 头部 */}
            <div className="border-b border-border/60 px-5 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold">
                    {selected.displayName || agentNameOf(selected) || selected.key}
                  </p>
                  <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground/50">{selected.key}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {isRunning(selected) && (
                    <button
                      onClick={handleAbort}
                      className="flex items-center gap-1 rounded-lg bg-orange-500/10 px-2.5 py-1 text-[11px] font-medium text-orange-600 hover:bg-orange-500/20"
                    >
                      <StopCircle className="h-3 w-3" />中止
                    </button>
                  )}
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[
                  selected.channel && `渠道: ${selected.channel}`,
                  selected.model && `模型: ${selected.model}`,
                  selected.messageCount && `消息: ${selected.messageCount}`,
                ].filter(Boolean).map(tag => (
                  <span key={tag as string} className="rounded-md bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            {/* 对话日志 */}
            <div className="flex-1 overflow-y-auto px-4 py-3">
              {logsLoading ? (
                <div className="flex h-full items-center justify-center">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/50" />
                </div>
              ) : logs.length === 0 ? (
                <p className="mt-8 text-center text-[12px] text-muted-foreground/40">暂无对话记录</p>
              ) : (
                <div className="space-y-2">
                  {logs.map((log, i) => <LogBubble key={i} log={log} />)}
                  <div ref={logsEndRef} />
                </div>
              )}
            </div>

            {actionMsg && (
              <div className="border-t border-border/30 px-4 py-2">
                <p className="text-[12px] text-muted-foreground">{actionMsg}</p>
              </div>
            )}

            {/* 发送框 */}
            <div className="border-t border-border/60 px-4 py-3">
              <div className="flex items-end gap-2">
                <textarea
                  value={sendMsg}
                  onChange={e => setSendMsg(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  placeholder="向 Agent 发送指令… (Enter 发送，Shift+Enter 换行)"
                  rows={2}
                  className="flex-1 resize-none rounded-xl border border-input bg-background px-3 py-2 text-[12px] placeholder:text-muted-foreground/40 focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <button
                  onClick={handleSend}
                  disabled={!sendMsg.trim() || sending}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
                >
                  {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-[13px] text-muted-foreground/40">← 选择一个 Session 查看详情</p>
          </div>
        )}
      </div>

      {showPicker && (
        <AgentPicker
          sessions={sessions}
          onClose={() => setShowPicker(false)}
          onSelect={handlePickerSelect}
        />
      )}
    </div>
  );
}
