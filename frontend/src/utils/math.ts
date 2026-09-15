/**
 * Maths formulas in question text.
 *
 * A formula is stored as TeX inside the question's HTML, between delimiters:
 * - \( and \) for a formula within a line of text;
 * - \[ and \], or $$ and $$, for a formula on its own line.
 *
 * Storing formulas as text means everything that already saves, copies,
 * imports or prints question HTML carries them unchanged. Anywhere that
 * doesn't draw them still shows the teacher's formula instead of nothing.
 *
 * A single $ is not a delimiter, because it appears in ordinary text as
 * currency.
 */

import katex, { type KatexOptions } from 'katex';
import 'katex/contrib/mhchem';
import 'katex/dist/katex.min.css';

export type MathSegment =
  | { kind: 'text'; text: string }
  | { kind: 'math'; tex: string; display: boolean; source: string };

/** Where a formula will be drawn. */
export type MathTarget = 'screen' | 'print';

const CLOSER: Record<string, string> = { '\\(': '\\)', '\\[': '\\]', $$: '$$' };

/** A cheap test for whether text might hold a formula. */
const MIGHT_HAVE_MATH = /\\[([]|\$\$/;

/**
 * The index of `closer` in `text` at or after `from`, or -1.
 *
 * A backslash escapes the character after it. So in `\\)`, a line break
 * followed by ")", the ")" does not close the formula.
 */
const findCloser = (text: string, from: number, closer: string): number => {
  for (let i = from; i < text.length; i++) {
    if (text.startsWith(closer, i)) return i;
    if (text[i] === '\\') i++;
  }
  return -1;
};

/**
 * Splits text into plain text and formulas. An opening delimiter with no
 * closing one, or around nothing, stays as plain text.
 */
export const splitMath = (text: string): MathSegment[] => {
  const segments: MathSegment[] = [];
  let plainFrom = 0;
  let i = 0;
  while (i < text.length) {
    const pair = text.slice(i, i + 2);
    if (!CLOSER[pair]) {
      i += text[i] === '\\' ? 2 : 1;
      continue;
    }
    const end = findCloser(text, i + 2, CLOSER[pair]);
    const tex = end < 0 ? '' : text.slice(i + 2, end).trim();
    if (!tex) {
      i += 2;
      continue;
    }
    if (i > plainFrom) segments.push({ kind: 'text', text: text.slice(plainFrom, i) });
    segments.push({ kind: 'math', tex, display: pair !== '\\(', source: text.slice(i, end + 2) });
    i = plainFrom = end + 2;
  }
  if (plainFrom < text.length) segments.push({ kind: 'text', text: text.slice(plainFrom) });
  return segments;
};

export const hasMath = (text: string | null | undefined): boolean =>
  !!text && MIGHT_HAVE_MATH.test(text) && splitMath(text).some((s) => s.kind === 'math');

/** TeX wrapped in the delimiters it is stored with. */
export const wrapTex = (tex: string, display: boolean): string =>
  display ? `\\[${tex}\\]` : `\\(${tex}\\)`;

// WeasyPrint, which renders the downloadable exam PDF, misplaces the slash
// KaTeX lays over a symbol for \not, \neq and \ne. It prints "x ≠ -2" as
// "x / -2" with the equals sign struck through the 2. Built from kerns
// instead, the slash lands on the symbol.
const PRINT_MACROS: Record<string, string> = {
  '\\not': '\\mathrel{\\mkern2.5mu/\\mkern-11.5mu}',
  '\\neq': '\\not=',
  '\\ne': '\\not=',
};

const katexOptions = (display: boolean, target: MathTarget, throwOnError: boolean): KatexOptions => ({
  displayMode: display,
  throwOnError,
  // No \href, \url, \includegraphics or \html... commands: formulas are
  // teacher-written, and students' browsers draw them.
  trust: false,
  strict: 'ignore',
  maxSize: 20,
  maxExpand: 1000,
  // The printed paper is HTML only. Its hidden MathML copy would print as
  // stray text wherever the stylesheet that hides it isn't honoured.
  output: target === 'print' ? 'html' : 'htmlAndMathml',
  // KaTeX writes \gdef definitions into this object, so each formula gets
  // its own copy.
  macros: target === 'print' ? { ...PRINT_MACROS } : {},
});

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * A formula as HTML. A formula KaTeX can't read is shown as its source, in
 * red, with the reason as a tooltip.
 */
export const renderTex = (tex: string, display: boolean, target: MathTarget = 'screen'): string => {
  try {
    return katex.renderToString(tex, katexOptions(display, target, false));
  } catch {
    return `<span class="katex-error" style="color:#cc0000">${escapeHtml(tex)}</span>`;
  }
};

/** Null when the formula can be drawn, otherwise why not. */
export const texError = (tex: string): string | null => {
  try {
    katex.renderToString(tex, katexOptions(false, 'screen', true));
    return null;
  } catch (error) {
    if (error instanceof katex.ParseError) return error.rawMessage || error.message;
    return error instanceof Error ? error.message : String(error);
  }
};

const SKIPPED_TAGS = new Set(['CODE', 'PRE', 'SCRIPT', 'STYLE', 'TEXTAREA']);

const isSkipped = (node: Node, root: Node) => {
  for (let el = node.parentElement; el && el !== root; el = el.parentElement) {
    if (SKIPPED_TAGS.has(el.tagName) || el.classList.contains('katex')) return true;
  }
  return false;
};

/** Text nodes under `root` that hold formulas, with their formulas split out. */
const mathTextNodes = (root: Node) => {
  const doc = root.ownerDocument ?? (root as Document);
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const found: { node: Text; segments: MathSegment[] }[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node as Text;
    if (!MIGHT_HAVE_MATH.test(text.data) || isSkipped(text, root)) continue;
    const segments = splitMath(text.data);
    if (segments.some((s) => s.kind === 'math')) found.push({ node: text, segments });
  }
  return found;
};

/**
 * Draws every formula under `root` in place.
 *
 * A formula has to sit within one text node. `\(x^2\)` with the 2 in bold
 * is left as it was typed.
 */
export const renderMathIn = (root: Node, target: MathTarget = 'screen'): void => {
  for (const { node, segments } of mathTextNodes(root)) {
    const doc = node.ownerDocument;
    const replacement = doc.createDocumentFragment();
    for (const segment of segments) {
      if (segment.kind === 'text') {
        replacement.append(segment.text);
      } else {
        const holder = doc.createElement('span');
        holder.innerHTML = renderTex(segment.tex, segment.display, target);
        replacement.append(...Array.from(holder.childNodes));
      }
    }
    node.replaceWith(replacement);
  }
};

/**
 * `html` with its formulas drawn. Parsing happens in an inert template, so
 * nothing in `html` runs or loads. This does not sanitise `html`.
 */
export const renderMathInHtml = (html: string, target: MathTarget = 'screen'): string => {
  if (!html || !MIGHT_HAVE_MATH.test(html)) return html;
  const template = document.createElement('template');
  template.innerHTML = html;
  renderMathIn(template.content, target);
  return template.innerHTML;
};

export interface MathProblem {
  source: string;
  error: string;
}

/** The formulas in `html` that can't be drawn. */
export const mathProblemsInHtml = (html: string | null | undefined): MathProblem[] => {
  if (!html || !MIGHT_HAVE_MATH.test(html)) return [];
  const template = document.createElement('template');
  template.innerHTML = html;
  const problems: MathProblem[] = [];
  for (const { segments } of mathTextNodes(template.content)) {
    for (const segment of segments) {
      if (segment.kind !== 'math') continue;
      const error = texError(segment.tex);
      if (error) problems.push({ source: segment.source, error });
    }
  }
  return problems;
};

/**
 * Starts downloading every formula font. Once a paper with formulas is on a
 * student's screen, a formula they reach after losing their connection still
 * draws in its proper fonts.
 */
export const preloadMathFonts = (): void => {
  document.fonts?.forEach((face) => {
    if (face.status === 'unloaded' && face.family.replace(/["']/g, '').startsWith('KaTeX_')) {
      face.load().catch(() => undefined);
    }
  });
};
