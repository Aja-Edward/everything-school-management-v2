import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, EyeOff, Eye, Loader2, Send } from 'lucide-react';
import { toast } from 'react-toastify';
import CBTService, {
  CBTMarkingOverview, CBTObjectiveMarking, CBTPaper, CBTPushResults, CBTQuestionToMark, CBTResultTargets, cbtProblems,
} from '@/services/CBTService';
import SafeHtml from './student/SafeHtml';

interface Props {
  paper: CBTPaper;
  onPaperChanged: (paper: CBTPaper) => void;
}

const card = 'rounded-xl border border-slate-200 p-4 dark:border-slate-700';
const button = 'rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800';
const primary = 'flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50';
const input = 'rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white';

/** Marking one typed question across every student who answered it. */
const TextMarking: React.FC<{ paperId: number; questionId: number; onBack: () => void; onSaved: (o: CBTMarkingOverview) => void }> = ({
  paperId, questionId, onBack, onSaved,
}) => {
  const [data, setData] = useState<CBTQuestionToMark | null>(null);
  const [draft, setDraft] = useState<Record<number, string>>({});
  const [hideNames, setHideNames] = useState(true);
  const [saving, setSaving] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    CBTService.questionToMark(paperId, questionId)
      .then((result) => {
        setData(result);
        setDraft(Object.fromEntries(result.answers.map((a) => [a.attempt, a.marks_awarded ?? ''])));
      })
      .catch((e) => setError(cbtProblems(e)[0]));
  }, [paperId, questionId]);

  if (!data) {
    return error ? <p className="text-sm text-rose-700">{error}</p> : <Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-400" />;
  }

  const save = async (attempt: number) => {
    setSaving(attempt);
    setError(null);
    const value = draft[attempt];
    try {
      const overview = await CBTService.saveMarks(paperId, [{ attempt, question: questionId, marks: value === '' ? null : Number(value) }]);
      setData((d) => d && {
        ...d,
        answers: d.answers.map((a) => (a.attempt === attempt ? { ...a, marks_awarded: value === '' ? null : value } : a)),
      });
      onSaved(overview);
    } catch (e) {
      setError(cbtProblems(e)[0]);
    } finally {
      setSaving(null);
    }
  };

  const marked = data.answers.filter((a) => a.marks_awarded !== null).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 dark:text-slate-300">
          <ArrowLeft className="h-4 w-4" /> Marking overview
        </button>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-slate-600 dark:text-slate-300">{marked} of {data.answers.length} marked</span>
          <button type="button" onClick={() => setHideNames((h) => !h)} className={`${button} flex items-center gap-1.5`}>
            {hideNames ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />} {hideNames ? 'Show names' : 'Hide names'}
          </button>
        </div>
      </div>

      <div className={card}>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Question {data.question.number} · out of {Number(data.question.marks)}</p>
        <SafeHtml html={data.question.content} className="cbt-content mt-1 text-slate-900 dark:text-slate-100" />
        {data.question.parts?.map((part, i) => (
          <div key={i} className="mt-1 flex gap-2 text-sm"><span className="font-semibold">({String.fromCharCode(97 + i)})</span><SafeHtml html={part.question} className="cbt-content" /></div>
        ))}
        {data.question.marking_guide && (
          <div className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-200">
            <p className="font-semibold">Marking guide</p>
            <p className="whitespace-pre-wrap">{data.question.marking_guide}</p>
          </div>
        )}
      </div>

      {error && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">{error}</p>}
      {data.answers.length === 0 && <p className="text-sm text-slate-500">No student has written an answer to this question yet.</p>}

      <ol className="space-y-3">
        {data.answers.map((answer, index) => {
          const unchanged = (answer.marks_awarded ?? '') === (draft[answer.attempt] ?? '');
          return (
            <li key={answer.attempt} className={card}>
              <div className="mb-2 flex items-center justify-between gap-2 text-sm">
                <span className="font-medium text-slate-800 dark:text-slate-100">{hideNames ? `Script ${index + 1}` : answer.student}</span>
                {answer.marks_awarded !== null && (
                  <span className="flex items-center gap-1 text-xs text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> Marked{answer.marked_by ? ` by ${answer.marked_by}` : ''}</span>
                )}
              </div>
              <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-900 dark:bg-slate-800 dark:text-slate-100">{answer.text_answer}</p>
              <div className="mt-3 flex items-center gap-2">
                <label className="text-sm text-slate-600 dark:text-slate-300" htmlFor={`marks-${answer.attempt}`}>Marks</label>
                <input id={`marks-${answer.attempt}`} type="number" min={0} max={Number(data.question.marks)} step="0.5"
                  value={draft[answer.attempt] ?? ''} onChange={(e) => setDraft((d) => ({ ...d, [answer.attempt]: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !unchanged) void save(answer.attempt); }}
                  className={`${input} w-24`} />
                <span className="text-sm text-slate-500">/ {Number(data.question.marks)}</span>
                <button type="button" onClick={() => void save(answer.attempt)} disabled={unchanged || saving === answer.attempt} className={primary}>
                  {saving === answer.attempt && <Loader2 className="h-4 w-4 animate-spin" />} Save
                </button>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
};

/** Correcting one objective question's answer, from its row in the overview. */
const AnswerKeyRow: React.FC<{ paperId: number; question: CBTObjectiveMarking; onChanged: (o: CBTMarkingOverview) => void }> = ({
  paperId, question, onChanged,
}) => {
  const [editing, setEditing] = useState(false);
  const [choice, setChoice] = useState(question.correct_option);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const percent = question.given_to ? Math.round((100 * question.correct) / question.given_to) : 0;

  const apply = async () => {
    setBusy(true);
    try {
      const result = await CBTService.correctAnswerKey(paperId, question.id,
        choice === '*' ? { award_all: true, reason } : { correct_option: choice, reason });
      toast.success(`Re-marked ${result.remarked_attempts} attempt${result.remarked_attempts === 1 ? '' : 's'}`);
      setEditing(false);
      onChanged(result.marking);
    } catch (e) {
      toast.error(cbtProblems(e)[0]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="border-b border-slate-100 py-3 last:border-0 dark:border-slate-800">
      <div className="flex flex-wrap items-start gap-3">
        <span className="w-8 text-sm font-semibold text-slate-500">Q{question.number}</span>
        <div className="min-w-0 flex-1">
          <SafeHtml html={question.content} className="cbt-content line-clamp-2 text-sm text-slate-800 dark:text-slate-100" />
          <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs">
            {question.options.map((option) => {
              const correct = question.award_all || option.key === question.correct_option;
              return (
                <span key={option.key} title={option.text}
                  className={`rounded px-1.5 py-0.5 ${correct ? 'bg-emerald-100 font-semibold text-emerald-800' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                  {option.key}: {question.option_counts[option.key] ?? 0}
                </span>
              );
            })}
            {question.award_all && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">Everyone gets the marks</span>}
          </div>
        </div>
        <span className={`w-14 text-right text-sm font-semibold ${percent < 30 ? 'text-rose-700' : 'text-slate-700 dark:text-slate-200'}`}
          title={`${question.correct} of ${question.given_to} correct`}>{percent}%</span>
        <button type="button" onClick={() => setEditing((e) => !e)} className={button}>Change answer</button>
      </div>
      {editing && (
        <div className="ml-11 mt-3 flex flex-wrap items-end gap-2 rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
          <label className="text-sm">
            <span className="block text-xs text-slate-500">Correct answer</span>
            <select value={choice} onChange={(e) => setChoice(e.target.value)} className={input}>
              {question.options.map((o) => <option key={o.key} value={o.key}>{o.key}: {o.text.replace(/<[^>]*>/g, '').slice(0, 40)}</option>)}
              <option value="*">Give everyone the marks</option>
            </select>
          </label>
          <label className="min-w-[12rem] flex-1 text-sm">
            <span className="block text-xs text-slate-500">Reason (kept in the record)</span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} className={`${input} w-full`} />
          </label>
          <button type="button" onClick={() => void apply()} disabled={busy} className={primary}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Re-mark everyone
          </button>
        </div>
      )}
    </li>
  );
};

const MarkingPanel: React.FC<Props> = ({ paper, onPaperChanged }) => {
  const [overview, setOverview] = useState<CBTMarkingOverview | null>(null);
  const [targets, setTargets] = useState<CBTResultTargets | null>(null);
  const [marking, setMarking] = useState<number | null>(null);
  const [session, setSession] = useState<string>(paper.result_exam_session ? String(paper.result_exam_session) : '');
  const [component, setComponent] = useState<string>(paper.result_component ? String(paper.result_component) : '');
  const [busy, setBusy] = useState(false);
  const [pushed, setPushed] = useState<CBTPushResults | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    CBTService.marking(paper.id).then(setOverview).catch((e) => setError(cbtProblems(e)[0]));
    CBTService.resultTargets(paper.id).then(setTargets).catch(() => setTargets(null));
  }, [paper.id]);

  useEffect(load, [load]);

  if (marking !== null) {
    return <TextMarking paperId={paper.id} questionId={marking} onBack={() => { setMarking(null); load(); }} onSaved={setOverview} />;
  }
  if (!overview) {
    return error ? <p className="text-sm text-rose-700">{error}</p> : <Loader2 className="mx-auto mt-6 h-6 w-6 animate-spin text-slate-400" />;
  }

  const targetsChanged = session !== String(paper.result_exam_session ?? '') || component !== String(paper.result_component ?? '');

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try { await work(); } catch (e) { setError(cbtProblems(e)[0]); } finally { setBusy(false); }
  };

  const saveTargets = () => run(async () => {
    const updated = await CBTService.updatePaper(paper.id, {
      result_exam_session: session ? Number(session) : null, result_component: component ? Number(component) : null,
    });
    onPaperChanged(updated);
    load();
    toast.success('Results destination saved');
  });

  const push = () => run(async () => {
    const result = await CBTService.pushResults(paper.id);
    setPushed(result);
    load();
  });

  const toggleRelease = () => run(async () => {
    onPaperChanged(await (paper.results_released_at ? CBTService.withholdResults(paper.id) : CBTService.releaseResults(paper.id)));
  });

  const chosenComponent = targets?.components.find((c) => String(c.id) === component);

  return (
    <div className="space-y-5">
      {error && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">{error}</p>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Finished', overview.finished_attempts],
          ['Still writing', overview.in_progress],
          ['Fully marked', overview.fully_marked],
          ['Answers to mark', overview.still_to_mark],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
            <p className="text-xs text-slate-500">{label}</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
          </div>
        ))}
      </div>

      {overview.text.length > 0 && (
        <section className={card}>
          <h3 className="font-semibold text-slate-900 dark:text-white">Typed answers</h3>
          <p className="text-sm text-slate-500">Marked by teachers, one question at a time. A blank answer scores 0 and needs no marking.</p>
          <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
            {overview.text.map((q) => (
              <li key={q.id} className="flex items-center gap-3 py-2.5">
                <span className="w-8 text-sm font-semibold text-slate-500">Q{q.number}</span>
                <SafeHtml html={q.content} className="cbt-content line-clamp-1 min-w-0 flex-1 text-sm text-slate-800 dark:text-slate-100" />
                <span className="text-sm text-slate-600 dark:text-slate-300">{q.marked} / {q.answers} marked</span>
                <button type="button" onClick={() => setMarking(q.id)} className={q.marked < q.answers ? primary : button}>
                  {q.marked < q.answers ? 'Mark' : 'Review'}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {overview.objective.length > 0 && (
        <section className={card}>
          <h3 className="font-semibold text-slate-900 dark:text-white">Objective questions</h3>
          <p className="text-sm text-slate-500">
            Marked automatically. The counts show how many students chose each option. A question most students got wrong
            may have the wrong answer key: correcting it re-marks everyone.
          </p>
          <ul className="mt-2">
            {overview.objective.map((q) => <AnswerKeyRow key={q.id} paperId={paper.id} question={q} onChanged={setOverview} />)}
          </ul>
        </section>
      )}

      <section className={card}>
        <h3 className="font-semibold text-slate-900 dark:text-white">Send scores to results</h3>
        {targets && !targets.supported ? (
          <p className="text-sm text-slate-500">This exam's class level isn't set up for results.</p>
        ) : (
          <>
            <p className="text-sm text-slate-500">
              Each student's score is scaled to the score column's maximum and written to their draft result for this subject.
              Results already approved are left alone.
            </p>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <label className="text-sm">
                <span className="block text-xs text-slate-500">Exam session</span>
                <select value={session} onChange={(e) => setSession(e.target.value)} className={`${input} min-w-[12rem]`}>
                  <option value="">Choose...</option>
                  {targets?.exam_sessions.map((s) => <option key={s.id} value={s.id}>{s.name} ({[s.term, s.academic_session].filter(Boolean).join(', ')})</option>)}
                </select>
              </label>
              <label className="text-sm">
                <span className="block text-xs text-slate-500">Score column{targets?.education_level ? ` (${targets.education_level})` : ''}</span>
                <select value={component} onChange={(e) => setComponent(e.target.value)} className={`${input} min-w-[10rem]`}>
                  <option value="">Choose...</option>
                  {targets?.components.map((c) => <option key={c.id} value={c.id}>{c.name} (out of {Number(c.max_score)})</option>)}
                </select>
              </label>
              {targetsChanged ? (
                <button type="button" onClick={() => void saveTargets()} disabled={busy} className={button}>Save choice</button>
              ) : (
                <button type="button" onClick={() => void push()} disabled={busy || !session || !component || overview.finished_attempts === 0} className={primary}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send scores
                </button>
              )}
            </div>
            {chosenComponent && overview.fully_marked < overview.finished_attempts && (
              <p className="mt-2 text-xs text-amber-700">{overview.finished_attempts - overview.fully_marked} student(s) still have answers to mark and will be skipped.</p>
            )}
            {overview.results.pushed_at && (
              <p className="mt-2 text-xs text-slate-500">
                Last sent {new Date(overview.results.pushed_at).toLocaleString()}{overview.results.pushed_by ? ` by ${overview.results.pushed_by}` : ''}.
              </p>
            )}
            {pushed && (
              <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800">
                <p className="font-medium text-slate-800 dark:text-slate-100">Sent {pushed.pushed} score{pushed.pushed === 1 ? '' : 's'}.</p>
                {pushed.skipped.length > 0 && (
                  <ul className="mt-1 list-disc pl-5 text-slate-600 dark:text-slate-300">
                    {pushed.skipped.map((s) => <li key={s.student}>{s.student}: {s.reason}</li>)}
                  </ul>
                )}
              </div>
            )}
          </>
        )}
      </section>

      <section className={card}>
        <h3 className="font-semibold text-slate-900 dark:text-white">Students seeing their scores</h3>
        {paper.result_release === 'manual' ? (
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {paper.results_released_at
                ? `Released ${new Date(paper.results_released_at).toLocaleString()}. Students see their score once their paper is fully marked.`
                : 'Not released. Students see their score only after you release it.'}
            </p>
            <button type="button" onClick={() => void toggleRelease()} disabled={busy} className={paper.results_released_at ? button : primary}>
              {paper.results_released_at ? 'Hide scores again' : 'Release scores'}
            </button>
          </div>
        ) : (
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            {paper.result_release === 'on_submit'
              ? 'Students see their score as soon as their paper is fully marked.'
              : 'Students see their score once the exam window has closed and their paper is fully marked.'}{' '}
            Change this in Settings.
          </p>
        )}
      </section>
    </div>
  );
};

export default MarkingPanel;
