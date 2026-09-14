import React, { useMemo } from 'react';
import DOMPurify from 'dompurify';

/**
 * Teacher-written HTML from the exam editor, cleaned before it reaches a
 * student's browser. DOMPurify removes scripts, event handlers and
 * javascript: URLs. Beyond its defaults, this also removes:
 * - form controls, which could pose as answer boxes;
 * - links, which would take a student out of their exam (their text is
 *   kept).
 */
const CONFIG = {
  FORBID_TAGS: ['a', 'form', 'input', 'button', 'textarea', 'select', 'option', 'style', 'link', 'meta'],
  FORBID_ATTR: ['id', 'name', 'tabindex', 'accesskey'],
  ALLOW_DATA_ATTR: false,
};

export const sanitizeHtml = (html: string | undefined | null): string =>
  html ? DOMPurify.sanitize(html, CONFIG) : '';

interface Props extends React.HTMLAttributes<HTMLElement> {
  html: string | undefined | null;
  as?: 'div' | 'span';
}

const SafeHtml: React.FC<Props> = ({ html, as = 'div', ...rest }) => {
  const clean = useMemo(() => sanitizeHtml(html), [html]);
  return React.createElement(as, { ...rest, dangerouslySetInnerHTML: { __html: clean } });
};

export default SafeHtml;
