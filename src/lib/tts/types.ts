export interface ClonedVoice {
  voiceId: string;
  masterId: string;
  masterName: string;
  fileName: string;
  createdAt: number;
}

export interface TTSConfig {
  apiKey: string;
  model: string;
  enabled: boolean;
  autoPlay: boolean;
  speed: number;
  masterVoices: Record<string, string>;
  clonedVoices: ClonedVoice[];
}

export const TTS_MODELS = [
  { id: 'speech-2.8-hd', label: 'Speech 2.8 HD (最佳音质)' },
  { id: 'speech-2.8-turbo', label: 'Speech 2.8 Turbo (更快)' },
  { id: 'speech-2.6-hd', label: 'Speech 2.6 HD (低延迟)' },
  { id: 'speech-2.6-turbo', label: 'Speech 2.6 Turbo (极速)' },
] as const;

export const VOICE_OPTIONS = [
  { id: 'Chinese (Mandarin)_Reliable_Executive', label: '沉稳高管', lang: '中文' },
  { id: 'male-qn-jingying', label: '精英青年', lang: '中文' },
  { id: 'Chinese (Mandarin)_Gentleman', label: '温润男声', lang: '中文' },
  { id: 'male-qn-qingse', label: '青涩青年', lang: '中文' },
  { id: 'male-qn-badao', label: '霸道青年', lang: '中文' },
  { id: 'male-qn-daxuesheng', label: '大学生', lang: '中文' },
  { id: 'Chinese (Mandarin)_Radio_Host', label: '电台男主播', lang: '中文' },
  { id: 'Chinese (Mandarin)_Lyrical_Voice', label: '抒情男声', lang: '中文' },
  { id: 'Chinese (Mandarin)_Sincere_Adult', label: '真诚青年', lang: '中文' },
  { id: 'Chinese (Mandarin)_Male_Announcer', label: '播报男声', lang: '中文' },
  { id: 'female-yujie', label: '御姐', lang: '中文' },
  { id: 'female-chengshu', label: '成熟女性', lang: '中文' },
  { id: 'female-tianmei', label: '甜美女性', lang: '中文' },
  { id: 'Chinese (Mandarin)_News_Anchor', label: '新闻女声', lang: '中文' },
  { id: 'Chinese (Mandarin)_Warm_Bestie', label: '温暖闺蜜', lang: '中文' },
  { id: 'English_Trustworthy_Man', label: 'Trustworthy Man', lang: 'EN' },
  { id: 'English_Graceful_Lady', label: 'Graceful Lady', lang: 'EN' },
  { id: 'English_Diligent_Man', label: 'Diligent Man', lang: 'EN' },
  { id: 'Italian_Narrator', label: 'Italian Narrator', lang: 'IT' },
] as const;

export const MASTER_DEFAULT_VOICES: Record<string, string> = {
  'product-mentor': 'Chinese (Mandarin)_Reliable_Executive',
  'science-mentor': 'male-qn-jingying',
  'creative-mentor': 'Chinese (Mandarin)_Gentleman',
};

export const DEFAULT_TTS_CONFIG: TTSConfig = {
  apiKey: '',
  model: 'speech-2.8-hd',
  enabled: true,
  autoPlay: false,
  speed: 1,
  masterVoices: { ...MASTER_DEFAULT_VOICES },
  clonedVoices: [],
};
