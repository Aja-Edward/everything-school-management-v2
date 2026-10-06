/**
 * Plain Page tab for the exam forms.
 *
 * The teacher types the whole paper on one page, the way they would in Word,
 * and decides where every line breaks. The page is kept as typed and can be
 * printed exactly like that. "Convert to questions" sends its text through
 * the same parser as Import → Paste Text, so the paper can also be used for
 * CBT and marking.
 */

import React, { useState } from 'react';
import { AlertCircle, Wand2 } from 'lucide-react';
import { RichTextEditor } from './ExamEditor';
import {
  parseExamPastedText,
  convertParsedDataToExamFormat,
} from '../../services/DocumentParserService';

const BLOCK_TAGS = new Set([
  'P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'TR', 'BLOCKQUOTE', 'PRE', 'TABLE', 'UL', 'OL',
]);
const BLOCK_SELECTOR = [...BLOCK_TAGS].join(',');

/**
 * The page as plain text, one line for each line the teacher typed. The
 * parser reads lines, so an Enter or a Shift+Enter both have to become one.
 */
export const plainPageToText = (html: string): string => {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const lines: string[] = [];
  let current = '';
  // A list item's number, held until its text arrives: the text sits in a
  // paragraph inside the item, which would otherwise start a new line.
  let number = '';
  const endLine = () => { lines.push(current); current = ''; };

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      current += number + (node.textContent ?? '');
      number = '';
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const element = node as Element;
    if (element.tagName === 'BR') { endLine(); return; }
    const isBlock = BLOCK_TAGS.has(element.tagName);
    if (isBlock && current) endLine();
    // A numbered list's numbers aren't in its text, and the parser needs them
    // to tell theory questions apart.
    if (element.tagName === 'LI' && element.parentElement?.tagName === 'OL') {
      const start = Number(element.parentElement.getAttribute('start')) || 1;
      number = `${start + Array.from(element.parentElement.children).indexOf(element)}. `;
    }
    element.childNodes.forEach((child, index) => {
      // Cells on one row stay on one line, a space apart.
      if ((element.tagName === 'TR') && index > 0) current += ' ';
      walk(child);
    });
    // An empty paragraph is a blank line the teacher left on purpose; a list
    // or a list item has already ended its lines through its paragraphs.
    if (isBlock && (current || !element.querySelector(BLOCK_SELECTOR))) endLine();
  };

  doc.body.childNodes.forEach(walk);
  if (current) endLine();
  return lines.map((line) => line.trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
};

/** Whether anything has been typed, as the editor leaves "<p></p>" when empty. */
export const plainPageHasContent = (html?: string | null): boolean => {
  if (!html) return false;
  if (/<(img|table)\b/i.test(html)) return true;
  return plainPageToText(html).trim().length > 0;
};

/** Why a conversion failed, in words, from the parser's reply or the error. */
const conversionFailure = (err: unknown): string => {
  const data = (err as any)?.response?.data;
  const parts = data
    ? [data.detail, data.help, data.example, data.warnings?.length ? 'Issues found:\n' + data.warnings.join('\n') : '']
    : [err instanceof Error ? err.message : 'Could not convert the page into questions.'];
  return parts.filter(Boolean).join('\n\n');
};

/**
 * The page turned into questions, in the shape the Import tab produces.
 * Throws an Error whose message says why when no questions can be read.
 */
export const convertPlainPage = async (html: string): Promise<any> => {
  const text = plainPageToText(html);
  if (!text) throw new Error('Type your exam on the page first.');
  try {
    return convertParsedDataToExamFormat(await parseExamPastedText(text));
  } catch (err) {
    throw new Error(conversionFailure(err));
  }
};

/** Questions in an exam's sections, custom sections counted by their questions. */
export const countQuestions = (exam: {
  objective_questions?: any[]; theory_questions?: any[]; practical_questions?: any[]; custom_sections?: any[];
}): number =>
  (exam.objective_questions?.length ?? 0) + (exam.theory_questions?.length ?? 0) +
  (exam.practical_questions?.length ?? 0) +
  (exam.custom_sections ?? []).reduce((n, s) => n + (s.questions?.length ?? 0), 0);

interface ExamPlainPageProps {
  value: string;
  onChange: (html: string) => void;
  printAsTyped: boolean;
  onPrintAsTypedChange: (value: boolean) => void;
  /** Questions already in the section tabs, which a conversion replaces. */
  existingQuestionCount: number;
  /** Receives the converted exam in the shape the Import tab produces. */
  onConvert: (examData: any) => void;
}

export const ExamPlainPage: React.FC<ExamPlainPageProps> = ({
  value,
  onChange,
  printAsTyped,
  onPrintAsTypedChange,
  existingQuestionCount,
  onConvert,
}) => {
  const [converting, setConverting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const convert = async () => {
    setError(null);
    if (!plainPageToText(value)) {
      setError('Type your exam on the page first.');
      return;
    }
    if (
      existingQuestionCount > 0 &&
      !window.confirm(
        `This replaces the ${existingQuestionCount} question${existingQuestionCount === 1 ? '' : 's'} ` +
        'already in the section tabs with the ones on this page. Continue?'
      )
    ) {
      return;
    }

    setConverting(true);
    try {
      onConvert(await convertPlainPage(value));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setConverting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Each Enter is one line, as in Word, rather than a spaced-out paragraph. */}
      <style>{`.exam-plain-page .ProseMirror p { margin: 0; }`}</style>

      <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-sm text-blue-800 dark:text-blue-200 space-y-1">
        <p>
          Type the exam the way you would in Word. Press <strong>Enter</strong> for a new line, and leave
          empty lines wherever you want space. The page is saved exactly as you type it.
        </p>
        <p>
          When you save, the page is turned into questions for you if the exam has none yet, so it can be
          viewed, marked and used for CBT. Press <strong>Convert to questions</strong> to do it now and check
          them first. Put options on their own lines as A., B., C., D. and number theory questions 1., 2., 3.
          Pictures, tables and formulas aren't carried over, so add those again in the section tabs.
        </p>
      </div>

      <div className="bg-slate-100 dark:bg-slate-900 rounded-lg p-3 sm:p-6">
        <div className="exam-plain-page mx-auto max-w-[820px] bg-white shadow-md">
          <RichTextEditor
            value={value}
            onChange={onChange}
            placeholder="Start typing your exam here…"
            enableImageUpload={true}
            enableTables={true}
            minHeight={700}
          />
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={printAsTyped}
            onChange={(e) => onPrintAsTypedChange(e.target.checked)}
            className="mt-0.5 rounded border-slate-300 text-blue-600"
          />
          <span className="text-sm text-slate-700 dark:text-slate-300">
            <strong>Print this page exactly as typed</strong>
            <span className="block text-xs text-slate-500 dark:text-slate-400">
              The printed paper keeps the school header, then shows this page instead of the section tabs.
            </span>
          </span>
        </label>

        <button
          type="button"
          onClick={convert}
          disabled={converting}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium transition-colors"
        >
          <Wand2 className="w-4 h-4" />
          {converting ? 'Converting…' : 'Convert to questions'}
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex gap-2">
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700 whitespace-pre-wrap">{error}</p>
        </div>
      )}
    </div>
  );
};

export default ExamPlainPage;
