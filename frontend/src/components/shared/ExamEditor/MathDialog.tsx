/**
 * Write or change one maths or chemistry formula.
 *
 * Teachers rarely know TeX, so the buttons insert it for them. The preview
 * shows what students will see, and a formula that can't be drawn can't be
 * inserted.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { renderTex, texError } from '@/utils/math';

interface Snippet {
  /** TeX drawn on the button. */
  face: string;
  /** TeX inserted. The cursor goes inside its first {}, or after it. */
  insert: string;
  title: string;
  /** Where the cursor goes, when not inside the first {}. */
  caret?: number;
}

const s = (face: string, insert: string, title: string, caret?: number): Snippet => ({ face, insert, title, caret });

const GROUPS: { name: string; snippets: Snippet[] }[] = [
  {
    name: 'Basic',
    snippets: [
      // Full size: a \frac in a line of text is too small to read on screen.
      s('\\dfrac{a}{b}', '\\dfrac{}{}', 'Fraction'),
      s('2\\tfrac{1}{3}', '\\tfrac{}{}', 'Small fraction, for mixed numbers'),
      s('x^{2}', '^{}', 'Power'),
      s('x_{1}', '_{}', 'Subscript'),
      s('\\sqrt{x}', '\\sqrt{}', 'Square root'),
      s('\\sqrt[3]{x}', '\\sqrt[3]{}', 'Cube root'),
      s('\\pm', '\\pm ', 'Plus or minus'),
      s('\\times', '\\times ', 'Times'),
      s('\\div', '\\div ', 'Divide'),
      s('\\neq', '\\neq ', 'Not equal'),
      s('\\leq', '\\leq ', 'Less than or equal'),
      s('\\geq', '\\geq ', 'Greater than or equal'),
      s('\\approx', '\\approx ', 'Approximately'),
      s('45^{\\circ}', '^{\\circ}', 'Degrees'),
      s('\\%', '\\%', 'Percent'),
      s('\\infty', '\\infty ', 'Infinity'),
      s('|x|', '\\left|  \\right|', 'Absolute value', 7),
      s('(\\ )', '\\left(  \\right)', 'Brackets that grow', 7),
    ],
  },
  {
    name: 'Greek',
    snippets: ['pi', 'theta', 'alpha', 'beta', 'gamma', 'delta', 'Delta', 'lambda', 'mu', 'rho', 'sigma', 'Sigma', 'phi', 'omega', 'Omega']
      .map((name) => s(`\\${name}`, `\\${name} `, name)),
  },
  {
    name: 'Algebra and calculus',
    snippets: [
      s('\\log_{a} x', '\\log_{}', 'Logarithm'),
      s('\\sin\\theta', '\\sin ', 'Sine'),
      s('\\cos\\theta', '\\cos ', 'Cosine'),
      s('\\tan\\theta', '\\tan ', 'Tangent'),
      s('\\sum_{i=1}^{n}', '\\sum_{i=1}^{n} ', 'Sum'),
      s('\\int_{a}^{b}', '\\int_{}^{} ', 'Integral'),
      s('\\lim_{x \\to 0}', '\\lim_{x \\to } ', 'Limit', 12),
      s('\\frac{dy}{dx}', '\\frac{dy}{dx}', 'Derivative'),
      s('\\binom{n}{r}', '\\binom{}{}', 'Combination'),
      s('\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}', '\\begin{pmatrix}  &  \\\\  &  \\end{pmatrix}', '2 by 2 matrix', 16),
      s('\\bar{x}', '\\bar{}', 'Mean'),
      s('\\vec{v}', '\\vec{}', 'Vector'),
      s('\\overline{AB}', '\\overline{}', 'Line segment'),
      s('\\angle ABC', '\\angle ', 'Angle'),
      s('\\triangle', '\\triangle ', 'Triangle'),
      s('\\therefore', '\\therefore ', 'Therefore'),
      s('\\in', '\\in ', 'Element of'),
      s('\\cup', '\\cup ', 'Union'),
      s('\\cap', '\\cap ', 'Intersection'),
      s('\\subset', '\\subset ', 'Subset'),
      s('\\emptyset', '\\emptyset ', 'Empty set'),
    ],
  },
  {
    name: 'Chemistry',
    snippets: [
      s('\\ce{H2SO4}', '\\ce{}', 'Formula: type it plainly inside, e.g. H2SO4'),
      s('\\ce{A -> B}', '\\ce{ -> }', 'Reaction', 4),
      s('\\ce{A <=> B}', '\\ce{ <=> }', 'Equilibrium', 4),
      s('\\ce{A ->[\\Delta] B}', '\\ce{ ->[\\Delta] }', 'Reaction with heat', 4),
      s('\\ce{SO4^2-}', '\\ce{SO4^2-}', 'Ion with charge'),
      s('\\ce{^{14}_{6}C}', '\\ce{^{}_{}}', 'Isotope'),
      s('\\ce{H2O(l)}', '(aq)', 'State symbol: put it inside \\ce{ }'),
    ],
  },
];

let faces: Map<string, string> | null = null;

/** Every button face, drawn once per page load. */
const buttonFaces = () => {
  faces ??= new Map(GROUPS.flatMap((g) => g.snippets).map((snippet) => [snippet.face, renderTex(snippet.face, false)]));
  return faces;
};

export interface MathDialogProps {
  /** The formula to change, or '' to write a new one. */
  initialTex: string;
  initialDisplay?: boolean;
  /** Offer "on its own line". Off for one-line fields such as options. */
  allowDisplay?: boolean;
  editing?: boolean;
  onSubmit: (tex: string, display: boolean) => void;
  onRemove?: () => void;
  onClose: () => void;
}

const MathDialog: React.FC<MathDialogProps> = ({
  initialTex, initialDisplay = false, allowDisplay = true, editing = false, onSubmit, onRemove, onClose,
}) => {
  const [tex, setTex] = useState(initialTex);
  const [display, setDisplay] = useState(initialDisplay);
  const [group, setGroup] = useState(GROUPS[0].name);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }, []);

  const trimmed = tex.trim();
  const error = useMemo(() => (trimmed ? texError(trimmed) : null), [trimmed]);
  const preview = useMemo(
    () => (trimmed && !error ? renderTex(trimmed, allowDisplay && display) : ''),
    [trimmed, error, display, allowDisplay],
  );

  const insertSnippet = (snippet: Snippet) => {
    const input = inputRef.current;
    const start = input?.selectionStart ?? tex.length;
    const end = input?.selectionEnd ?? tex.length;
    const next = tex.slice(0, start) + snippet.insert + tex.slice(end);
    const brace = snippet.insert.indexOf('{}');
    const caret = start + (snippet.caret ?? (brace >= 0 ? brace + 1 : snippet.insert.length));
    setTex(next);
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(caret, caret);
    });
  };

  const canSubmit = !!trimmed && !error;
  const submit = () => {
    if (canSubmit) onSubmit(trimmed, allowDisplay && display);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    // Keep keys from reaching the exam form behind, which may close on Escape.
    e.stopPropagation();
    if (e.key === 'Escape') onClose();
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      submit();
    }
  };

  const snippets = GROUPS.find((g) => g.name === group)?.snippets ?? [];
  const drawn = buttonFaces();

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4"
      onKeyDown={onKeyDown}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="math-dialog-title"
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white text-slate-900 shadow-2xl dark:bg-slate-800 dark:text-slate-100"
      >
        <div className="border-b border-slate-200 px-5 py-3 dark:border-slate-700">
          <h2 id="math-dialog-title" className="text-base font-semibold">{editing ? 'Change formula' : 'Insert formula'}</h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Use the buttons, or type: <code>x^2</code> for a power, <code>x_1</code> for a subscript,{' '}
            <code>\frac{'{a}{b}'}</code> for a fraction. Chemistry goes inside <code>\ce{'{ }'}</code>, e.g. <code>\ce{'{H2SO4}'}</code>.
          </p>
        </div>

        <div className="overflow-y-auto px-5 py-4">
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Formula buttons">
            {GROUPS.map((g) => (
              <button
                key={g.name}
                type="button"
                role="tab"
                aria-selected={g.name === group}
                onClick={() => setGroup(g.name)}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  g.name === group
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600'
                }`}
              >
                {g.name}
              </button>
            ))}
          </div>

          <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-1.5">
            {snippets.map((snippet) => (
              <button
                key={snippet.face}
                type="button"
                title={snippet.title}
                aria-label={snippet.title}
                onClick={() => insertSnippet(snippet)}
                className="flex h-12 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white px-1 text-sm hover:border-indigo-400 hover:bg-indigo-50 dark:border-slate-600 dark:bg-slate-900 dark:hover:bg-slate-700"
              >
                <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: drawn.get(snippet.face) ?? '' }} />
              </button>
            ))}
          </div>

          <label htmlFor="math-dialog-tex" className="mt-4 block text-sm font-medium">Formula</label>
          <textarea
            id="math-dialog-tex"
            ref={inputRef}
            value={tex}
            onChange={(e) => setTex(e.target.value)}
            rows={3}
            spellCheck={false}
            autoComplete="off"
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-600 dark:bg-slate-900"
            placeholder="e.g. x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}"
          />

          {allowDisplay && (
            <label className="mt-2 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={display} onChange={(e) => setDisplay(e.target.checked)} />
              Put it on its own line, centred
            </label>
          )}

          <p className="mt-4 text-sm font-medium">What students will see</p>
          <div
            className="mt-1 flex min-h-[4.5rem] items-center justify-center overflow-x-auto rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-lg dark:border-slate-600 dark:bg-slate-900"
            aria-live="polite"
          >
            {!trimmed && <span className="text-sm text-slate-400">Your formula will appear here.</span>}
            {error && (
              <span className="text-sm text-rose-700 dark:text-rose-300">
                This formula can't be shown yet: {error}
              </span>
            )}
            {preview && <span className="max-w-full" dangerouslySetInnerHTML={{ __html: preview }} />}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-5 py-3 dark:border-slate-700">
          <div>
            {editing && onRemove && (
              <button type="button" onClick={onRemove}
                className="rounded-lg px-3 py-2 text-sm text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-900/30">
                Remove formula
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700">
              Cancel
            </button>
            <button type="button" onClick={submit} disabled={!canSubmit}
              title="Ctrl+Enter"
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">
              {editing ? 'Update formula' : 'Insert formula'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default MathDialog;
