/**
 * ShapePanel — a floating panel for configuring and inserting SVG shapes
 * into the exam editor.
 *
 * Shapes are rendered as inline SVGs → converted to data-URL PNGs and
 * inserted via the Image extension so they get the same drag-resize toolbar
 * as uploaded photos.
 *
 * Features:
 *  • 30+ shape types across 5 categories
 *  • Fill colour, stroke colour, background colour
 *  • Size (24 – 300 px), stroke width (0 – 12 px)
 *  • Live preview
 */
import React, { useState, useCallback } from 'react';
import { X } from 'lucide-react';

// ─── Shape definitions ─────────────────────────────────────────────────────────

type ShapeDef = { label: string; path: (fill: string, stroke: string, sw: number) => string };

const C = 50;  // centre of 100×100 viewBox

function poly(points: [number, number][], fill: string, stroke: string, sw: number) {
  const d = points.map(([x, y]) => `${x},${y}`).join(' ');
  return `<polygon points="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"/>`;
}

const SHAPE_CATEGORIES: { name: string; shapes: ShapeDef[] }[] = [
  {
    name: 'Basic',
    shapes: [
      { label: 'Circle',    path: (f,s,w) => `<circle cx="50" cy="50" r="${46-w/2}" fill="${f}" stroke="${s}" stroke-width="${w}"/>` },
      { label: 'Square',    path: (f,s,w) => `<rect x="${w/2}" y="${w/2}" width="${100-w}" height="${100-w}" fill="${f}" stroke="${s}" stroke-width="${w}"/>` },
      { label: 'Rectangle', path: (f,s,w) => `<rect x="${w/2}" y="${25+w/2}" width="${100-w}" height="${50-w}" fill="${f}" stroke="${s}" stroke-width="${w}"/>` },
      { label: 'Oval',      path: (f,s,w) => `<ellipse cx="50" cy="50" rx="${46-w/2}" ry="${28-w/2}" fill="${f}" stroke="${s}" stroke-width="${w}"/>` },
      { label: 'Triangle',  path: (f,s,w) => poly([[50,3],[97,97],[3,97]], f,s,w) },
      { label: 'Diamond',   path: (f,s,w) => poly([[50,3],[97,50],[50,97],[3,50]], f,s,w) },
      { label: 'Pentagon',  path: (f,s,w) => poly([[50,3],[97,36],[79,95],[21,95],[3,36]], f,s,w) },
      { label: 'Hexagon',   path: (f,s,w) => poly([[50,3],[93,27],[93,73],[50,97],[7,73],[7,27]], f,s,w) },
      { label: 'Parallelogram', path: (f,s,w) => poly([[20,10],[100,10],[80,90],[0,90]], f,s,w) },
      { label: 'Trapezoid', path: (f,s,w) => poly([[20,10],[80,10],[97,90],[3,90]], f,s,w) },
    ],
  },
  {
    name: 'Stars & Symbols',
    shapes: [
      { label: 'Star 5pt', path: (f,s,w) => poly([[50,3],[61,35],[95,35],[68,57],[79,91],[50,70],[21,91],[32,57],[5,35],[39,35]], f,s,w) },
      { label: 'Star 6pt', path: (f,s,w) => poly([[50,3],[60,35],[90,35],[70,55],[80,85],[50,68],[20,85],[30,55],[10,35],[40,35]], f,s,w) },
      { label: 'Star 4pt', path: (f,s,w) => poly([[50,3],[60,40],[97,50],[60,60],[50,97],[40,60],[3,50],[40,40]], f,s,w) },
      { label: 'Heart',    path: (f,s,w) => `<path d="M50 85 C28 65 3 52 3 30 C3 14 18 4 32 14 C40 19 50 30 50 30 C50 30 60 19 68 14 C82 4 97 14 97 30 C97 52 72 65 50 85Z" fill="${f}" stroke="${s}" stroke-width="${w}" stroke-linejoin="round"/>` },
      { label: 'Cross',    path: (f,s,w) => poly([[33,3],[67,3],[67,33],[97,33],[97,67],[67,67],[67,97],[33,97],[33,67],[3,67],[3,33],[33,33]], f,s,w) },
      { label: 'Plus',     path: (f,s,w) => poly([[35,3],[65,3],[65,35],[97,35],[97,65],[65,65],[65,97],[35,97],[35,65],[3,65],[3,35],[35,35]], f,s,w) },
      { label: 'Check ✓',  path: (f,s,w) => `<polyline points="10,55 38,80 90,20" fill="none" stroke="${f === 'none' ? s : f}" stroke-width="${Math.max(w,8)}" stroke-linecap="round" stroke-linejoin="round"/>` },
      { label: 'X Mark',   path: (f,s,w) => `<g stroke="${f === 'none' ? s : f}" stroke-width="${Math.max(w,8)}" stroke-linecap="round"><line x1="15" y1="15" x2="85" y2="85"/><line x1="85" y1="15" x2="15" y2="85"/></g>` },
      { label: 'Smiley',   path: (f,s,w) => `<circle cx="50" cy="50" r="45" fill="${f}" stroke="${s}" stroke-width="${w}"/><circle cx="35" cy="38" r="6" fill="${s}"/><circle cx="65" cy="38" r="6" fill="${s}"/><path d="M30 60 Q50 80 70 60" fill="none" stroke="${s}" stroke-width="${Math.max(w,4)}" stroke-linecap="round"/>` },
      { label: 'Speech',   path: (f,s,w) => `<path d="M5 10 Q5 5 10 5 L90 5 Q95 5 95 10 L95 70 Q95 75 90 75 L55 75 L45 95 L40 75 L10 75 Q5 75 5 70Z" fill="${f}" stroke="${s}" stroke-width="${w}" stroke-linejoin="round"/>` },
    ],
  },
  {
    name: 'Arrows',
    shapes: [
      { label: 'Arrow →',  path: (f,s,w) => poly([[5,38],[65,38],[65,15],[97,50],[65,85],[65,62],[5,62]], f,s,w) },
      { label: 'Arrow ←',  path: (f,s,w) => poly([[95,38],[35,38],[35,15],[3,50],[35,85],[35,62],[95,62]], f,s,w) },
      { label: 'Arrow ↑',  path: (f,s,w) => poly([[38,95],[38,35],[15,35],[50,3],[85,35],[62,35],[62,95]], f,s,w) },
      { label: 'Arrow ↓',  path: (f,s,w) => poly([[38,5],[38,65],[15,65],[50,97],[85,65],[62,65],[62,5]], f,s,w) },
      { label: 'Arrow ↔',  path: (f,s,w) => poly([[3,50],[25,20],[25,38],[75,38],[75,20],[97,50],[75,80],[75,62],[25,62],[25,80]], f,s,w) },
      { label: 'Curved →', path: (f,s,w) => `<path d="M5 65 Q50 65 50 35" fill="none" stroke="${f === 'none' ? s : f}" stroke-width="${Math.max(w,6)}" stroke-linecap="round"/><polygon points="50,10 35,40 65,40" fill="${f === 'none' ? s : f}"/>` },
    ],
  },
  {
    name: 'Science & Math',
    shapes: [
      { label: 'Atom',     path: (f,s,w) => `<circle cx="50" cy="50" r="10" fill="${f}" stroke="${s}" stroke-width="${w}"/><ellipse cx="50" cy="50" rx="45" ry="15" fill="none" stroke="${f === 'none' ? s : f}" stroke-width="${Math.max(w,3)}"/><ellipse cx="50" cy="50" rx="45" ry="15" fill="none" stroke="${f === 'none' ? s : f}" stroke-width="${Math.max(w,3)}" transform="rotate(60,50,50)"/><ellipse cx="50" cy="50" rx="45" ry="15" fill="none" stroke="${f === 'none' ? s : f}" stroke-width="${Math.max(w,3)}" transform="rotate(120,50,50)"/>` },
      { label: 'DNA',      path: (f,s,w) => `<path d="M30 5 Q70 25 30 50 Q70 75 30 95" fill="none" stroke="${f === 'none' ? s : f}" stroke-width="${Math.max(w,5)}" stroke-linecap="round"/><path d="M70 5 Q30 25 70 50 Q30 75 70 95" fill="none" stroke="${s}" stroke-width="${Math.max(w,5)}" stroke-linecap="round"/>` },
      { label: 'Infinity ∞', path: (f,s,w) => `<path d="M20 50 C20 30 40 30 50 50 C60 70 80 70 80 50 C80 30 60 30 50 50 C40 70 20 70 20 50Z" fill="${f}" stroke="${s}" stroke-width="${w}"/>` },
      { label: 'Pi π',     path: (f,s,w) => `<line x1="10" y1="20" x2="90" y2="20" stroke="${f === 'none' ? s : f}" stroke-width="${Math.max(w,6)}" stroke-linecap="round"/><path d="M30 20 L30 85" fill="none" stroke="${f === 'none' ? s : f}" stroke-width="${Math.max(w,6)}" stroke-linecap="round"/><path d="M70 20 Q80 55 65 85" fill="none" stroke="${f === 'none' ? s : f}" stroke-width="${Math.max(w,6)}" stroke-linecap="round"/>` },
      { label: 'Flask',    path: (f,s,w) => `<path d="M35 5 L35 45 L5 90 Q3 95 8 97 L92 97 Q97 95 95 90 L65 45 L65 5Z" fill="${f}" stroke="${s}" stroke-width="${w}" stroke-linejoin="round"/><line x1="35" y1="5" x2="65" y2="5" stroke="${s}" stroke-width="${Math.max(w,4)}"/><circle cx="30" cy="78" r="6" fill="${s}" opacity="0.6"/><circle cx="65" cy="85" r="4" fill="${s}" opacity="0.5"/>` },
      { label: 'Molecule', path: (f,s,w) => `<circle cx="50" cy="50" r="12" fill="${f}" stroke="${s}" stroke-width="${w}"/><circle cx="20" cy="25" r="8" fill="${s}" stroke="${s}" stroke-width="${w}"/><circle cx="80" cy="25" r="8" fill="${s}" stroke="${s}" stroke-width="${w}"/><circle cx="20" cy="75" r="8" fill="${s}" stroke="${s}" stroke-width="${w}"/><circle cx="80" cy="75" r="8" fill="${s}" stroke="${s}" stroke-width="${w}"/><line x1="38" y1="42" x2="28" y2="32" stroke="${s}" stroke-width="${Math.max(w,3)}"/><line x1="62" y1="42" x2="72" y2="32" stroke="${s}" stroke-width="${Math.max(w,3)}"/><line x1="38" y1="58" x2="28" y2="68" stroke="${s}" stroke-width="${Math.max(w,3)}"/><line x1="62" y1="58" x2="72" y2="68" stroke="${s}" stroke-width="${Math.max(w,3)}"/>` },
    ],
  },
  {
    name: 'Academic',
    shapes: [
      { label: 'Book',     path: (f,s,w) => `<rect x="5" y="10" width="42" height="80" rx="2" fill="${f}" stroke="${s}" stroke-width="${w}"/><rect x="53" y="10" width="42" height="80" rx="2" fill="${s === '#000000' ? '#e5e7eb' : s}" stroke="${s}" stroke-width="${w}"/><path d="M47 10 Q50 50 47 90" fill="none" stroke="${s}" stroke-width="${Math.max(w,3)}"/><path d="M53 10 Q50 50 53 90" fill="none" stroke="${s}" stroke-width="${Math.max(w,3)}"/>` },
      { label: 'Pencil',   path: (f,s,w) => `<polygon points="40,5 60,5 65,80 50,97 35,80" fill="${f}" stroke="${s}" stroke-width="${w}" stroke-linejoin="round"/><polygon points="40,5 60,5 60,25 40,25" fill="${s}" stroke="${s}" stroke-width="${w}"/>` },
      { label: 'Mortarboard', path:(f,s,w)=> `<polygon points="50,10 95,35 50,60 5,35" fill="${f}" stroke="${s}" stroke-width="${w}" stroke-linejoin="round"/><path d="M80 50 L80 78 Q65 90 50 85 Q35 90 20 78 L20 50" fill="${f}" stroke="${s}" stroke-width="${w}" stroke-linejoin="round"/><line x1="95" y1="35" x2="95" y2="65" stroke="${s}" stroke-width="${Math.max(w,4)}" stroke-linecap="round"/>` },
      { label: 'Lightbulb', path:(f,s,w)=> `<path d="M50 5 C25 5 10 20 10 40 C10 60 25 72 30 80 L70 80 C75 72 90 60 90 40 C90 20 75 5 50 5Z" fill="${f}" stroke="${s}" stroke-width="${w}"/><rect x="33" y="80" width="34" height="10" rx="3" fill="${s}"/><line x1="38" y1="90" x2="38" y2="97" stroke="${s}" stroke-width="${Math.max(w,4)}" stroke-linecap="round"/><line x1="62" y1="90" x2="62" y2="97" stroke="${s}" stroke-width="${Math.max(w,4)}" stroke-linecap="round"/>` },
    ],
  },
];

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
  const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
    ${bgColor !== 'transparent' ? `<rect x="0" y="0" width="100" height="100" fill="${bgColor}" rx="6"/>` : ''}
    ${inner}
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgStr)}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface ShapePanelProps {
  onInsert: (dataUrl: string, altText: string, size: number) => void;
  onClose: () => void;
}

const DEFAULT: ShapeConfig = {
  categoryIdx: 0,
  shapeIdx: 0,
  fillColor: '#3b82f6',
  strokeColor: '#1d4ed8',
  bgColor: 'transparent',
  size: 80,
  strokeWidth: 2,
};

const ShapePanel: React.FC<ShapePanelProps> = ({ onInsert, onClose }) => {
  const [cfg, setCfg] = useState<ShapeConfig>({ ...DEFAULT });

  const set = <K extends keyof ShapeConfig>(k: K, v: ShapeConfig[K]) =>
    setCfg(prev => ({ ...prev, [k]: v }));

  const previewUrl = buildSvgDataUrl(cfg);
  const selectedShape = SHAPE_CATEGORIES[cfg.categoryIdx]?.shapes[cfg.shapeIdx];

  const handleInsert = useCallback(() => {
    const url = buildSvgDataUrl(cfg);
    if (url) onInsert(url, selectedShape?.label ?? 'Shape', cfg.size);
  }, [cfg, onInsert, selectedShape]);

  const swatch = (color: string) => (
    <div className="w-5 h-5 rounded border border-gray-300 flex-shrink-0" style={{ background: color }} />
  );

  return (
    <div className="absolute top-full left-0 mt-1 z-30 bg-white border border-gray-200 rounded-xl shadow-2xl w-[520px] max-h-[80vh] overflow-hidden flex flex-col"
      onMouseDown={e => e.preventDefault()}>

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
              <span className="font-mono text-gray-400">{cfg.size}px</span>
            </label>
            <input type="range" min={24} max={300} step={4} value={cfg.size}
              onChange={e => set('size', Number(e.target.value))} className="w-full" />
            <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
              <span>24</span><span>150</span><span>300</span>
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
        </div>
      </div>
    </div>
  );
};

export default ShapePanel;
