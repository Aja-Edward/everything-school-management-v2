import { useCallback, useEffect, useRef, useState } from 'react';
import StudentCBTService, { CBTAnswer, CBTRequestError } from '@/services/StudentCBTService';

/**
 * A student's answers, saved to the server as they go and kept on the
 * computer until the server has them.
 *
 * Every change is written to localStorage first. A reload, a crash or a
 * dropped connection loses nothing, and whatever hadn't reached the server is
 * sent again once it can be. Changes are sent in batches: shortly after a
 * click, a few seconds after typing stops, and every few seconds while
 * anything is waiting. Each question carries a version number, so an answer
 * changed while its save was on the way stays queued rather than being marked
 * saved.
 */

export type SaveStatus = 'saved' | 'saving' | 'waiting' | 'offline';

interface Stored {
  answers: Record<number, CBTAnswer>;
  pending: number[];
}

interface Options {
  attemptId: number;
  serverAnswers: CBTAnswer[];
  /** The attempt has ended on the server (submitted, or time ran out). */
  onEnded: () => void;
  /** The exam was opened on another device. */
  onReplaced: () => void;
  /** The server refused an answer; the message is fit to show the student. */
  onRefused: (message: string) => void;
}

const storageKey = (attemptId: number) => `cbt:answers:${attemptId}`;

const load = (attemptId: number): Stored | null => {
  try {
    const raw = localStorage.getItem(storageKey(attemptId));
    return raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    return null;
  }
};

export const forgetStoredAnswers = (attemptId: number) => {
  try { localStorage.removeItem(storageKey(attemptId)); } catch { /* ignore */ }
};

const blank = (questionId: number): CBTAnswer => ({ question_id: questionId, selected_option: '', text_answer: '', flagged: false });

export const useAnswerQueue = ({ attemptId, serverAnswers, onEnded, onReplaced, onRefused }: Options) => {
  // Answers not yet saved on this computer win over what the server last had.
  const initial = useRef<Stored>((() => {
    const answers: Record<number, CBTAnswer> = {};
    serverAnswers.forEach((a) => { answers[a.question_id] = a; });
    const stored = load(attemptId);
    stored?.pending.forEach((id) => { if (stored.answers[id]) answers[id] = stored.answers[id]; });
    return { answers, pending: stored?.pending ?? [] };
  })());

  const answersRef = useRef<Record<number, CBTAnswer>>(initial.current.answers);
  const pendingRef = useRef<Map<number, number>>(new Map(initial.current.pending.map((id) => [id, 1])));
  const versionRef = useRef(1);
  const inFlightRef = useRef<Promise<boolean> | null>(null);
  const timerRef = useRef<number | null>(null);
  const backoffRef = useRef(3000);
  const endedRef = useRef(false);
  const callbacks = useRef({ onEnded, onReplaced, onRefused });
  callbacks.current = { onEnded, onReplaced, onRefused };

  const [answers, setAnswers] = useState(answersRef.current);
  const [status, setStatus] = useState<SaveStatus>(pendingRef.current.size ? 'waiting' : 'saved');
  const [pendingCount, setPendingCount] = useState(pendingRef.current.size);

  const persist = useCallback(() => {
    try {
      localStorage.setItem(storageKey(attemptId), JSON.stringify({
        answers: answersRef.current, pending: [...pendingRef.current.keys()],
      }));
    } catch { /* storage full or blocked: the in-memory queue still works */ }
    setPendingCount(pendingRef.current.size);
  }, [attemptId]);

  const schedule = useCallback((delay: number) => {
    if (endedRef.current) return;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => { void flushRef.current(); }, delay);
  }, []);

  const flush = useCallback((): Promise<boolean> => {
    if (endedRef.current) return Promise.resolve(false);
    if (!pendingRef.current.size) {
      setStatus('saved');
      return inFlightRef.current ?? Promise.resolve(true);
    }
    if (inFlightRef.current) {
      // Save again once the request already on its way is back.
      return inFlightRef.current.then(() => flushRef.current());
    }

    const sending = [...pendingRef.current.entries()];
    const batch = sending.map(([id]) => answersRef.current[id] ?? blank(id));
    setStatus('saving');

    const work = StudentCBTService.saveAnswers(attemptId, batch)
      .then(() => {
        sending.forEach(([id, version]) => {
          if (pendingRef.current.get(id) === version) pendingRef.current.delete(id);
        });
        backoffRef.current = 3000;
        persist();
        setStatus(pendingRef.current.size ? 'waiting' : 'saved');
        if (pendingRef.current.size) schedule(500);
        return true;
      })
      .catch((error: CBTRequestError) => {
        if (error.code === 'ended') {
          endedRef.current = true;
          callbacks.current.onEnded();
          return false;
        }
        if (error.code === 'session_replaced') {
          endedRef.current = true;
          callbacks.current.onReplaced();
          return false;
        }
        if (error.isNetwork || error.status === 429 || error.status >= 500) {
          setStatus('offline');
          schedule(backoffRef.current);
          backoffRef.current = Math.min(backoffRef.current * 2, 30000);
          return false;
        }
        // Refused outright (going back, a bad option): retrying can't help.
        sending.forEach(([id, version]) => {
          if (pendingRef.current.get(id) === version) pendingRef.current.delete(id);
        });
        persist();
        setStatus(pendingRef.current.size ? 'waiting' : 'saved');
        callbacks.current.onRefused(error.message);
        return false;
      })
      .finally(() => { inFlightRef.current = null; });

    inFlightRef.current = work;
    return work;
  }, [attemptId, persist, schedule]);

  const flushRef = useRef(flush);
  flushRef.current = flush;

  /** Change one question's answer. Typing waits longer before saving than a click. */
  const update = useCallback((questionId: number, change: Partial<CBTAnswer>, typing = false) => {
    const next = { ...(answersRef.current[questionId] ?? blank(questionId)), ...change, question_id: questionId };
    answersRef.current = { ...answersRef.current, [questionId]: next };
    versionRef.current += 1;
    pendingRef.current.set(questionId, versionRef.current);
    setAnswers(answersRef.current);
    persist();
    setStatus((s) => (s === 'offline' ? s : 'waiting'));
    schedule(typing ? 2500 : 400);
  }, [persist, schedule]);

  useEffect(() => {
    const retry = () => { backoffRef.current = 3000; void flushRef.current(); };
    const everyFewSeconds = window.setInterval(() => { if (pendingRef.current.size) void flushRef.current(); }, 10000);
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      if (pendingRef.current.size && !endedRef.current) event.preventDefault();
    };
    window.addEventListener('online', retry);
    window.addEventListener('beforeunload', warnBeforeLeaving);
    if (pendingRef.current.size) schedule(1000);
    return () => {
      window.clearInterval(everyFewSeconds);
      window.removeEventListener('online', retry);
      window.removeEventListener('beforeunload', warnBeforeLeaving);
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [schedule]);

  /** Stop saving: the attempt is over. */
  const stop = useCallback(() => {
    endedRef.current = true;
    if (timerRef.current) window.clearTimeout(timerRef.current);
  }, []);

  /** Keep saving until nothing is waiting, or a save fails. True when everything reached the server. */
  const flushAll = useCallback(async (): Promise<boolean> => {
    for (let round = 0; round < 5 && pendingRef.current.size; round += 1) {
      if (!(await flushRef.current())) return false;
    }
    return pendingRef.current.size === 0;
  }, []);

  return { answers, status, pendingCount, update, flush, flushAll, stop };
};
