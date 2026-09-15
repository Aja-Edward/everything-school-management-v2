/**
 * A one-line text box, such as an objective option, with a formula button.
 *
 * Formulas go into the text as \(...\) at the cursor. When the cursor is
 * inside one, the button changes that formula instead. Any formulas in the
 * text are drawn underneath, as students will see them.
 */

import React, { useRef, useState } from 'react';
import SafeHtml from '@/components/cbt/student/SafeHtml';
import { hasMath, splitMath, wrapTex } from '@/utils/math';
import MathDialog from './MathDialog';

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  /** Classes for the text box. */
  className?: string;
  /** Classes for the wrapper, e.g. grid placement. */
  wrapperClassName?: string;
}

/** Where the dialog's formula goes: the range it replaces, and the formula already there. */
interface Target {
  start: number;
  end: number;
  tex: string;
  editing: boolean;
}

const formulaAround = (text: string, caret: number): Target | null => {
  let index = 0;
  for (const segment of splitMath(text)) {
    const length = segment.kind === 'text' ? segment.text.length : segment.source.length;
    if (segment.kind === 'math' && caret > index && caret < index + length) {
      return { start: index, end: index + length, tex: segment.tex, editing: true };
    }
    index += length;
  }
  return null;
};

const MathTextInput: React.FC<Props> = ({ value, onChange, placeholder, required, className = '', wrapperClassName = '' }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [target, setTarget] = useState<Target | null>(null);

  const open = () => {
    const start = inputRef.current?.selectionStart ?? value.length;
    const end = inputRef.current?.selectionEnd ?? value.length;
    setTarget(formulaAround(value, start) ?? { start, end, tex: '', editing: false });
  };

  const replace = (insert: string) => {
    if (!target) return;
    onChange(value.slice(0, target.start) + insert + value.slice(target.end));
    const caret = target.start + insert.length;
    setTarget(null);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(caret, caret);
    });
  };

  return (
    <div className={wrapperClassName}>
      <div className="flex gap-1">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          className={`min-w-0 flex-1 ${className}`}
        />
        <button
          type="button"
          onClick={open}
          title="Insert a formula here, or change the one the cursor is in"
          aria-label={`Formula for ${placeholder ?? 'this field'}`}
          className="shrink-0 rounded-lg border border-slate-300 px-2 text-sm text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          √x
        </button>
      </div>
      {hasMath(value) && (
        <SafeHtml html={value} className="mt-1 rounded bg-slate-50 px-2 py-1 text-sm text-slate-800 dark:bg-slate-800 dark:text-slate-100" />
      )}
      {target && (
        <MathDialog
          initialTex={target.tex}
          allowDisplay={false}
          editing={target.editing}
          onSubmit={(tex) => replace(wrapTex(tex, false))}
          onRemove={() => replace('')}
          onClose={() => setTarget(null)}
        />
      )}
    </div>
  );
};

export default MathTextInput;
