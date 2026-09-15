/**
 * A formula inside the exam editor.
 *
 * In the editor it is drawn, and clicking it opens the formula dialog. In the
 * saved HTML it is the TeX between its delimiters, in a marked span:
 *
 *   <span data-math="inline">\(x^2\)</span>
 *
 * Everything that shows questions draws formulas from that text (see
 * utils/math), so the span itself is never needed. The student screen
 * sanitises the data attribute away and still draws the formula.
 */

import { InputRule, Node, PasteRule, mergeAttributes } from '@tiptap/react';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { renderTex, splitMath, wrapTex } from '@/utils/math';

export interface MathEditRequest {
  tex: string;
  display: boolean;
  /** The node's position in the document. */
  pos: number;
}

export interface MathNodeOptions {
  /** Called when a formula is clicked in an editable editor. */
  onEdit: ((request: MathEditRequest) => void) | null;
}

export const MATH_NODE = 'math';

const MathNode = Node.create<MathNodeOptions>({
  name: MATH_NODE,
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addOptions() {
    return { onEdit: null };
  },

  addAttributes() {
    return {
      tex: { default: '', rendered: false },
      display: { default: false, rendered: false },
    };
  },

  parseHTML() {
    return [{
      tag: 'span[data-math]',
      getAttrs: (element) => {
        const formula = splitMath((element as HTMLElement).textContent ?? '').find((s) => s.kind === 'math');
        return formula?.kind === 'math' ? { tex: formula.tex, display: formula.display } : false;
      },
    }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, { 'data-math': node.attrs.display ? 'block' : 'inline' }),
      wrapTex(node.attrs.tex, node.attrs.display),
    ];
  },

  renderText({ node }) {
    return wrapTex(node.attrs.tex, node.attrs.display);
  },

  addNodeView() {
    return ({ node, getPos, editor }) => {
      let current: ProseMirrorNode = node;
      const dom = document.createElement('span');
      dom.contentEditable = 'false';

      const draw = () => {
        const { tex, display } = current.attrs;
        dom.className = `rounded px-0.5 [&.ProseMirror-selectednode]:bg-indigo-100 ${
          editor.isEditable ? 'cursor-pointer hover:bg-indigo-50' : ''
        } ${display ? 'block' : ''}`;
        dom.title = editor.isEditable ? 'Click to change this formula' : '';
        dom.innerHTML = renderTex(tex, display);
      };
      draw();

      dom.addEventListener('click', (event) => {
        const pos = getPos();
        if (!editor.isEditable || typeof pos !== 'number') return;
        event.preventDefault();
        this.options.onEdit?.({ tex: current.attrs.tex, display: current.attrs.display, pos });
      });

      return {
        dom,
        update: (updated) => {
          if (updated.type !== current.type) return false;
          current = updated;
          draw();
          return true;
        },
        ignoreMutation: () => true,
      };
    };
  },

  // Typing \(x^2\) turns it into a formula when the closing \) is typed.
  addInputRules() {
    return [
      new InputRule({
        find: /\\\(([^\n]*?\S[^\n]*?)\\\)$/,
        handler: ({ state, range, match }) => {
          state.tr.replaceWith(range.from, range.to, this.type.create({ tex: match[1].trim(), display: false }));
        },
      }),
    ];
  },

  // Pasted text holding \(...\), \[...\] or $$...$$ gets formulas too.
  addPasteRules() {
    return [
      new PasteRule({
        find: (text) => {
          let index = 0;
          return splitMath(text).flatMap((segment) => {
            const at = index;
            if (segment.kind === 'text') {
              index += segment.text.length;
              return [];
            }
            index += segment.source.length;
            return [{ index: at, text: segment.source, data: { tex: segment.tex, display: segment.display } }];
          });
        },
        handler: ({ state, range, match }) => {
          state.tr.replaceWith(range.from, range.to, this.type.create(match.data));
        },
      }),
    ];
  },
});

export default MathNode;
