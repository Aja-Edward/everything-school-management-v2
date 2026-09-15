/**
 * Sound clips for listening questions.
 *
 * The file goes from the teacher's browser straight to Cloudinary, with an
 * upload signed by our server for the school's audio folder (see backend
 * exam/audio_views.py). It never passes through our server, so a large clip
 * isn't stopped by the proxy's upload limit.
 *
 * A clip is stored on a question or section as `audio` (see backend
 * cbt/snapshot.py): plays is how many times a student may play it, 0 for as
 * often as they like.
 */

import api from './api';

export interface SoundClip {
  url: string;
  title: string;
  plays: number;
  /** Seconds, as the upload reported it. */
  duration?: number | null;
}

export const MAX_PLAYS = 10;

interface Signature {
  upload_url: string;
  fields: Record<string, string | number>;
  max_mb: number;
  formats: string[];
}

export class UploadCancelled extends Error {}

const extension = (name: string) => name.split('.').pop()?.toLowerCase() ?? '';

/** A file name as a clip title: "passage_1-final.mp3" becomes "passage 1 final". */
const titleFrom = (name: string) => name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();

/**
 * Upload `file` and return it as a clip. `onProgress` gets the share uploaded,
 * 0 to 1. Abort with `signal`, which rejects with UploadCancelled.
 */
export async function uploadSoundClip(
  file: File, onProgress?: (share: number) => void, signal?: AbortSignal,
): Promise<SoundClip> {
  let signature: Signature;
  try {
    signature = await api.post('/api/exams/audio/upload-signature/', {});
  } catch {
    throw new Error("The upload couldn't start. Check the internet connection and try again; if it keeps happening, the school's file storage may not be set up.");
  }
  if (!signature.formats.includes(extension(file.name))) {
    throw new Error(`Choose a sound file: ${signature.formats.map((f) => f.toUpperCase()).join(', ')}.`);
  }
  if (file.size > signature.max_mb * 1024 * 1024) {
    throw new Error(`That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. Sound clips can be up to ${signature.max_mb} MB.`);
  }

  const body = new FormData();
  Object.entries(signature.fields).forEach(([key, value]) => body.append(key, String(value)));
  body.append('file', file);

  const result = await new Promise<any>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', signature.upload_url);
    request.upload.onprogress = (event) => { if (event.lengthComputable) onProgress?.(event.loaded / event.total); };
    request.onload = () => {
      let data: any = null;
      try { data = JSON.parse(request.responseText); } catch { /* not JSON */ }
      if (request.status >= 200 && request.status < 300 && data?.secure_url) resolve(data);
      else reject(new Error(data?.error?.message ? `The upload was refused: ${data.error.message}` : 'The upload failed. Please try again.'));
    };
    request.onerror = () => reject(new Error('The upload failed: check the internet connection and try again.'));
    request.onabort = () => reject(new UploadCancelled('Upload cancelled.'));
    signal?.addEventListener('abort', () => request.abort());
    request.send(body);
  });

  return {
    url: result.secure_url,
    title: titleFrom(file.name),
    plays: 2,
    duration: typeof result.duration === 'number' ? Math.round(result.duration * 10) / 10 : null,
  };
}

/** "1:05" for 65 seconds. */
export const formatSeconds = (seconds: number | null | undefined) => {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return '';
  const whole = Math.max(0, Math.round(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};

export const describePlays = (plays: number) =>
  !plays ? 'as often as they like' : plays === 1 ? 'once' : plays === 2 ? 'twice' : `${plays} times`;
