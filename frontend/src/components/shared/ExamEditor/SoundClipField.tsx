/**
 * A sound clip on a question or section, for listening tests: upload one,
 * listen to it, name it, and choose how many times students may play it.
 */

import React, { useRef, useState } from 'react';
import { Loader2, Music, Trash2, Upload, X } from 'lucide-react';
import {
  MAX_PLAYS, SoundClip, UploadCancelled, describePlays, formatSeconds, uploadSoundClip,
} from '@/services/SoundClipService';

interface Props {
  value?: SoundClip | null;
  onChange: (clip: SoundClip | undefined) => void;
  /** What the clip is for, e.g. "this question" or "Section A". */
  forWhat?: string;
}

const button = 'inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700';

const SoundClipField: React.FC<Props> = ({ value, onChange, forWhat = 'this question' }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [uploadingName, setUploadingName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const clip = value?.url ? value : null;

  const upload = async (file: File) => {
    setError(null);
    setUploadingName(file.name);
    setProgress(0);
    abortRef.current = new AbortController();
    try {
      const uploaded = await uploadSoundClip(file, setProgress, abortRef.current.signal);
      // Replacing a clip keeps the teacher's title and play limit.
      onChange(clip ? { ...uploaded, title: clip.title || uploaded.title, plays: clip.plays } : uploaded);
    } catch (e) {
      if (!(e instanceof UploadCancelled)) setError(e instanceof Error ? e.message : 'The upload failed.');
    } finally {
      setProgress(null);
      abortRef.current = null;
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const picker = (
    <input ref={fileRef} type="file" accept="audio/*,.mp3,.m4a,.wav,.ogg,.webm" className="hidden"
      onChange={(e) => { const file = e.target.files?.[0]; if (file) void upload(file); }} />
  );

  if (progress !== null) {
    return (
      <div className="rounded-lg border border-slate-200 p-2.5 text-xs dark:border-slate-700">
        <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span className="min-w-0 flex-1 truncate">Uploading {uploadingName}… {Math.round(progress * 100)}%</span>
          <button type="button" className={button} onClick={() => abortRef.current?.abort()}><X className="h-3.5 w-3.5" /> Cancel</button>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
          <div className="h-full bg-indigo-600 transition-[width]" style={{ width: `${progress * 100}%` }} />
        </div>
      </div>
    );
  }

  if (!clip) {
    return (
      <div className="text-xs">
        {picker}
        <button type="button" className={button} onClick={() => fileRef.current?.click()}>
          <Music className="h-3.5 w-3.5" /> Add a sound clip to {forWhat}
        </button>
        <span className="ml-2 text-slate-500 dark:text-slate-400">For listening tests. MP3, M4A, WAV or OGG, up to 20 MB.</span>
        {error && <p className="mt-1 text-rose-700 dark:text-rose-300">{error}</p>}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-2.5 text-xs dark:border-indigo-800 dark:bg-indigo-900/20">
      {picker}
      <div className="flex flex-wrap items-center gap-2">
        <Music className="h-4 w-4 text-indigo-600 dark:text-indigo-300" aria-hidden="true" />
        <input
          value={clip.title}
          onChange={(e) => onChange({ ...clip, title: e.target.value })}
          maxLength={200}
          placeholder="Name, e.g. Passage 1"
          aria-label={`Name of the sound clip for ${forWhat}`}
          className="min-w-[10rem] flex-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-800 dark:text-white"
        />
        {clip.duration ? <span className="text-slate-500 dark:text-slate-400">{formatSeconds(clip.duration)}</span> : null}
        <label className="flex items-center gap-1 text-slate-700 dark:text-slate-200">
          Students may play it
          <select
            value={clip.plays}
            onChange={(e) => onChange({ ...clip, plays: Number(e.target.value) })}
            className="rounded-md border border-slate-300 bg-white px-1.5 py-1 text-xs dark:border-slate-600 dark:bg-slate-800 dark:text-white"
          >
            {Array.from({ length: MAX_PLAYS + 1 }, (_, n) => n).map((n) => (
              <option key={n} value={n}>{describePlays(n)}</option>
            ))}
          </select>
        </label>
        <button type="button" className={button} onClick={() => fileRef.current?.click()}><Upload className="h-3.5 w-3.5" /> Replace</button>
        <button type="button" className={button} onClick={() => onChange(undefined)}><Trash2 className="h-3.5 w-3.5" /> Remove</button>
      </div>
      <audio controls preload="none" src={clip.url} className="mt-2 h-8 w-full">
        Your browser can't play this clip.
      </audio>
      {error && <p className="mt-1 text-rose-700 dark:text-rose-300">{error}</p>}
    </div>
  );
};

export default SoundClipField;
