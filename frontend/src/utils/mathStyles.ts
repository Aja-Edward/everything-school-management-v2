/**
 * KaTeX's stylesheet with its fonts embedded, for documents that can't load
 * the app's own copy:
 * - the CBT student preview, a sandboxed iframe with no origin of its own;
 * - the printed exam paper, which is also sent to the server and rendered by
 *   WeasyPrint. WeasyPrint only fetches public URLs and data: URIs.
 */

import katexCss from 'katex/dist/katex.min.css?raw';

const FONT_URLS = import.meta.glob('/node_modules/katex/dist/fonts/*.woff2', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>;

// Each @font-face lists woff2, woff and ttf copies. Only woff2 is kept.
const FONT_SRC = /src:url\(fonts\/([\w-]+)\.woff2\)[^;}]*/g;

const toDataUrl = async (url: string): Promise<string> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load formula font ${url} (${response.status})`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return `data:font/woff2;base64,${btoa(binary)}`;
};

let embedded: Promise<string> | null = null;

const buildEmbeddedCss = async (): Promise<string> => {
  const fonts = new Map(
    await Promise.all(
      Object.entries(FONT_URLS).map(async ([path, url]) => {
        const name = path.slice(path.lastIndexOf('/') + 1, -'.woff2'.length);
        return [name, await toDataUrl(url)] as const;
      }),
    ),
  );
  return katexCss.replace(FONT_SRC, (rule, name: string) => {
    const data = fonts.get(name);
    return data ? `src:url(${data}) format("woff2")` : rule;
  });
};

/** The stylesheet, built once per page load. A failed build is retried next time. */
export const embeddedMathCss = (): Promise<string> => {
  embedded ??= buildEmbeddedCss().catch((error) => {
    embedded = null;
    throw error;
  });
  return embedded;
};

/**
 * `html`, a whole document, with the stylesheet added to its <head> if any
 * formula in it has been drawn. Without the stylesheet the formulas are
 * still there, but badly laid out.
 */
export const withMathStyles = async (html: string): Promise<string> => {
  if (!html.includes('class="katex')) return html;
  try {
    const css = await embeddedMathCss();
    return html.replace('</head>', () => `<style>${css}</style></head>`);
  } catch (error) {
    console.error(error);
    return html;
  }
};
