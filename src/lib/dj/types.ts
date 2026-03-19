export type OpenClawEventType =
  | 'conversation.started'
  | 'conversation.ended'
  | 'message.received'
  | 'message.sent'
  | 'intent.detected'
  | 'handoff.requested'
  | 'custom.triggered';

export interface OpenClawEvent {
  type: OpenClawEventType;
  timestamp: number;
  payload?: Record<string, unknown>;
}

export type WorkState =
  | 'working'
  | 'task_complete'
  | 'idle';

export interface WorkStateInfo {
  state: WorkState;
  label: string;
  since: number;
}

export interface MusicStyle {
  prompt: string;
  label: string;
}

export const WORK_STATE_LABELS: Record<WorkState, string> = {
  working: '工作中',
  task_complete: '任务完成',
  idle: '空闲',
};

export const WORK_STATE_MUSIC: Record<WorkState, MusicStyle> = {
  working: {
    prompt: 'Lo-fi, Ambient, Focus, Instrumental, Calm Beat, Productive',
    label: '专注工作',
  },
  task_complete: {
    prompt: 'Triumphant, Orchestral, Celebration, Uplifting, Cinematic',
    label: '完成庆祝',
  },
  idle: {
    prompt: 'Chill, Acoustic, Relaxing, Piano, Soft, Gentle',
    label: '轻柔休息',
  },
};

export type MusicSource = 'generated' | 'uploaded';

export interface MusicTrack {
  id: string;
  title: string;
  source: MusicSource;
  fileName: string;
  url?: string;
  duration?: number;
  workStates: WorkState[];
  createdAt: number;
}

export interface DJConfig {
  enabled: boolean;
  // Webhook 被动接收模式
  openclawWebhookSecret: string;
  // WebSocket 主动连接模式
  openclawEndpoint: string;
  openclawToken: string;
  openclawPassword: string;
  isInstrumental: boolean;
  volume: number;
}

export const DEFAULT_DJ_CONFIG: DJConfig = {
  enabled: false,
  openclawWebhookSecret: '',
  openclawEndpoint: '',
  openclawToken: '',
  openclawPassword: '',
  isInstrumental: true,
  volume: 0.7,
};

export interface DJPlaybackState {
  isPlaying: boolean;
  currentTrack: MusicTrack | null;
  workState: WorkStateInfo | null;
  connected: boolean;
  generating: boolean;
  generateError: string | null;
  queue: MusicTrack[];
}

export const INITIAL_PLAYBACK_STATE: DJPlaybackState = {
  isPlaying: false,
  currentTrack: null,
  workState: null,
  connected: false,
  generating: false,
  generateError: null,
  queue: [],
};
