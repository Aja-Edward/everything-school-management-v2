/**
 * ShapePanel — a floating panel for configuring and inserting SVG shapes
 * into the exam editor.
 *
 * A shape goes in as a drawing of one shape (see ShapeCanvas.shapeDrawing):
 * an SVG inserted via the Image extension, so it gets the same drag-resize
 * toolbar as uploaded photos, and "Edit drawing" opens it on the drawing
 * board to be moved, resized, turned, recoloured or labelled.
 *
 * Features:
 *  • 40 shape types across 5 categories, every basic geometric shape among them
 *  • Fill colour, stroke colour, background colour
 *  • Size (8 – 300 px), stroke width (0 – 12 px)
 *  • Live preview
 */
import React, { useState, useCallback } from 'react';
import { X } from 'lucide-react';
import { SHAPE_CATEGORIES, tightBox } from './shapeLibrary';
import { shapeDrawing } from './ShapeCanvas';

// ─── SVG builder ──────────────────────────────────────────────────────────────

interface ShapeConfig {
  categoryIdx: number;
  shapeIdx: number;
  fillColor: string;
  strokeColor: string;
  bgColor: string;
  size: number;
  strokeWidth: number;
}

function buildSvgDataUrl(config: ShapeConfig): string {
  const { categoryIdx, shapeIdx, fillColor, strokeColor, bgColor, size, strokeWidth } = config;
  const shape = SHAPE_CATEGORIES[categoryIdx]?.shapes[shapeIdx];
  if (!shape) return '';

  const inner = shape.path(fillColor, strokeColor, strokeWidth);
  const { x, y, w, h } = tightBox(inner, strokeWidth);
  // `size` is the longer side; the shorter one follows the shape.
  const scale = size / Math.max(w, h);
  const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.max(1, Math.round(w * scale))}" height="${Math.max(1, Math.round(h * scale))}" viewBox="${x} ${y} ${w} ${h}">
    ${bgColor !== 'transparent' ? `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${bgColor}" rx="6"/>` : ''}
    ${inner}
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgStr)}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface ShapePanelProps {
  /** `width` is the picture's width in pixels. */
  onInsert: (dataUrl: string, altText: string, width: number) => void;
  onClose: () => void;
  /** Opens the drawing board, where shapes can be labelled. */
  onDraw?: () => void;
}

/** Any size from a dot to most of a line; it can be changed again in the question. */
const MIN_SIZE = 8;
const MAX_SIZE = 300;

const DEFAULT: ShapeConfig = {
  categoryIdx: 0,
  shapeIdx: 0,
  fillColor: '#3b82f6',
  strokeColor: '#1d4ed8',
  bgColor: 'transparent',
  size: 80,
  strokeWidth: 2,
};

const ShapePanel: React.FC<ShapePanelProps> = ({ onInsert, onClose, onDraw }) => {
  const [cfg, setCfg] = useState<ShapeConfig>({ ...DEFAULT });

  const set = <K extends keyof ShapeConfig>(k: K, v: ShapeConfig[K]) =>
    setCfg(prev => ({ ...prev, [k]: v }));

  const previewUrl = buildSvgDataUrl(cfg);
  const selectedShape = SHAPE_CATEGORIES[cfg.categoryIdx]?.shapes[cfg.shapeIdx];

  const handleInsert = useCallback(() => {
    if (!selectedShape) return;
    // Inserted as a drawing of one shape, so it opens on the drawing board
    // to be moved, resized, turned, recoloured or labelled later. A plain
    // picture of it could only be stretched.
    const drawing = shapeDrawing(selectedShape.label, cfg.fillColor, cfg.strokeColor, cfg.strokeWidth, cfg.size, cfg.bgColor);
    if (!drawing) return;
    onInsert(drawing.dataUrl, selectedShape.label, Math.max(1, Math.round(drawing.width)));
  }, [cfg, onInsert, selectedShape]);

  const swatch = (color: string) => (
    <div className="w-5 h-5 rounded border border-gray-300 flex-shrink-0" style={{ background: color }} />
  );

  // A window of its own over the page. Hung from the toolbar, it sat inside
  // the editor's box, which cut it down to whatever height the editor had:
  // a short question showed an oval and a hexagon and nothing else.
  // preventDefault keeps the editor's cursor where the shape should go.
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-3"
      onMouseDown={e => { e.preventDefault(); if (e.target === e.currentTarget) onClose(); }}>
    <div className="bg-white border border-gray-200 rounded-xl shadow-2xl w-[640px] max-w-full max-h-[90vh] overflow-hidden flex flex-col">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 bg-gray-50">
        <span className="text-sm font-semibold text-gray-700">Shape Designer</span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
          <X size={16} />
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: shape gallery */}
        <div className="w-64 border-r border-gray-100 overflow-y-auto p-2 space-y-3">
          {SHAPE_CATEGORIES.map((cat, ci) => (
            <div key={cat.name}>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1 mb-1">
                {cat.name}
              </p>
              <div className="grid grid-cols-4 gap-1">
                {cat.shapes.map((shape, si) => {
                  const url = buildSvgDataUrl({ ...cfg, categoryIdx: ci, shapeIdx: si, size: 36 });
                  const active = cfg.categoryIdx === ci && cfg.shapeIdx === si;
                  return (
                    <button
                      key={shape.label}
                      type="button"
                      title={shape.label}
                      onClick={() => setCfg(prev => ({ ...prev, categoryIdx: ci, shapeIdx: si }))}
                      className={`p-1.5 rounded-lg border-2 transition-all flex items-center justify-center ${
                        active ? 'border-blue-500 bg-blue-50 shadow-sm' : 'border-transparent hover:border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <img src={url} alt={shape.label} width={28} height={28} className="block" />
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Right: configuration + preview */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">

          {/* Preview */}
          <div className="flex items-center justify-center bg-[repeating-linear-gradient(45deg,#f3f4f6_0,#f3f4f6_10px,#e5e7eb_10px,#e5e7eb_20px)] rounded-xl h-32 border border-gray-200">
            {previewUrl && (
              <img
                src={previewUrl}
                alt="Preview"
                style={{ width: Math.min(cfg.size, 110), height: Math.min(cfg.size, 110), objectFit: 'contain' }}
              />
            )}
          </div>

          {selectedShape && (
            <p className="text-xs text-center text-gray-500 -mt-2">{selectedShape.label}</p>
          )}

          {/* Size */}
          <div>
            <label className="flex items-center justify-between text-xs font-medium text-gray-600 mb-1">
              <span>Size</span>
              <span className="flex items-center gap-1">
                <input type="number" min={MIN_SIZE} max={MAX_SIZE} value={cfg.size} aria-label="Size in pixels"
                  onChange={e => set('size', Math.max(MIN_SIZE, Math.min(MAX_SIZE, Number(e.target.value) || MIN_SIZE)))}
                  className="w-16 text-xs border border-gray-200 rounded px-1.5 py-0.5 font-mono text-right" />
                <span className="font-mono text-gray-400">px</span>
              </span>
            </label>
            <input type="range" min={MIN_SIZE} max={MAX_SIZE} step={1} value={cfg.size}
              onChange={e => set('size', Number(e.target.value))} className="w-full" />
            <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
              <span>{MIN_SIZE}</span><span>150</span><span>{MAX_SIZE}</span>
            </div>
          </div>

          {/* Stroke width */}
          <div>
            <label className="flex items-center justify-between text-xs font-medium text-gray-600 mb-1">
              <span>Border thickness</span>
              <span className="font-mono text-gray-400">{cfg.strokeWidth}px</span>
            </label>
            <input type="range" min={0} max={12} step={1} value={cfg.strokeWidth}
              onChange={e => set('strokeWidth', Number(e.target.value))} className="w-full" />
          </div>

          {/* Colors */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-600">Colours</p>

            {[
              { label: 'Fill colour',       key: 'fillColor'   as const, value: cfg.fillColor   },
              { label: 'Border colour',     key: 'strokeColor' as const, value: cfg.strokeColor },
            ].map(({ label, key, value }) => (
              <div key={key} className="flex items-center gap-2">
                {swatch(value)}
                <label className="text-xs text-gray-600 flex-1">{label}</label>
                <input type="color" value={value}
                  onChange={e => set(key, e.target.value)}
                  className="w-8 h-6 rounded cursor-pointer border-0 p-0 bg-transparent" />
                <input type="text" value={value} onChange={e => set(key, e.target.value)}
                  className="w-20 text-xs border border-gray-200 rounded px-1.5 py-1 font-mono" maxLength={7} />
              </div>
            ))}

            {/* Background */}
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded border border-gray-300 flex-shrink-0 bg-[repeating-linear-gradient(45deg,#d1d5db_0,#d1d5db_3px,#fff_3px,#fff_6px)]" />
              <label className="text-xs text-gray-600 flex-1">Background</label>
              <button type="button"
                onClick={() => set('bgColor', cfg.bgColor === 'transparent' ? '#ffffff' : 'transparent')}
                className={`text-xs px-2 py-1 rounded border transition-colors ${
                  cfg.bgColor === 'transparent'
                    ? 'bg-white border-gray-300 text-gray-500'
                    : 'bg-blue-50 border-blue-300 text-blue-700'
                }`}>
                {cfg.bgColor === 'transparent' ? 'None' : 'On'}
              </button>
              {cfg.bgColor !== 'transparent' && (
                <>
                  <input type="color" value={cfg.bgColor}
                    onChange={e => set('bgColor', e.target.value)}
                    className="w-8 h-6 rounded cursor-pointer border-0 p-0 bg-transparent" />
                  <input type="text" value={cfg.bgColor} onChange={e => set('bgColor', e.target.value)}
                    className="w-20 text-xs border border-gray-200 rounded px-1.5 py-1 font-mono" maxLength={7} />
                </>
              )}
            </div>
          </div>

          {/* Quick colour presets */}
          <div>
            <p className="text-xs text-gray-500 mb-1.5">Quick fill</p>
            <div className="flex flex-wrap gap-1.5">
              {['#ef4444','#f97316','#eab308','#22c55e','#3b82f6','#8b5cf6','#ec4899',
                '#000000','#6b7280','#ffffff','none'].map(c => (
                <button key={c} type="button"
                  onClick={() => set('fillColor', c)}
                  title={c === 'none' ? 'Transparent' : c}
                  className={`w-6 h-6 rounded-full border-2 transition-all ${
                    cfg.fillColor === c ? 'border-gray-800 scale-125' : 'border-gray-200 hover:scale-110'
                  }`}
                  style={{ background: c === 'none' ? 'repeating-linear-gradient(45deg,#d1d5db 0,#d1d5db 3px,#fff 3px,#fff 6px)' : c }}
                />
              ))}
            </div>
          </div>

          {/* Insert button */}
          <button
            type="button"
            onClick={handleInsert}
            className="w-full py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors mt-2"
          >
            Insert Shape
          </button>

          {/* Labels go on in the drawing board, which this shape also opens in. */}
          {onDraw && (
            <button
              type="button"
              onClick={onDraw}
              className="w-full py-2 border border-gray-300 text-gray-700 rounded-xl text-xs font-medium hover:bg-gray-50 transition-colors"
            >
              Need freehand, labels or several shapes? Open the drawing board ✏️
            </button>
          )}
        </div>
      </div>
    </div>
    </div>
  );
};

export default ShapePanel;
