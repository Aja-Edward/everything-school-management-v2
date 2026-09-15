/**
 * How one objective question is answered, and its correct answer.
 *
 * The editors differ in how they edit option text (rich text for admins, one
 * line for teachers), so they pass `renderOption`. Everything else about the
 * answer type is the same wherever a question is written.
 */

import React from 'react';
import {
  ANSWER_TYPES, AnswerType, ObjectiveAnswer, OPTION_LETTERS, answerProblem, answerTypeOf, parseKeys, trueFalseKey,
  withAnswerType,
} from '@/utils/objectiveQuestions';

type Letter = typeof OPTION_LETTERS[number];

interface Props<T extends ObjectiveAnswer> {
  question: T;
  /** The whole question with the change made. */
  onChange: (question: T) => void;
  renderOption: (letter: Letter) => React.ReactNode;
  /** Classes for the box around the options, e.g. a grid. */
  optionsClassName?: string;
  /** Show what is wrong with the answer, once the teacher has had a chance to fill it in. */
  showProblems?: boolean;
}

const field = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white';
const small = 'block text-xs font-medium text-slate-600 dark:text-slate-300';

const strip = (html: string | undefined) => (html ?? '').replace(/<[^>]*>/g, '').trim();

function ObjectiveAnswerFields<T extends ObjectiveAnswer>({
  question, onChange, renderOption, optionsClassName = 'grid grid-cols-1 gap-3 sm:grid-cols-2', showProblems = true,
}: Props<T>) {
  const type = answerTypeOf(question);
  const answer = String(question.correctAnswer ?? '');
  const set = (patch: Partial<ObjectiveAnswer>) => onChange({ ...question, ...patch });
  const problem = showProblems ? answerProblem(question) : null;
  const hint = ANSWER_TYPES.find((t) => t.value === type)?.hint;
  const optionLabel = (letter: Letter) => {
    const text = strip(question[`option${letter}`]);
    return text ? `${letter}: ${text.length > 40 ? `${text.slice(0, 40)}…` : text}` : `${letter} (empty)`;
  };

  return (
    <div className="space-y-3">
      <div>
        <span className={small}>Answer type</span>
        <div className="mt-1 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Answer type">
          {ANSWER_TYPES.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={type === option.value}
              onClick={() => onChange(withAnswerType(question, option.value as AnswerType))}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                type === option.value
                  ? 'border-blue-600 bg-blue-600 text-white'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        {hint && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
      </div>

      {(type === 'single' || type === 'multiple') && (
        <div className={optionsClassName}>
          {OPTION_LETTERS.map((letter) => <React.Fragment key={letter}>{renderOption(letter)}</React.Fragment>)}
        </div>
      )}

      {type === 'single' && (
        <label className="block">
          <span className={small}>Correct answer</span>
          <select value={answer.toUpperCase()} onChange={(e) => set({ correctAnswer: e.target.value })} className={`${field} mt-1`}>
            <option value="">Choose the correct answer</option>
            {OPTION_LETTERS.map((letter) => <option key={letter} value={letter}>{optionLabel(letter)}</option>)}
          </select>
        </label>
      )}

      {type === 'multiple' && (
        <fieldset>
          <legend className={small}>Correct answers: tick every one that is right</legend>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1.5">
            {OPTION_LETTERS.map((letter) => {
              const keys = parseKeys(answer);
              const ticked = keys.includes(letter);
              return (
                <label key={letter} className="flex items-center gap-1.5 text-sm text-slate-800 dark:text-slate-100">
                  <input
                    type="checkbox"
                    checked={ticked}
                    onChange={() => set({ correctAnswer: (ticked ? keys.filter((k) => k !== letter) : [...keys, letter]).sort().join(',') })}
                  />
                  {optionLabel(letter)}
                </label>
              );
            })}
          </div>
          <label className="mt-2 flex items-start gap-2 text-sm text-slate-700 dark:text-slate-200">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={!!question.partialCredit}
              onChange={(e) => set({ partialCredit: e.target.checked })}
            />
            <span>
              Give part marks
              <span className="block text-xs text-slate-500 dark:text-slate-400">
                A share of the marks for each right option ticked, less one for each wrong one. Without this, only a
                fully right answer earns marks.
              </span>
            </span>
          </label>
        </fieldset>
      )}

      {type === 'true_false' && (
        <fieldset>
          <legend className={small}>Correct answer</legend>
          <div className="mt-1 flex gap-2">
            {[['A', 'True'], ['B', 'False']].map(([key, label]) => (
              <label key={key}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2 text-sm ${
                  trueFalseKey(question) === key
                    ? 'border-blue-600 bg-blue-50 text-blue-900 dark:bg-blue-900/30 dark:text-blue-100'
                    : 'border-slate-300 text-slate-700 dark:border-slate-600 dark:text-slate-200'
                }`}>
                <input type="radio" checked={trueFalseKey(question) === key} onChange={() => set({ correctAnswer: key })} />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {type === 'numeric' && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="block">
            <span className={small}>Correct answer</span>
            <input value={answer} onChange={(e) => set({ correctAnswer: e.target.value })} inputMode="decimal"
              placeholder="e.g. 12.5 or 3/4" maxLength={50} className={`${field} mt-1`} />
          </label>
          <label className="block">
            <span className={small}>Allowed either side</span>
            <input value={String(question.tolerance ?? '')} onChange={(e) => set({ tolerance: e.target.value })}
              inputMode="decimal" placeholder="0 (exact)" maxLength={20} className={`${field} mt-1`} />
          </label>
          <label className="block">
            <span className={small}>Unit (optional)</span>
            <input value={question.unit ?? ''} onChange={(e) => set({ unit: e.target.value })}
              placeholder="e.g. cm" maxLength={30} className={`${field} mt-1`} />
          </label>
          <p className="text-xs text-slate-500 sm:col-span-3 dark:text-slate-400">
            Students may write the number as a decimal, a fraction or with commas: 0.75, 3/4 and 1,200 are all read.
            With 0.1 allowed either side, an answer of 12.5 accepts anything from 12.4 to 12.6.
          </p>
        </div>
      )}

      {problem && <p className="text-xs font-medium text-amber-700 dark:text-amber-300">{problem}</p>}
    </div>
  );
}

export default ObjectiveAnswerFields;
