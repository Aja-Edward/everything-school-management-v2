import React from 'react';
import { AlertTriangle, Check } from 'lucide-react';
import { CBTAnswer, CBTPart, CBTQuestion, CHOICE_KINDS } from '@/services/StudentCBTService';
import { parseNumber } from '@/utils/objectiveQuestions';
import SafeHtml from './SafeHtml';

export const OPTION_LETTERS = 'ABCDEFGHIJ';

/** A choose-all-that-apply answer with `key` ticked or unticked: every key ticked, in order. */
export const toggleKey = (selected: string, key: string) => {
  const keys = new Set(selected.split('').filter(Boolean));
  if (keys.has(key)) keys.delete(key);
  else keys.add(key);
  return [...keys].sort().join('');
};

export const isChoice = (question: CBTQuestion) => CHOICE_KINDS.includes(question.kind);

const HINTS: Record<string, string> = {
  objective: 'Click an option again to clear it. Keyboard: press the letter to choose.',
  true_false: 'Choose True or False. Click it again to clear it. Keyboard: press A or B.',
  multiple: 'Tick every option that is right. Click an option again to untick it. Keyboard: press a letter to tick or untick it.',
};

interface Props {
  question: CBTQuestion;
  total: number;
  answer?: CBTAnswer;
  sectionTitle?: string;
  sectionInstructions?: string;
  fontSize: string;
  disabled?: boolean;
  /** The whole choice after a click: one key, "" for none, or every key ticked ("AC"). */
  onChoose: (selected: string) => void;
  onType: (text: string) => void;
  /** The section's sound clip player, shown on every question in the section. */
  sectionClip?: React.ReactNode;
  /** The question's own sound clip player. */
  questionClip?: React.ReactNode;
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

const ChoiceOptions: React.FC<{
  question: CBTQuestion; selected: string; disabled?: boolean; onChoose: (selected: string) => void;
}> = ({ question, selected, disabled, onChoose }) => {
  const multiple = question.kind === 'multiple';
  return (
    <div className="mt-5">
      {multiple && (
        <p className="mb-2.5 text-[0.85em] font-semibold text-indigo-700 dark:text-indigo-300">Choose all that apply.</p>
      )}
      <div
        className={question.kind === 'true_false' ? 'grid grid-cols-1 gap-2.5 sm:grid-cols-2' : 'space-y-2.5'}
        role={multiple ? 'group' : 'radiogroup'}
        aria-label={`Options for question ${question.number}`}
      >
        {(question.options ?? []).map((option, index) => {
          const chosen = multiple ? selected.includes(option.key) : selected === option.key;
          return (
            <button
              key={option.key}
              type="button"
              role={multiple ? 'checkbox' : 'radio'}
              aria-checked={chosen}
              disabled={disabled}
              onClick={() => onChoose(multiple ? toggleKey(selected, option.key) : chosen ? '' : option.key)}
              className={`flex w-full items-start gap-3 rounded-xl border-2 px-4 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                chosen
                  ? 'border-indigo-600 bg-indigo-50 dark:border-indigo-400 dark:bg-indigo-900/40'
                  : 'border-slate-200 bg-white hover:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-slate-500'
              }`}
            >
              <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center border-2 text-[0.85em] font-bold ${
                multiple ? 'rounded-md' : 'rounded-full'
              } ${chosen ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-400 text-slate-600 dark:text-slate-300'}`}>
                {OPTION_LETTERS[index]}
              </span>
              <SafeHtml html={option.text} className="cbt-content min-w-0 flex-1 pt-1" />
              {multiple && chosen && (
                <Check className="mt-1.5 h-5 w-5 flex-shrink-0 text-indigo-600 dark:text-indigo-300" aria-hidden="true" />
              )}
            </button>
          );
        })}
      </div>
      <p className="pt-2.5 text-[0.75em] text-slate-500 dark:text-slate-400">{HINTS[question.kind]}</p>
    </div>
  );
};

const NumberAnswer: React.FC<{
  question: CBTQuestion; text: string; disabled?: boolean; onType: (text: string) => void;
}> = ({ question, text, disabled, onType }) => {
  const unreadable = text.trim() !== '' && parseNumber(text, question.unit ?? '') === null;
  const id = `answer-${question.id}`;
  return (
    <div className="mt-5">
      <label htmlFor={id} className="block text-[0.85em] font-medium text-slate-700 dark:text-slate-300">Your answer</label>
      <div className="mt-1 flex items-center gap-2">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          value={text}
          disabled={disabled}
          onChange={(e) => onType(e.target.value)}
          maxLength={50}
          aria-describedby={`${id}-help`}
          aria-invalid={unreadable}
          className={`w-full max-w-xs rounded-xl border-2 bg-white px-4 py-3 text-[1.1em] focus:outline-none dark:bg-slate-800 ${
            unreadable ? 'border-amber-500 focus:border-amber-600' : 'border-slate-200 focus:border-indigo-500 dark:border-slate-700'
          }`}
        />
        {question.unit && <span className="text-[1em] font-medium text-slate-700 dark:text-slate-200">{question.unit}</span>}
      </div>
      <p id={`${id}-help`} className="mt-2 text-[0.75em] text-slate-500 dark:text-slate-400">
        Type a number. You can write decimals (12.5), fractions (3/4 or 1 1/2) and commas (1,200).
      </p>
      {unreadable && (
        <p className="mt-1 flex items-center gap-1.5 text-[0.8em] font-medium text-amber-700 dark:text-amber-300" role="status">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" /> This can't be read as a number yet, so it would be marked wrong.
        </p>
      )}
    </div>
  );
};

/**
 * One question as the student answers it. Options are lettered by where they
 * sit on this student's screen, not by their key: after shuffling, the
 * student's "A" may be another student's "C".
 */
const QuestionView: React.FC<Props> = ({
  question, total, answer, sectionTitle, sectionInstructions, fontSize, disabled, onChoose, onType, sectionClip, questionClip,
}) => (
  <div style={{ fontSize }} className="text-slate-900 dark:text-slate-100">
    {sectionTitle && (
      <div className="mb-4 rounded-lg bg-indigo-50 px-4 py-2 dark:bg-indigo-900/30">
        <p className="text-[0.8em] font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">{sectionTitle}</p>
        {sectionInstructions && <p className="mt-0.5 text-[0.85em] text-indigo-900 dark:text-indigo-200">{sectionInstructions}</p>}
      </div>
    )}
    {sectionClip}

    <div className="mb-3 flex items-baseline justify-between gap-3 text-[0.85em] text-slate-500 dark:text-slate-400">
      <span className="font-semibold text-slate-700 dark:text-slate-200">Question {question.number} of {total}</span>
      <span>{marksLabel(question.marks)}</span>
    </div>

    <SafeHtml html={question.content} className="cbt-content leading-relaxed" />
    {question.image_url && (
      <img src={question.image_url} alt="" className="mt-3 max-h-80 max-w-full rounded border border-slate-200" />
    )}
    {questionClip && <div className="mt-4">{questionClip}</div>}

    {isChoice(question) && (
      <ChoiceOptions question={question} selected={answer?.selected_option ?? ''} disabled={disabled} onChoose={onChoose} />
    )}

    {question.kind === 'numeric' && (
      <NumberAnswer question={question} text={answer?.text_answer ?? ''} disabled={disabled} onType={onType} />
    )}

    {question.kind === 'text' && (
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
