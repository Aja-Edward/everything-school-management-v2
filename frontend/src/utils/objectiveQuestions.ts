/**
 * How an objective question is answered, as the exam editors store it on the
 * question (see backend cbt/snapshot.py and cbt/scoring.py):
 *
 *   questionType   missing for choose one, or 'multiple', 'true_false', 'numeric'
 *   correctAnswer  a letter; letters for multiple ("A,C"); True/False; or the number
 *   partialCredit  multiple only: marks for part of the right choices
 *   tolerance      numeric only: how far either side still counts
 *   unit           numeric only: shown beside the answer box
 */

export type AnswerType = 'single' | 'multiple' | 'true_false' | 'numeric';

export interface ObjectiveAnswer {
  questionType?: string;
  optionA?: string;
  optionB?: string;
  optionC?: string;
  optionD?: string;
  optionE?: string;
  correctAnswer?: string;
  correct_answer?: string;
  partialCredit?: boolean;
  tolerance?: string | number;
  unit?: string;
}

export const ANSWER_TYPES: { value: AnswerType; label: string; hint: string }[] = [
  { value: 'single', label: 'Choose one', hint: 'One option is right.' },
  { value: 'multiple', label: 'Choose all that apply', hint: 'Students tick every option that is right.' },
  { value: 'true_false', label: 'True or false', hint: 'Students choose True or False.' },
  { value: 'numeric', label: 'Number', hint: 'Students type a number, such as 12.5, -3, 3/4 or 1,200.' },
];

const TYPE_NAMES: Record<string, AnswerType> = {
  '': 'single', single: 'single', objective: 'single',
  multiple: 'multiple', multi_select: 'multiple', multiselect: 'multiple',
  true_false: 'true_false', truefalse: 'true_false', 'true-false': 'true_false',
  numeric: 'numeric', number: 'numeric',
};

export const answerTypeOf = (question: ObjectiveAnswer): AnswerType =>
  TYPE_NAMES[String(question.questionType ?? '').trim().toLowerCase()] ?? 'single';

export const OPTION_LETTERS = ['A', 'B', 'C', 'D'] as const;

const answerOf = (question: ObjectiveAnswer) => String(question.correctAnswer ?? question.correct_answer ?? '');

/** Letters from "A,C", "A C", "ca" or ["A", "C"]: upper-cased, in order, without repeats. */
export const parseKeys = (raw: unknown): string[] => {
  const text = Array.isArray(raw) ? raw.join('') : String(raw ?? '');
  return [...new Set(text.replace(/[\s,;/&]+/g, '').toUpperCase().split('').filter(Boolean))].sort();
};

/** "A" or "B" for True or False, or '' when the answer is neither. */
export const trueFalseKey = (question: ObjectiveAnswer): string =>
  ({ a: 'A', true: 'A', t: 'A', b: 'B', false: 'B', f: 'B' } as Record<string, string>)[
    answerOf(question).trim().replace(/\.$/, '').toLowerCase()] ?? '';

const MAX_NUMBER_LENGTH = 50;

/**
 * The number written in `text`, or null. Accepts what the server accepts:
 * 12, -3.5, .75, 1,250,000, 6.02e23, 3/4, 1 1/2, and the unit after it.
 */
export const parseNumber = (input: string | number | null | undefined, unit = ''): number | null => {
  if (input === null || input === undefined) return null;
  let text = String(input).replace(/[−–—]/g, '-').trim();
  if (text.length > MAX_NUMBER_LENGTH) return null;
  const u = unit.trim();
  if (u && text.toLowerCase().endsWith(u.toLowerCase())) text = text.slice(0, -u.length).trim();
  if (!text) return null;

  const mixed = /^([+-]?)(\d+)\s+(\d+)\s*\/\s*(\d+)$/.exec(text);
  if (mixed) {
    const [, sign, whole, top, bottom] = mixed;
    if (Number(bottom) === 0) return null;
    const value = Number(whole) + Number(top) / Number(bottom);
    return sign === '-' ? -value : value;
  }
  const fraction = /^([+-]?)(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/.exec(text);
  if (fraction) {
    const [, sign, top, bottom] = fraction;
    if (Number(bottom) === 0) return null;
    const value = Number(top) / Number(bottom);
    return sign === '-' ? -value : value;
  }
  let plain = text.replace(/ /g, '');
  if (plain.includes(',')) {
    if (!/^[+-]?\d{1,3}(,\d{3})+(\.\d*)?$/.test(plain)) return null;
    plain = plain.replace(/,/g, '');
  }
  const decimal = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.exec(plain);
  if (!decimal) return null;
  if (decimal[2] && Math.abs(Number(decimal[2].slice(1))) > 100) return null;
  return Number(plain);
};

/** The question with its answer type changed, keeping what still makes sense. */
export const withAnswerType = <T extends ObjectiveAnswer>(question: T, type: AnswerType): T => {
  const from = answerTypeOf(question);
  if (from === type) return question;
  const next: T = { ...question, questionType: type === 'single' ? undefined : type };
  delete next.partialCredit;
  delete next.tolerance;
  delete next.unit;

  if (type === 'true_false') {
    // The letters now mean True and False, so an earlier answer would mean something else.
    return { ...next, optionA: 'True', optionB: 'False', optionC: '', optionD: '', ...(next.optionE ? { optionE: '' } : {}),
      correctAnswer: '' };
  }
  // True and False were filled in for the student, so they go when the type does.
  if (from === 'true_false') {
    Object.assign(next, { optionA: '', optionB: '' });
  }
  if (type === 'numeric') return { ...next, correctAnswer: '', tolerance: '', unit: '' };
  if (type === 'multiple') {
    return { ...next, correctAnswer: from === 'single' ? parseKeys(answerOf(question)).join(',') : '', partialCredit: false };
  }
  return { ...next, correctAnswer: '' };
};

/** The key as a teacher reads it: "B", "A, C", "True", "12.5 ± 0.1 cm". */
export const describeAnswer = (question: ObjectiveAnswer): string => {
  const type = answerTypeOf(question);
  if (type === 'multiple') return parseKeys(answerOf(question)).join(', ');
  if (type === 'true_false') return ({ A: 'True', B: 'False' } as Record<string, string>)[trueFalseKey(question)] ?? '';
  if (type === 'numeric') {
    const margin = parseNumber(question.tolerance ?? '');
    return [answerOf(question), margin ? `± ${margin}` : '', question.unit ?? ''].filter(Boolean).join(' ');
  }
  // Older questions sometimes hold the option's text rather than its letter: shown as written.
  return answerOf(question);
};

/** What is wrong with the question's answer, for showing beside it in the editor. */
export const answerProblem = (question: ObjectiveAnswer): string | null => {
  const type = answerTypeOf(question);
  const answer = answerOf(question).trim();
  if (type === 'multiple') {
    const filled = OPTION_LETTERS.filter((letter) => (question[`option${letter}`] ?? '').trim());
    const keys = parseKeys(answer);
    if (!keys.length) return 'Tick every option that is right.';
    if (keys.some((key) => !filled.includes(key as typeof OPTION_LETTERS[number]))) return 'A ticked option is empty.';
    return null;
  }
  if (type === 'true_false') return trueFalseKey(question) ? null : 'Choose True or False.';
  if (type === 'numeric') {
    if (!answer) return 'Type the answer.';
    if (parseNumber(answer) === null) return 'The answer must be a number, such as 12.5 or 3/4.';
    // The server reads the margin as a plain decimal: no fractions or thousands commas.
    const margin = String(question.tolerance ?? '').trim();
    if (margin && (!/^\+?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(margin)))
      return 'The margin either side must be a number, 0 or more, such as 0.5.';
    return null;
  }
  return answer ? null : 'Choose the correct answer.';
};
