import { CBTStudentPart, CBTStudentPaper, CBTStudentQuestion } from '@/services/CBTService';
import { mathProblemsInHtml, renderMathInHtml } from '@/utils/math';
import { SoundClip, describePlays } from '@/services/SoundClipService';

/**
 * A standalone HTML page showing a CBT paper as a student gets it, for a
 * sandboxed iframe's srcDoc.
 *
 * Question and option content is teacher-written HTML from the exam editor and
 * is inserted as-is. It is safe only because the iframe is sandboxed with no
 * permissions, so no script in it can run. Do not render this outside such an
 * iframe. Titles and labels are plain text and are escaped.
 *
 * Formulas are drawn here, since nothing can run in the iframe to draw them.
 * Add the formula stylesheet with withMathStyles (utils/mathStyles).
 */

const escape = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const marks = (value: unknown): string => {
  const n = Number(value);
  if (!n) return '';
  return `<span class="marks">[${n} mark${n === 1 ? '' : 's'}]</span>`;
};

const renderParts = (parts: CBTStudentPart[] | undefined, depth = 0): string => {
  if (!parts?.length) return '';
  const label = (i: number) => (depth === 0 ? `(${String.fromCharCode(97 + i)})` : `(${['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii'][i] ?? i + 1})`);
  return `<ol class="parts">${parts.map((part, i) => `
    <li><span class="part-label">${label(i)}</span>
      <div class="content">${renderMathInHtml(part.question ?? '')} ${marks(part.marks)}</div>
      ${renderParts(part.parts, depth + 1)}
    </li>`).join('')}</ol>`;
};

/** A sound clip with the browser's own player: a sandboxed page runs no scripts, but plays media. */
const renderClip = (clip: SoundClip | undefined, heading: string): string => {
  if (!clip?.url) return '';
  const plays = clip.plays ? `students may play it ${describePlays(clip.plays)}` : 'students may play it as often as they like';
  return `<div class="clip"><div class="clip-head">${escape(heading)}${clip.title ? `: ${escape(clip.title)}` : ''}
    <span class="clip-plays">(${plays})</span></div>
    <audio controls preload="none" src="${escape(clip.url)}"></audio></div>`;
};

const renderQuestion = (question: CBTStudentQuestion): string => {
  const image = question.image_url ? `<img src="${escape(question.image_url)}" alt="" />` : '';
  const options = () => `<ul class="options${question.kind === 'true_false' ? ' two' : ''}">${(question.options ?? []).map((option, i) => `
        <li><span class="option-letter${question.kind === 'multiple' ? ' square' : ''}">${String.fromCharCode(65 + i)}</span>
          <span class="content">${renderMathInHtml(option.text)}</span></li>`).join('')}</ul>`;
  const body = {
    objective: options,
    true_false: options,
    multiple: () => `<p class="choose-all">Choose all that apply.</p>${options()}`,
    numeric: () => `<div class="answer-box number">Students type a number here${
      question.unit ? ` <span class="unit">${escape(question.unit)}</span>` : ''}</div>`,
    text: () => `${renderParts(question.parts)}<div class="answer-box">Students type their answer here.</div>`,
  }[question.kind]();
  return `
    <article class="question">
      <header><span class="number">Question ${question.number}</span>${marks(question.marks)}</header>
      <div class="content">${renderMathInHtml(question.content)}</div>
      ${renderClip(question.audio, 'Listen to this question')}
      ${image}
      ${body}
    </article>`;
};

/**
 * One sentence per formula in the paper that can't be drawn, which students
 * would see as red TeX. These don't stop a paper being published: the server
 * can't read TeX, and the teacher may still want the paper as it is.
 */
export const formulaProblems = (paper: CBTStudentPaper): string[] => {
  const problems: string[] = [];
  const collect = (where: string, html: string | undefined) => {
    for (const { source, error } of mathProblemsInHtml(html)) {
      problems.push(`${where}: ${source} can't be shown (${error}).`);
    }
  };
  const collectParts = (name: string, parts: CBTStudentPart[] | undefined) => {
    parts?.forEach((part, i) => {
      const partName = `${name}, part ${i + 1}`;
      collect(partName, part.question);
      collectParts(partName, part.parts);
    });
  };
  for (const question of paper.questions) {
    const name = `Question ${question.number}`;
    collect(name, question.content);
    question.options?.forEach((option, i) => collect(`${name}, option ${String.fromCharCode(65 + i)}`, option.text));
    collectParts(name, question.parts);
  }
  return problems;
};

export const buildPreviewDocument = (paper: CBTStudentPaper): string => {
  const sections = paper.sections.map((section) => {
    const questions = paper.questions.filter((q) => q.section === section.key);
    if (!questions.length) return '';
    return `
      <section>
        <h2>${escape(section.title)}</h2>
        ${section.instructions ? `<p class="instructions">${escape(section.instructions)}</p>` : ''}
        ${renderClip(section.audio, 'Sound clip for this section')}
        ${questions.map(renderQuestion).join('')}
      </section>`;
  }).join('');

  return `<!doctype html>
<html><head><meta charset="utf-8" />
<style>
  body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #0f172a; margin: 0; padding: 20px; background: #f8fafc; line-height: 1.5; }
  .paper-head { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px 18px; margin-bottom: 16px; }
  .paper-head h1 { font-size: 18px; margin: 0 0 4px; }
  .meta { color: #475569; font-size: 13px; }
  .instructions { color: #334155; font-size: 14px; white-space: pre-wrap; }
  h2 { font-size: 15px; text-transform: uppercase; letter-spacing: .04em; color: #4338ca; margin: 22px 0 8px; }
  .question { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 18px; margin-bottom: 12px; }
  .question header { display: flex; justify-content: space-between; font-size: 13px; color: #64748b; margin-bottom: 6px; }
  .number { font-weight: 600; color: #0f172a; }
  .marks { font-size: 12px; color: #64748b; margin-left: 6px; }
  .content img, .question > img { max-width: 100%; height: auto; }
  .content table { border-collapse: collapse; } .content td, .content th { border: 1px solid #cbd5e1; padding: 4px 8px; }
  .options { list-style: none; padding: 0; margin: 10px 0 0; display: grid; gap: 8px; }
  .options li { display: flex; gap: 10px; align-items: flex-start; border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px 12px; }
  .option-letter { flex: 0 0 26px; height: 26px; border-radius: 50%; border: 1px solid #94a3b8; display: inline-flex; align-items: center; justify-content: center; font-weight: 600; font-size: 13px; }
  .options .content p, .question > .content p { margin: 0; }
  .parts { list-style: none; padding-left: 4px; margin: 8px 0; }
  .parts li { display: grid; grid-template-columns: 2.4em 1fr; column-gap: 6px; margin: 6px 0; }
  .parts li > .parts { grid-column: 2; margin: 2px 0; }
  .parts .content p { margin: 0; display: inline; }
  .part-label { font-weight: 600; }
  .answer-box { margin-top: 10px; border: 1px dashed #94a3b8; border-radius: 8px; padding: 18px; color: #94a3b8; font-size: 13px; }
  .answer-box.number { display: inline-block; min-width: 220px; padding: 10px 14px; }
  .answer-box .unit { color: #334155; font-weight: 600; margin-left: 6px; }
  .option-letter.square { border-radius: 5px; }
  .options.two { grid-template-columns: 1fr 1fr; }
  .clip { margin: 10px 0; padding: 8px 12px; border: 1px solid #c7d2fe; border-radius: 8px; background: #eef2ff; }
  .clip-head { font-size: 13px; font-weight: 600; color: #3730a3; margin-bottom: 6px; }
  .clip-plays { font-weight: 400; color: #475569; }
  .clip audio { width: 100%; height: 32px; }
  .choose-all { margin: 10px 0 0; font-size: 13px; font-weight: 600; color: #4338ca; }
</style></head>
<body>
  <div class="paper-head">
    <h1>${escape(paper.exam_title)}</h1>
    <div class="meta">${escape(paper.subject)}${paper.duration_minutes ? ` &middot; ${paper.duration_minutes} minutes` : ''} &middot; ${paper.questions.length} questions &middot; ${escape(paper.total_marks)} marks${paper.allow_backtracking ? '' : ' &middot; no going back'}</div>
    ${paper.instructions ? `<p class="instructions">${escape(paper.instructions)}</p>` : ''}
  </div>
  ${sections}
</body></html>`;
};
