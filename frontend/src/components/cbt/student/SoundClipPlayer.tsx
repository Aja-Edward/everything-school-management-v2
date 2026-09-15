import React from 'react';
import { AlertTriangle, Pause, Play, RotateCcw, Volume2 } from 'lucide-react';
import { SoundClip, formatSeconds } from '@/services/SoundClipService';
import type { SoundClips } from './useSoundClips';

interface Props {
  clipKey: string;
  clip: SoundClip;
  clips: SoundClips;
  /** What the clip is, e.g. "Listen to this question" or the section's title. */
  heading: string;
  disabled?: boolean;
}

/**
 * A sound clip on the student's screen: play, pause and how far it has got.
 * There is no way to skip within a clip; it plays from the start each time.
 */
const SoundClipPlayer: React.FC<Props> = ({ clipKey, clip, clips, heading, disabled }) => {
  const state = clips.states[clipKey];
  if (!state) return null;
  const left = clips.playsLeft(clipKey);
  const used = clips.plays[clipKey] ?? 0;
  const playing = state.status === 'playing';
  const paused = state.status === 'paused';
  const outOfPlays = !playing && !paused && left === 0;
  const duration = state.duration ?? clip.duration ?? null;
  const share = duration ? Math.min(1, state.position / duration) : 0;

  const playsText = !clip.plays
    ? 'You can play it as often as you like.'
    : outOfPlays
      ? `You have used all ${clip.plays} play${clip.plays === 1 ? '' : 's'}.`
      : `${left} of ${clip.plays} play${clip.plays === 1 ? '' : 's'} left. Pausing doesn't use one.`;

  const label = playing ? 'Pause' : paused ? 'Carry on' : used ? 'Play again' : 'Play';

  return (
    <div className="mb-4 rounded-xl border-2 border-indigo-200 bg-indigo-50/60 p-3 dark:border-indigo-800 dark:bg-indigo-900/20"
      role="region" aria-label={`Sound clip: ${clip.title || heading}`}>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => (playing ? clips.pause(clipKey) : clips.play(clipKey))}
          disabled={disabled || outOfPlays}
          aria-label={`${label}: ${clip.title || heading}`}
          className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {playing ? <Pause className="h-5 w-5" /> : used && !paused ? <RotateCcw className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
        </button>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[0.85em] font-semibold text-indigo-900 dark:text-indigo-100">
            <Volume2 className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
            <span className="truncate">{heading}{clip.title ? `: ${clip.title}` : ''}</span>
          </p>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-indigo-200 dark:bg-indigo-950" aria-hidden="true">
            <div className="h-full rounded-full bg-indigo-600 dark:bg-indigo-400" style={{ width: `${share * 100}%` }} />
          </div>
          <p className="mt-1 flex flex-wrap justify-between gap-x-3 text-[0.75em] text-slate-600 dark:text-slate-300">
            <span aria-live="polite">{playsText}</span>
            {duration ? <span className="tabular-nums">{formatSeconds(state.position)} / {formatSeconds(duration)}</span> : null}
          </p>
        </div>
      </div>
      {state.status === 'error' && (
        <p className="mt-2 flex items-center gap-1.5 text-[0.8em] font-medium text-rose-700 dark:text-rose-300" role="alert">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" /> This clip wouldn't play. Tell the invigilator.
        </p>
      )}
    </div>
  );
};

export default SoundClipPlayer;
