/**
 * ShapeCanvas — a drawing board for exam questions, the way Word and Google
 * Docs let you draw one: put several shapes on a canvas, move and resize them,
 * label them, then drop the lot into the question as a single picture.
 *
 * What comes out is an SVG in a data URL, inserted through the editor's Image
 * extension, so it behaves like any other picture: drag to resize, crop, or
 * delete. The drawing's own description is kept inside the SVG (a <desc> with
 * the items as base64 JSON), so the same drawing can be opened and changed
 * again later instead of being redrawn from scratch.
 *
 * Nothing here is loaded from the internet, so a drawing still shows on an
 * exam station with no connection (see docs/cbt-offline-station.md).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Circle, Minus, MousePointer2, Redo2, Square, Trash2, Triangle, Type, Undo2, X } from 'lucide-react';

// ─── The drawing ──────────────────────────────────────────────────────────────

export const CANVAS_WIDTH = 640;
export const CANVAS_HEIGHT = 380;
const MIN_SIZE = 8;

/** Marks an SVG as one of our drawings, and carries the items to edit again. */
const DRAWING_ATTR = 'data-drawing';

type Tool = 'select' | 'rect' | 'ellipse' | 'triangle' | 'line' | 'arrow' | 'text';

interface BoxItem {
  id: string;
  kind: 'rect' | 'ellipse' | 'triangle';
  x: number; y: number; w: number; h: number;
  fill: string; stroke: string; strokeWidth: number;
}

interface LineItem {
  id: string;
  kind: 'line' | 'arrow';
  x1: number; y1: number; x2: number; y2: number;
  stroke: string; strokeWidth: number;
}

interface TextItem {
  id: string;
  kind: 'text';
  x: number; y: number;
  text: string; fill: string; fontSize: number;
}

export type DrawingItem = BoxItem | LineItem | TextItem;

const isBox = (item: DrawingItem): item is BoxItem =>
  item.kind === 'rect' || item.kind === 'ellipse' || item.kind === 'triangle';
const isLine = (item: DrawingItem): item is LineItem =>
  item.kind === 'line' || item.kind === 'arrow';

const newId = () => Math.random().toString(36).slice(2, 10);

/** Roughly how wide a label sits, for its grab patch and selection outline. */
const textWidth = (item: TextItem) => Math.max(40, item.text.length * item.fontSize * 0.6);

// ─── Drawing → SVG ────────────────────────────────────────────────────────────

const escapeXml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c] as string));

const ARROW_HEAD = 'drawing-arrow-head';

/** One item as SVG markup. The same shapes the board itself draws. */
const itemToSvg = (item: DrawingItem): string => {
  if (isBox(item)) {
    if (item.kind === 'rect') {
      return `<rect x="${item.x}" y="${item.y}" width="${item.w}" height="${item.h}" fill="${item.fill}" stroke="${item.stroke}" stroke-width="${item.strokeWidth}"/>`;
    }
    if (item.kind === 'ellipse') {
      return `<ellipse cx="${item.x + item.w / 2}" cy="${item.y + item.h / 2}" rx="${item.w / 2}" ry="${item.h / 2}" fill="${item.fill}" stroke="${item.stroke}" stroke-width="${item.strokeWidth}"/>`;
    }
    const points = `${item.x + item.w / 2},${item.y} ${item.x + item.w},${item.y + item.h} ${item.x},${item.y + item.h}`;
    return `<polygon points="${points}" fill="${item.fill}" stroke="${item.stroke}" stroke-width="${item.strokeWidth}" stroke-linejoin="round"/>`;
  }
  if (isLine(item)) {
    const head = item.kind === 'arrow' ? ` marker-end="url(#${ARROW_HEAD})"` : '';
    return `<line x1="${item.x1}" y1="${item.y1}" x2="${item.x2}" y2="${item.y2}" stroke="${item.stroke}" stroke-width="${item.strokeWidth}" stroke-linecap="round"${head}/>`;
  }
  return `<text x="${item.x}" y="${item.y}" fill="${item.fill}" font-size="${item.fontSize}" font-family="system-ui, -apple-system, Segoe UI, sans-serif">${escapeXml(item.text)}</text>`;
};

/** The finished drawing: an SVG carrying its own items, so it can be edited again. */
export const drawingToSvg = (items: DrawingItem[], background: string): string => {
  const model = btoa(unescape(encodeURIComponent(JSON.stringify(items))));
  const needsArrow = items.some((item) => item.kind === 'arrow');
  const marker = needsArrow
    ? `<defs><marker id="${ARROW_HEAD}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="context-stroke"/></marker></defs>`
    : '';
  const sheet = background === 'transparent'
    ? ''
    : `<rect x="0" y="0" width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" fill="${background}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" viewBox="0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}">`
    + `<desc ${DRAWING_ATTR}="${model}">Drawing</desc>${marker}${sheet}`
    + items.map(itemToSvg).join('')
    + '</svg>';
};

export const drawingToDataUrl = (items: DrawingItem[], background: string): string =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(drawingToSvg(items, background))}`;

/** The items inside one of our drawings, or null for any other picture. */
export const readDrawing = (src: string | null | undefined): DrawingItem[] | null => {
  if (!src || !src.startsWith('data:image/svg+xml')) return null;
  try {
    const comma = src.indexOf(',');
    const body = src.slice(comma + 1);
    const svg = src.slice(0, comma).includes(';base64') ? atob(body) : decodeURIComponent(body);
    const match = svg.match(new RegExp(`${DRAWING_ATTR}="([^"]+)"`));
    if (!match) return null;
    const items = JSON.parse(decodeURIComponent(escape(atob(match[1]))));
    return Array.isArray(items) ? items : null;
  } catch {
    return null;
  }
};

// ─── Board ────────────────────────────────────────────────────────────────────

interface Props {
  /** Items to open with, for changing a drawing already in the question. */
  initialItems?: DrawingItem[] | null;
  onInsert: (dataUrl: string) => void;
  onClose: () => void;
}

const TOOLS: { tool: Tool; label: string; icon: React.ReactNode }[] = [
  { tool: 'select',   label: 'Select and move',  icon: <MousePointer2 className="h-4 w-4" /> },
  { tool: 'rect',     label: 'Rectangle',        icon: <Square className="h-4 w-4" /> },
  { tool: 'ellipse',  label: 'Circle or oval',   icon: <Circle className="h-4 w-4" /> },
  { tool: 'triangle', label: 'Triangle',         icon: <Triangle className="h-4 w-4" /> },
  { tool: 'line',     label: 'Line',             icon: <Minus className="h-4 w-4" /> },
  { tool: 'arrow',    label: 'Arrow',            icon: <ArrowRight className="h-4 w-4" /> },
  { tool: 'text',     label: 'Label',            icon: <Type className="h-4 w-4" /> },
];

const SWATCHES = ['#1d4ed8', '#dc2626', '#16a34a', '#ca8a04', '#7c3aed', '#0f172a', '#ffffff', 'none'];

const ShapeCanvas: React.FC<Props> = ({ initialItems, onInsert, onClose }) => {
  const [items, setItems] = useState<DrawingItem[]>(initialItems ?? []);
  const [past, setPast] = useState<DrawingItem[][]>([]);
  const [future, setFuture] = useState<DrawingItem[][]>([]);
  const [tool, setTool] = useState<Tool>('select');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fill, setFill] = useState('#dbeafe');
  const [stroke, setStroke] = useState('#1d4ed8');
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [background, setBackground] = useState<'transparent' | '#ffffff'>('transparent');
  const svgRef = useRef<SVGSVGElement>(null);
  // What the pointer is doing between mousedown and mouseup.
  const drag = useRef<{ mode: 'draw' | 'move' | 'resize' | 'end1' | 'end2'; id: string; dx: number; dy: number } | null>(null);

  const selected = items.find((item) => item.id === selectedId) ?? null;

  /** Remember the items before a change, so it can be undone. */
  const commit = useCallback((next: DrawingItem[]) => {
    setPast((stack) => [...stack.slice(-49), items]);
    setFuture([]);
    setItems(next);
  }, [items]);

  const update = useCallback((id: string, changes: Partial<DrawingItem>) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...changes } as DrawingItem : item)));
  }, []);

  const undo = useCallback(() => {
    setPast((stack) => {
      if (!stack.length) return stack;
      const previous = stack[stack.length - 1];
      setFuture((ahead) => [items, ...ahead]);
      setItems(previous);
      return stack.slice(0, -1);
    });
  }, [items]);

  const redo = useCallback(() => {
    setFuture((ahead) => {
      if (!ahead.length) return ahead;
      setPast((stack) => [...stack, items]);
      setItems(ahead[0]);
      return ahead.slice(1);
    });
  }, [items]);

  const removeSelected = useCallback(() => {
    if (!selectedId) return;
    commit(items.filter((item) => item.id !== selectedId));
    setSelectedId(null);
  }, [commit, items, selectedId]);

  // Delete and Backspace remove the selected shape; Escape closes the board.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const onAnInput = ['INPUT', 'TEXTAREA'].includes((event.target as HTMLElement)?.tagName);
      if (event.key === 'Escape') onClose();
      if (!onAnInput && (event.key === 'Delete' || event.key === 'Backspace')) {
        event.preventDefault();
        removeSelected();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, removeSelected]);

  /** Where the pointer is on the canvas, in the drawing's own coordinates. */
  const pointAt = (event: React.MouseEvent): { x: number; y: number } => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: ((event.clientX - rect.left) / rect.width) * CANVAS_WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * CANVAS_HEIGHT,
    };
  };

  const startOnCanvas = (event: React.MouseEvent) => {
    const { x, y } = pointAt(event);
    if (tool === 'select') {
      setSelectedId(null);
      return;
    }
    if (tool === 'text') {
      const item: TextItem = { id: newId(), kind: 'text', x, y, text: 'Label', fill: stroke, fontSize: 18 };
      commit([...items, item]);
      setSelectedId(item.id);
      setTool('select');
      return;
    }
    const id = newId();
    const item: DrawingItem = tool === 'line' || tool === 'arrow'
      ? { id, kind: tool, x1: x, y1: y, x2: x, y2: y, stroke, strokeWidth }
      : { id, kind: tool, x, y, w: 1, h: 1, fill, stroke, strokeWidth };
    setPast((stack) => [...stack.slice(-49), items]);
    setFuture([]);
    setItems([...items, item]);
    setSelectedId(id);
    drag.current = { mode: 'draw', id, dx: x, dy: y };
  };

  const moveOnCanvas = (event: React.MouseEvent) => {
    const active = drag.current;
    if (!active) return;
    const { x, y } = pointAt(event);
    const item = items.find((i) => i.id === active.id);
    if (!item) return;

    if (active.mode === 'draw') {
      if (isLine(item)) update(item.id, { x2: x, y2: y } as Partial<DrawingItem>);
      else if (isBox(item)) {
        update(item.id, {
          x: Math.min(active.dx, x), y: Math.min(active.dy, y),
          w: Math.abs(x - active.dx), h: Math.abs(y - active.dy),
        } as Partial<DrawingItem>);
      }
    } else if (active.mode === 'move') {
      if (isBox(item)) update(item.id, { x: x - active.dx, y: y - active.dy } as Partial<DrawingItem>);
      else if (isLine(item)) {
        const width = item.x2 - item.x1;
        const height = item.y2 - item.y1;
        update(item.id, { x1: x - active.dx, y1: y - active.dy, x2: x - active.dx + width, y2: y - active.dy + height } as Partial<DrawingItem>);
      } else update(item.id, { x: x - active.dx, y: y - active.dy } as Partial<DrawingItem>);
    } else if (active.mode === 'resize' && isBox(item)) {
      update(item.id, { w: Math.max(MIN_SIZE, x - item.x), h: Math.max(MIN_SIZE, y - item.y) } as Partial<DrawingItem>);
    } else if (active.mode === 'end1' && isLine(item)) {
      update(item.id, { x1: x, y1: y } as Partial<DrawingItem>);
    } else if (active.mode === 'end2' && isLine(item)) {
      update(item.id, { x2: x, y2: y } as Partial<DrawingItem>);
    }
  };

  const endDrag = () => {
    const active = drag.current;
    drag.current = null;
    if (active?.mode !== 'draw') return;
    // A click with no drag leaves nothing worth keeping.
    setItems((current) => current.filter((item) => {
      if (item.id !== active.id) return true;
      if (isBox(item)) return item.w >= MIN_SIZE && item.h >= MIN_SIZE;
      if (isLine(item)) return Math.hypot(item.x2 - item.x1, item.y2 - item.y1) >= MIN_SIZE;
      return true;
    }));
    setTool('select');
  };

  const grabItem = (event: React.MouseEvent, item: DrawingItem) => {
    event.stopPropagation();
    setSelectedId(item.id);
    if (tool !== 'select') return;
    const { x, y } = pointAt(event);
    setPast((stack) => [...stack.slice(-49), items]);
    setFuture([]);
    const origin = isBox(item) ? { x: item.x, y: item.y } : isLine(item) ? { x: item.x1, y: item.y1 } : { x: item.x, y: item.y };
    drag.current = { mode: 'move', id: item.id, dx: x - origin.x, dy: y - origin.y };
  };

  const grabHandle = (event: React.MouseEvent, item: DrawingItem, mode: 'resize' | 'end1' | 'end2') => {
    event.stopPropagation();
    setSelectedId(item.id);
    setPast((stack) => [...stack.slice(-49), items]);
    setFuture([]);
    drag.current = { mode, id: item.id, dx: 0, dy: 0 };
  };

  const preview = useMemo(() => drawingToDataUrl(items, background), [items, background]);

  const handle = (x: number, y: number, onGrab: (event: React.MouseEvent) => void, key: string) => (
    <rect key={key} x={x - 5} y={y - 5} width={10} height={10} rx={2}
      fill="#ffffff" stroke="#2563eb" strokeWidth={2} style={{ cursor: 'nwse-resize' }}
      onMouseDown={onGrab} />
  );

  const button = (active: boolean) =>
    `flex items-center justify-center h-8 w-8 rounded-lg border transition ${
      active ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-3" onMouseDown={(e) => e.stopPropagation()}>
      <div className="flex max-h-[95vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">Draw a diagram</h2>
            <p className="text-xs text-slate-500">Pick a shape, drag on the sheet to draw it, then drag it about to arrange.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 text-slate-400 hover:text-slate-700" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tools */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2">
          <div className="flex gap-1">
            {TOOLS.map((entry) => (
              <button key={entry.tool} type="button" title={entry.label} aria-label={entry.label}
                aria-pressed={tool === entry.tool}
                onClick={() => setTool(entry.tool)} className={button(tool === entry.tool)}>
                {entry.icon}
              </button>
            ))}
          </div>

          <span className="mx-1 h-6 w-px bg-slate-200" />

          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            Fill
            <input type="color" value={fill === 'none' ? '#ffffff' : fill} aria-label="Fill colour"
              onChange={(e) => { setFill(e.target.value); if (selected && isBox(selected)) commit(items.map((i) => (i.id === selected.id ? { ...i, fill: e.target.value } as DrawingItem : i))); }}
              className="h-7 w-7 cursor-pointer rounded border-0 bg-transparent p-0" />
            <button type="button" onClick={() => { setFill('none'); if (selected && isBox(selected)) commit(items.map((i) => (i.id === selected.id ? { ...i, fill: 'none' } as DrawingItem : i))); }}
              className={`rounded border px-1.5 py-0.5 text-[11px] ${fill === 'none' ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500'}`}>
              None
            </button>
          </label>

          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            Line
            <input type="color" value={stroke} aria-label="Line colour"
              onChange={(e) => { setStroke(e.target.value); if (selected) commit(items.map((i) => (i.id === selected.id ? { ...i, ...(i.kind === 'text' ? { fill: e.target.value } : { stroke: e.target.value }) } as DrawingItem : i))); }}
              className="h-7 w-7 cursor-pointer rounded border-0 bg-transparent p-0" />
          </label>

          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            Thickness
            <input type="range" min={1} max={12} value={strokeWidth} aria-label="Line thickness"
              onChange={(e) => {
                const width = Number(e.target.value);
                setStrokeWidth(width);
                if (selected && selected.kind !== 'text') commit(items.map((i) => (i.id === selected.id ? { ...i, strokeWidth: width } as DrawingItem : i)));
              }}
              className="w-20" />
          </label>

          <div className="ml-auto flex items-center gap-1">
            {SWATCHES.map((colour) => (
              <button key={colour} type="button" title={colour === 'none' ? 'No fill' : colour}
                aria-label={`Fill ${colour}`}
                onClick={() => { setFill(colour); if (selected && isBox(selected)) commit(items.map((i) => (i.id === selected.id ? { ...i, fill: colour } as DrawingItem : i))); }}
                className="h-5 w-5 rounded-full border border-slate-300"
                style={{ background: colour === 'none' ? 'repeating-linear-gradient(45deg,#d1d5db 0,#d1d5db 3px,#fff 3px,#fff 6px)' : colour }} />
            ))}
          </div>
        </div>

        {/* Sheet */}
        <div className="flex-1 overflow-auto bg-slate-100 p-4">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            className="mx-auto block max-w-full rounded-lg border border-slate-300 bg-white shadow-sm"
            style={{ cursor: tool === 'select' ? 'default' : 'crosshair', touchAction: 'none' }}
            onMouseDown={startOnCanvas}
            onMouseMove={moveOnCanvas}
            onMouseUp={endDrag}
            onMouseLeave={endDrag}
          >
            <defs>
              <marker id={ARROW_HEAD} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
              </marker>
            </defs>
            {background !== 'transparent' && (
              <rect x={0} y={0} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} fill={background} />
            )}

            {items.map((item) => (
              <g key={item.id} onMouseDown={(e) => grabItem(e, item)} style={{ cursor: tool === 'select' ? 'move' : 'crosshair' }}>
                {/* Words are only clickable on the letters themselves, which is
                    fiddly to hit, so a label gets an invisible patch to grab.
                    It stays on the board and never reaches the picture. */}
                {item.kind === 'text' && (
                  <rect x={item.x - 4} y={item.y - item.fontSize} width={textWidth(item)} height={item.fontSize * 1.4} fill="transparent" />
                )}
                <g dangerouslySetInnerHTML={{ __html: itemToSvg(item) }} />
              </g>
            ))}

            {/* Selection outline and handles */}
            {selected && isBox(selected) && (
              <>
                <rect x={selected.x} y={selected.y} width={selected.w} height={selected.h}
                  fill="none" stroke="#2563eb" strokeDasharray="4 3" strokeWidth={1} pointerEvents="none" />
                {handle(selected.x + selected.w, selected.y + selected.h, (e) => grabHandle(e, selected, 'resize'), 'br')}
              </>
            )}
            {selected && isLine(selected) && (
              <>
                {handle(selected.x1, selected.y1, (e) => grabHandle(e, selected, 'end1'), 'e1')}
                {handle(selected.x2, selected.y2, (e) => grabHandle(e, selected, 'end2'), 'e2')}
              </>
            )}
            {selected && selected.kind === 'text' && (
              <rect x={selected.x - 4} y={selected.y - selected.fontSize} width={textWidth(selected)} height={selected.fontSize * 1.4}
                fill="none" stroke="#2563eb" strokeDasharray="4 3" strokeWidth={1} pointerEvents="none" />
            )}
          </svg>
        </div>

        {/* What is selected */}
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 bg-slate-50 px-4 py-2">
          {selected?.kind === 'text' ? (
            <label className="flex items-center gap-2 text-xs text-slate-600">
              Label
              <input value={selected.text} autoFocus
                onChange={(e) => update(selected.id, { text: e.target.value } as Partial<DrawingItem>)}
                className="w-48 rounded border border-slate-300 px-2 py-1 text-sm" />
              <input type="range" min={10} max={48} value={selected.fontSize} aria-label="Label size"
                onChange={(e) => update(selected.id, { fontSize: Number(e.target.value) } as Partial<DrawingItem>)}
                className="w-20" />
            </label>
          ) : (
            <span className="text-xs text-slate-500">
              {selected ? 'Drag the shape to move it, or its square to resize.' : `${items.length} shape${items.length === 1 ? '' : 's'} on the sheet.`}
            </span>
          )}

          <div className="ml-auto flex items-center gap-1">
            <button type="button" onClick={undo} disabled={!past.length} title="Undo"
              className={`${button(false)} disabled:opacity-40`}><Undo2 className="h-4 w-4" /></button>
            <button type="button" onClick={redo} disabled={!future.length} title="Redo"
              className={`${button(false)} disabled:opacity-40`}><Redo2 className="h-4 w-4" /></button>
            <button type="button" onClick={removeSelected} disabled={!selected} title="Delete the selected shape"
              className={`${button(false)} text-rose-600 disabled:opacity-40`}><Trash2 className="h-4 w-4" /></button>
            <button type="button" onClick={() => setBackground((b) => (b === 'transparent' ? '#ffffff' : 'transparent'))}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-50">
              {background === 'transparent' ? 'No background' : 'White background'}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Cancel
          </button>
          <button type="button" disabled={!items.length} onClick={() => onInsert(preview)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
            {initialItems?.length ? 'Save changes' : 'Insert drawing'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ShapeCanvas;
