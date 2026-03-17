'use client';

import { useState, useRef, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import { MASTER_DEFAULT_VOICES } from './types';

export function useTTS(masterId: string) {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
    setPlayingId(null);
    setLoading(false);
  }, []);

  const play = useCallback(
    async (messageId: string, text: string) => {
      if (playingId === messageId) {
        stop();
        return;
      }

      stop();

      const { ttsConfig } = useAppStore.getState();
      if (!ttsConfig.apiKey || !text.trim()) return;

      const voiceId =
        ttsConfig.masterVoices[masterId] ||
        MASTER_DEFAULT_VOICES[masterId] ||
        'male-qn-jingying';

      setLoading(true);
      setPlayingId(messageId);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text,
            apiKey: ttsConfig.apiKey,
            model: ttsConfig.model,
            voiceId,
            speed: ttsConfig.speed,
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const errBody = await res.text().catch(() => '');
          console.error('[TTS] API error:', res.status, errBody);
          stop();
          return;
        }

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);

        const audio = new Audio(url);
        audioRef.current = audio;
        setLoading(false);

        audio.onended = () => {
          URL.revokeObjectURL(url);
          setPlayingId(null);
          audioRef.current = null;
        };

        audio.onerror = () => {
          URL.revokeObjectURL(url);
          stop();
        };

        await audio.play();
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.error('[TTS] playback error:', err);
        }
        stop();
      }
    },
    [playingId, masterId, stop]
  );

  return { play, stop, playingId, loading };
}
