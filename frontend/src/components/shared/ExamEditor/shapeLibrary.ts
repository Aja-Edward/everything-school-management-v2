/**
 * The shapes the Shape Designer offers, each drawn in a 100 x 100 square.
 * Shared with the drawing board, so a shape inserted from the designer can be
 * opened on the board and moved, resized, turned and recoloured there.
 */

// ─── Shape definitions ─────────────────────────────────────────────────────────

export type ShapeDef = { label: string; path: (fill: string, stroke: string, sw: number) => string };

function poly(points: [number, number][], fill: string, stroke: string, sw: number) {
  const d = points.map(([x, y]) => `${x},${y}`).join(' ');
  return `<polygon points="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"/>`;
}

export const SHAPE_CATEGORIES: { name: string; shapes: ShapeDef[] }[] = [
  {
    name: 'Basic',
    shapes: [
      { label: 'Circle',    path: (f,s,w) => `<circle cx="50" cy="50" r="${46-w/2}" fill="${f}" stroke="${s}" stroke-width="${w}"/>` },
      { label: 'Square',    path: (f,s,w) => `<rect x="${w/2}" y="${w/2}" width="${100-w}" height="${100-w}" fill="${f}" stroke="${s}" stroke-width="${w}"/>` },
      { label: 'Rectangle', path: (f,s,w) => `<rect x="${w/2}" y="${25+w/2}" width="${100-w}" height="${50-w}" fill="${f}" stroke="${s}" stroke-width="${w}"/>` },
      { label: 'Oval',      path: (f,s,w) => `<ellipse cx="50" cy="50" rx="${46-w/2}" ry="${28-w/2}" fill="${f}" stroke="${s}" stroke-width="${w}"/>` },
      { label: 'Semicircle', path: (f,s,w) => `<path d="M${3+w/2} 72 A${47-w/2} ${47-w/2} 0 0 1 ${97-w/2} 72 Z" fill="${f}" stroke="${s}" stroke-width="${w}" stroke-linejoin="round"/>` },
      { label: 'Triangle',  path: (f,s,w) => poly([[50,3],[97,97],[3,97]], f,s,w) },
      { label: 'Right-angled triangle', path: (f,s,w) => poly([[3,3],[3,97],[97,97]], f,s,w) + `<polyline points="3,85 15,85 15,97" fill="none" stroke="${s}" stroke-width="${Math.max(1, w/2)}"/>` },
      { label: 'Rhombus',   path: (f,s,w) => poly([[50,3],[97,50],[50,97],[3,50]], f,s,w) },
      { label: 'Kite',      path: (f,s,w) => poly([[50,3],[90,35],[50,97],[10,35]], f,s,w) },
      { label: 'Parallelogram', path: (f,s,w) => poly([[20,10],[100,10],[80,90],[0,90]], f,s,w) },
      { label: 'Trapezium', path: (f,s,w) => poly([[20,10],[80,10],[97,90],[3,90]], f,s,w) },
      { label: 'Pentagon',  path: (f,s,w) => poly([[50,3],[97,36],[79,95],[21,95],[3,36]], f,s,w) },
      { label: 'Hexagon',   path: (f,s,w) => poly([[50,3],[93,27],[93,73],[50,97],[7,73],[7,27]], f,s,w) },
      { label: 'Octagon',   path: (f,s,w) => poly([[30,3],[70,3],[97,30],[97,70],[70,97],[30,97],[3,70],[3,30]], f,s,w) },
      { label: 'Star',      path: (f,s,w) => poly([[50,3],[61,35],[95,35],[68,57],[79,91],[50,70],[21,91],[32,57],[5,35],[39,35]], f,s,w) },
      { label: 'Cross',     path: (f,s,w) => poly([[33,3],[67,3],[67,33],[97,33],[97,67],[67,67],[67,97],[33,97],[33,67],[3,67],[3,33],[33,33]], f,s,w) },
    ],
  },
  {
    name: 'Stars & Symbols',
    shapes: [
      { label: 'Star 5pt', path: (f,s,w) => poly([[50,3],[61,35],[95,35],[68,57],[79,91],[50,70],[21,91],[32,57],[5,35],[39,35]], f,s,w) },
      { label: 'Star 6pt', path: (f,s,w) => poly([[50,3],[60,35],[90,35],[70,55],[80,85],[50,68],[20,85],[30,55],[10,35],[40,35]], f,s,w) },
      { label: 'Star 4pt', path: (f,s,w) => poly([[50,3],[60,40],[97,50],[60,60],[50,97],[40,60],[3,50],[40,40]], f,s,w) },
      { label: 'Heart',    path: (f,s,w) => `<path d="M50 85 C28 65 3 52 3 30 C3 14 18 4 32 14 C40 19 50 30 50 30 C50 30 60 19 68 14 C82 4 97 14 97 30 C97 52 72 65 50 85Z" fill="${f}" stroke="${s}" stroke-width="${w}" stroke-linejoin="round"/>` },
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

/** A shape by its name, which is unique across every category. */
export const findLibraryShape = (label: string): ShapeDef | undefined => {
  for (const category of SHAPE_CATEGORIES) {
    const shape = category.shapes.find((entry) => entry.label === label);
    if (shape) return shape;
  }
  return undefined;
};

const tightBoxes = new Map<string, { x: number; y: number; w: number; h: number }>();

/**
 * The part of the 100×100 square a shape actually covers, line included.
 * Every shape used to keep the whole square, so a rectangle or an oval came
 * with empty bands above and below it that took up room in the question.
 */
export function tightBox(inner: string, strokeWidth: number) {
  const known = tightBoxes.get(inner);
  if (known) return known;
  let box = { x: 0, y: 0, w: 100, h: 100 };
  try {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('style', 'position:absolute;left:-9999px;top:-9999px;width:100px;height:100px');
    svg.innerHTML = inner;
    document.body.appendChild(svg);
    const b = svg.getBBox();
    document.body.removeChild(svg);
    // getBBox leaves out the line drawn round the edge, and pointed corners
    // poke a little past it, so give a line's width to spare.
    const pad = Math.max(1, strokeWidth);
    if (b.width > 0 && b.height > 0) {
      box = { x: b.x - pad, y: b.y - pad, w: b.width + pad * 2, h: b.height + pad * 2 };
    }
  } catch {
    // No layout to measure with: keep the whole square.
  }
  tightBoxes.set(inner, box);
  return box;
}

