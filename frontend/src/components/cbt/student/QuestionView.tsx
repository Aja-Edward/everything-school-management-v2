import React from 'react';
import { CBTAnswer, CBTPart, CBTQuestion } from '@/services/StudentCBTService';
import SafeHtml from './SafeHtml';

export const OPTION_LETTERS = 'ABCDEFGHIJ';

interface Props {
  question: CBTQuestion;
  total: number;
  answer?: CBTAnswer;
  sectionTitle?: string;
  sectionInstructions?: string;
  fontSize: string;
  disabled?: boolean;
  onChoose: (optionKey: string) => void;
  onType: (text: string) => void;
}

const marksLabel = (marks: string | number | undefined) => {
  const n = Number(marks);
  return n ? `${n} mark${n === 1 ? '' : 's'}` : '';
};

const Parts: React.FC<{ parts?: CBTPart[]; depth?: number }> = ({ parts, depth = 0 }) => {
  if (!parts?.length) return null;
  const label = (i: number) => (depth === 0 ? `(${String.fromCharCode(97 + i)})` : `(${['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii'][i] ?? i + 1})`);
  return (
    <ol className="mt-3 space-y-2">
      {parts.map((part, i) => (
        <li key={i} className="grid grid-cols-[2.5em_1fr] gap-x-2">
          <span className="font-semibold">{label(i)}</span>
          <div>
            <SafeHtml html={part.question} className="cbt-content inline" as="div" />
            {part.marks ? <span className="ml-2 text-xs text-slate-500">[{marksLabel(part.marks)}]</span> : null}
            <Parts parts={part.parts} depth={depth + 1} />
          </div>
        </li>
      ))}
    </ol>
  );
};

/**
 * One question as the student answers it. Options are lettered by where they
 * sit on this student's screen, not by their key: after shuffling, the
 * student's "A" may be another student's "C".
 */
const QuestionView: React.FC<Props> = ({
  question, total, answer, sectionTitle, sectionInstructions, fontSize, disabled, onChoose, onType,
}) => (
  <div style={{ fontSize }} className="text-slate-900 dark:text-slate-100">
    {sectionTitle && (
      <div className="mb-4 rounded-lg bg-indigo-50 px-4 py-2 dark:bg-indigo-900/30">
        <p className="text-[0.8em] font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">{sectionTitle}</p>
        {sectionInstructions && <p className="mt-0.5 text-[0.85em] text-indigo-900 dark:text-indigo-200">{sectionInstructions}</p>}
      </div>
    )}

    <div className="mb-3 flex items-baseline justify-between gap-3 text-[0.85em] text-slate-500 dark:text-slate-400">
      <span className="font-semibold text-slate-700 dark:text-slate-200">Question {question.number} of {total}</span>
      <span>{marksLabel(question.marks)}</span>
    </div>

    <SafeHtml html={question.content} className="cbt-content leading-relaxed" />
    {question.image_url && (
      <img src={question.image_url} alt="" className="mt-3 max-h-80 max-w-full rounded border border-slate-200" />
    )}

    {question.kind === 'objective' ? (
      <div className="mt-5 space-y-2.5" role="radiogroup" aria-label={`Options for question ${question.number}`}>
        {(question.options ?? []).map((option, index) => {
          const selected = answer?.selected_option === option.key;
          return (
            <button
              key={option.key}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => onChoose(selected ? '' : option.key)}
              className={`flex w-full items-start gap-3 rounded-xl border-2 px-4 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                selected
                  ? 'border-indigo-600 bg-indigo-50 dark:border-indigo-400 dark:bg-indigo-900/40'
                  : 'border-slate-200 bg-white hover:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-slate-500'
              }`}
            >
              <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border-2 text-[0.85em] font-bold ${
                selected ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-400 text-slate-600 dark:text-slate-300'
              }`}>
                {OPTION_LETTERS[index]}
              </span>
              <SafeHtml html={option.text} className="cbt-content min-w-0 flex-1 pt-1" />
            </button>
          );
        })}
        <p className="pt-1 text-[0.75em] text-slate-500 dark:text-slate-400">
          Click an option again to clear it. Keyboard: press the letter to choose.
        </p>
      </div>
    ) : (
      <div className="mt-4">
        <Parts parts={question.parts} />
        <label htmlFor={`answer-${question.id}`} className="mt-5 block text-[0.85em] font-medium text-slate-700 dark:text-slate-300">
          Your answer
        </label>
        <textarea
          id={`answer-${question.id}`}
          value={answer?.text_answer ?? ''}
          disabled={disabled}
          onChange={(e) => onType(e.target.value)}
          rows={10}
          maxLength={20000}
          spellCheck={false}
          className="mt-1 w-full rounded-xl border-2 border-slate-200 bg-white p-3 leading-relaxed focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800"
        />
        <p className="text-right text-[0.75em] text-slate-500">{(answer?.text_answer ?? '').length.toLocaleString()} / 20,000</p>
      </div>
    )}
  </div>
);

export default QuestionView;
