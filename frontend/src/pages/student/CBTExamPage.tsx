import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock, KeyRound, Loader2, Monitor, TimerOff } from 'lucide-react';
import StudentCBTService, {
  CBTAttemptDetail, CBTAttemptState, CBTMyExam, CBTRequestError, sessionTokens,
} from '@/services/StudentCBTService';
import ExamScreen from '@/components/cbt/student/ExamScreen';

type View =
  | { name: 'loading' }
  | { name: 'unavailable'; message: string }
  | { name: 'intro'; exam: CBTMyExam; takeover: boolean }
  | { name: 'exam'; detail: Required<CBTAttemptDetail> }
  | { name: 'finished'; exam: CBTMyExam | null; state: CBTAttemptState | null };

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

const Shell: React.FC<{ children: React.ReactNode; onBack: () => void }> = ({ children, onBack }) => (
  <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4 dark:bg-slate-950">
    <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-8">
      {children}
      <button type="button" onClick={onBack}
        className="mt-6 flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
        <ArrowLeft className="h-4 w-4" /> Back to my exams
      </button>
    </div>
  </div>
);

const CBTExamPage: React.FC = () => {
  const { paperId } = useParams();
  const navigate = useNavigate();
  const [view, setView] = useState<View>({ name: 'loading' });
  const [accessCode, setAccessCode] = useState('');
  const [starting, setStarting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const backToExams = useCallback(() => navigate('/student/dashboard?section=cbt'), [navigate]);

  const openAttempt = useCallback(async (attemptId: number, exam: CBTMyExam) => {
    const detail = await StudentCBTService.attempt(attemptId);
    if (detail.attempt.status !== 'in_progress' || !detail.paper || !detail.answers) {
      setView({ name: 'finished', exam, state: detail.attempt });
      return;
    }
    setView({ name: 'exam', detail: detail as Required<CBTAttemptDetail> });
  }, []);

  const load = useCallback(async () => {
    setView({ name: 'loading' });
    try {
      const { exams } = await StudentCBTService.myExams();
      const exam = exams.find((e) => String(e.paper) === paperId);
      if (!exam) {
        setView({ name: 'unavailable', message: "This exam isn't one you are entered for." });
        return;
      }
      if (exam.state === 'in_progress' && exam.attempt) {
        // Picking up after a reload on the same computer needs no clicks.
        if (sessionTokens.get(exam.attempt.id)) {
          try {
            await openAttempt(exam.attempt.id, exam);
            return;
          } catch (error) {
            if ((error as CBTRequestError).code !== 'session_replaced') throw error;
          }
        }
        setView({ name: 'intro', exam, takeover: true });
        return;
      }
      if (exam.state === 'done' || exam.state === 'missed') {
        setView({ name: 'finished', exam, state: exam.attempt });
        return;
      }
      setView({ name: 'intro', exam, takeover: false });
    } catch (error) {
      setView({ name: 'unavailable', message: (error as Error).message || 'Could not load this exam.' });
    }
  }, [openAttempt, paperId]);

  useEffect(() => { void load(); }, [load]);

  const start = async (exam: CBTMyExam) => {
    setStarting(true);
    setProblem(null);
    try {
      const state = await StudentCBTService.start(exam.paper, exam.attempt?.id ?? null, accessCode);
      if (state.status !== 'in_progress') {
        setView({ name: 'finished', exam, state });
        return;
      }
      await openAttempt(state.id, exam);
    } catch (error) {
      setProblem((error as Error).message);
    } finally {
      setStarting(false);
    }
  };

  if (view.name === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 dark:bg-slate-950">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (view.name === 'exam') {
    return (
      <ExamScreen
        detail={view.detail}
        onEnded={(state) => {
          sessionTokens.clear(view.detail.attempt.id);
          setView({ name: 'finished', exam: null, state });
        }}
        onReplaced={() => void load()}
      />
    );
  }

  if (view.name === 'unavailable') {
    return (
      <Shell onBack={backToExams}>
        <AlertTriangle className="h-10 w-10 text-amber-500" />
        <h1 className="mt-3 text-xl font-bold text-slate-900 dark:text-white">Exam not available</h1>
        <p className="mt-2 text-slate-600 dark:text-slate-300">{view.message}</p>
      </Shell>
    );
  }

  if (view.name === 'finished') {
    const timedOut = view.state?.status === 'timed_out';
    return (
      <Shell onBack={backToExams}>
        {timedOut ? <TimerOff className="h-10 w-10 text-amber-500" /> : <CheckCircle2 className="h-10 w-10 text-emerald-600" />}
        <h1 className="mt-3 text-xl font-bold text-slate-900 dark:text-white">
          {view.state ? (timedOut ? 'Time ran out' : 'Exam submitted') : 'This exam has ended'}
        </h1>
        <p className="mt-2 text-slate-600 dark:text-slate-300">
          {view.state
            ? `Your answers were handed in${view.state.submitted_at ? ` at ${when(view.state.submitted_at)}` : ''}. ${
              timedOut ? 'Everything you had saved before time ran out counts.' : 'You can close this page.'}`
            : view.exam?.state === 'missed'
              ? 'The window for this exam has closed.'
              : 'Your answers have been handed in.'}
        </p>
      </Shell>
    );
  }

  const { exam } = view;

  if (exam.state === 'upcoming') {
    return (
      <Shell onBack={backToExams}>
        <Clock className="h-10 w-10 text-indigo-600" />
        <h1 className="mt-3 text-xl font-bold text-slate-900 dark:text-white">{exam.exam_title}</h1>
        <p className="mt-2 text-slate-600 dark:text-slate-300">This exam opens on {when(exam.opens_at)}.</p>
      </Shell>
    );
  }

  return (
    <Shell onBack={backToExams}>
      <div className="flex items-center gap-2 text-sm font-medium text-indigo-700 dark:text-indigo-300">
        <Monitor className="h-4 w-4" /> Computer-based test
      </div>
      <h1 className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{exam.exam_title}</h1>
      <p className="text-slate-500 dark:text-slate-400">{exam.subject}</p>

      {view.takeover ? (
        <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
          You have already started this exam, on another computer or in another browser. Continuing here moves the
          exam to this computer, and the other one will stop working. Your saved answers come with you, and your time
          keeps running.
        </div>
      ) : (
        <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
            <dt className="text-slate-500 dark:text-slate-400">Time allowed</dt>
            <dd className="font-semibold text-slate-900 dark:text-white">{exam.duration_minutes} minutes</dd>
          </div>
          <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
            <dt className="text-slate-500 dark:text-slate-400">Closes</dt>
            <dd className="font-semibold text-slate-900 dark:text-white">{when(exam.closes_at)}</dd>
          </div>
        </dl>
      )}

      {!view.takeover && (
        <ul className="mt-5 list-disc space-y-1.5 pl-5 text-sm text-slate-600 dark:text-slate-300">
          <li>Your time starts when you press Start, and the clock keeps running if you leave the page.</li>
          <li>Your answers are saved as you go. If the connection drops, keep working and don't close the page.</li>
          <li>Use one computer. Opening the exam somewhere else moves it there.</li>
          <li>When time runs out, your answers are handed in for you.</li>
        </ul>
      )}

      {exam.requires_access_code && (
        <div className="mt-5">
          <label htmlFor="cbt-access-code" className="flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
            <KeyRound className="h-4 w-4" /> Access code
          </label>
          <input id="cbt-access-code" value={accessCode} onChange={(e) => setAccessCode(e.target.value)} autoComplete="off"
            placeholder="Your invigilator will give you this"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-mono uppercase tracking-widest dark:border-slate-600 dark:bg-slate-800 dark:text-white" />
        </div>
      )}

      {problem && <p className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">{problem}</p>}

      <button type="button" onClick={() => void start(exam)} disabled={starting || (exam.requires_access_code && !accessCode.trim())}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-base font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
        {starting && <Loader2 className="h-5 w-5 animate-spin" />}
        {view.takeover ? 'Continue on this computer' : 'Start exam'}
      </button>
    </Shell>
  );
};

export default CBTExamPage;
