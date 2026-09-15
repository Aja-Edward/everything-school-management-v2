import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Clock, CloudOff, Flag, Loader2, Maximize, Minus, Plus,
} from 'lucide-react';
import StudentCBTService, {
  CBTAttemptDetail, CBTAttemptState, CBTClientEvent, CBTClientEventKind, CBTPart, CBTQuestion, CBTRequestError,
} from '@/services/StudentCBTService';
import { hasMath, preloadMathFonts } from '@/utils/math';
import QuestionView, { OPTION_LETTERS, isChoice, toggleKey } from './QuestionView';
import { forgetStoredAnswers, useAnswerQueue } from './useAnswerQueue';
import SoundClipPlayer from './SoundClipPlayer';
import { forgetStoredPlays, useSoundClips } from './useSoundClips';
import type { SoundClip } from '@/services/SoundClipService';

interface Props {
  detail: Required<CBTAttemptDetail>;
  onEnded: (state: CBTAttemptState | null) => void;
  onReplaced: () => void;
}

const FONT_SIZES = ['0.95rem', '1.1rem', '1.25rem', '1.45rem'];
const HEARTBEAT_MS = 30000;

export const formatClock = (totalSeconds: number) => {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
};

const readNumber = (key: string, fallback: number) => {
  try {
    const value = Number(localStorage.getItem(key));
    return Number.isFinite(value) && localStorage.getItem(key) !== null ? value : fallback;
  } catch {
    return fallback;
  }
};

const store = (key: string, value: number) => {
  try { localStorage.setItem(key, String(value)); } catch { /* ignore */ }
};

const ExamScreen: React.FC<Props> = ({ detail, onEnded, onReplaced }) => {
  const { paper } = detail;
  const questions = paper.questions;
  const total = questions.length;
  const attemptId = detail.attempt.id;
  const allowBack = detail.attempt.allow_backtracking;

  const [attempt, setAttempt] = useState(detail.attempt);
  const offsetRef = useRef(Date.parse(detail.attempt.server_time) - Date.now());
  const [now, setNow] = useState(() => Date.now() + offsetRef.current);
  const [current, setCurrent] = useState(() => {
    const saved = readNumber(`cbt:position:${attemptId}`, allowBack ? 0 : detail.attempt.furthest_position);
    const start = Math.min(Math.max(saved, 0), total - 1);
    return allowBack ? start : Math.max(start, detail.attempt.furthest_position);
  });
  // A reload reopens the question the student was on, which may be past what the server has heard of.
  const [furthest, setFurthest] = useState(() => Math.max(detail.attempt.furthest_position, current));
  const [fontStep, setFontStep] = useState(() => readNumber('cbt:font-step', 1));
  const [notice, setNotice] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [finishing, setFinishing] = useState<null | 'submit' | 'time'>(null);
  const [submitProblem, setSubmitProblem] = useState<string | null>(null);
  const eventsRef = useRef<CBTClientEvent[]>([]);
  const endedRef = useRef(false);

  useEffect(() => {
    const partsHaveMath = (parts?: CBTPart[]): boolean =>
      !!parts?.some((part) => hasMath(part.question) || partsHaveMath(part.parts));
    const paperHasMath = questions.some((q) =>
      hasMath(q.content) || q.options?.some((o) => hasMath(o.text)) || partsHaveMath(q.parts));
    if (paperHasMath) preloadMathFonts();
  }, [questions]);

  const end = useCallback((state: CBTAttemptState | null) => {
    if (endedRef.current) return;
    endedRef.current = true;
    forgetStoredAnswers(attemptId);
    forgetStoredPlays(attemptId);
    onEnded(state);
  }, [attemptId, onEnded]);

  const queue = useAnswerQueue({
    attemptId,
    serverAnswers: detail.answers,
    onEnded: () => end(null),
    onReplaced,
    onRefused: (message) => setNotice(message),
  });

  const deadline = Date.parse(attempt.deadline);
  const secondsLeft = Math.max(0, Math.ceil((deadline - now) / 1000));

  const sectionsByKey = useMemo(() => Object.fromEntries(paper.sections.map((s) => [s.key, s])), [paper.sections]);
  const isAnswered = (q: CBTQuestion) => {
    const a = queue.answers[q.id];
    return !!a && (isChoice(q) ? !!a.selected_option : !!a.text_answer.trim());
  };
  const answeredCount = questions.filter(isAnswered).length;
  const flagged = questions.filter((q) => queue.answers[q.id]?.flagged);
  const unanswered = questions.filter((q) => !isAnswered(q));

  const report = useCallback((kind: CBTClientEventKind, detailData?: Record<string, unknown>) => {
    if (eventsRef.current.length < 200) {
      eventsRef.current.push({ kind, client_time: new Date().toISOString(), detail: detailData });
    }
  }, []);

  const sendEvents = useCallback(async () => {
    const batch = eventsRef.current.splice(0, 50);
    if (!batch.length) return;
    try {
      await StudentCBTService.events(attemptId, batch);
    } catch {
      eventsRef.current.unshift(...batch);
    }
  }, [attemptId]);

  const acceptState = useCallback((state: CBTAttemptState) => {
    offsetRef.current = Date.parse(state.server_time) - Date.now();
    setAttempt(state);
    if (state.status !== 'in_progress') end(state);
  }, [end]);

  const handleError = useCallback((error: unknown) => {
    const e = error as CBTRequestError;
    if (e?.code === 'ended') end(null);
    else if (e?.code === 'session_replaced') onReplaced();
  }, [end, onReplaced]);

  // Seconds each question has been on screen since the last check-in, for the question analysis.
  // Time while the page is hidden (another tab, minimised) isn't counted.
  const timeRef = useRef<Record<string, number>>({});
  const shownRef = useRef<{ id: number; since: number } | null>(null);

  const noteTime = useCallback((count = !document.hidden) => {
    const shown = shownRef.current;
    if (!shown) return;
    if (count) {
      const key = String(shown.id);
      timeRef.current[key] = (timeRef.current[key] ?? 0) + (Date.now() - shown.since) / 1000;
    }
    shown.since = Date.now();
  }, []);

  /** The whole seconds counted so far, taken out of the tally to send. */
  const takeTime = useCallback(() => {
    noteTime();
    const whole: Record<string, number> = {};
    for (const [key, seconds] of Object.entries(timeRef.current)) {
      const s = Math.floor(seconds);
      if (s > 0) {
        whole[key] = s;
        timeRef.current[key] = seconds - s;
      }
    }
    return whole;
  }, [noteTime]);

  const giveBackTime = useCallback((time: Record<string, number>) => {
    for (const [key, seconds] of Object.entries(time)) timeRef.current[key] = (timeRef.current[key] ?? 0) + seconds;
  }, []);

  /**
   * Check in with the server. `position` is only reported once nothing is left to save
   * (`saved`): when going back isn't allowed, the server refuses answers to questions
   * before the reported position, and an answer still in the queue would be lost.
   */
  const heartbeat = useCallback(async (position: number, saved: boolean) => {
    const time = takeTime();
    try {
      acceptState(await StudentCBTService.heartbeat(
        attemptId, saved ? position : attempt.furthest_position, time, playsRef.current));
    } catch (error) {
      giveBackTime(time);
      handleError(error);
    }
    void sendEvents();
  }, [acceptState, attempt.furthest_position, attemptId, giveBackTime, handleError, sendEvents, takeTime]);

  const pendingRef = useRef(queue.pendingCount);
  pendingRef.current = queue.pendingCount;

  // Sound clips, keyed the way the server counts their plays.
  const clips = useMemo(() => {
    const all: Record<string, SoundClip> = {};
    paper.sections.forEach((s) => { if (s.audio?.url) all[`section:${s.key}`] = s.audio; });
    questions.forEach((q) => { if (q.audio?.url) all[`question:${q.id}`] = q.audio; });
    return all;
  }, [paper.sections, questions]);
  const soundClips = useSoundClips({
    attemptId,
    clips,
    serverPlays: attempt.audio_plays ?? {},
    onReport: (kind, eventDetail) => report(kind, eventDetail),
    // Tell the server now, so a reload on another computer can't start the count again.
    onPlayCounted: () => window.setTimeout(() => {
      void heartbeatRef.current(furthestRef.current, pendingRef.current === 0);
    }, 0),
  });
  const playsRef = useRef(soundClips.plays);
  playsRef.current = soundClips.plays;

  // The clock.
  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now() + offsetRef.current), 1000);
    return () => window.clearInterval(tick);
  }, []);

  const heartbeatRef = useRef(heartbeat);
  heartbeatRef.current = heartbeat;
  const furthestRef = useRef(furthest);
  furthestRef.current = furthest;
  useEffect(() => {
    const beat = window.setInterval(() => {
      void heartbeatRef.current(furthestRef.current, pendingRef.current === 0);
    }, HEARTBEAT_MS);
    return () => window.clearInterval(beat);
  }, []);

  useEffect(() => { store(`cbt:position:${attemptId}`, current); }, [attemptId, current]);

  // What the browser notices, for invigilators.
  useEffect(() => {
    let leftAt = 0;
    const onBlur = () => { leftAt = Date.now(); report('focus_lost'); };
    const onFocus = () => { if (leftAt) report('focus_returned', { away_seconds: Math.round((Date.now() - leftAt) / 1000) }); leftAt = 0; };
    const onCopy = () => report('copy_attempted');
    const onPaste = () => report('paste_attempted');
    const onOffline = () => report('connection_lost');
    const onOnline = () => { report('reconnected'); void sendEvents(); };
    const onFullscreen = () => { if (!document.fullscreenElement) report('fullscreen_exited'); };
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    document.addEventListener('copy', onCopy);
    document.addEventListener('paste', onPaste);
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    document.addEventListener('fullscreenchange', onFullscreen);
    return () => {
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('paste', onPaste);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
      document.removeEventListener('fullscreenchange', onFullscreen);
    };
  }, [report, sendEvents]);

  const finish = useCallback(async (reason: 'submit' | 'time') => {
    setFinishing(reason);
    setSubmitProblem(null);
    let allSaved = await queue.flushAll();
    if (!allSaved && reason === 'time') {
      // The server takes saves for a short while after the deadline: keep trying until then.
      for (let tries = 0; tries < 5 && !allSaved && !endedRef.current; tries += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 4000));
        allSaved = await queue.flushAll();
      }
    }
    if (endedRef.current) return;
    if (!allSaved && reason === 'submit') {
      setFinishing(null);
      setSubmitProblem(
        "Some answers haven't reached the school server yet. Check the connection and try again. Your answers are safe on this computer.");
      return;
    }
    soundClips.stopAll();
    await sendEvents();
    // The last few seconds on screen; the server's furthest position is sent back unchanged.
    await StudentCBTService.heartbeat(attemptId, attempt.furthest_position, takeTime(), playsRef.current).catch(() => undefined);
    try {
      const state = await StudentCBTService.submit(attemptId);
      queue.stop();
      end(state);
    } catch (error) {
      const e = error as CBTRequestError;
      if (e.code === 'ended') { queue.stop(); end(null); return; }
      if (e.code === 'session_replaced') { onReplaced(); return; }
      if (reason === 'time') {
        // Keep the overlay up: the attempt ends on the server regardless, and the next try will say so.
        window.setTimeout(() => { void finishRef.current('time'); }, 5000);
        return;
      }
      setFinishing(null);
      setSubmitProblem(e.message || 'Could not submit. Please try again.');
    }
  }, [attempt.furthest_position, attemptId, end, onReplaced, queue, sendEvents, takeTime]);

  const finishRef = useRef(finish);
  finishRef.current = finish;

  // Time up: save what can be saved and hand in.
  const timeUpRef = useRef(false);
  useEffect(() => {
    if (secondsLeft === 0 && !timeUpRef.current && attempt.status === 'in_progress') {
      timeUpRef.current = true;
      void finish('time');
    }
  }, [attempt.status, finish, secondsLeft]);

  const goTo = useCallback(async (index: number) => {
    if (index < 0 || index >= total || finishing) return;
    if (!allowBack && index < furthest) return;
    setNotice(null);
    if (!allowBack && index > furthest) {
      setFurthest(index);
      setCurrent(index);
      void heartbeat(index, await queue.flushAll());
      return;
    }
    setCurrent(index);
  }, [allowBack, finishing, furthest, heartbeat, queue, total]);

  const question = questions[current];

  // Start timing the question now on screen, crediting the one before it.
  useEffect(() => {
    noteTime();
    shownRef.current = { id: question.id, since: Date.now() };
  }, [noteTime, question.id]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) noteTime(true);
      else if (shownRef.current) shownRef.current.since = Date.now();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [noteTime]);
  const answer = queue.answers[question.id];
  const previous = questions[current - 1];
  const showSection = !previous || previous.section !== question.section;
  const section = sectionsByKey[question.section];

  const choose = useCallback((selected: string) => {
    queue.update(question.id, { selected_option: selected });
  }, [queue, question.id]);

  // Keyboard: letters choose, arrows or N/P move, F flags.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (reviewing || finishing || event.ctrlKey || event.metaKey || event.altKey) return;
      if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || target.isContentEditable)) return;
      const key = event.key.toUpperCase();
      if (key === 'ARROWRIGHT' || key === 'N') { event.preventDefault(); void goTo(current + 1); return; }
      if (key === 'ARROWLEFT' || key === 'P') { event.preventDefault(); void goTo(current - 1); return; }
      if (key === 'F') { queue.update(question.id, { flagged: !answer?.flagged }); return; }
      const index = OPTION_LETTERS.indexOf(key);
      if (isChoice(question) && key.length === 1 && index >= 0 && question.options?.[index]) {
        const option = question.options[index].key;
        choose(question.kind === 'multiple' ? toggleKey(answer?.selected_option ?? '', option) : option);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [answer?.flagged, answer?.selected_option, choose, current, finishing, goTo, queue, question, reviewing]);

  const changeFont = (step: number) => {
    const next = Math.min(Math.max(fontStep + step, 0), FONT_SIZES.length - 1);
    setFontStep(next);
    store('cbt:font-step', next);
  };

  const lowTime = secondsLeft <= 300;
  const saveLabel = {
    saved: 'All answers saved',
    saving: 'Saving...',
    waiting: `${queue.pendingCount} change${queue.pendingCount === 1 ? '' : 's'} to save`,
    offline: 'Offline: answers kept on this computer',
  }[queue.status];

  const gridButton = (index: number) => {
    const q = questions[index];
    const done = isAnswered(q);
    const isFlagged = !!queue.answers[q.id]?.flagged;
    const locked = !allowBack && index < furthest;
    return (
      <button
        key={q.id}
        type="button"
        disabled={locked || !!finishing}
        onClick={() => { setReviewing(false); void goTo(index); }}
        aria-label={`Question ${index + 1}${done ? ', answered' : ''}${isFlagged ? ', flagged' : ''}`}
        className={`relative h-10 rounded-lg border text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
          index === current ? 'ring-2 ring-indigo-500 ring-offset-1 dark:ring-offset-slate-900' : ''
        } ${done
          ? 'border-indigo-600 bg-indigo-600 text-white'
          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200'}`}
      >
        {index + 1}
        {isFlagged && <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-white bg-amber-500 dark:border-slate-900" />}
      </button>
    );
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-100 dark:bg-slate-950">
      <style>{`
        .cbt-content img { max-width: 100%; height: auto; }
        .cbt-content p { margin: 0 0 .5em; }
        .cbt-content p:last-child { margin-bottom: 0; }
        .cbt-content ul { list-style: disc; padding-left: 1.5em; }
        .cbt-content ol { list-style: decimal; padding-left: 1.5em; }
        .cbt-content table { border-collapse: collapse; margin: .5em 0; }
        .cbt-content td, .cbt-content th { border: 1px solid #94a3b8; padding: .25em .6em; }
        .cbt-content strong, .cbt-content b { font-weight: 700; }
        .cbt-content em, .cbt-content i { font-style: italic; }
      `}</style>

      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-2.5">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold text-slate-900 sm:text-lg dark:text-white">{paper.exam_title}</h1>
            <p className={`flex items-center gap-1.5 text-xs ${queue.status === 'offline' ? 'text-amber-700 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400'}`}>
              {queue.status === 'saving' ? <Loader2 className="h-3 w-3 animate-spin" />
                : queue.status === 'offline' ? <CloudOff className="h-3 w-3" />
                  : queue.status === 'saved' ? <CheckCircle2 className="h-3 w-3 text-emerald-600" /> : null}
              {saveLabel}
            </p>
          </div>
          <div className="flex items-center gap-1" aria-label="Text size">
            <button type="button" onClick={() => changeFont(-1)} className="rounded p-1.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800" aria-label="Smaller text"><Minus className="h-4 w-4" /></button>
            <span className="text-xs text-slate-500">Aa</span>
            <button type="button" onClick={() => changeFont(1)} className="rounded p-1.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800" aria-label="Larger text"><Plus className="h-4 w-4" /></button>
          </div>
          {document.fullscreenEnabled && !document.fullscreenElement && (
            <button type="button" onClick={() => { void document.documentElement.requestFullscreen().catch(() => undefined); }}
              className="hidden rounded p-1.5 text-slate-600 hover:bg-slate-100 sm:block dark:text-slate-300 dark:hover:bg-slate-800" aria-label="Full screen">
              <Maximize className="h-4 w-4" />
            </button>
          )}
          <div
            role="timer"
            aria-live={secondsLeft <= 60 ? 'assertive' : 'off'}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-mono text-lg font-bold tabular-nums ${
              lowTime ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100'
            } ${secondsLeft <= 60 && secondsLeft > 0 ? 'animate-pulse' : ''}`}
          >
            <Clock className="h-4 w-4" />
            {formatClock(secondsLeft)}
          </div>
        </div>
        {queue.status === 'offline' && (
          <div className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
            No connection to the school server. Keep working: your answers are saved on this computer and will be sent
            when the connection comes back. Don't close this page.
          </div>
        )}
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 p-3 sm:p-4 lg:flex-row">
        <main className="flex min-w-0 flex-1 flex-col rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="flex-1 p-4 sm:p-6">
            {notice && (
              <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" /> {notice}
              </div>
            )}
            <QuestionView
              question={question}
              total={total}
              answer={answer}
              sectionTitle={showSection ? section?.title : undefined}
              sectionInstructions={showSection ? section?.instructions : undefined}
              fontSize={FONT_SIZES[fontStep] ?? FONT_SIZES[1]}
              disabled={!!finishing}
              onChoose={choose}
              onType={(text) => queue.update(question.id, { text_answer: text }, true)}
              sectionClip={section?.audio?.url ? (
                <SoundClipPlayer clipKey={`section:${section.key}`} clip={section.audio} clips={soundClips}
                  heading={`${section.title}: listen`} disabled={!!finishing} />
              ) : undefined}
              questionClip={question.audio?.url ? (
                <SoundClipPlayer clipKey={`question:${question.id}`} clip={question.audio} clips={soundClips}
                  heading="Listen to this question" disabled={!!finishing} />
              ) : undefined}
            />
          </div>

          <div className="flex items-center gap-2 border-t border-slate-200 p-3 dark:border-slate-800 sm:p-4">
            <button type="button" onClick={() => void goTo(current - 1)} disabled={current === 0 || !allowBack || !!finishing}
              className="flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">
              <ChevronLeft className="h-4 w-4" /> Previous
            </button>
            <button type="button" onClick={() => queue.update(question.id, { flagged: !answer?.flagged })} disabled={!!finishing}
              aria-pressed={!!answer?.flagged}
              className={`flex items-center gap-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                answer?.flagged ? 'border-amber-500 bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200' : 'border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800'
              }`}>
              <Flag className="h-4 w-4" /> {answer?.flagged ? 'Flagged' : 'Flag'}
            </button>
            <div className="flex-1" />
            {current < total - 1 ? (
              <button type="button" onClick={() => void goTo(current + 1)} disabled={!!finishing}
                className="flex items-center gap-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
                Next <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <button type="button" onClick={() => setReviewing(true)} disabled={!!finishing}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                Review and submit
              </button>
            )}
          </div>
        </main>

        <aside className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 lg:w-72">
          <div className="mb-3 flex items-center justify-between text-sm">
            <span className="font-semibold text-slate-800 dark:text-slate-100">{answeredCount} of {total} answered</span>
            {flagged.length > 0 && <span className="text-amber-700 dark:text-amber-400">{flagged.length} flagged</span>}
          </div>
          <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-10 lg:grid-cols-5">
            {questions.map((_, index) => gridButton(index))}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-indigo-600" /> Answered</span>
            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded border border-slate-300 bg-white" /> Not answered</span>
            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-amber-500" /> Flagged</span>
          </div>
          {!allowBack && (
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">This exam doesn't allow going back to earlier questions.</p>
          )}
          <button type="button" onClick={() => setReviewing(true)} disabled={!!finishing}
            className="mt-4 w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
            Submit exam
          </button>
        </aside>
      </div>

      {(reviewing || submitProblem) && !finishing && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="cbt-review-title">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900">
            <h2 id="cbt-review-title" className="text-lg font-bold text-slate-900 dark:text-white">Submit your exam?</h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              You have answered <strong>{answeredCount}</strong> of <strong>{total}</strong> questions,
              with {formatClock(secondsLeft)} left. Once you submit, you can't change your answers.
            </p>
            {[['Not answered', unanswered], ['Flagged', flagged]].map(([label, list]) => {
              const items = list as typeof questions;
              return items.length > 0 ? (
                <div key={label as string} className="mt-4">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{label as string} ({items.length})</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {items.slice(0, 40).map((q) => {
                      const index = questions.indexOf(q);
                      const locked = !allowBack && index < furthest;
                      return (
                        <button key={q.id} type="button" disabled={locked}
                          onClick={() => { setReviewing(false); setSubmitProblem(null); void goTo(index); }}
                          className="h-8 min-w-[2rem] rounded border border-slate-300 px-2 text-sm hover:bg-slate-50 disabled:opacity-40 dark:border-slate-600 dark:hover:bg-slate-800">
                          {index + 1}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null;
            })}
            {submitProblem && (
              <p className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">{submitProblem}</p>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => { setReviewing(false); setSubmitProblem(null); }}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200">
                Keep working
              </button>
              <button type="button" onClick={() => void finish('submit')}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
                Submit now
              </button>
            </div>
          </div>
        </div>
      )}

      {finishing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="alertdialog" aria-live="assertive">
          <div className="rounded-2xl bg-white px-8 py-6 text-center shadow-xl dark:bg-slate-900">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-indigo-600" />
            <p className="mt-3 font-semibold text-slate-900 dark:text-white">
              {finishing === 'time' ? 'Time is up. Handing in your answers...' : 'Submitting your answers...'}
            </p>
            <p className="mt-1 text-sm text-slate-500">Please don't close this page.</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExamScreen;
