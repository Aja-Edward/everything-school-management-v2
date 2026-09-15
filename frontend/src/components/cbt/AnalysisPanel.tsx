import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, ChevronDown, ChevronRight, Loader2, Table2, BarChart3 } from 'lucide-react';
import { toast } from 'react-toastify';
import CBTService, { CBTAnalysis, CBTAnalysisItem, CBTAnalysisFlagCode, cbtProblems } from '@/services/CBTService';
import SafeHtml from './student/SafeHtml';

const FLAG_LABEL: Record<CBTAnalysisFlagCode, (option?: string) => string> = {
  very_hard: () => 'Very hard',
  very_easy: () => 'Very easy',
  negative_discrimination: () => 'Weaker students do better',
  weak_discrimination: () => "Doesn't separate stronger from weaker",
  distractor_draws_strong: (o) => `Option ${o} draws strong students`,
  unused_option: (o) => `Option ${o} never chosen`,
};

const DIFFICULTY_LABEL: Record<string, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

const KIND_LABEL: Record<CBTAnalysisItem['kind'], string> = {
  objective: 'Objective',
  true_false: 'True or false',
  multiple: 'Choose all',
  numeric: 'Number',
  text: 'Typed',
};

const percent = (share: number | null | undefined) => (share === null || share === undefined ? '–' : `${Math.round(share * 100)}%`);
const seconds = (s: number | null) => (s === null ? '–' : s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`);

/** Chart colours: one series, validated against both surfaces (see the dataviz palette). */
const VIZ_STYLE = `
  .cbt-viz { --viz-series: #2a78d6; --viz-track: #cde2fb; --viz-grid: #e1e0d9; --viz-axis: #c3c2b7; }
  .dark .cbt-viz { --viz-series: #3987e5; --viz-track: #1c3557; --viz-grid: #334155; --viz-axis: #475569; }
`;

const StatTile: React.FC<{ label: string; value: string; note?: string }> = ({ label, value, note }) => (
  <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
    <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
    <p className="text-2xl font-semibold text-slate-900 dark:text-white">{value}</p>
    {note && <p className="mt-0.5 text-[11px] leading-snug text-slate-500 dark:text-slate-400">{note}</p>}
  </div>
);

const Distribution: React.FC<{ bands: CBTAnalysis['summary']['distribution'] }> = ({ bands }) => {
  const [asTable, setAsTable] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const most = Math.max(1, ...bands.map((b) => b.students));
  // A clean top tick: the smallest of 1, 2, 5 × 10ⁿ at or above the tallest column.
  const top = useMemo(() => {
    const magnitude = 10 ** Math.floor(Math.log10(most));
    return [1, 2, 5, 10].map((m) => m * magnitude).find((v) => v >= most) ?? most;
  }, [most]);

  return (
    <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">Score distribution</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">Students by the share of the paper's marks they were awarded</p>
        </div>
        <button type="button" onClick={() => setAsTable((t) => !t)}
          className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">
          {asTable ? <BarChart3 className="h-3.5 w-3.5" /> : <Table2 className="h-3.5 w-3.5" />} {asTable ? 'Chart' : 'Table'}
        </button>
      </div>

      {asTable ? (
        <table className="mt-3 w-full text-sm">
          <thead><tr className="text-left text-xs text-slate-500"><th className="py-1 font-medium">Score</th><th className="py-1 text-right font-medium">Students</th></tr></thead>
          <tbody className="tabular-nums text-slate-800 dark:text-slate-200">
            {bands.map((b) => <tr key={b.from} className="border-t border-slate-100 dark:border-slate-800"><td className="py-1">{b.from}–{b.to}%</td><td className="py-1 text-right">{b.students}</td></tr>)}
          </tbody>
        </table>
      ) : (
        <div className="cbt-viz mt-4">
          <div className="grid grid-cols-[2rem_1fr] gap-x-2">
            <div className="relative h-36 text-right text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
              <span className="absolute right-0 top-0 -translate-y-1/2">{top}</span>
              <span className="absolute bottom-0 right-0 translate-y-1/2">0</span>
            </div>
            <div className="relative h-36">
              <div className="absolute inset-x-0 top-0 border-t" style={{ borderColor: 'var(--viz-grid)' }} />
              <div className="absolute inset-x-0 bottom-0 border-t" style={{ borderColor: 'var(--viz-axis)' }} />
              <div className="absolute inset-0 flex items-end">
                {bands.map((band, i) => (
                  <button
                    key={band.from}
                    type="button"
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(i)}
                    onBlur={() => setHover(null)}
                    aria-label={`${band.students} student${band.students === 1 ? '' : 's'} scored ${band.from}–${band.to}%`}
                    className="relative flex h-full flex-1 items-end justify-center focus:outline-none"
                  >
                    {band.students > 0 && (
                      <span className="block w-full max-w-[24px] rounded-t" style={{
                        height: `${(band.students / top) * 100}%`,
                        background: 'var(--viz-series)',
                        opacity: hover === null || hover === i ? 1 : 0.55,
                      }} />
                    )}
                    {hover === i && (
                      <span className="pointer-events-none absolute bottom-full z-10 mb-1 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-xs text-white shadow dark:bg-white dark:text-slate-900">
                        <strong>{band.students}</strong> student{band.students === 1 ? '' : 's'} · {band.from}–{band.to}%
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
            <div />
            <div className="mt-1 flex text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
              {bands.map((b) => <span key={b.from} className="flex-1 text-center">{b.from}</span>)}
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

const FacilityMeter: React.FC<{ value: number | null }> = ({ value }) => (
  <div className="cbt-viz flex items-center gap-2">
    <div className="h-1.5 w-16 overflow-hidden rounded-full" style={{ background: 'var(--viz-track)' }}>
      {value !== null && <div className="h-full rounded-full" style={{ width: `${value * 100}%`, background: 'var(--viz-series)' }} />}
    </div>
    <span className="w-9 text-right tabular-nums text-slate-800 dark:text-slate-200">{percent(value)}</span>
  </div>
);

/** The answers a numeric question got most often. A popular wrong answer can mean a wrong key. */
const CommonAnswers: React.FC<{ item: CBTAnalysisItem }> = ({ item }) => (
  <table className="w-full text-sm">
    <thead>
      <tr className="text-left text-xs text-slate-500">
        <th className="py-1 font-medium">Answer given{item.unit ? ` (${item.unit})` : ''}</th>
        <th className="py-1 text-right font-medium">Students</th>
      </tr>
    </thead>
    <tbody className="tabular-nums text-slate-800 dark:text-slate-200">
      <tr className="border-t border-slate-100 dark:border-slate-700">
        <td className="py-1.5 text-slate-600 dark:text-slate-300" colSpan={2}>Correct answer: <strong>{item.key}</strong></td>
      </tr>
      {(item.common_answers ?? []).map((common) => (
        <tr key={common.answer} className="border-t border-slate-100 dark:border-slate-700">
          <td className="py-1.5">
            <span className="flex items-center gap-2">
              {common.answer}
              {common.correct && <span className="flex items-center gap-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400"><Check className="h-3.5 w-3.5" /> Counts as right</span>}
            </span>
          </td>
          <td className="py-1.5 text-right">{common.students}</td>
        </tr>
      ))}
      <tr className="border-t border-slate-100 text-slate-500 dark:border-slate-700">
        <td className="py-1.5">Left blank</td>
        <td className="py-1.5 text-right">{item.omitted ?? 0}</td>
      </tr>
    </tbody>
  </table>
);

const OptionBreakdown: React.FC<{ item: CBTAnalysisItem }> = ({ item }) => (
  <table className="w-full text-sm">
    <thead>
      <tr className="text-left text-xs text-slate-500">
        <th className="py-1 font-medium">Option{item.kind === 'multiple' ? ' (each tick counts)' : ''}</th>
        <th className="py-1 text-right font-medium">Everyone</th>
        <th className="py-1 text-right font-medium">Top 27%</th>
        <th className="py-1 text-right font-medium">Bottom 27%</th>
      </tr>
    </thead>
    <tbody className="tabular-nums text-slate-800 dark:text-slate-200">
      {item.options?.map((option) => {
        const correct = item.award_all || !!item.correct_option?.includes(option.key);
        return (
          <tr key={option.key} className="border-t border-slate-100 dark:border-slate-700">
            <td className="py-1.5">
              <span className="flex items-center gap-2">
                <span className="font-semibold">{option.key}</span>
                <SafeHtml html={option.text} as="span" className="cbt-content line-clamp-1 text-slate-600 dark:text-slate-300" />
                {correct && <span className="flex items-center gap-0.5 whitespace-nowrap text-xs font-medium text-emerald-700 dark:text-emerald-400"><Check className="h-3.5 w-3.5" /> Correct</span>}
              </span>
            </td>
            <td className="py-1.5 text-right">{item.option_counts?.[option.key] ?? 0}</td>
            <td className="py-1.5 text-right">{item.top_group_counts?.[option.key] ?? 0}</td>
            <td className="py-1.5 text-right">{item.bottom_group_counts?.[option.key] ?? 0}</td>
          </tr>
        );
      })}
      <tr className="border-t border-slate-100 text-slate-500 dark:border-slate-700">
        <td className="py-1.5">Left blank</td>
        <td className="py-1.5 text-right">{item.omitted ?? 0}</td>
        <td colSpan={2} />
      </tr>
    </tbody>
  </table>
);

const AnalysisPanel: React.FC<{ paperId: number }> = ({ paperId }) => {
  const [data, setData] = useState<CBTAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [chosen, setChosen] = useState<number[]>([]);
  const [applying, setApplying] = useState(false);

  const load = () => {
    CBTService.analysis(paperId).then(setData).catch((e) => setError(cbtProblems(e)[0]));
  };
  useEffect(load, [paperId]);

  if (!data) {
    return error ? <p className="text-sm text-rose-700">{error}</p> : <Loader2 className="mx-auto mt-6 h-6 w-6 animate-spin text-slate-400" />;
  }
  if (data.students === 0) {
    return <p className="py-10 text-center text-sm text-slate-500">No student has finished this paper yet.</p>;
  }

  const { summary } = data;
  const rows = data.questions.filter((q) => !onlyFlagged || q.flags.length > 0);
  const suggestable = data.questions.filter((q) => q.bank?.suggested_difficulty && q.bank.suggested_difficulty !== q.bank.difficulty);

  const apply = async () => {
    setApplying(true);
    try {
      const result = await CBTService.applyBankDifficulty(paperId, chosen);
      toast.success(`Updated ${result.updated.length} question${result.updated.length === 1 ? '' : 's'} in the bank`);
      result.skipped.forEach((s) => toast.info(`Question not updated: ${s.reason}`));
      setChosen([]);
      load();
    } catch (e) {
      toast.error(cbtProblems(e)[0]);
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="space-y-5">
      <style>{VIZ_STYLE}</style>

      {!data.enough_students && (
        <p className="flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
          With fewer than {data.min_students} students, how well each question separates stronger from weaker students isn't worked out: the numbers would mean little.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Students" value={String(data.students)} note={summary.fully_marked < data.students ? `${summary.fully_marked} fully marked` : undefined} />
        <StatTile label="Average" value={summary.mean === null ? '–' : `${summary.mean}%`} />
        <StatTile label="Median" value={summary.median === null ? '–' : `${summary.median}%`} />
        <StatTile label="Highest" value={summary.highest === null ? '–' : `${summary.highest}%`} />
        <StatTile label="Lowest" value={summary.lowest === null ? '–' : `${summary.lowest}%`} />
        <StatTile label="Reliability (KR-20)" value={summary.kr20 === null ? '–' : summary.kr20.toFixed(2)}
          note={summary.kr20 === null ? summary.kr20_note : summary.kr20 >= 0.7 ? 'Consistent' : 'Low: questions pull in different directions'} />
      </div>

      <Distribution bands={summary.distribution} />

      <section className="rounded-xl border border-slate-200 dark:border-slate-700">
        <div className="flex flex-wrap items-center justify-between gap-2 p-4 pb-2">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">Questions</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">Open a question to see how each option was chosen.</p>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input type="checkbox" checked={onlyFlagged} onChange={(e) => setOnlyFlagged(e.target.checked)} />
            Only questions worth a look
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-y border-slate-200 bg-slate-50 text-left text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800/60">
              <tr>
                <th className="px-4 py-2 font-medium">Question</th>
                <th className="px-2 py-2 font-medium" title="The average share of the question's marks students earned: for a question marked right or wrong, the share who got it right.">Got it right</th>
                <th className="px-2 py-2 text-right font-medium" title="Top 27% minus bottom 27%. 0.3 or more is good; below 0 needs a look.">Separates</th>
                <th className="px-2 py-2 text-right font-medium">Time</th>
                <th className="px-2 py-2 font-medium">Worth a look</th>
                <th className="px-4 py-2 font-medium">Bank difficulty</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => {
                const expanded = open === item.id;
                const canSuggest = !!item.bank?.suggested_difficulty && item.bank.suggested_difficulty !== item.bank.difficulty;
                return (
                  <React.Fragment key={item.id}>
                    <tr className="border-b border-slate-100 align-top dark:border-slate-800">
                      <td className="px-4 py-2.5">
                        <button type="button" onClick={() => setOpen(expanded ? null : item.id)} disabled={item.kind === 'text'}
                          className="flex w-full items-start gap-1.5 text-left disabled:cursor-default">
                          {item.kind !== 'text'
                            ? (expanded ? <ChevronDown className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" /> : <ChevronRight className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" />)
                            : <span className="w-4" />}
                          <span className="min-w-0">
                            <span className="text-xs font-semibold text-slate-500">{KIND_LABEL[item.kind]} {item.number}{item.partial_credit ? ', part marks' : ''}</span>
                            <SafeHtml html={item.content} className="cbt-content line-clamp-2 text-slate-800 dark:text-slate-100" />
                          </span>
                        </button>
                      </td>
                      <td className="px-2 py-2.5"><FacilityMeter value={item.facility} /></td>
                      <td className="px-2 py-2.5 text-right tabular-nums text-slate-800 dark:text-slate-200">
                        {item.discrimination === null ? '–' : item.discrimination.toFixed(2)}
                      </td>
                      <td className="px-2 py-2.5 text-right tabular-nums text-slate-600 dark:text-slate-300">{seconds(item.median_seconds)}</td>
                      <td className="px-2 py-2.5">
                        <div className="flex flex-col gap-1">
                          {item.flags.map((flag) => (
                            <span key={`${flag.code}${flag.option ?? ''}`} className="flex items-center gap-1 text-xs text-amber-800 dark:text-amber-300">
                              <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" /> {FLAG_LABEL[flag.code](flag.option)}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-600 dark:text-slate-300">
                        {!item.bank ? '–' : (
                          <label className={`flex items-center gap-2 ${canSuggest ? 'cursor-pointer' : ''}`}>
                            {canSuggest && (
                              <input type="checkbox" checked={chosen.includes(item.id)}
                                onChange={(e) => setChosen((c) => (e.target.checked ? [...c, item.id] : c.filter((id) => id !== item.id)))} />
                            )}
                            <span>
                              {DIFFICULTY_LABEL[item.bank.difficulty] ?? item.bank.difficulty}
                              {canSuggest && <> → <strong className="text-slate-900 dark:text-white">{DIFFICULTY_LABEL[item.bank.suggested_difficulty!]}</strong></>}
                            </span>
                          </label>
                        )}
                      </td>
                    </tr>
                    {expanded && (
                      <tr className="border-b border-slate-100 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-800/40">
                        <td colSpan={6} className="px-10 py-3">{item.kind === 'numeric' ? <CommonAnswers item={item} /> : <OptionBreakdown item={item} />}</td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              {rows.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">Nothing to flag.</td></tr>}
            </tbody>
          </table>
        </div>
        {suggestable.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 p-4 dark:border-slate-700">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {suggestable.length} question-bank question{suggestable.length === 1 ? '' : 's'} performed differently from their difficulty rating.
            </p>
            <button type="button" onClick={() => void apply()} disabled={!chosen.length || applying}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
              {applying && <Loader2 className="h-4 w-4 animate-spin" />} Update {chosen.length || ''} rating{chosen.length === 1 ? '' : 's'} in the bank
            </button>
          </div>
        )}
        <p className="border-t border-slate-200 p-4 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
          <strong>Got it right</strong>: for a typed question, or one giving part marks, the average share of its marks awarded.{' '}
          <strong>Separates</strong>: how much more often the top 27% of students got it right than the bottom 27%. Around 0.3 or
          more is good; near 0 or below usually means the question is ambiguous or its answer key is wrong.{' '}
          <strong>Time</strong>: the median time students had it on screen.
        </p>
      </section>
    </div>
  );
};

export default AnalysisPanel;
