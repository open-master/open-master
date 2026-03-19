import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Master } from '@/lib/master/types';
import type { ProviderType } from '@/lib/ai/provider';
import { SYSTEM_MASTERS } from '@/lib/master/registry';
import {
  type EmbeddingConfig,
  DEFAULT_EMBEDDING_CONFIG,
} from '@/lib/memory/types';
import { type TTSConfig, DEFAULT_TTS_CONFIG } from '@/lib/tts/types';
import { type DJConfig, DEFAULT_DJ_CONFIG } from '@/lib/dj/types';

type View = 'chat' | 'settings';

export interface ProviderConfig {
  anthropicApiKey: string;
  openaiApiKey: string;
  openrouterApiKey: string;
  deepseekApiKey: string;
  kimiApiKey: string;
  selectedProvider: ProviderType;
  selectedModel: string;
}

interface AppState {
  currentView: View;
  setCurrentView: (view: View) => void;

  activeMasterIds: string[];
  customMasters: Master[];
  selectedMasterId: string | null;

  addMasterById: (id: string) => void;
  removeMaster: (id: string) => void;
  selectMaster: (id: string) => void;
  addCustomMaster: (master: Master) => void;
  updateCustomMaster: (id: string, updates: Partial<Master>) => void;
  deleteCustomMaster: (id: string) => void;

  masterChatKeys: Record<string, number>;
  newChatForMaster: (masterId: string) => void;

  providerConfig: ProviderConfig;
  setProviderConfig: (config: Partial<ProviderConfig>) => void;

  embeddingConfig: EmbeddingConfig;
  setEmbeddingConfig: (config: Partial<EmbeddingConfig>) => void;

  ttsConfig: TTSConfig;
  setTtsConfig: (config: Partial<TTSConfig>) => void;

  djConfig: DJConfig;
  setDjConfig: (config: Partial<DJConfig>) => void;

  pairingRequestId: string | null;
  setPairingRequestId: (id: string | null) => void;

  sidebarCollapsed: boolean;
  toggleSidebar: () => void;

  showAddMasterModal: boolean;
  setShowAddMasterModal: (show: boolean) => void;
}

const DEFAULT_PROVIDER_CONFIG: ProviderConfig = {
  anthropicApiKey: '',
  openaiApiKey: '',
  openrouterApiKey: '',
  deepseekApiKey: '',
  kimiApiKey: '',
  selectedProvider: 'openrouter',
  selectedModel: 'anthropic/claude-sonnet-4-20250514',
};

const DEFAULT_ACTIVE_MASTERS = SYSTEM_MASTERS.map((m) => m.id);

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      currentView: 'chat',
      setCurrentView: (view) => set({ currentView: view }),

      activeMasterIds: [...DEFAULT_ACTIVE_MASTERS],
      customMasters: [],
      selectedMasterId: DEFAULT_ACTIVE_MASTERS[0],

      addMasterById: (id) =>
        set((state) => {
          if (state.activeMasterIds.includes(id)) return state;
          return { activeMasterIds: [...state.activeMasterIds, id] };
        }),

      removeMaster: (id) =>
        set((state) => {
          const newIds = state.activeMasterIds.filter((mid) => mid !== id);
          const newSelected =
            state.selectedMasterId === id
              ? newIds[0] ?? null
              : state.selectedMasterId;
          return {
            activeMasterIds: newIds,
            selectedMasterId: newSelected,
          };
        }),

      selectMaster: (id) =>
        set({ selectedMasterId: id, currentView: 'chat' }),

      addCustomMaster: (master) =>
        set((state) => ({
          customMasters: [...state.customMasters, master],
          activeMasterIds: [...state.activeMasterIds, master.id],
          selectedMasterId: master.id,
          currentView: 'chat',
        })),

      updateCustomMaster: (id, updates) =>
        set((state) => ({
          customMasters: state.customMasters.map((m) =>
            m.id === id ? { ...m, ...updates } : m
          ),
        })),

      deleteCustomMaster: (id) =>
        set((state) => {
          const newCustom = state.customMasters.filter((m) => m.id !== id);
          const newIds = state.activeMasterIds.filter((mid) => mid !== id);
          const newSelected =
            state.selectedMasterId === id
              ? newIds[0] ?? null
              : state.selectedMasterId;
          return {
            customMasters: newCustom,
            activeMasterIds: newIds,
            selectedMasterId: newSelected,
          };
        }),

      masterChatKeys: {},
      newChatForMaster: (masterId) =>
        set((state) => ({
          masterChatKeys: {
            ...state.masterChatKeys,
            [masterId]: (state.masterChatKeys[masterId] ?? 0) + 1,
          },
        })),

      providerConfig: { ...DEFAULT_PROVIDER_CONFIG },
      setProviderConfig: (config) =>
        set((state) => ({
          providerConfig: { ...state.providerConfig, ...config },
        })),

      embeddingConfig: { ...DEFAULT_EMBEDDING_CONFIG },
      setEmbeddingConfig: (config) =>
        set((state) => ({
          embeddingConfig: { ...state.embeddingConfig, ...config },
        })),

      ttsConfig: { ...DEFAULT_TTS_CONFIG },
      setTtsConfig: (config) =>
        set((state) => ({
          ttsConfig: { ...state.ttsConfig, ...config },
        })),

      djConfig: { ...DEFAULT_DJ_CONFIG },
      setDjConfig: (config) =>
        set((state) => ({
          djConfig: { ...state.djConfig, ...config },
        })),

      pairingRequestId: null,
      setPairingRequestId: (id) => set({ pairingRequestId: id }),

      sidebarCollapsed: false,
      toggleSidebar: () =>
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

      showAddMasterModal: false,
      setShowAddMasterModal: (show) => set({ showAddMasterModal: show }),
    }),
    {
      name: 'open-master-storage',
      partialize: (state) => ({
        providerConfig: state.providerConfig,
        embeddingConfig: state.embeddingConfig,
        ttsConfig: state.ttsConfig,
        djConfig: state.djConfig,
        selectedMasterId: state.selectedMasterId,
        sidebarCollapsed: state.sidebarCollapsed,
        activeMasterIds: state.activeMasterIds,
        customMasters: state.customMasters,
        masterChatKeys: state.masterChatKeys,
      }),
      merge: (persisted, current) => {
        const p = persisted as Partial<AppState>;
        return {
          ...current,
          ...p,
          providerConfig: {
            ...DEFAULT_PROVIDER_CONFIG,
            ...(p.providerConfig ?? {}),
          },
          embeddingConfig: {
            ...DEFAULT_EMBEDDING_CONFIG,
            ...(p.embeddingConfig ?? {}),
          },
          ttsConfig: {
            ...DEFAULT_TTS_CONFIG,
            ...(p.ttsConfig ?? {}),
            masterVoices: {
              ...DEFAULT_TTS_CONFIG.masterVoices,
              ...((p.ttsConfig as TTSConfig | undefined)?.masterVoices ?? {}),
            },
            clonedVoices: (p.ttsConfig as TTSConfig | undefined)?.clonedVoices ?? [],
          },
          djConfig: {
            ...DEFAULT_DJ_CONFIG,
            ...((p.djConfig as DJConfig | undefined) ?? {}),
          },
          activeMasterIds:
            p.activeMasterIds && p.activeMasterIds.length > 0
              ? p.activeMasterIds
              : [...DEFAULT_ACTIVE_MASTERS],
          customMasters: p.customMasters ?? [],
          masterChatKeys: p.masterChatKeys ?? {},
        };
      },
    }
  )
);
