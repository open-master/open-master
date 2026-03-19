'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  X, RefreshCw, Send, StopCircle, Trash2, ChevronRight,
  Clock, MessageSquare, Cpu, Loader2, AlertCircle, Plus,
} from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { cn } from '@/lib/utils';

// ── 类型 ─────────────────────────────────────────────────────────────────────
interface Session {
  key: string;
  kind: string;
  displayName?: string;
  channel?: string;
  running?: boolean;
  updatedAt?: number;
  lastActivityMs?: number;
  messageCount?: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  model?: string;
  abortedLastRun?: boolean;
}

interface UsageLog {
  ts: number;
  role: string;
  content?: string;
  tokens?: number;
  tool?: string;
}

// ── helpers ───────────────────────────────────────────────────────────────────
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
  // key 格式: agent:{agentName}:{channel}:{kind}:{id}
  const parts = s.key.split(':');
  if (parts[0] === 'agent' && parts[1]) return parts[1];
  return null;
}

// ── 拖拽 hook ─────────────────────────────────────────────────────────────────
function useDraggable() {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragging  = useRef(false);
  const startMouse = useRef({ x: 0, y: 0 });
  const startOffset = useRef({ x: 0, y: 0 });

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current    = true;
    startMouse.current  = { x: e.clientX, y: e.clientY };
    startOffset.current = { ...offset };
    e.preventDefault();
  }, [offset]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      setOffset({
        x: startOffset.current.x + (e.clientX - startMouse.current.x),
        y: startOffset.current.y + (e.clientY - startMouse.current.y),
      });
    };
    const onUp = () => { dragging.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
    };
  }, []);

  return { offset, onMouseDown };
}

// ── 新建对话弹窗 ──────────────────────────────────────────────────────────────
interface NewConvDialogProps {
  sessions: Session[];
  onClose: () => void;
  onConfirm: (sessionKey: string, message: string) => Promise<void>;
}

function NewConvDialog({ sessions, onClose, onConfirm }: NewConvDialogProps) {
  // 提取所有 agent 名
  const agentMap = new Map<string, Session[]>();
  sessions.forEach(s => {
    const name = agentNameOf(s);
    if (name) {
      if (!agentMap.has(name)) agentMap.set(name, []);
      agentMap.get(name)!.push(s);
    }
  });
  const agentNames = [...agentMap.keys()].sort();

  const [selectedAgent, setSelectedAgent] = useState(agentNames[0] ?? '');
  const [message,       setMessage]       = useState('');
  const [sending,       setSending]       = useState(false);
  const [error,         setError]         = useState<string | null>(null);

  const handleConfirm = async () => {
    if (!selectedAgent || !message.trim() || sending) return;
    setSending(true); setError(null);

    // 找该 Agent 最近的 session（优先 direct，否则取最新）
    const candidates = agentMap.get(selectedAgent) ?? [];
    const direct  = candidates.find(s => s.kind === 'direct');
    const target  = direct ?? candidates.sort((a, b) =>
      ((b.lastActivityMs ?? b.updatedAt ?? 0) - (a.lastActivityMs ?? a.updatedAt ?? 0))
    )[0];

    if (!target) {
      setError(`未找到 Agent "${selectedAgent}" 的 Session`);
      setSending(false);
      return;
    }

    try {
      await onConfirm(target.key, message.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : '发送失败');
      setSending(false);
    }
  };

  return createPortal(
    <>
      <div className="fixed inset-0 z-[60] bg-black/20 backdrop-blur-[2px]" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-[61] w-[460px] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
        <div className="border-b border-border/60 px-5 py-4">
          <p className="text-[14px] font-semibold text-foreground">新建对话</p>
          <p className="mt-0.5 text-[12px] text-muted-foreground">选择 Agent 并发送消息</p>
        </div>

        <div className="space-y-4 px-5 py-4">
          {/* Agent 选择 */}
          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-foreground">Agent</label>
            {agentNames.length > 0 ? (
              <div className="grid grid-cols-2 gap-1.5 max-h-[160px] overflow-y-auto">
                {agentNames.map(name => (
                  <button
                    key={name}
                    onClick={() => setSelectedAgent(name)}
                    className={cn(
                      'flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-[12px] transition-colors',
                      selectedAgent === name
                        ? 'border-primary/40 bg-primary/10 text-primary font-medium'
                        : 'border-border/50 bg-muted/30 text-foreground hover:bg-accent'
                    )}
                  >
                    <div className={cn(
                      'h-2 w-2 shrink-0 rounded-full',
                      selectedAgent === name ? 'bg-primary' : 'bg-muted-foreground/30'
                    )} />
                    {name}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-[12px] text-muted-foreground/60">暂无可用 Agent，请先刷新 Session 列表</p>
            )}
          </div>

          {/* 消息 */}
          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-foreground">消息内容</label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleConfirm(); } }}
              placeholder="输入要发送给 Agent 的内容…"
              rows={4}
              autoFocus
              className="w-full resize-none rounded-xl border border-input bg-background px-3 py-2.5 text-[12px] placeholder:text-muted-foreground/40 focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {error && <p className="text-[11px] text-destructive">{error}</p>}
        </div>

        <div className="flex items-center justify-between border-t border-border/60 px-5 py-3">
          <button onClick={onClose} className="text-[12px] text-muted-foreground hover:text-foreground">
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedAgent || !message.trim() || sending}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-[12px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
          >
            {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            发起对话
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}

// ── 主组件 ────────────────────────────────────────────────────────────────────
interface OpenClawPanelProps {
  onClose: () => void;
}

export function OpenClawPanel({ onClose }: OpenClawPanelProps) {
  const { djConfig } = useAppStore();
  const endpoint = djConfig.openclawEndpoint?.trim() || '';
  const token    = djConfig.openclawToken?.trim()    || '';
  const password = djConfig.openclawPassword?.trim() || '';

  const [mounted,     setMounted]     = useState(false);
  const [sessions,    setSessions]    = useState<Session[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [selected,    setSelected]    = useState<Session | null>(null);
  const [logs,        setLogs]        = useState<UsageLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [sendMsg,     setSendMsg]     = useState('');
  const [sending,     setSending]     = useState(false);
  const [actionMsg,   setActionMsg]   = useState<string | null>(null);
  const [showNew,     setShowNew]     = useState(false);

  const logsEndRef = useRef<HTMLDivElement>(null);
  const { offset, onMouseDown } = useDraggable();

  // Portal 需要客户端挂载后才能用 document.body
  useEffect(() => { setMounted(true); }, []);

  // ── command ───────────────────────────────────────────────────────────────
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

  // ── sessions ──────────────────────────────────────────────────────────────
  const loadSessions = useCallback(async () => {
    if (!endpoint) { setError('请先配置 WebSocket 地址'); return; }
    setLoading(true); setError(null);
    try {
      const result = await command('sessions.list', {}) as { sessions?: Session[] };
      const list = result?.sessions ?? [];
      list.sort((a, b) => ((b.lastActivityMs ?? b.updatedAt ?? 0) - (a.lastActivityMs ?? a.updatedAt ?? 0)));
      setSessions(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setLoading(false); }
  }, [command, endpoint]);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  // ── logs ──────────────────────────────────────────────────────────────────
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
    setSelected(s); setSendMsg(''); setActionMsg(null);
    loadLogs(s);
  }, [loadLogs]);

  // ── 发送消息 ──────────────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    if (!selected || !sendMsg.trim() || sending) return;
    setSending(true); setActionMsg(null);
    try {
      await command('chat.send', { sessionKey: selected.key, message: sendMsg.trim(), deliver: true, idempotencyKey: `om-${Date.now()}` });
      setActionMsg('✅ 消息已发送');
      setSendMsg('');
      setTimeout(() => loadLogs(selected), 1500);
    } catch (e) {
      setActionMsg(`❌ ${e instanceof Error ? e.message : '发送失败'}`);
    } finally { setSending(false); }
  }, [selected, sendMsg, sending, command, loadLogs]);

  // ── 中止 ─────────────────────────────────────────────────────────────────
  const handleAbort = useCallback(async () => {
    if (!selected) return; setActionMsg(null);
    try {
      await command('chat.abort', { sessionKey: selected.key });
      setActionMsg('✅ 已中止'); loadSessions();
    } catch (e) { setActionMsg(`❌ ${e instanceof Error ? e.message : '中止失败'}`); }
  }, [selected, command, loadSessions]);

  // ── 删除 ─────────────────────────────────────────────────────────────────
  const handleDelete = useCallback(async () => {
    if (!selected || !window.confirm(`确认删除 "${selected.key}"？`)) return;
    setActionMsg(null);
    try {
      await command('sessions.delete', { key: selected.key, deleteTranscript: true });
      setSelected(null); setLogs([]); loadSessions();
    } catch (e) { setActionMsg(`❌ ${e instanceof Error ? e.message : '删除失败'}`); }
  }, [selected, command, loadSessions]);

  // ── 新建对话确认 ──────────────────────────────────────────────────────────
  const handleNewConvConfirm = useCallback(async (sessionKey: string, message: string) => {
    await command('chat.send', { sessionKey, message, deliver: true, idempotencyKey: `om-new-${Date.now()}` });
    setShowNew(false);
    setTimeout(() => loadSessions(), 1000);
  }, [command, loadSessions]);

  if (!mounted) return null;

  // 面板样式：贴顶显示，水平居中，拖拽叠加偏移
  const panelStyle: React.CSSProperties = {
    position: 'fixed',
    left:      `calc(50% + ${offset.x}px)`,
    top:       `calc(12px + ${offset.y}px)`,
    transform: 'translateX(-50%)',
    zIndex:    9999,
  };

  const panel = (
    <>
      {/* 背景遮罩 */}
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(2px)' }}
        onClick={onClose}
      />

      {/* 面板 */}
      <div
        style={panelStyle}
        className="flex h-[78vh] w-[880px] max-w-[94vw] flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header（拖拽区域） */}
        <div
          className="flex cursor-grab items-center justify-between border-b border-border/60 px-5 py-3.5 select-none active:cursor-grabbing"
          onMouseDown={onMouseDown}
        >
          <div className="flex items-center gap-2.5">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10">
              <Cpu className="h-3.5 w-3.5 text-primary" />
            </div>
            <span className="text-[14px] font-semibold text-foreground">OpenClaw 管理</span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
              {sessions.length} sessions
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowNew(true)}
              className="flex items-center gap-1 rounded-lg bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/20"
            >
              <Plus className="h-3 w-3" />新建对话
            </button>
            <button onClick={loadSessions} disabled={loading}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent disabled:opacity-40">
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            </button>
            <button onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex min-h-0 flex-1">
          {/* Session 列表 */}
          <div className="flex w-[320px] shrink-0 flex-col border-r border-border/60">
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
                  const active    = isRunning(s);
                  const ts        = s.lastActivityMs ?? s.updatedAt ?? 0;
                  const agentName = agentNameOf(s);
                  const label     = s.displayName || agentName || s.key;
                  return (
                    <button key={s.key} onClick={() => selectSession(s)}
                      className={cn(
                        'flex w-full items-start gap-3 border-b border-border/30 px-4 py-3 text-left transition-colors hover:bg-accent/50',
                        selected?.key === s.key && 'bg-accent'
                      )}>
                      <div className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', active ? 'animate-pulse bg-green-500' : 'bg-muted-foreground/25')} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="truncate text-[12px] font-medium text-foreground">{label}</span>
                          <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/40" />
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                          <span className="flex items-center gap-1"><Clock className="h-2.5 w-2.5" />{timeAgo(ts)}</span>
                          {s.messageCount != null && <span className="flex items-center gap-1"><MessageSquare className="h-2.5 w-2.5" />{s.messageCount}</span>}
                          <span className="truncate text-muted-foreground/50">{s.channel} · {s.kind}</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* 详情 */}
          {selected ? (
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="border-b border-border/60 px-5 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-foreground">
                      {selected.displayName || agentNameOf(selected) || selected.key}
                    </p>
                    <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground/50">{selected.key}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {isRunning(selected) && (
                      <button onClick={handleAbort}
                        className="flex items-center gap-1 rounded-lg bg-orange-500/10 px-2.5 py-1 text-[11px] font-medium text-orange-600 hover:bg-orange-500/20">
                        <StopCircle className="h-3 w-3" />中止
                      </button>
                    )}
                    <button onClick={handleDelete}
                      className="flex items-center gap-1 rounded-lg bg-destructive/10 px-2.5 py-1 text-[11px] font-medium text-destructive hover:bg-destructive/20">
                      <Trash2 className="h-3 w-3" />删除
                    </button>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {[
                    selected.channel    && `渠道: ${selected.channel}`,
                    selected.model      && `模型: ${selected.model}`,
                    selected.messageCount && `消息: ${selected.messageCount}`,
                  ].filter(Boolean).map(tag => (
                    <span key={tag as string} className="rounded-md bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{tag}</span>
                  ))}
                </div>
              </div>

              {/* 对话历史 */}
              <div className="flex-1 overflow-y-auto px-4 py-3">
                {logsLoading ? (
                  <div className="flex h-full items-center justify-center">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/50" />
                  </div>
                ) : logs.length === 0 ? (
                  <p className="mt-8 text-center text-[12px] text-muted-foreground/40">暂无对话记录</p>
                ) : (
                  <div className="space-y-2">
                    {logs.map((log, i) => (
                      <div key={i} className={cn(
                        'rounded-xl px-3 py-2 text-[12px]',
                        log.role === 'user'      ? 'ml-10 bg-primary/10 text-foreground'
                          : log.role === 'assistant' ? 'mr-10 bg-muted text-foreground'
                          : 'bg-muted/40 text-muted-foreground italic'
                      )}>
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-[10px] font-medium text-muted-foreground">
                            {log.role === 'user' ? '用户' : log.role === 'assistant' ? 'Agent' : log.tool || log.role}
                          </span>
                          <span className="text-[10px] text-muted-foreground/40">
                            {log.ts ? new Date(log.ts).toLocaleTimeString() : ''}
                            {log.tokens ? ` · ${log.tokens}t` : ''}
                          </span>
                        </div>
                        <p className="whitespace-pre-wrap break-words leading-relaxed">
                          {log.content ?? (log.tool ? `[工具: ${log.tool}]` : '—')}
                        </p>
                      </div>
                    ))}
                    <div ref={logsEndRef} />
                  </div>
                )}
              </div>

              {actionMsg && (
                <div className="border-t border-border/30 px-4 py-2">
                  <p className="text-[12px] text-muted-foreground">{actionMsg}</p>
                </div>
              )}

              {/* 发送 */}
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
                  <button onClick={handleSend} disabled={!sendMsg.trim() || sending}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
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
      </div>

      {/* 新建对话弹窗 */}
      {showNew && (
        <NewConvDialog
          sessions={sessions}
          onClose={() => setShowNew(false)}
          onConfirm={handleNewConvConfirm}
        />
      )}
    </>
  );

  return createPortal(panel, document.body);
}
