import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Shuffle } from 'lucide-react';
import { toast } from 'react-toastify';
import CBTService, { CBTBankQuestionType, CBTBankSummary, cbtProblems } from '@/services/CBTService';

interface Props {
  paperId: number;
  /** Called after questions are added, so the parent can drop stale checks and previews. */
  onDrawn: (added: number) => void;
}

const topicKey = (topic: string) => topic.trim().replace(/\s+/g, ' ').toLowerCase();

const BankDrawPanel: React.FC<Props> = ({ paperId, onDrawn }) => {
  const [questionType, setQuestionType] = useState<CBTBankQuestionType>('objective');
  const [anyGradeLevel, setAnyGradeLevel] = useState(false);
  const [summary, setSummary] = useState<CBTBankSummary | null>(null);
  const [topics, setTopics] = useState<string[]>([]);
  const [difficulties, setDifficulties] = useState<string[]>([]);
  const [count, setCount] = useState(10);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setProblems([]);
    CBTService.getBankSummary(paperId, questionType, anyGradeLevel)
      .then((result) => {
        if (cancelled) return;
        setSummary(result);
        setTopics([]);
        setDifficulties([]);
      })
      .catch((error) => !cancelled && setProblems(cbtProblems(error)))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [paperId, questionType, anyGradeLevel, reloadKey]);

  const available = summary?.available ?? [];

  // Topics grouped however they were capitalised; the first spelling seen is shown.
  const topicOptions = useMemo(() => {
    const byKey = new Map<string, { key: string; label: string; raw: string; count: number }>();
    // Every topic stays listed, counting only the chosen difficulties, so a chosen topic never vanishes.
    for (const entry of available) {
      const key = topicKey(entry.topic);
      const option = byKey.get(key) ?? { key, label: entry.topic || 'No topic', raw: entry.topic, count: 0 };
      if (!difficulties.length || difficulties.includes(entry.difficulty)) option.count += entry.count;
      byKey.set(key, option);
    }
    return [...byKey.values()];
  }, [available, difficulties]);

  const difficultyOptions = useMemo(() => {
    const byCode = new Map<string, { code: string; label: string; count: number }>();
    for (const entry of available) {
      const option = byCode.get(entry.difficulty) ?? { code: entry.difficulty, label: entry.difficulty_name, count: 0 };
      if (!topics.length || topics.includes(topicKey(entry.topic))) option.count += entry.count;
      byCode.set(entry.difficulty, option);
    }
    return [...byCode.values()];
  }, [available, topics]);

  const matching = available
    .filter((e) => !topics.length || topics.includes(topicKey(e.topic)))
    .filter((e) => !difficulties.length || difficulties.includes(e.difficulty))
    .reduce((sum, e) => sum + e.count, 0);

  const toggleIn = (list: string[], value: string) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const refusal = summary?.edit_refusal;
  const wanted = Math.min(count, matching);

  const drawQuestions = async () => {
    setBusy(true);
    setProblems([]);
    try {
      // Topics go back as the server spelled them; it matches them however they're capitalised.
      const topicLabels = topicOptions.filter((t) => topics.includes(t.key)).map((t) => t.raw);
      const result = await CBTService.drawFromBank(paperId, {
        question_type: questionType, count: wanted, topics: topicLabels, difficulties, any_grade_level: anyGradeLevel,
      });
      toast.success(`Added ${result.added} question${result.added === 1 ? '' : 's'} to the exam`);
      onDrawn(result.added);
      setReloadKey((k) => k + 1);
    } catch (error) {
      setProblems(cbtProblems(error));
    } finally {
      setBusy(false);
    }
  };

  const chip = (selected: boolean) =>
    `rounded-full border px-3 py-1 text-sm transition-colors disabled:opacity-50 ${
      selected
        ? 'border-indigo-600 bg-indigo-600 text-white'
        : 'border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700'
    }`;

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Add questions picked at random from the question bank. They are added to the exam itself, so they
        also appear in the exam editor and on the printed paper. A question already on the exam is never
        added again.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border border-slate-300 p-0.5 dark:border-slate-600">
          {(['objective', 'theory'] as CBTBankQuestionType[]).map((type) => (
            <button key={type} onClick={() => setQuestionType(type)}
              className={`rounded-md px-3 py-1.5 text-sm capitalize ${questionType === type ? 'bg-slate-800 text-white' : 'text-slate-600 dark:text-slate-300'}`}>
              {type}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
          <input type="checkbox" checked={anyGradeLevel} onChange={(e) => setAnyGradeLevel(e.target.checked)} />
          Include questions tagged for other classes
        </label>
      </div>

      {summary && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {summary.subject}{anyGradeLevel ? ', any class' : `, ${summary.grade_level}`}: your questions and those
          shared by other teachers.
        </p>
      )}

      {refusal && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" /> {refusal}
        </div>
      )}

      {problems.length > 0 && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-900/30 dark:text-rose-300">
          {problems.map((p) => <p key={p}>{p}</p>)}
        </div>
      )}

      {loading && <p className="py-6 text-center text-sm text-slate-500">Loading the question bank...</p>}

      {!loading && summary && available.length === 0 && (
        <p className="rounded-lg border border-dashed border-slate-300 py-8 text-center text-sm text-slate-500 dark:border-slate-600">
          No {questionType} questions in the bank can be added to this exam.
        </p>
      )}

      {!loading && available.length > 0 && (
        <>
          <div>
            <h4 className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">Topics <span className="font-normal text-slate-500">(none selected means all)</span></h4>
            <div className="flex flex-wrap gap-2">
              {topicOptions.map((topic) => (
                <button key={topic.key} disabled={busy} className={chip(topics.includes(topic.key))}
                  onClick={() => setTopics((list) => toggleIn(list, topic.key))}>
                  {topic.label} <span className="opacity-70">{topic.count}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <h4 className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">Difficulty <span className="font-normal text-slate-500">(none selected means all)</span></h4>
            <div className="flex flex-wrap gap-2">
              {difficultyOptions.map((difficulty) => (
                <button key={difficulty.code} disabled={busy} className={chip(difficulties.includes(difficulty.code))}
                  onClick={() => setDifficulties((list) => toggleIn(list, difficulty.code))}>
                  {difficulty.label} <span className="opacity-70">{difficulty.count}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3 border-t border-slate-200 pt-4 dark:border-slate-700">
            <div>
              <label htmlFor="cbt-draw-count" className="block text-sm font-medium text-slate-700 dark:text-slate-300">How many</label>
              <input id="cbt-draw-count" type="number" min={1} max={matching} value={count} disabled={busy}
                onChange={(e) => setCount(Math.max(1, Number(e.target.value) || 1))}
                className="mt-1 w-24 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-white" />
            </div>
            <p className="pb-2 text-sm text-slate-500 dark:text-slate-400">{matching} match</p>
            <button onClick={drawQuestions} disabled={busy || !!refusal || matching === 0}
              className="ml-auto flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
              <Shuffle className="h-4 w-4" />
              Add {wanted} {questionType} question{wanted === 1 ? '' : 's'}
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default BankDrawPanel;
