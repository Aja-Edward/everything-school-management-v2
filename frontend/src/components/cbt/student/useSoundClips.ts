import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SoundClip } from '@/services/SoundClipService';

/**
 * The sound clips on a student's paper, played through one audio element per
 * clip that lives as long as the exam screen. A section's clip keeps playing
 * while the student moves between that section's questions.
 *
 * Every clip is downloaded when the exam opens, so a clip still plays if the
 * connection drops later. A clip that can't be downloaded is streamed instead
 * when it is played.
 *
 * Plays are limited here, on the exam page, which works offline. A play counts
 * once sound actually starts, so a clip that fails to play costs nothing.
 * Counts are kept on this computer at once and reported to the server with
 * the next check-in (`plays`); the server keeps the highest count, so a reload
 * or another device carries on from it. Only one clip plays at a time.
 */

export type ClipStatus = 'idle' | 'playing' | 'paused' | 'ended' | 'error';

export interface ClipState {
  status: ClipStatus;
  /** Seconds into the clip. */
  position: number;
  duration: number | null;
  /** The clip has been downloaded to this computer. */
  ready: boolean;
}

interface Options {
  attemptId: number;
  /** Clips by key: "question:<id>" or "section:<key>". */
  clips: Record<string, SoundClip>;
  serverPlays: Record<string, number>;
  /** A clip started (with its play number) or failed, for the invigilators' record. */
  onReport: (kind: 'audio_played' | 'audio_failed', detail: Record<string, unknown>) => void;
  /** A play was counted: check in soon. */
  onPlayCounted: () => void;
}

const storageKey = (attemptId: number) => `cbt:audio:${attemptId}`;

const readStored = (attemptId: number): Record<string, number> => {
  try {
    const raw = localStorage.getItem(storageKey(attemptId));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

export const forgetStoredPlays = (attemptId: number) => {
  try { localStorage.removeItem(storageKey(attemptId)); } catch { /* ignore */ }
};

const higher = (a: Record<string, number>, b: Record<string, number>) => {
  const out = { ...a };
  Object.entries(b).forEach(([key, n]) => { if (typeof n === 'number' && n > (out[key] ?? 0)) out[key] = n; });
  return out;
};

const idle = (clip: SoundClip): ClipState => ({ status: 'idle', position: 0, duration: clip.duration ?? null, ready: false });

export const useSoundClips = ({ attemptId, clips, serverPlays, onReport, onPlayCounted }: Options) => {
  const keys = useMemo(() => Object.keys(clips).sort().join('|'), [clips]);
  const [plays, setPlays] = useState<Record<string, number>>(() => higher(readStored(attemptId), serverPlays));
  const [states, setStates] = useState<Record<string, ClipState>>(
    () => Object.fromEntries(Object.entries(clips).map(([key, clip]) => [key, idle(clip)])));

  const playsRef = useRef(plays);
  const audioRef = useRef<Record<string, HTMLAudioElement>>({});
  const startingRef = useRef<Set<string>>(new Set());
  const blobUrlsRef = useRef<Record<string, string>>({});
  const callbacks = useRef({ onReport, onPlayCounted });
  callbacks.current = { onReport, onPlayCounted };

  const patch = useCallback((key: string, change: Partial<ClipState>) => {
    setStates((current) => (current[key] ? { ...current, [key]: { ...current[key], ...change } } : current));
  }, []);

  // The server may know of plays from another device.
  useEffect(() => {
    const merged = higher(playsRef.current, serverPlays);
    if (JSON.stringify(merged) !== JSON.stringify(playsRef.current)) {
      playsRef.current = merged;
      setPlays(merged);
    }
  }, [serverPlays]);

  // One element per clip, and a download of each clip to play from.
  useEffect(() => {
    let cancelled = false;
    const elements: Record<string, HTMLAudioElement> = {};
    Object.entries(clips).forEach(([key, clip]) => {
      const audio = new Audio();
      audio.preload = 'auto';
      audio.src = clip.url;
      audio.addEventListener('playing', () => {
        patch(key, { status: 'playing' });
        if (startingRef.current.delete(key)) {
          const next = { ...playsRef.current, [key]: (playsRef.current[key] ?? 0) + 1 };
          playsRef.current = next;
          setPlays(next);
          try { localStorage.setItem(storageKey(attemptId), JSON.stringify(next)); } catch { /* the server still hears */ }
          callbacks.current.onReport('audio_played', { clip: key, play: next[key] });
          callbacks.current.onPlayCounted();
        }
      });
      audio.addEventListener('pause', () => { if (!audio.ended) patch(key, { status: 'paused' }); });
      audio.addEventListener('ended', () => patch(key, { status: 'ended', position: 0 }));
      audio.addEventListener('timeupdate', () => patch(key, { position: audio.currentTime }));
      audio.addEventListener('loadedmetadata', () => {
        if (Number.isFinite(audio.duration)) patch(key, { duration: audio.duration });
      });
      audio.addEventListener('error', () => {
        if (!startingRef.current.has(key) && audio.paused) return;
        startingRef.current.delete(key);
        patch(key, { status: 'error' });
        callbacks.current.onReport('audio_failed', { clip: key, error: audio.error?.code ?? 'unknown' });
      });
      elements[key] = audio;
    });
    audioRef.current = elements;

    // Download each clip in turn, so a lab full of students doesn't pull every clip at once.
    (async () => {
      for (const [key, clip] of Object.entries(clips)) {
        if (cancelled) return;
        try {
          const response = await fetch(clip.url, { mode: 'cors', credentials: 'omit' });
          if (!response.ok) throw new Error(String(response.status));
          const type = response.headers.get('content-type') ?? '';
          // A web page where the clip should be (a login screen, an error page) isn't a clip.
          if (type && !/^(audio|video)\/|octet-stream/.test(type)) throw new Error(type);
          const url = URL.createObjectURL(await response.blob());
          if (cancelled) { URL.revokeObjectURL(url); return; }
          blobUrlsRef.current[key] = url;
          const audio = elements[key];
          // Don't pull the source from under a clip that's already playing.
          if (audio.paused && !startingRef.current.has(key)) {
            const at = audio.currentTime;
            audio.src = url;
            if (at) audio.currentTime = at;
          }
          patch(key, { ready: true });
        } catch {
          // Played from its link instead, which needs the connection.
        }
      }
    })();

    return () => {
      cancelled = true;
      Object.values(elements).forEach((audio) => { audio.pause(); audio.removeAttribute('src'); audio.load(); });
      Object.values(blobUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
      blobUrlsRef.current = {};
    };
    // Rebuilt only when the set of clips changes, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys, attemptId, patch]);

  const playsLeft = useCallback((key: string) => {
    const limit = clips[key]?.plays ?? 0;
    return limit ? Math.max(0, limit - (plays[key] ?? 0)) : Infinity;
  }, [clips, plays]);

  const play = useCallback((key: string) => {
    const audio = audioRef.current[key];
    if (!audio) return;
    Object.entries(audioRef.current).forEach(([other, element]) => { if (other !== key && !element.paused) element.pause(); });

    const resuming = audio.paused && audio.currentTime > 0 && !audio.ended;
    if (!resuming) {
      const limit = clips[key]?.plays ?? 0;
      if (limit && (playsRef.current[key] ?? 0) >= limit) return;
      audio.currentTime = 0;
      startingRef.current.add(key);
    }
    audio.play().catch((error: Error) => {
      if (error?.name === 'AbortError') return;
      startingRef.current.delete(key);
      patch(key, { status: 'error' });
      callbacks.current.onReport('audio_failed', { clip: key, error: error?.name ?? 'unknown' });
    });
  }, [clips, patch]);

  const pause = useCallback((key: string) => { audioRef.current[key]?.pause(); }, []);

  const stopAll = useCallback(() => {
    Object.values(audioRef.current).forEach((audio) => audio.pause());
  }, []);

  return { states, plays, playsLeft, play, pause, stopAll };
};

export type SoundClips = ReturnType<typeof useSoundClips>;
