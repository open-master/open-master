'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Play, Pause, Volume2, VolumeX, Loader2, Wifi, WifiOff,
  Music, Upload, LayoutList, Sparkles, Check,
} from 'lucide-react';
import { OpenClawPanel } from '@/components/dj/openclaw-panel';
import { useAppStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import {
  type MusicTrack,
  type DJPlaybackState,
  INITIAL_PLAYBACK_STATE,
  WORK_STATE_LABELS,
  type WorkState,
} from '@/lib/dj/types';
import {
  pushEvent,
  analyzeWorkStateHardcoded,
  getMusicStyleForState,
  clearEventWindow,
} from '@/lib/dj/analyzer';

type TrackLibrary = {
  generated: MusicTrack[];
  uploaded: MusicTrack[];
};

type DialogMode = 'generate' | 'upload';

interface StateSelectionDialogProps {
  mode: DialogMode;
  initialStates: WorkState[];
  onClose: () => void;
  onConfirm: (states: WorkState[]) => void;
}

function StateSelectionDialog({
  mode,
  initialStates,
  onClose,
  onConfirm,
}: StateSelectionDialogProps) {
  const allowMultiple = mode === 'upload';
  const [selectedStates, setSelectedStates] = useState<WorkState[]>(initialStates);

  const toggleState = (state: WorkState) => {
    if (allowMultiple) {
      setSelectedStates((prev) =>
        prev.includes(state) ? prev.filter((item) => item !== state) : [...prev, state]
      );
      return;
    }
    setSelectedStates([state]);
  };

  const title = mode === 'generate' ? '生成音乐' : '上传音乐';
  const description =
    mode === 'generate'
      ? '选择这首音乐要服务的工作状态。生成音乐会产生一定费用。'
      : '选择这首音乐适配的工作状态。可同时勾选多个状态。';
  const confirmLabel = mode === 'generate' ? '继续生成' : '选择文件';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-background shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-border/60 px-5 py-4">
          <div className="text-[15px] font-semibold text-foreground">{title}</div>
          <div className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
            {description}
          </div>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="grid grid-cols-1 gap-2">
            {(Object.entries(WORK_STATE_LABELS) as [WorkState, string][]).map(([state, label]) => {
              const active = selectedStates.includes(state);
              return (
                <button
                  key={state}
                  onClick={() => toggleState(state)}
                  className={cn(
                    'flex items-center justify-between rounded-xl border px-3 py-3 text-left transition-colors',
                    active
                      ? 'border-primary/40 bg-primary/10'
                      : 'border-border/50 bg-muted/20 hover:bg-accent'
                  )}
                >
                  <div>
                    <div className="text-[13px] font-medium text-foreground">{label}</div>
                    <div className="mt-0.5 text-[12px] text-muted-foreground">
                      {state === 'working'
                        ? '用于 OpenClaw 正在工作时播放'
                        : state === 'task_complete'
                          ? '用于任务刚完成时切换'
                          : '用于空闲或休息时播放'}
                    </div>
                  </div>
                  <div
                    className={cn(
                      'flex h-5 w-5 items-center justify-center rounded-full border',
                      active
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border/70 bg-background'
                    )}
                  >
                    {active && <Check className="h-3 w-3" />}
                  </div>
                </button>
              );
            })}
          </div>

          {mode === 'generate' && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2.5 text-[12px] leading-relaxed text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-100">
              AI 生成音乐会产生一定费用，请在确认状态后再继续。
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border/60 px-5 py-3">
          <button
            onClick={onClose}
            className="text-[12px] text-muted-foreground transition-colors hover:text-foreground"
          >
            取消
          </button>
          <button
            onClick={() => onConfirm(selectedStates)}
            disabled={selectedStates.length === 0}
            className="rounded-xl bg-primary px-4 py-2 text-[12px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function MusicPlayerBar() {
  const { djConfig, ttsConfig, setPairingRequestId } = useAppStore();
  const [playback, setPlayback] = useState<DJPlaybackState>(INITIAL_PLAYBACK_STATE);
  const [library, setLibrary] = useState<TrackLibrary>({ generated: [], uploaded: [] });
  const [volume, setVolume] = useState(djConfig.volume);
  const [muted, setMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showPanel, setShowPanel] = useState(false);
  const [dialogMode, setDialogMode] = useState<DialogMode | null>(null);
  const [pendingUploadStates, setPendingUploadStates] = useState<WorkState[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const prevStateRef = useRef<WorkState | null>(null);
  const lastPushedEventRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const updatePlayback = useCallback(
    (updates: Partial<DJPlaybackState>) =>
      setPlayback((prev) => ({ ...prev, ...updates })),
    []
  );

  const stopPlayback = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    setProgress(0);
    setDuration(0);
    updatePlayback({ isPlaying: false, currentTrack: null });
  }, [updatePlayback]);

  const loadLibrary = useCallback(async () => {
    try {
      const res = await fetch('/api/music/list');
      if (!res.ok) return;
      const data = (await res.json()) as TrackLibrary;
      setLibrary({
        generated: data.generated ?? [],
        uploaded: data.uploaded ?? [],
      });
    } catch {
      // ignore
    }
  }, []);

  const playTrack = useCallback((track: MusicTrack) => {
    audioRef.current?.pause();

    const url = track.url
      ? track.url
      : `/api/music/serve?source=${track.source}&file=${encodeURIComponent(track.fileName)}`;

    const audio = new Audio(url);
    audio.volume = muted ? 0 : volume;
    audioRef.current = audio;

    audio.ontimeupdate = () => {
      setProgress(audio.currentTime);
      setDuration(audio.duration || 0);
    };
    audio.onended = () => {
      updatePlayback({ isPlaying: false, currentTrack: null });
    };
    audio.onerror = () => updatePlayback({ isPlaying: false });

    audio.play().catch(() => updatePlayback({ isPlaying: false }));
    updatePlayback({ isPlaying: true, currentTrack: track, generateError: null });
  }, [muted, volume, updatePlayback]);

  const pickTrackForState = useCallback(
    (state: WorkState, currentTrackId?: string | null) => {
      const matches = (track: MusicTrack) => track.workStates.includes(state);
      const uploaded = library.uploaded.filter(matches);
      const generated = library.generated.filter(matches);
      const pool = uploaded.length > 0 ? uploaded : generated;
      if (pool.length === 0) return null;

      const withoutCurrent = currentTrackId
        ? pool.filter((track) => track.id !== currentTrackId)
        : pool;
      const choices = withoutCurrent.length > 0 ? withoutCurrent : pool;
      return choices[Math.floor(Math.random() * choices.length)];
    },
    [library]
  );

  const currentTrackMatchesState = useCallback((track: MusicTrack | null, state: WorkState) => {
    if (!track) return false;
    return track.workStates.includes(state);
  }, []);

  useEffect(() => {
    loadLibrary();
  }, [loadLibrary]);

  useEffect(() => {
    if (!djConfig.enabled) {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
      prevStateRef.current = null;
      updatePlayback({ connected: false, workState: null });
      clearEventWindow();
      stopPlayback();
      return;
    }

    const endpoint = djConfig.openclawEndpoint?.trim();
    if (!endpoint) {
      updatePlayback({ connected: false });
      return;
    }

    const params = new URLSearchParams({ endpoint });
    if (djConfig.openclawToken?.trim()) params.set('token', djConfig.openclawToken.trim());
    if (djConfig.openclawPassword?.trim()) params.set('password', djConfig.openclawPassword.trim());

    const es = new EventSource(`/api/openclaw/stream?${params}`);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as {
          type: string;
          payload?: unknown;
          timestamp?: number;
        };

        if (data.type === 'connected') {
          updatePlayback({ connected: true });
          setPairingRequestId(null);
          return;
        }
        if (data.type === 'disconnected' || data.type === 'error') {
          updatePlayback({ connected: false });
          return;
        }
        if (data.type === 'pairing_required') {
          updatePlayback({ connected: false });
          es.close();
          eventSourceRef.current = null;
          const requestId = (data as { requestId?: string }).requestId;
          if (requestId) setPairingRequestId(requestId);
          return;
        }

        if (data.type === 'sessions.update' && data.payload) {
          type SessionItem = {
            running?: boolean;
            status?: string;
            lastActivityMs?: number;
            updatedAt?: number;
          };

          const sessions = (data.payload as { sessions?: SessionItem[] }).sessions ?? [];
          const now = Date.now();
          const activeSessions = sessions.filter((session) => {
            if (session.running === true || session.status === 'running') return true;
            const ts = session.lastActivityMs ?? session.updatedAt ?? 0;
            return now - ts < 20_000;
          });

          if (activeSessions.length > 0) {
            lastPushedEventRef.current = 'message.sent';
            pushEvent({
              type: 'message.sent',
              timestamp: data.timestamp ?? now,
              payload: { sessionCount: activeSessions.length },
            });
          } else {
            const recentSessions = sessions.filter((session) => {
              const ts = session.lastActivityMs ?? session.updatedAt ?? 0;
              return now - ts < 90_000;
            });
            if (recentSessions.length > 0 && lastPushedEventRef.current !== 'conversation.ended') {
              lastPushedEventRef.current = 'conversation.ended';
              pushEvent({
                type: 'conversation.ended',
                timestamp: data.timestamp ?? now,
                payload: { sessionCount: recentSessions.length },
              });
            }
          }
        }
      } catch {
        // ignore malformed events
      }
    };

    es.onerror = () => updatePlayback({ connected: false });

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [
    djConfig.enabled,
    djConfig.openclawEndpoint,
    djConfig.openclawToken,
    djConfig.openclawPassword,
    setPairingRequestId,
    stopPlayback,
    updatePlayback,
  ]);

  useEffect(() => {
    if (!djConfig.enabled || !playback.connected) return;

    const analyze = () => {
      const stateInfo = analyzeWorkStateHardcoded();
      updatePlayback({ workState: stateInfo });
    };

    analyze();
    const interval = setInterval(analyze, 10_000);
    return () => clearInterval(interval);
  }, [djConfig.enabled, playback.connected, updatePlayback]);

  useEffect(() => {
    const state = playback.workState?.state;
    if (!state) return;

    const stateChanged = prevStateRef.current !== state;
    const hasMatchingTrack = currentTrackMatchesState(playback.currentTrack, state);
    if (!stateChanged && hasMatchingTrack) return;

    prevStateRef.current = state;
    const nextTrack = pickTrackForState(state, playback.currentTrack?.id);
    if (nextTrack) {
      playTrack(nextTrack);
    }
  }, [
    currentTrackMatchesState,
    pickTrackForState,
    playTrack,
    playback.currentTrack,
    playback.workState?.state,
  ]);

  const handleGenerateForState = useCallback(async (state: WorkState) => {
    if (playback.generating || !ttsConfig.apiKey) return;
    updatePlayback({ generating: true, generateError: null });

    try {
      const style = getMusicStyleForState(state);
      const res = await fetch('/api/music/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: ttsConfig.apiKey,
          prompt: style.prompt,
          isInstrumental: djConfig.isInstrumental,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      const saveRes = await fetch('/api/music/save-generated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioUrl: data.audioUrl,
          title: `${style.label} ${new Date().toLocaleTimeString()}`,
          workStates: [state],
        }),
      });
      const saved = await saveRes.json();
      if (!saveRes.ok) throw new Error(saved.error || '保存失败');

      const track: MusicTrack = {
        id: saved.id,
        title: saved.title,
        source: 'generated',
        fileName: saved.fileName,
        createdAt: Date.now(),
        workStates: saved.workStates ?? [state],
      };

      await loadLibrary();
      updatePlayback({ generating: false, generateError: null });
      playTrack(track);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      updatePlayback({ generating: false, generateError: message });
    }
  }, [djConfig.isInstrumental, loadLibrary, playback.generating, playTrack, ttsConfig.apiKey, updatePlayback]);

  const togglePlay = useCallback(() => {
    if (!audioRef.current) return;
    if (playback.isPlaying) {
      audioRef.current.pause();
      updatePlayback({ isPlaying: false });
    } else {
      audioRef.current.play().catch(() => undefined);
      updatePlayback({ isPlaying: true });
    }
  }, [playback.isPlaying, updatePlayback]);

  const handleVolumeChange = useCallback((value: number) => {
    setVolume(value);
    setMuted(value === 0);
    if (audioRef.current) audioRef.current.volume = value;
  }, []);

  const toggleMute = useCallback(() => {
    const next = !muted;
    setMuted(next);
    if (audioRef.current) audioRef.current.volume = next ? 0 : volume;
  }, [muted, volume]);

  const handleSeek = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(event.target.value);
    setProgress(value);
    if (audioRef.current) audioRef.current.currentTime = value;
  }, []);

  const handleDialogConfirm = useCallback((states: WorkState[]) => {
    if (dialogMode === 'generate') {
      setDialogMode(null);
      handleGenerateForState(states[0] ?? 'working');
      return;
    }

    setPendingUploadStates(states);
    setDialogMode(null);
    setTimeout(() => fileInputRef.current?.click(), 0);
  }, [dialogMode, handleGenerateForState]);

  const handleUploadClick = useCallback(() => {
    setDialogMode('upload');
  }, []);

  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const form = new FormData();
    form.append('file', file);
    form.append('source', 'uploaded');
    form.append('title', file.name.replace(/\.[^.]+$/, ''));
    form.append('workStates', JSON.stringify(pendingUploadStates.length > 0 ? pendingUploadStates : ['working']));

    try {
      const res = await fetch('/api/music/upload', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '上传失败');

      const track: MusicTrack = {
        id: data.id,
        title: data.title,
        source: 'uploaded',
        fileName: data.storedName || data.fileName,
        createdAt: Date.now(),
        workStates: data.workStates ?? pendingUploadStates,
      };

      await loadLibrary();
      playTrack(track);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      updatePlayback({ generateError: message });
    } finally {
      setPendingUploadStates([]);
      event.target.value = '';
    }
  }, [loadLibrary, pendingUploadStates, playTrack, updatePlayback]);

  const formatTime = (seconds: number) => {
    if (!seconds || !isFinite(seconds)) return '0:00';
    const minutes = Math.floor(seconds / 60);
    const rest = Math.floor(seconds % 60);
    return `${minutes}:${rest.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      eventSourceRef.current?.close();
    };
  }, []);

  if (!djConfig.enabled) return null;

  const currentState = playback.workState?.state ?? 'idle';

  return (
    <>
      <div className="flex h-[48px] shrink-0 items-center gap-3 border-t border-border/60 bg-background/95 px-4 backdrop-blur-sm">
        <div className="flex items-center gap-1.5" title={playback.connected ? 'OpenClaw 已连接' : 'OpenClaw 未连接'}>
          {playback.connected ? (
            <Wifi className="h-3.5 w-3.5 text-green-500" />
          ) : (
            <WifiOff className="h-3.5 w-3.5 text-muted-foreground/40" />
          )}
          {playback.workState && (
            <span className="text-[11px] text-muted-foreground">
              {playback.workState.label}
            </span>
          )}
        </div>

        <div className="mx-1 h-4 w-px bg-border/50" />

        <div className="flex min-w-0 flex-1 items-center gap-2">
          {playback.generating ? (
            <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>生成中…</span>
            </div>
          ) : playback.currentTrack ? (
            <>
              <Music className="h-3.5 w-3.5 shrink-0 text-primary/70" />
              <span className="truncate text-[12px] font-medium text-foreground/80">
                {playback.currentTrack.title}
              </span>
            </>
          ) : playback.generateError ? (
            <span className="truncate text-[11px] text-destructive/70" title={playback.generateError}>
              {playback.generateError}
            </span>
          ) : (
            <span className="text-[12px] text-muted-foreground/50">
              {playback.connected ? `暂无${WORK_STATE_LABELS[currentState]}音乐` : '未连接'}
            </span>
          )}
        </div>

        {playback.currentTrack && duration > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="w-8 text-right text-[10px] tabular-nums text-muted-foreground/60">
              {formatTime(progress)}
            </span>
            <input
              type="range"
              min={0}
              max={duration}
              step={0.1}
              value={progress}
              onChange={handleSeek}
              className="h-1 w-24 cursor-pointer accent-primary"
            />
            <span className="w-8 text-[10px] tabular-nums text-muted-foreground/60">
              {formatTime(duration)}
            </span>
          </div>
        )}

        <div className="flex items-center gap-1">
          <button
            onClick={togglePlay}
            disabled={!playback.currentTrack}
            className="flex h-7 w-7 items-center justify-center rounded-full text-foreground/70 transition-colors hover:bg-accent disabled:opacity-30"
          >
            {playback.isPlaying ? (
              <Pause className="h-3.5 w-3.5" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            onClick={() => setDialogMode('generate')}
            disabled={playback.generating || !ttsConfig.apiKey}
            title="生成音乐"
            className="flex h-7 w-7 items-center justify-center rounded-full text-foreground/70 transition-colors hover:bg-accent disabled:opacity-30"
          >
            <Sparkles className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="mx-0.5 h-4 w-px bg-border/50" />

        <div className="flex items-center gap-1">
          <button
            onClick={toggleMute}
            className="flex h-7 w-7 items-center justify-center rounded-full text-foreground/70 transition-colors hover:bg-accent"
          >
            {muted || volume === 0 ? (
              <VolumeX className="h-3.5 w-3.5" />
            ) : (
              <Volume2 className="h-3.5 w-3.5" />
            )}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={muted ? 0 : volume}
            onChange={(event) => handleVolumeChange(parseFloat(event.target.value))}
            className="h-1 w-16 cursor-pointer accent-primary"
          />
        </div>

        <button
          onClick={handleUploadClick}
          title="上传音乐"
          className="flex h-7 w-7 items-center justify-center rounded-full text-foreground/70 transition-colors hover:bg-accent"
        >
          <Upload className="h-3.5 w-3.5" />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".mp3,.m4a,.wav,.ogg,.flac,.aac"
          onChange={handleFileUpload}
          className="hidden"
        />

        {playback.connected && (
          <button
            onClick={() => {
              const api = (window as unknown as { electronAPI?: { openClawPanel?: () => void } }).electronAPI;
              if (api?.openClawPanel) {
                api.openClawPanel();
              } else {
                setShowPanel(true);
              }
            }}
            title="OpenClaw 管理"
            className="flex h-7 w-7 items-center justify-center rounded-full text-foreground/70 transition-colors hover:bg-accent"
          >
            <LayoutList className="h-3.5 w-3.5" />
          </button>
        )}

        {showPanel && <OpenClawPanel onClose={() => setShowPanel(false)} />}
      </div>

      {dialogMode && (
        <StateSelectionDialog
          mode={dialogMode}
          initialStates={[playback.workState?.state ?? 'working']}
          onClose={() => setDialogMode(null)}
          onConfirm={handleDialogConfirm}
        />
      )}
    </>
  );
}
