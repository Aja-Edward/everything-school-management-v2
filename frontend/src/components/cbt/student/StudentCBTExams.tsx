import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarClock, CheckCircle2, Clock, KeyRound, Loader2, Monitor, PlayCircle, RefreshCw } from 'lucide-react';
import StudentCBTService, { CBTExamState, CBTMyExam } from '@/services/StudentCBTService';

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

const GROUPS: { state: CBTExamState; title: string }[] = [
  { state: 'in_progress', title: 'In progress' },
  { state: 'open', title: 'Open now' },
  { state: 'upcoming', title: 'Coming up' },
  { state: 'done', title: 'Finished' },
  { state: 'missed', title: 'Missed' },
];

/** The student portal's list of computer-based tests. */
const StudentCBTExams: React.FC = () => {
  const navigate = useNavigate();
  const [exams, setExams] = useState<CBTMyExam[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    setError(null);
    StudentCBTService.myExams()
      .then((data) => setExams(data.exams))
      .catch((e) => setError(e.message || 'Could not load your exams.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const open = (exam: CBTMyExam) => navigate(`/student/cbt/${exam.paper}`);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-gray-900 dark:text-white">
            <Monitor className="h-5 w-5" /> Computer-based tests
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">Exams you sit on the computer.</p>
        </div>
        <button type="button" onClick={load} disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">{error}</p>}

      {loading && !exams && (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
      )}

      {exams && exams.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-300 p-10 text-center text-gray-500 dark:border-gray-700">
          You have no computer-based tests at the moment.
        </div>
      )}

      {exams && GROUPS.map(({ state, title }) => {
        const inGroup = exams.filter((e) => e.state === state);
        if (!inGroup.length) return null;
        return (
          <section key={state}>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{title}</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {inGroup.map((exam) => (
                <div key={exam.paper} className="flex flex-col rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
                  <p className="font-semibold text-gray-900 dark:text-white">{exam.exam_title}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{exam.subject}</p>
                  <div className="mt-3 space-y-1 text-sm text-gray-600 dark:text-gray-300">
                    <p className="flex items-center gap-1.5"><Clock className="h-4 w-4" /> {exam.duration_minutes} minutes</p>
                    {state === 'upcoming' && <p className="flex items-center gap-1.5"><CalendarClock className="h-4 w-4" /> Opens {when(exam.opens_at)}</p>}
                    {(state === 'open' || state === 'in_progress') && <p className="flex items-center gap-1.5"><CalendarClock className="h-4 w-4" /> Closes {when(exam.closes_at)}</p>}
                    {exam.requires_access_code && state === 'open' && <p className="flex items-center gap-1.5"><KeyRound className="h-4 w-4" /> Needs an access code</p>}
                    {state === 'done' && exam.attempt?.submitted_at && (
                      <p className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        {exam.attempt.status === 'timed_out' ? 'Time ran out' : 'Submitted'} {when(exam.attempt.submitted_at)}</p>
                    )}
                  </div>
                  {(state === 'open' || state === 'in_progress') && (
                    <button type="button" onClick={() => open(exam)}
                      className="mt-4 flex items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700">
                      <PlayCircle className="h-4 w-4" /> {state === 'in_progress' ? 'Continue' : 'Start'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
};

export default StudentCBTExams;
