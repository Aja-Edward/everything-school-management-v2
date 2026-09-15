import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle, CheckCircle, Eye, Monitor, Radio, RefreshCw, Rocket, Trash2, Undo2, X } from 'lucide-react';
import { toast } from 'react-toastify';
import CBTService, {
  CBTCheck,
  CBTPaper,
  CBTPaperSettings,
  CBTStudentPaper,
  cbtProblems,
} from '@/services/CBTService';
import { buildPreviewDocument } from './previewDocument';
import BankDrawPanel from './BankDrawPanel';
import MarkingPanel from './MarkingPanel';
import AnalysisPanel from './AnalysisPanel';

interface Props {
  open: boolean;
  exam: { id: number; title: string } | null;
  onClose: () => void;
  /** Called with the paper after any change, or null once it is removed. */
  onChanged?: (examId: number, paper: CBTPaper | null) => void;
}

type Tab = 'settings' | 'bank' | 'preview' | 'marking' | 'analysis';

const TAB_LABELS: Record<Tab, string> = {
  settings: 'Settings',
  bank: 'Question bank',
  preview: 'Preview as student',
  marking: 'Marking & results',
  analysis: 'Analysis',
};

/** Tabs about what students did, which a draft has nothing to show for. */
const AFTER_PUBLISHING: Tab[] = ['marking', 'analysis'];

const QUESTION_SETTINGS: (keyof CBTPaperSettings)[] = [
  'include_objective', 'include_theory', 'objective_questions_per_attempt',
];

/** ISO timestamp → value for <input type="datetime-local">, in the browser's time zone. */
const toLocalInput = (iso: string | null): string => {
  if (!iso) return '';
  const date = new Date(iso);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

const fromLocalInput = (value: string): string | null => (value ? new Date(value).toISOString() : null);

const settingsOf = (paper: CBTPaper): CBTPaperSettings => ({
  opens_at: paper.opens_at,
  closes_at: paper.closes_at,
  duration_minutes: paper.duration_minutes,
  include_objective: paper.include_objective,
  include_theory: paper.include_theory,
  objective_questions_per_attempt: paper.objective_questions_per_attempt,
  shuffle_questions: paper.shuffle_questions,
  shuffle_options: paper.shuffle_options,
  allow_backtracking: paper.allow_backtracking,
  max_attempts: paper.max_attempts,
  access_code: paper.access_code,
  result_release: paper.result_release,
});

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700 border-slate-300',
  published: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  closed: 'bg-amber-100 text-amber-800 border-amber-300',
};

const Problems: React.FC<{ title: string; problems: string[] }> = ({ title, problems }) => (
  <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 dark:border-rose-800 dark:bg-rose-900/30">
    <div className="flex items-center gap-2 text-sm font-semibold text-rose-800 dark:text-rose-200">
      <AlertCircle className="h-4 w-4 flex-shrink-0" />
      {title}
    </div>
    <ul className="mt-2 list-disc space-y-1 pl-6 text-sm text-rose-700 dark:text-rose-300">
      {problems.map((problem) => <li key={problem}>{problem}</li>)}
    </ul>
  </div>
);

const CBTPaperModal: React.FC<Props> = ({ open, exam, onClose, onChanged }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [paper, setPaper] = useState<CBTPaper | null>(null);
  const [form, setForm] = useState<CBTPaperSettings>({});
  const [problems, setProblems] = useState<{ title: string; items: string[] } | null>(null);
  const [check, setCheck] = useState<CBTCheck | null>(null);
  const [preview, setPreview] = useState<CBTStudentPaper | null>(null);
  const [tab, setTab] = useState<Tab>('settings');

  const started = (paper?.attempt_count ?? 0) > 0;
  const dirty = useMemo(
    () => !!paper && JSON.stringify(settingsOf(paper)) !== JSON.stringify({ ...settingsOf(paper), ...form }),
    [paper, form],
  );

  const showPaper = useCallback((next: CBTPaper | null) => {
    setPaper(next);
    setForm(next ? settingsOf(next) : {});
    if (exam) onChanged?.(exam.id, next);
  }, [exam, onChanged]);

  useEffect(() => {
    if (!open || !exam) return;
    setTab('settings');
    setProblems(null);
    setCheck(null);
    setPreview(null);
    setLoading(true);
    CBTService.getPaperForExam(exam.id)
      .then((found) => { setPaper(found); setForm(found ? settingsOf(found) : {}); })
      .catch((error) => setProblems({ title: 'Could not load the CBT paper', items: cbtProblems(error) }))
      .finally(() => setLoading(false));
  }, [open, exam]);

  if (!open || !exam) return null;

  const run = async (work: () => Promise<void>, failureTitle: string) => {
    setBusy(true);
    setProblems(null);
    try {
      await work();
    } catch (error) {
      setProblems({ title: failureTitle, items: cbtProblems(error) });
    } finally {
      setBusy(false);
    }
  };

  const setField = <K extends keyof CBTPaperSettings>(name: K, value: CBTPaperSettings[K]) => {
    setForm((current) => ({ ...current, [name]: value }));
    setCheck(null);
  };

  const saveSettings = () => run(async () => {
    if (!paper) return;
    showPaper(await CBTService.updatePaper(paper.id, form));
    toast.success('CBT settings saved');
  }, 'Settings not saved');

  const setUp = () => run(async () => {
    showPaper(await CBTService.createPaper(exam.id));
  }, 'Could not set up CBT');

  const runCheck = () => run(async () => {
    if (!paper) return;
    if (dirty) showPaper(await CBTService.updatePaper(paper.id, form));
    setCheck(await CBTService.checkPaper(paper.id));
  }, 'Could not check the paper');

  const loadPreview = () => run(async () => {
    if (!paper) return;
    if (dirty) showPaper(await CBTService.updatePaper(paper.id, form));
    setPreview(await CBTService.previewPaper(paper.id));
    setTab('preview');
  }, 'Could not preview the paper');

  const publish = () => run(async () => {
    if (!paper) return;
    if (dirty) showPaper(await CBTService.updatePaper(paper.id, form));
    showPaper(await CBTService.publishPaper(paper.id));
    setCheck(null);
    toast.success('Published. Students can start when the exam opens.');
  }, 'Not published');

  const unpublish = () => run(async () => {
    if (!paper || !window.confirm('Take this paper down? Students will not be able to start it.')) return;
    showPaper(await CBTService.unpublishPaper(paper.id));
    toast.success('Paper taken down');
  }, 'Could not take the paper down');

  const remove = () => run(async () => {
    if (!paper || !window.confirm('Stop delivering this exam as CBT? Its CBT settings will be deleted.')) return;
    await CBTService.deletePaper(paper.id);
    showPaper(null);
    toast.success('CBT removed from this exam');
  }, 'Could not remove CBT');

  const inputClass = 'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-white disabled:opacity-60';
  const labelClass = 'block text-sm font-medium text-slate-700 dark:text-slate-300';
  const toggle = (name: keyof CBTPaperSettings, label: string, hint?: string) => {
    const locked = started && QUESTION_SETTINGS.includes(name);
    return (
      <label className={`flex items-start gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700 ${locked ? 'opacity-60' : 'cursor-pointer'}`}>
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4"
          checked={!!form[name]}
          disabled={locked || busy}
          onChange={(e) => setField(name, e.target.checked as any)}
        />
        <span>
          <span className="block text-sm font-medium text-slate-800 dark:text-slate-200">{label}</span>
          {hint && <span className="block text-xs text-slate-500 dark:text-slate-400">{hint}</span>}
        </span>
      </label>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-4">
      <div className="flex max-h-[95vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-xl dark:bg-slate-800">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-700">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-white">
              <Monitor className="h-5 w-5 text-indigo-600" />
              Computer-based test
            </h2>
            <p className="truncate text-sm text-slate-500 dark:text-slate-400">{exam.title}</p>
          </div>
          <div className="flex items-center gap-3">
            {paper && (
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold capitalize ${STATUS_BADGE[paper.status]}`}>
                {paper.status}
              </span>
            )}
            <button onClick={onClose} className="rounded p-1 text-slate-400 hover:text-slate-600" aria-label="Close">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {paper && (
          <div className="flex gap-1 border-b border-slate-200 px-5 dark:border-slate-700">
            {(Object.keys(TAB_LABELS) as Tab[]).filter((name) => !AFTER_PUBLISHING.includes(name) || paper.status !== 'draft').map((name) => (
              <button
                key={name}
                onClick={() => (name === 'preview' && !preview ? loadPreview() : setTab(name))}
                className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
                  tab === name ? 'border-indigo-600 text-indigo-700 dark:text-indigo-300' : 'border-transparent text-slate-500'
                }`}
              >
                {TAB_LABELS[name]}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {problems && <Problems title={problems.title} problems={problems.items} />}

          {loading && <p className="py-10 text-center text-sm text-slate-500">Loading...</p>}

          {!loading && !paper && (
            <div className="py-8 text-center">
              <Monitor className="mx-auto h-10 w-10 text-slate-300" />
              <p className="mt-3 font-medium text-slate-800 dark:text-slate-200">
                This exam isn't set up for computer-based testing.
              </p>
              <p className="mx-auto mt-1 max-w-md text-sm text-slate-500 dark:text-slate-400">
                Setting it up lets students sit it on screen. The window and duration start from the
                exam's date and times, and you can change them before publishing.
              </p>
              <button
                onClick={setUp}
                disabled={busy}
                className="mt-5 rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                Set up CBT
              </button>
            </div>
          )}

          {!loading && paper && tab === 'settings' && (
            <>
              {started && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
                  {paper.attempt_count} student{paper.attempt_count === 1 ? ' has' : 's have'} started this paper.
                  Which questions go on it can no longer change, but you can still move the window.
                </div>
              )}

              <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className={labelClass} htmlFor="cbt-opens">Opens</label>
                  <input id="cbt-opens" type="datetime-local" className={inputClass} disabled={busy}
                    value={toLocalInput(form.opens_at ?? null)}
                    onChange={(e) => setField('opens_at', fromLocalInput(e.target.value))} />
                </div>
                <div>
                  <label className={labelClass} htmlFor="cbt-closes">Closes</label>
                  <input id="cbt-closes" type="datetime-local" className={inputClass} disabled={busy}
                    value={toLocalInput(form.closes_at ?? null)}
                    onChange={(e) => setField('closes_at', fromLocalInput(e.target.value))} />
                </div>
                <div>
                  <label className={labelClass} htmlFor="cbt-duration">Minutes per student</label>
                  <input id="cbt-duration" type="number" min={1} className={inputClass} disabled={busy}
                    value={form.duration_minutes ?? ''}
                    onChange={(e) => setField('duration_minutes', e.target.value ? Number(e.target.value) : null)} />
                </div>
              </section>
              <p className="-mt-2 text-xs text-slate-500 dark:text-slate-400">
                No one can start after closing time. Anyone still writing stops then, plus any extra time on
                their exam registration.
              </p>

              <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {toggle('include_objective', 'Objective questions', 'Marked automatically')}
                {toggle('include_theory', 'Theory and custom sections', 'Typed answers, marked by a teacher. Practical questions are never included.')}
                {toggle('shuffle_questions', 'Shuffle questions', 'Each student gets their own order within each section')}
                {toggle('shuffle_options', 'Shuffle options', 'A, B, C, D appear in a different order for each student')}
                {toggle('allow_backtracking', 'Allow going back', 'Students can return to earlier questions')}
              </section>

              <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClass} htmlFor="cbt-draw">Objective questions per student</label>
                  <input id="cbt-draw" type="number" min={1} className={inputClass}
                    placeholder="All of them" disabled={busy || started}
                    value={form.objective_questions_per_attempt ?? ''}
                    onChange={(e) => setField('objective_questions_per_attempt', e.target.value ? Number(e.target.value) : null)} />
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Drawn at random from the exam's objective questions.</p>
                </div>
                <div>
                  <label className={labelClass} htmlFor="cbt-attempts">Attempts allowed</label>
                  <input id="cbt-attempts" type="number" min={1} className={inputClass} disabled={busy}
                    value={form.max_attempts ?? 1}
                    onChange={(e) => setField('max_attempts', Math.max(1, Number(e.target.value) || 1))} />
                </div>
                <div>
                  <label className={labelClass} htmlFor="cbt-code">Access code</label>
                  <input id="cbt-code" type="text" maxLength={20} className={inputClass} disabled={busy}
                    placeholder="None" value={form.access_code ?? ''}
                    onChange={(e) => setField('access_code', e.target.value)} />
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">If set, invigilators read it out and students enter it to start.</p>
                </div>
                <div>
                  <label className={labelClass} htmlFor="cbt-release">Students see their score</label>
                  <select id="cbt-release" className={inputClass} disabled={busy}
                    value={form.result_release ?? 'manual'}
                    onChange={(e) => setField('result_release', e.target.value as CBTPaperSettings['result_release'])}>
                    <option value="manual">When staff release results</option>
                    <option value="after_close">When the exam closes</option>
                    <option value="on_submit">As soon as they submit</option>
                  </select>
                </div>
              </section>

              {check && (check.ready ? (
                <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200">
                  <CheckCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  Ready to publish: {check.objective_count} objective and {check.text_count} typed-answer question
                  {check.objective_count + check.text_count === 1 ? '' : 's'}.
                </div>
              ) : (
                <>
                  <Problems title="Fix these before publishing" problems={check.problems} />
                  {check.objective_count + check.text_count === 0 && (
                    <button onClick={() => setTab('bank')}
                      className="text-sm font-medium text-indigo-700 hover:underline dark:text-indigo-300">
                      Add questions from the question bank
                    </button>
                  )}
                </>
              ))}

              {paper.status !== 'draft' && (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Published {paper.published_at ? new Date(paper.published_at).toLocaleString() : ''} with{' '}
                  {paper.objective_count} objective and {paper.text_count} typed-answer questions.
                  Later edits to the exam's questions reach students only if you publish again.
                </p>
              )}
            </>
          )}

          {!loading && paper && tab === 'marking' && (
            <MarkingPanel paper={paper} onPaperChanged={showPaper} />
          )}

          {!loading && paper && tab === 'analysis' && <AnalysisPanel paperId={paper.id} />}

          {!loading && paper && tab === 'bank' && (
            <BankDrawPanel
              paperId={paper.id}
              onDrawn={() => {
                // The exam's questions changed, so any earlier check or preview is out of date.
                setCheck(null);
                setPreview(null);
              }}
            />
          )}

          {!loading && paper && tab === 'preview' && preview && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  {preview.is_draft
                    ? "A draft preview, built from the exam's questions as they are now."
                    : 'The published paper, as one student would get it.'}{' '}
                  No answers are included.
                </p>
                <button onClick={loadPreview} disabled={busy}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-600 dark:text-slate-200">
                  <RefreshCw className="h-4 w-4" />
                  Draw again
                </button>
              </div>
              {preview.problems.length > 0 && (
                <Problems title="This paper can't be published yet" problems={preview.problems} />
              )}
              {/* Sandboxed with no permissions: question HTML is shown, but nothing in it can run. */}
              <iframe
                title="Student preview"
                sandbox=""
                srcDoc={buildPreviewDocument(preview)}
                className="h-[60vh] w-full rounded-lg border border-slate-200 bg-white dark:border-slate-700"
              />
            </>
          )}
        </div>

        {paper && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-5 py-3 dark:border-slate-700">
            <div className="flex gap-2">
              {paper.status === 'draft' && !started && (
                <button onClick={remove} disabled={busy}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-rose-700 hover:bg-rose-50 disabled:opacity-60">
                  <Trash2 className="h-4 w-4" /> Remove CBT
                </button>
              )}
              {paper.status !== 'draft' && (
                <button
                  onClick={() => navigate(`${location.pathname.startsWith('/teacher') ? '/teacher/invigilate' : '/admin/cbt-invigilation'}/${paper.id}`)}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300">
                  <Radio className="h-4 w-4" /> Live board
                </button>
              )}
              {paper.status === 'published' && !started && (
                <button onClick={unpublish} disabled={busy}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-60 dark:text-slate-200">
                  <Undo2 className="h-4 w-4" /> Take down
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {tab === 'settings' && (
                <>
                  <button onClick={runCheck} disabled={busy}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-600 dark:text-slate-200">
                    Check paper
                  </button>
                  <button onClick={loadPreview} disabled={busy}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-600 dark:text-slate-200">
                    <Eye className="h-4 w-4" /> Preview
                  </button>
                  <button onClick={saveSettings} disabled={busy || !dirty}
                    className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-40">
                    Save settings
                  </button>
                </>
              )}
              {!started && (
                <button onClick={publish} disabled={busy}
                  className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60">
                  <Rocket className="h-4 w-4" />
                  {paper.status === 'draft' ? 'Publish' : 'Publish again'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CBTPaperModal;
