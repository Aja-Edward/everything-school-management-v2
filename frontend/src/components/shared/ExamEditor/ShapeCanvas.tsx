/**
 * ShapeCanvas — a drawing board for exam questions, the way Word and Google
 * Docs let you draw one: put several shapes on a canvas, draw freehand with a
 * pen, rub out with an eraser, move, resize and turn things, label them, then
 * drop the lot into the question as a single picture.
 *
 * What comes out is an SVG in a data URL, inserted through the editor's Image
 * extension, so it behaves like any other picture: drag to resize, crop, or
 * delete. It is saved inside the question's HTML, shown to students as an
 * ordinary <img>, and printed and turned into PDF like any other picture.
 * The drawing's own description is kept inside the SVG (a <desc> with the
 * items as base64 JSON), so the same drawing can be opened and changed again
 * later instead of being redrawn from scratch.
 *
 * Nothing here is loaded from the internet, so a drawing still shows on an
 * exam station with no connection (see docs/cbt-offline-station.md).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight, ChevronDown, Eraser, Minus, MousePointer2, Pencil, Redo2, Trash2, Type, Undo2, X,
} from 'lucide-react';
import { SHAPE_CATEGORIES, findLibraryShape, tightBox } from './shapeLibrary';

// ─── The drawing ──────────────────────────────────────────────────────────────

export const CANVAS_WIDTH = 720;
export const CANVAS_HEIGHT = 440;
const MIN_SIZE = 8;

/** Marks an SVG as one of our drawings, and carries the items to edit again. */
const DRAWING_ATTR = 'data-drawing';
/** The space kept around the drawing, so it opens again with the same choice. */
const MARGIN_ATTR = 'data-margin';
/** The sheet's colour, so it opens again with the same one. */
const BACKGROUND_ATTR = 'data-background';

/** Every shape the board draws itself, each filling the box it is dragged out to. */
const SHAPES = [
  { kind: 'rect',           label: 'Rectangle' },
  { kind: 'square',         label: 'Square' },
  { kind: 'circle',         label: 'Circle' },
  { kind: 'ellipse',        label: 'Oval' },
  { kind: 'semicircle',     label: 'Semicircle' },
  { kind: 'triangle',       label: 'Triangle' },
  { kind: 'right_triangle', label: 'Right-angled triangle' },
  { kind: 'rhombus',        label: 'Rhombus' },
  { kind: 'kite',           label: 'Kite' },
  { kind: 'parallelogram',  label: 'Parallelogram' },
  { kind: 'trapezium',      label: 'Trapezium' },
  { kind: 'pentagon',       label: 'Pentagon' },
  { kind: 'hexagon',        label: 'Hexagon' },
  { kind: 'octagon',        label: 'Octagon' },
  { kind: 'star',           label: 'Star' },
  { kind: 'cross',          label: 'Cross' },
] as const;

type ShapeKind = typeof SHAPES[number]['kind'];
/** `symbol:<name>` draws one of the Shape Designer's shapes. */
type Tool = 'select' | 'pen' | 'eraser' | ShapeKind | 'line' | 'arrow' | 'text' | `symbol:${string}`;

const SHAPE_KINDS = new Set<string>(SHAPES.map((shape) => shape.kind));
/** Shapes that keep their sides equal however they're dragged. */
const EVEN_KINDS = new Set<string>(['square', 'circle']);
/** Shapes that start wider than tall when placed with a single click. */
const WIDE_KINDS = new Set<string>(['rect', 'ellipse', 'semicircle', 'parallelogram', 'trapezium']);

/** The Designer's own categories, less the basic shapes the board already draws. */
const LIBRARY_CATEGORIES = SHAPE_CATEGORIES.filter((category) => category.name !== 'Basic');

/** Corners of each straight-sided shape, as fractions of its box. */
const CORNERS: Partial<Record<ShapeKind, [number, number][]>> = {
  rect:           [[0, 0], [1, 0], [1, 1], [0, 1]],
  square:         [[0, 0], [1, 0], [1, 1], [0, 1]],
  triangle:       [[0.5, 0], [1, 1], [0, 1]],
  right_triangle: [[0, 0], [1, 1], [0, 1]],
  rhombus:        [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]],
  kite:           [[0.5, 0], [1, 0.35], [0.5, 1], [0, 0.35]],
  parallelogram:  [[0.25, 0], [1, 0], [0.75, 1], [0, 1]],
  trapezium:      [[0.25, 0], [0.75, 0], [1, 1], [0, 1]],
  pentagon:       [[0.5, 0], [1, 0.38], [0.81, 1], [0.19, 1], [0, 0.38]],
  hexagon:        [[0.25, 0], [0.75, 0], [1, 0.5], [0.75, 1], [0.25, 1], [0, 0.5]],
  octagon:        [[0.3, 0], [0.7, 0], [1, 0.3], [1, 0.7], [0.7, 1], [0.3, 1], [0, 0.7], [0, 0.3]],
  star:           [[0.5, 0], [0.61, 0.33], [0.95, 0.33], [0.68, 0.55], [0.79, 0.9], [0.5, 0.69], [0.21, 0.9], [0.32, 0.55], [0.05, 0.33], [0.39, 0.33]],
  cross:          [[0.33, 0], [0.67, 0], [0.67, 0.33], [1, 0.33], [1, 0.67], [0.67, 0.67], [0.67, 1], [0.33, 1], [0.33, 0.67], [0, 0.67], [0, 0.33], [0.33, 0.33]],
};

/** Shapes whose sides and corners a maths question would name. */
const LABELLED_KINDS = new Set<string>(
  Object.keys(CORNERS).filter((kind) => kind !== 'star' && kind !== 'cross'),
);

interface BoxItem {
  id: string;
  kind: ShapeKind;
  x: number; y: number; w: number; h: number;
  fill: string; stroke: string; strokeWidth: number;
  /** Degrees clockwise, about the box's centre. */
  rotation?: number;
}

/** One of the Shape Designer's shapes, stretched to fill its box. */
interface SymbolItem {
  id: string;
  kind: 'symbol';
  /** The shape's name in the Designer. */
  shape: string;
  /** The part of the Designer's 100 x 100 square the shape covers. */
  vb: [number, number, number, number];
  x: number; y: number; w: number; h: number;
  fill: string; stroke: string; strokeWidth: number;
  rotation?: number;
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
  /**
   * Which end of the text sits on its spot. A label beside a shape grows away
   * from it as it's typed: centred above or below, leftwards on the left.
   */
  anchor?: 'middle' | 'end';
  /** Degrees clockwise, about the label's spot. */
  rotation?: number;
}

/**
 * A freehand line, as the points the pen passed through: x, y, x, y… Turning
 * one turns its points, so it never carries a rotation of its own.
 */
interface PenItem {
  id: string;
  kind: 'pen';
  points: number[];
  stroke: string; strokeWidth: number;
}

type BoxLike = BoxItem | SymbolItem;
export type DrawingItem = BoxItem | SymbolItem | LineItem | TextItem | PenItem;

const isSymbol = (item: DrawingItem): item is SymbolItem => item.kind === 'symbol';
const isBox = (item: DrawingItem): item is BoxLike => SHAPE_KINDS.has(item.kind) || isSymbol(item);
const isLine = (item: DrawingItem): item is LineItem =>
  item.kind === 'line' || item.kind === 'arrow';
const isPen = (item: DrawingItem): item is PenItem => item.kind === 'pen';
const isText = (item: DrawingItem): item is TextItem => item.kind === 'text';
const isSymbolTool = (tool: Tool): tool is `symbol:${string}` => tool.startsWith('symbol:');

export const newId = () => Math.random().toString(36).slice(2, 10);

/** One decimal place: plenty on a sheet this size, and it keeps the saved drawing small. */
const round1 = (value: number) => Math.round(value * 10) / 10;

// ─── Geometry ─────────────────────────────────────────────────────────────────

type Point = { x: number; y: number };
type Box = { x: number; y: number; w: number; h: number };

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** A vector turned clockwise (on screen) by `degrees`. */
const turn = (dx: number, dy: number, degrees: number): [number, number] => {
  if (!degrees) return [dx, dy];
  const c = Math.cos(toRadians(degrees));
  const s = Math.sin(toRadians(degrees));
  return [dx * c - dy * s, dx * s + dy * c];
};

/** A point turned about a pivot. */
const turnAbout = (x: number, y: number, px: number, py: number, degrees: number): [number, number] => {
  const [dx, dy] = turn(x - px, y - py, degrees);
  return [px + dx, py + dy];
};

/** An angle brought into -180…180. */
const normalise = (degrees: number) => {
  const a = ((degrees % 360) + 360) % 360;
  return a > 180 ? a - 360 : a;
};

/**
 * A turn as the hand made it, settling on straight angles nearby so a shape
 * can be stood back upright. With Shift held it moves in steps of 15°.
 */
const settle = (degrees: number, steps: boolean) => {
  const a = normalise(degrees);
  if (steps) return normalise(Math.round(a / 15) * 15);
  const square = Math.round(a / 90) * 90;
  return normalise(Math.abs(a - square) < 4 ? square : Math.round(a));
};

/** The box a freehand line's points fill, not counting its thickness. */
const penBox = (points: number[]): Box => {
  let left = Infinity; let top = Infinity; let right = -Infinity; let bottom = -Infinity;
  for (let i = 0; i < points.length; i += 2) {
    left = Math.min(left, points[i]); right = Math.max(right, points[i]);
    top = Math.min(top, points[i + 1]); bottom = Math.max(bottom, points[i + 1]);
  }
  if (!Number.isFinite(left)) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: left, y: top, w: right - left, h: bottom - top };
};

/** How far a point lies from the segment a–b. */
const distanceToSegment = (px: number, py: number, ax: number, ay: number, bx: number, by: number) => {
  const dx = bx - ax; const dy = by - ay;
  const length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};

/**
 * The fewest points that keep a freehand line's shape to within `tolerance`
 * (Ramer–Douglas–Peucker). A pen reports a point every few pixels, which
 * would make a detailed drawing too big to save with the question.
 */
const simplify = (points: number[], tolerance = 0.6): number[] => {
  const count = points.length / 2;
  if (count <= 2) return points.map(round1);
  const keep = new Uint8Array(count);
  keep[0] = 1; keep[count - 1] = 1;
  const stack: [number, number][] = [[0, count - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let furthest = 0; let index = -1;
    for (let i = a + 1; i < b; i++) {
      const d = distanceToSegment(points[2 * i], points[2 * i + 1], points[2 * a], points[2 * a + 1], points[2 * b], points[2 * b + 1]);
      if (d > furthest) { furthest = d; index = i; }
    }
    if (index > 0 && furthest > tolerance) {
      keep[index] = 1;
      stack.push([a, index], [index, b]);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < count; i++) if (keep[i]) out.push(round1(points[2 * i]), round1(points[2 * i + 1]));
  return out;
};

/** A freehand line with a point at least every `step`, so an eraser can cut it anywhere. */
const densify = (points: number[], step: number): number[] => {
  const out: number[] = points.slice(0, 2);
  for (let i = 2; i < points.length; i += 2) {
    const ax = points[i - 2]; const ay = points[i - 1]; const bx = points[i]; const by = points[i + 1];
    const pieces = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step));
    for (let j = 1; j <= pieces; j++) out.push(ax + ((bx - ax) * j) / pieces, ay + ((by - ay) * j) / pieces);
  }
  return out;
};

/**
 * A smooth path through a freehand line's points: each point bends the line
 * towards it, so the corners between pen samples don't show.
 */
const penPath = (points: number[]): string => {
  const count = points.length / 2;
  if (!count) return '';
  const at = (i: number) => `${points[2 * i]} ${points[2 * i + 1]}`;
  // A single dab of the pen is still a dot.
  if (count === 1) return `M${at(0)}L${at(0)}`;
  let d = `M${at(0)}`;
  for (let i = 1; i < count - 1; i++) {
    const midX = round1((points[2 * i] + points[2 * i + 2]) / 2);
    const midY = round1((points[2 * i + 1] + points[2 * i + 3]) / 2);
    d += `Q${at(i)} ${midX} ${midY}`;
  }
  return `${d}L${at(count - 1)}`;
};

/** Roughly how wide a label sits, for its grab patch and selection outline. */
const textWidth = (item: TextItem) => Math.max(40, item.text.length * item.fontSize * 0.6);
/** Where a label's grab patch starts. */
const textLeft = (item: TextItem) => {
  if (item.anchor === 'middle') return item.x - textWidth(item) / 2;
  if (item.anchor === 'end') return item.x - textWidth(item);
  return item.x - 4;
};

const rotationOf = (item: DrawingItem): number => (item as { rotation?: number }).rotation ?? 0;

/**
 * The box an item fills before it is turned: what its selection outline and
 * handles go round. Null for a straight line, which is moved by its ends.
 */
const localBox = (item: DrawingItem): Box | null => {
  if (isBox(item)) return { x: item.x, y: item.y, w: item.w, h: item.h };
  if (isPen(item)) return penBox(item.points);
  if (isText(item)) return { x: textLeft(item), y: item.y - item.fontSize, w: textWidth(item), h: item.fontSize * 1.4 };
  return null;
};

/** The point an item turns about: a shape's centre, a label's spot. */
const pivotOf = (item: DrawingItem): [number, number] => {
  if (isText(item)) return [item.x, item.y];
  if (isLine(item)) return [(item.x1 + item.x2) / 2, (item.y1 + item.y2) / 2];
  const box = localBox(item)!;
  return [box.x + box.w / 2, box.y + box.h / 2];
};

/** The SVG transform that turns an item, if it is turned at all. */
const rotationAttr = (item: DrawingItem): string | undefined => {
  const rotation = rotationOf(item);
  if (!rotation) return undefined;
  const [px, py] = pivotOf(item);
  return `rotate(${rotation} ${round1(px)} ${round1(py)})`;
};

/** A straight-sided shape's corners on the sheet, or null for a curved one. */
const cornersOf = (item: BoxLike): [number, number][] | null => {
  if (isSymbol(item)) return null;
  const corners = CORNERS[item.kind];
  if (!corners) return null;
  const [px, py] = pivotOf(item);
  return corners.map(([u, v]) => turnAbout(item.x + u * item.w, item.y + v * item.h, px, py, rotationOf(item)));
};

/** The box a square or circle fills: its longer side, both ways, from where the drag began. */
const evenBox = (fromX: number, fromY: number, x: number, y: number) => {
  const side = Math.max(Math.abs(x - fromX), Math.abs(y - fromY));
  return { x: x < fromX ? fromX - side : fromX, y: y < fromY ? fromY - side : fromY, w: side, h: side };
};

/**
 * What each side starts out called, in the order of the shape's corners
 * (side i runs from corner i to corner i + 1); null leaves a side unlabelled.
 * Shapes not listed get a, b, c… on every side.
 */
const SIDE_NAMES: Partial<Record<ShapeKind, (string | null)[]>> = {
  // Corners: top, bottom right, bottom left (the right angle).
  right_triangle: ['hypotenuse', 'base', 'height'],
  // Corners: top left, top right, bottom right, bottom left.
  rect: ['length', 'breadth', null, null],
  square: ['side', null, null, null],
};

/** Labels just outside each side, or each corner, of a shape. */
const edgeLabels = (shape: BoxLike, corners: [number, number][], what: 'sides' | 'corners'): TextItem[] => {
  const centre = {
    x: corners.reduce((sum, [x]) => sum + x, 0) / corners.length,
    y: corners.reduce((sum, [, y]) => sum + y, 0) / corners.length,
  };
  const names = what === 'sides' && !isSymbol(shape) ? SIDE_NAMES[shape.kind] : undefined;
  const fontSize = 16;
  const labels: TextItem[] = [];
  corners.forEach(([cx, cy], i) => {
    const name = names ? names[i] : String.fromCharCode((what === 'corners' ? 65 : 97) + i);
    if (!name) return;
    const [nx, ny] = corners[(i + 1) % corners.length];
    const [x, y] = what === 'corners' ? [cx, cy] : [(cx + nx) / 2, (cy + ny) / 2];
    const away = Math.hypot(x - centre.x, y - centre.y) || 1;
    const gap = what === 'corners' ? 14 : 16;
    const sideways = (x - centre.x) / away;
    const anchor: TextItem['anchor'] = sideways > 0.5 ? undefined : sideways < -0.5 ? 'end' : 'middle';
    labels.push({
      id: newId(), kind: 'text', anchor, fill: shape.stroke, fontSize, text: name,
      x: round1(x + ((x - centre.x) / away) * gap),
      // Baseline a little below the spot, so the letters sit centred on it.
      y: round1(y + ((y - centre.y) / away) * gap + fontSize * 0.35),
    });
  });
  return labels;
};

/**
 * A colour that reads inside a shape: its line colour, or white on a dark
 * fill, where marks in the line colour were lost (θ in blue on blue).
 */
const inkInside = (shape: BoxLike): string => {
  const hex = /^#([0-9a-f]{6})$/i.exec(shape.fill)?.[1];
  if (!hex) return shape.stroke;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lightness = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lightness < 0.55 ? '#ffffff' : shape.stroke;
};

/** Letters for angles, in the order maths questions use them. */
const ANGLE_NAMES = ['θ', 'α', 'β', 'γ', 'δ', 'φ', 'ψ', 'ω'];

/** Shapes whose angles are all right angles, already plain to see. */
const SQUARE_CORNERED = new Set<string>(['rect', 'square']);

/**
 * An arc inside each angle of a shape with a letter beside it (θ, α, β…),
 * for the teacher to change to the angle's size. A right-angled triangle's
 * right angle keeps its little square instead.
 */
const angleMarks = (shape: BoxLike, corners: [number, number][]): DrawingItem[] => {
  const count = corners.length;
  const marks: DrawingItem[] = [];
  const ink = inkInside(shape);
  let named = 0;
  corners.forEach(([vx, vy], i) => {
    if (!isSymbol(shape) && shape.kind === 'right_triangle' && i === 2) return;
    const [px, py] = corners[(i + count - 1) % count];
    const [nx, ny] = corners[(i + 1) % count];
    const from = Math.atan2(py - vy, px - vx);
    // The turn towards the next side, the short way round: inside the shape.
    let sweep = Math.atan2(ny - vy, nx - vx) - from;
    while (sweep <= -Math.PI) sweep += 2 * Math.PI;
    while (sweep > Math.PI) sweep -= 2 * Math.PI;
    const shortest = Math.min(Math.hypot(px - vx, py - vy), Math.hypot(nx - vx, ny - vy));
    const radius = Math.max(10, Math.min(24, shortest * 0.3));
    const points: number[] = [];
    for (let s = 0; s <= 12; s++) {
      const a = from + (sweep * s) / 12;
      points.push(round1(vx + radius * Math.cos(a)), round1(vy + radius * Math.sin(a)));
    }
    marks.push({
      id: newId(), kind: 'pen', points, stroke: ink,
      strokeWidth: Math.max(1, Math.min(2, shape.strokeWidth * 0.75)),
    });
    const middle = from + sweep / 2;
    const reach = radius + 11;
    const fontSize = 15;
    marks.push({
      id: newId(), kind: 'text', anchor: 'middle', fill: ink, fontSize,
      text: ANGLE_NAMES[named++ % ANGLE_NAMES.length],
      x: round1(vx + reach * Math.cos(middle)),
      y: round1(vy + reach * Math.sin(middle) + fontSize * 0.35),
    });
  });
  return marks;
};

/**
 * A basic Designer shape as the board's own shape, so it can be labelled.
 * Shapes inserted from the Shape Designer between 6 and 7 Nov 2026 were saved
 * as Designer shapes, which offered no Label sides or Mark angles; they turn
 * into the board's own shape when opened. Everything else is left as it is.
 */
const asOwnShape = (item: DrawingItem): DrawingItem => {
  if (!isSymbol(item)) return item;
  const own = SHAPES.find((entry) => entry.label === item.shape);
  if (!own) return item;
  const pad = item.strokeWidth / 2;
  return {
    id: item.id, kind: own.kind,
    x: round1(item.x + pad), y: round1(item.y + pad),
    w: round1(Math.max(MIN_SIZE, item.w - item.strokeWidth)), h: round1(Math.max(MIN_SIZE, item.h - item.strokeWidth)),
    fill: item.fill, stroke: item.stroke, strokeWidth: item.strokeWidth, rotation: item.rotation,
  };
};

/** An item moved by dx, dy. */
const moved = (item: DrawingItem, dx: number, dy: number): DrawingItem => {
  if (isPen(item)) return { ...item, points: item.points.map((v, i) => round1(v + (i % 2 ? dy : dx))) };
  if (isLine(item)) {
    return { ...item, x1: round1(item.x1 + dx), y1: round1(item.y1 + dy), x2: round1(item.x2 + dx), y2: round1(item.y2 + dy) };
  }
  return { ...item, x: round1(item.x + dx), y: round1(item.y + dy) };
};

/** Which way each corner handle lies from the box's centre: top-left, top-right, bottom-right, bottom-left. */
const CORNER_SIGNS: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

/**
 * An item resized by dragging one corner, the opposite corner staying put on
 * the sheet even when the item is turned. Shift keeps its proportions.
 */
const resized = (orig: DrawingItem, corner: number, to: Point, keepRatio: boolean): DrawingItem => {
  const box = localBox(orig);
  if (!box || isText(orig) || isLine(orig)) return orig;
  const rotation = rotationOf(orig);
  const cx = box.x + box.w / 2; const cy = box.y + box.h / 2;
  const [ex, ey] = CORNER_SIGNS[corner];
  const [ax, ay] = turnAbout(cx - (ex * box.w) / 2, cy - (ey * box.h) / 2, cx, cy, rotation);
  const [dx, dy] = turn(to.x - ax, to.y - ay, -rotation);
  const oldW = Math.max(box.w, 1); const oldH = Math.max(box.h, 1);
  let w = Math.max(MIN_SIZE, dx * ex);
  let h = Math.max(MIN_SIZE, dy * ey);
  if (isBox(orig) && EVEN_KINDS.has(orig.kind)) {
    w = h = Math.max(w, h);
  } else if (keepRatio) {
    const scale = Math.max(w / oldW, h / oldH);
    w = oldW * scale; h = oldH * scale;
  }
  const [mx, my] = turn((ex * w) / 2, (ey * h) / 2, rotation);
  const left = ax + mx - w / 2; const top = ay + my - h / 2;
  if (isPen(orig)) {
    // A line drawn dead level or upright has no height or width to stretch.
    const sx = box.w ? w / box.w : 1; const sy = box.h ? h / box.h : 1;
    return {
      ...orig,
      points: orig.points.map((v, i) => round1(i % 2 ? top + (v - box.y) * sy : left + (v - box.x) * sx)),
    };
  }
  return { ...orig, x: round1(left), y: round1(top), w: round1(w), h: round1(h) };
};

/** An item turned by dragging its round handle from `from` to `to`. */
const turned = (orig: DrawingItem, from: Point, to: Point, steps: boolean): DrawingItem => {
  const [px, py] = pivotOf(orig);
  const delta = ((Math.atan2(to.y - py, to.x - px) - Math.atan2(from.y - py, from.x - px)) * 180) / Math.PI;
  if (isPen(orig)) {
    const by = settle(delta, steps);
    const points: number[] = [];
    for (let i = 0; i < orig.points.length; i += 2) {
      const [x, y] = turnAbout(orig.points[i], orig.points[i + 1], px, py, by);
      points.push(round1(x), round1(y));
    }
    return { ...orig, points };
  }
  if (isLine(orig)) return orig;
  return { ...orig, rotation: settle(rotationOf(orig) + delta, steps) };
};

/**
 * A freehand line with what the eraser passed over rubbed out: null if it
 * wasn't touched, otherwise the pieces left, which may be none.
 */
const rubOut = (item: PenItem, spots: [number, number][], radius: number): PenItem[] | null => {
  const reach = radius + item.strokeWidth / 2;
  const box = penBox(item.points);
  const near = spots.filter(([x, y]) => x >= box.x - reach && x <= box.x + box.w + reach
    && y >= box.y - reach && y <= box.y + box.h + reach);
  if (!near.length) return null;
  const dense = densify(item.points, 2);
  const pieces: number[][] = [];
  let piece: number[] = [];
  let touched = false;
  for (let i = 0; i < dense.length; i += 2) {
    const x = dense[i]; const y = dense[i + 1];
    if (near.some(([sx, sy]) => (sx - x) ** 2 + (sy - y) ** 2 <= reach * reach)) {
      touched = true;
      if (piece.length) pieces.push(piece);
      piece = [];
    } else {
      piece.push(x, y);
    }
  }
  if (piece.length) pieces.push(piece);
  if (!touched) return null;
  return pieces.filter((points) => points.length >= 4).map((points) => ({ ...item, id: newId(), points: simplify(points) }));
};

// ─── Drawing → SVG ────────────────────────────────────────────────────────────

const escapeXml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c] as string));

const ARROW_HEAD = 'drawing-arrow-head';

/** An item's markup, turned if it is turned. */
const withRotation = (item: DrawingItem, markup: string) => {
  const transform = rotationAttr(item);
  return transform ? `<g transform="${transform}">${markup}</g>` : markup;
};

/** One item as SVG markup. The same shapes the board itself draws. */
const itemToSvg = (item: DrawingItem): string => {
  if (isPen(item)) {
    return `<path d="${penPath(item.points)}" fill="none" stroke="${item.stroke}" stroke-width="${item.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  if (isSymbol(item)) {
    const shape = findLibraryShape(item.shape);
    if (!shape) return '';
    const [vx, vy, vw, vh] = item.vb;
    const sx = item.w / vw; const sy = item.h / vh;
    // The line is drawn inside the stretched square, so it's thinned to match.
    const lineWidth = Math.round((item.strokeWidth / ((sx + sy) / 2)) * 100) / 100;
    const transform = `translate(${item.x} ${item.y}) scale(${sx.toFixed(4)} ${sy.toFixed(4)}) translate(${-vx} ${-vy})`;
    return withRotation(item, `<g transform="${transform}">${shape.path(item.fill, item.stroke, lineWidth)}</g>`);
  }
  if (isBox(item)) {
    const paint = `fill="${item.fill}" stroke="${item.stroke}" stroke-width="${item.strokeWidth}"`;
    if (item.kind === 'rect' || item.kind === 'square') {
      return withRotation(item, `<rect x="${item.x}" y="${item.y}" width="${item.w}" height="${item.h}" ${paint}/>`);
    }
    if (item.kind === 'ellipse' || item.kind === 'circle') {
      return withRotation(item, `<ellipse cx="${item.x + item.w / 2}" cy="${item.y + item.h / 2}" rx="${item.w / 2}" ry="${item.h / 2}" ${paint}/>`);
    }
    if (item.kind === 'semicircle') {
      return withRotation(item, `<path d="M${item.x} ${item.y + item.h} A${item.w / 2} ${item.h} 0 0 1 ${item.x + item.w} ${item.y + item.h} Z" ${paint} stroke-linejoin="round"/>`);
    }
    // Corners before turning: the whole shape is turned in one go below.
    const points = (CORNERS[item.kind] ?? []).map(([u, v]) => `${round1(item.x + u * item.w)},${round1(item.y + v * item.h)}`).join(' ');
    let shape = `<polygon points="${points}" ${paint} stroke-linejoin="round"/>`;
    if (item.kind === 'right_triangle') {
      // The little square that marks the right angle.
      const mark = Math.min(14, item.w / 4, item.h / 4);
      const corner = item.y + item.h;
      shape += `<polyline points="${item.x},${corner - mark} ${item.x + mark},${corner - mark} ${item.x + mark},${corner}" fill="none" stroke="${item.stroke}" stroke-width="${Math.max(1, item.strokeWidth / 2)}"/>`;
    }
    return withRotation(item, shape);
  }
  if (isLine(item)) {
    const head = item.kind === 'arrow' ? ` marker-end="url(#${ARROW_HEAD})"` : '';
    return `<line x1="${item.x1}" y1="${item.y1}" x2="${item.x2}" y2="${item.y2}" stroke="${item.stroke}" stroke-width="${item.strokeWidth}" stroke-linecap="round"${head}/>`;
  }
  const anchor = item.anchor ? ` text-anchor="${item.anchor}"` : '';
  return withRotation(item, `<text x="${item.x}" y="${item.y}"${anchor} fill="${item.fill}" font-size="${item.fontSize}" font-family="system-ui, -apple-system, Segoe UI, sans-serif">${escapeXml(item.text)}</text>`);
};

/** How far an item reaches on the sheet: [left, top, right, bottom]. */
const itemBounds = (item: DrawingItem): [number, number, number, number] => {
  let edges: [number, number, number, number];
  if (isPen(item)) {
    const box = penBox(item.points);
    const pad = item.strokeWidth / 2;
    edges = [box.x - pad, box.y - pad, box.x + box.w + pad, box.y + box.h + pad];
  } else if (isSymbol(item)) {
    // The Designer's box already allows for the line round the shape.
    edges = [item.x, item.y, item.x + item.w, item.y + item.h];
  } else if (isBox(item)) {
    const pad = item.strokeWidth / 2;
    edges = [item.x - pad, item.y - pad, item.x + item.w + pad, item.y + item.h + pad];
  } else if (isLine(item)) {
    // An arrow head is five line-widths long and as wide, so it pokes out further.
    const pad = item.kind === 'arrow' ? item.strokeWidth * 2.5 : item.strokeWidth / 2;
    return [
      Math.min(item.x1, item.x2) - pad, Math.min(item.y1, item.y2) - pad,
      Math.max(item.x1, item.x2) + pad, Math.max(item.y1, item.y2) + pad,
    ];
  } else {
    const width = item.text.length * item.fontSize * 0.6;
    const left = item.anchor === 'middle' ? item.x - width / 2 : item.anchor === 'end' ? item.x - width : item.x;
    edges = [left, item.y - item.fontSize * 0.85, left + width, item.y + item.fontSize * 0.3];
  }
  const rotation = rotationOf(item);
  if (!rotation) return edges;
  // A turned item reaches as far as its turned corners.
  const [px, py] = pivotOf(item);
  const [l, t, r, b] = edges;
  const corners = [[l, t], [r, t], [r, b], [l, b]].map(([x, y]) => turnAbout(x, y, px, py, rotation));
  return [
    Math.min(...corners.map((c) => c[0])), Math.min(...corners.map((c) => c[1])),
    Math.max(...corners.map((c) => c[0])), Math.max(...corners.map((c) => c[1])),
  ];
};

/** Space left around the drawing unless the teacher picks otherwise. */
export const DEFAULT_MARGIN = 4;

/**
 * The part of the sheet the picture keeps: just what is drawn, plus `margin`
 * on every side. The whole sheet went into the question before, so a small
 * triangle came with a page of empty space around it.
 */
export const drawingBounds = (items: DrawingItem[], margin: number) => {
  if (!items.length) return { x: 0, y: 0, w: CANVAS_WIDTH, h: CANVAS_HEIGHT };
  const edges = items.map(itemBounds);
  const left = Math.floor(Math.min(...edges.map((e) => e[0])) - margin);
  const top = Math.floor(Math.min(...edges.map((e) => e[1])) - margin);
  const right = Math.ceil(Math.max(...edges.map((e) => e[2])) + margin);
  const bottom = Math.ceil(Math.max(...edges.map((e) => e[3])) + margin);
  return { x: left, y: top, w: Math.max(1, right - left), h: Math.max(1, bottom - top) };
};

/**
 * The finished drawing: an SVG carrying its own items, so it can be edited
 * again. The items keep their places on the sheet and the viewBox picks out
 * the part that is drawn on, so reopening it puts everything back where it was.
 */
export const drawingToSvg = (items: DrawingItem[], background: string, margin = DEFAULT_MARGIN): string => {
  const model = btoa(unescape(encodeURIComponent(JSON.stringify(items))));
  const { x, y, w, h } = drawingBounds(items, margin);
  const needsArrow = items.some((item) => item.kind === 'arrow');
  const marker = needsArrow
    ? `<defs><marker id="${ARROW_HEAD}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="context-stroke"/></marker></defs>`
    : '';
  const sheet = background === 'transparent'
    ? ''
    : `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${escapeXml(background)}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${x} ${y} ${w} ${h}">`
    + `<desc ${DRAWING_ATTR}="${model}" ${MARGIN_ATTR}="${margin}" ${BACKGROUND_ATTR}="${escapeXml(background)}">Drawing</desc>${marker}${sheet}`
    + items.map(itemToSvg).join('')
    + '</svg>';
};

export const drawingToDataUrl = (items: DrawingItem[], background: string, margin = DEFAULT_MARGIN): string =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(drawingToSvg(items, background, margin))}`;

/**
 * One of the Shape Designer's shapes as a drawing of its own, so once it is in
 * the question it opens on the board to be moved, resized, turned, recoloured
 * or labelled. `size` is its longer side and `strokeWidth` is in the
 * Designer's 100 x 100 square, as the Designer sets them.
 */
export const shapeItem = (
  label: string, fill: string, stroke: string, strokeWidth: number, size: number,
): DrawingItem | null => {
  const shape = findLibraryShape(label);
  if (!shape) return null;
  const vb = tightBox(shape.path(fill, stroke, strokeWidth), strokeWidth);
  const scale = size / Math.max(vb.w, vb.h);
  const w = round1(vb.w * scale); const h = round1(vb.h * scale);
  const lineWidth = Math.round(strokeWidth * scale * 100) / 100;
  // Somewhere near the middle of the sheet, for when it is opened there.
  const x = round1((CANVAS_WIDTH - w) / 2); const y = round1((CANVAS_HEIGHT - h) / 2);
  // A basic shape the board draws itself goes in as the board's own shape, so
  // its sides, corners and angles can be labelled. As a Designer shape it could
  // only be moved and stretched: a maths teacher couldn't mark the height and
  // base of a right-angled triangle.
  const own = SHAPES.find((entry) => entry.label === label);
  if (own) {
    const pad = lineWidth / 2;
    return {
      id: newId(), kind: own.kind, x: x + pad, y: y + pad,
      w: round1(Math.max(MIN_SIZE, w - lineWidth)), h: round1(Math.max(MIN_SIZE, h - lineWidth)),
      fill, stroke, strokeWidth: lineWidth,
    };
  }
  return {
    id: newId(), kind: 'symbol', shape: label, vb: [vb.x, vb.y, vb.w, vb.h],
    x, y, w, h, fill, stroke, strokeWidth: lineWidth,
  };
};

export const shapeDrawing = (
  label: string, fill: string, stroke: string, strokeWidth: number, size: number, background: string,
): { dataUrl: string; width: number } | null => {
  const item = shapeItem(label, fill, stroke, strokeWidth, size);
  if (!item) return null;
  const items = [item];
  return { dataUrl: drawingToDataUrl(items, background, 0), width: drawingBounds(items, 0).w };
};

/** The SVG markup inside an SVG data URL, or null for any other picture. */
const svgOf = (src: string | null | undefined): string | null => {
  if (!src || !src.startsWith('data:image/svg+xml')) return null;
  try {
    const comma = src.indexOf(',');
    const body = src.slice(comma + 1);
    return src.slice(0, comma).includes(';base64') ? atob(body) : decodeURIComponent(body);
  } catch {
    return null;
  }
};

/** The items inside one of our drawings, or null for any other picture. */
export const readDrawing = (src: string | null | undefined): DrawingItem[] | null => {
  const svg = svgOf(src);
  if (!svg) return null;
  try {
    const match = svg.match(new RegExp(`${DRAWING_ATTR}="([^"]+)"`));
    if (!match) return null;
    const items = JSON.parse(decodeURIComponent(escape(atob(match[1]))));
    return Array.isArray(items) ? items : null;
  } catch {
    return null;
  }
};

/** The space a drawing was saved with; older drawings, saved as the whole sheet, get the usual margin. */
export const readDrawingMargin = (src: string | null | undefined): number => {
  const match = svgOf(src)?.match(new RegExp(`${MARGIN_ATTR}="(\\d+)"`));
  return match ? Number(match[1]) : DEFAULT_MARGIN;
};

/**
 * The sheet colour a drawing was saved with. Older drawings didn't record it:
 * one with a white sheet starts with a rect at the top-left of its frame.
 */
export const readDrawingBackground = (src: string | null | undefined): string => {
  const svg = svgOf(src);
  const match = svg?.match(new RegExp(`${BACKGROUND_ATTR}="([^"]+)"`));
  if (match) return match[1].replace(/&amp;/g, '&');
  return svg && /<\/desc>(<defs>.*?<\/defs>)?<rect [^>]*fill="#ffffff"\/>/.test(svg) ? '#ffffff' : 'transparent';
};

/** How wide an SVG says it is, in its own pixels. */
export const svgWidth = (src: string | null | undefined): number | null => {
  const match = svgOf(src)?.match(/<svg[^>]*\swidth="([\d.]+)"/);
  return match ? Number(match[1]) : null;
};

// ─── Board ────────────────────────────────────────────────────────────────────

interface Props {
  /** Items to open with, for changing a drawing already in the question. */
  initialItems?: DrawingItem[] | null;
  /** The space around the drawing it was saved with. */
  initialMargin?: number;
  /** The sheet colour it was saved with. */
  initialBackground?: string;
  /** Changing a drawing already in the question, rather than adding one. */
  editingExisting?: boolean;
  /** The picture, and how wide it is in its own pixels. */
  onInsert: (dataUrl: string, width: number) => void;
  onClose: () => void;
}

const TOOLS: { tool: Tool; label: string; icon: React.ReactNode }[] = [
  { tool: 'select', label: 'Select: click a shape, line or label to move, resize, turn or recolour it', icon: <MousePointer2 className="h-4 w-4" /> },
  { tool: 'pen',    label: 'Pen: draw freehand', icon: <Pencil className="h-4 w-4" /> },
  { tool: 'eraser', label: 'Eraser: rub out pen lines (select a shape or label and press Delete to remove it)', icon: <Eraser className="h-4 w-4" /> },
  { tool: 'line',   label: 'Line', icon: <Minus className="h-4 w-4" /> },
  { tool: 'arrow',  label: 'Arrow: point a label at a part of the diagram', icon: <ArrowRight className="h-4 w-4" /> },
  { tool: 'text',   label: 'Label: click anywhere, on a shape or beside it, to add text or a number', icon: <Type className="h-4 w-4" /> },
];

/** A shape drawn small, as its button in the shape picker. */
const shapeIcon = (kind: ShapeKind) => {
  const tall = kind === 'semicircle' ? 11 : 22;
  const svg = itemToSvg({ id: kind, kind, x: 1, y: 23 - tall, w: 22, h: tall, fill: 'none', stroke: '#334155', strokeWidth: 1.5 });
  return <svg viewBox="0 0 24 24" className="h-6 w-6" dangerouslySetInnerHTML={{ __html: svg }} />;
};

/** One of the Designer's shapes drawn small. */
const libraryIcon = (label: string) => {
  const shape = findLibraryShape(label);
  if (!shape) return null;
  const inner = shape.path('#e2e8f0', '#334155', 4);
  const box = tightBox(inner, 4);
  return <svg viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} className="h-6 w-6" dangerouslySetInnerHTML={{ __html: inner }} />;
};

const SWATCHES = ['#0f172a', '#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#1d4ed8', '#7c3aed', '#db2777', '#92400e', '#ffffff', 'none'];

type Drag = {
  mode: 'draw' | 'move' | 'resize' | 'rotate' | 'end1' | 'end2' | 'pen' | 'erase';
  id: string;
  /** Where the pointer went down. */
  start: Point;
  /** The item as it was when the drag began. */
  orig?: DrawingItem;
  corner?: number;
  /** Where the eraser was last, so a fast stroke rubs out the gap too. */
  last?: Point;
};

const ShapeCanvas: React.FC<Props> = ({ initialItems, initialMargin, initialBackground, editingExisting, onInsert, onClose }) => {
  const [items, setItems] = useState<DrawingItem[]>(() => (initialItems ?? []).map(asOwnShape));
  const [past, setPast] = useState<DrawingItem[][]>([]);
  const [future, setFuture] = useState<DrawingItem[][]>([]);
  const [tool, setTool] = useState<Tool>(initialItems?.length ? 'select' : 'pen');
  // A single shape opened from the Shape Designer starts selected, so its
  // Label sides / Label corners / Mark angles buttons are there at once.
  const [selectedId, setSelectedId] = useState<string | null>(
    initialItems?.length === 1 ? initialItems[0].id : null);
  const [fill, setFill] = useState('#dbeafe');
  const [stroke, setStroke] = useState('#0f172a');
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [eraserSize, setEraserSize] = useState(12);
  const [background, setBackground] = useState<string>(initialBackground ?? 'transparent');
  const [showShapes, setShowShapes] = useState(false);
  const [margin, setMargin] = useState(initialMargin ?? DEFAULT_MARGIN);
  /** Where the eraser is, to show how much it will rub out. */
  const [hover, setHover] = useState<Point | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  // What the pointer is doing between pointerdown and pointerup.
  const drag = useRef<Drag | null>(null);

  const selected = items.find((item) => item.id === selectedId) ?? null;
  const dirty = past.length > 0 || future.length > 0;

  /** Remember the items as they are, so the change about to be made can be undone. */
  const snapshot = useCallback(() => {
    setPast((stack) => [...stack.slice(-79), items]);
    setFuture([]);
  }, [items]);

  /** Make a change that can be undone. */
  const commit = useCallback((next: DrawingItem[]) => {
    snapshot();
    setItems(next);
  }, [snapshot]);

  const replace = useCallback((id: string, next: DrawingItem) => {
    setItems((current) => current.map((item) => (item.id === id ? next : item)));
  }, []);

  const update = useCallback((id: string, changes: Partial<DrawingItem>) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...changes } as DrawingItem : item)));
  }, []);

  /** Change the selected item, as one step that can be undone. */
  const changeSelected = useCallback((change: (item: DrawingItem) => DrawingItem) => {
    if (!selectedId) return;
    commit(items.map((item) => (item.id === selectedId ? change(item) : item)));
  }, [commit, items, selectedId]);

  const undo = useCallback(() => {
    if (!past.length) return;
    setFuture([items, ...future]);
    setItems(past[past.length - 1]);
    setPast(past.slice(0, -1));
  }, [items, past, future]);

  const redo = useCallback(() => {
    if (!future.length) return;
    setPast([...past, items]);
    setItems(future[0]);
    setFuture(future.slice(1));
  }, [items, past, future]);

  const removeSelected = useCallback(() => {
    if (!selectedId) return;
    commit(items.filter((item) => item.id !== selectedId));
    setSelectedId(null);
  }, [commit, items, selectedId]);

  const clearAll = () => {
    if (!items.length) return;
    commit([]);
    setSelectedId(null);
  };

  /** Close without saving, checking first if there's work to lose. */
  const requestClose = useCallback(() => {
    if (dirty && !window.confirm('Close without saving this drawing? Your changes will be lost.')) return;
    onClose();
  }, [dirty, onClose]);

  // Delete and Backspace remove the selected item; Ctrl+Z / Ctrl+Y undo and
  // redo; Escape lets go of the selection, then closes the board.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const onAnInput = ['INPUT', 'TEXTAREA'].includes((event.target as HTMLElement)?.tagName);
      if (event.key === 'Escape') {
        if (selectedId) setSelectedId(null);
        else requestClose();
        return;
      }
      if (onAnInput) return;
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo(); else undo();
      } else if ((event.ctrlKey || event.metaKey) && key === 'y') {
        event.preventDefault();
        redo();
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        removeSelected();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [requestClose, removeSelected, undo, redo, selectedId]);

  /** Where the pointer is on the canvas, in the drawing's own coordinates. */
  const pointAt = (event: { clientX: number; clientY: number }): Point => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: ((event.clientX - rect.left) / rect.width) * CANVAS_WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * CANVAS_HEIGHT,
    };
  };

  /** Keep the pointer's moves coming to the sheet even when it strays off it. */
  const capture = (event: React.PointerEvent) => {
    try { svgRef.current?.setPointerCapture(event.pointerId); } catch { /* not every pointer can be captured */ }
  };

  /** Rub out pen lines along the way from one spot to the next. */
  const erase = (from: Point, to: Point) => {
    const radius = eraserSize / 2;
    const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / Math.max(1, radius / 2)));
    const spots: [number, number][] = [];
    for (let i = 0; i <= steps; i++) {
      spots.push([from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps]);
    }
    setItems((current) => {
      let changed = false;
      const next = current.flatMap((item): DrawingItem[] => {
        if (!isPen(item)) return [item];
        const left = rubOut(item, spots, radius);
        if (!left) return [item];
        changed = true;
        return left;
      });
      return changed ? next : current;
    });
  };

  const startOnCanvas = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    capture(event);
    const start = pointAt(event);
    const { x, y } = start;
    setShowShapes(false);
    if (tool === 'select') {
      setSelectedId(null);
      return;
    }
    if (tool === 'pen') {
      const item: PenItem = { id: newId(), kind: 'pen', points: [round1(x), round1(y)], stroke, strokeWidth };
      snapshot();
      setItems([...items, item]);
      setSelectedId(null);
      drag.current = { mode: 'pen', id: item.id, start };
      return;
    }
    if (tool === 'eraser') {
      snapshot();
      setSelectedId(null);
      drag.current = { mode: 'erase', id: '', start, last: start };
      erase(start, start);
      return;
    }
    if (tool === 'text') {
      const item: TextItem = { id: newId(), kind: 'text', x: round1(x), y: round1(y), text: 'Label', fill: stroke, fontSize: 18 };
      commit([...items, item]);
      setSelectedId(item.id);
      setTool('select');
      return;
    }
    const id = newId();
    let item: DrawingItem;
    if (tool === 'line' || tool === 'arrow') {
      item = { id, kind: tool, x1: round1(x), y1: round1(y), x2: round1(x), y2: round1(y), stroke, strokeWidth };
    } else if (isSymbolTool(tool)) {
      const label = tool.slice('symbol:'.length);
      const shape = findLibraryShape(label);
      if (!shape) return;
      const box = tightBox(shape.path(fill, stroke, 3), 3);
      item = { id, kind: 'symbol', shape: label, vb: [box.x, box.y, box.w, box.h], x, y, w: 1, h: 1, fill, stroke, strokeWidth };
    } else {
      item = { id, kind: tool, x, y, w: 1, h: 1, fill, stroke, strokeWidth };
    }
    snapshot();
    setItems([...items, item]);
    setSelectedId(id);
    drag.current = { mode: 'draw', id, start, orig: item };
  };

  const moveOnCanvas = (event: React.PointerEvent<SVGSVGElement>) => {
    const at = pointAt(event);
    if (tool === 'eraser') setHover(at);
    const active = drag.current;
    if (!active) return;

    if (active.mode === 'pen') {
      // A stylus reports more points than the screen draws; take them all, so
      // a quick curve stays a curve.
      const native = event.nativeEvent as PointerEvent;
      const samples = native.getCoalescedEvents?.().map(pointAt) ?? [at];
      setItems((current) => current.map((item) => {
        if (item.id !== active.id || !isPen(item)) return item;
        const points = item.points.slice();
        for (const point of samples.length ? samples : [at]) {
          const lastX = points[points.length - 2]; const lastY = points[points.length - 1];
          if (Math.hypot(point.x - lastX, point.y - lastY) >= 1.5) points.push(round1(point.x), round1(point.y));
        }
        return points.length === item.points.length ? item : { ...item, points };
      }));
      return;
    }
    if (active.mode === 'erase') {
      erase(active.last ?? at, at);
      active.last = at;
      return;
    }

    // The item just put down may not have reached `items` yet.
    const item = items.find((i) => i.id === active.id) ?? active.orig;
    if (!item) return;
    const { x, y } = at;

    if (active.mode === 'draw') {
      if (isLine(item)) update(item.id, { x2: round1(x), y2: round1(y) } as Partial<DrawingItem>);
      else if (isBox(item) && (EVEN_KINDS.has(item.kind) || event.shiftKey)) {
        update(item.id, evenBox(active.start.x, active.start.y, x, y) as Partial<DrawingItem>);
      } else if (isBox(item)) {
        update(item.id, {
          x: round1(Math.min(active.start.x, x)), y: round1(Math.min(active.start.y, y)),
          w: round1(Math.abs(x - active.start.x)), h: round1(Math.abs(y - active.start.y)),
        } as Partial<DrawingItem>);
      }
    } else if (active.mode === 'move' && active.orig) {
      replace(item.id, moved(active.orig, x - active.start.x, y - active.start.y));
    } else if (active.mode === 'resize' && active.orig && active.corner !== undefined) {
      replace(item.id, resized(active.orig, active.corner, at, event.shiftKey));
    } else if (active.mode === 'rotate' && active.orig) {
      replace(item.id, turned(active.orig, active.start, at, event.shiftKey));
    } else if (active.mode === 'end1' && isLine(item)) {
      update(item.id, { x1: round1(x), y1: round1(y) } as Partial<DrawingItem>);
    } else if (active.mode === 'end2' && isLine(item)) {
      update(item.id, { x2: round1(x), y2: round1(y) } as Partial<DrawingItem>);
    }
  };

  const endDrag = (event: React.PointerEvent<SVGSVGElement>) => {
    try { svgRef.current?.releasePointerCapture(event.pointerId); } catch { /* already let go */ }
    const active = drag.current;
    drag.current = null;
    if (!active) return;
    if (active.mode === 'pen') {
      setItems((current) => current.map((item) => (
        item.id === active.id && isPen(item) ? { ...item, points: simplify(item.points) } : item
      )));
      return;
    }
    if (active.mode !== 'draw') return;
    setItems((current) => current.flatMap((item) => {
      if (item.id !== active.id) return [item];
      if (isLine(item)) {
        // A click with no drag leaves no line worth keeping.
        return Math.hypot(item.x2 - item.x1, item.y2 - item.y1) >= MIN_SIZE ? [item] : [];
      }
      if (isBox(item) && (item.w < MIN_SIZE || item.h < MIN_SIZE)) {
        // A click, or a tap on a tablet, puts down a shape of the usual size there.
        let w = 90; let h = 90;
        if (isSymbol(item)) {
          const [, , vw, vh] = item.vb;
          w = round1((90 * vw) / Math.max(vw, vh)); h = round1((90 * vh) / Math.max(vw, vh));
        } else if (WIDE_KINDS.has(item.kind)) {
          w = 130; h = item.kind === 'semicircle' ? 65 : 80;
        }
        return [{ ...item, x: round1(active.start.x - w / 2), y: round1(active.start.y - h / 2), w, h }];
      }
      return [item];
    }));
    setTool('select');
  };

  const grabItem = (event: React.PointerEvent, item: DrawingItem) => {
    // With a drawing tool in hand, a press on a shape is for the tool: a
    // label goes on the shape, a pen line is drawn over it, or a new shape is
    // drawn on top. Grabbing the shape here put nothing there.
    if (tool !== 'select') return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.stopPropagation();
    capture(event);
    setShowShapes(false);
    setSelectedId(item.id);
    snapshot();
    drag.current = { mode: 'move', id: item.id, start: pointAt(event), orig: item };
  };

  const grabHandle = (event: React.PointerEvent, item: DrawingItem, mode: 'resize' | 'rotate' | 'end1' | 'end2', corner?: number) => {
    event.stopPropagation();
    capture(event);
    setSelectedId(item.id);
    snapshot();
    drag.current = { mode, id: item.id, start: pointAt(event), orig: item, corner };
  };

  /**
   * Put a label just outside each side, or each corner, of the selected
   * shape, or an arc and a letter inside each angle, for the teacher to change
   * to the lengths, names or sizes the question gives. A right-angled
   * triangle's sides start as its height, base and hypotenuse, and a
   * rectangle's as its length and breadth, the way a maths question names them.
   */
  const labelShape = (what: 'sides' | 'corners' | 'angles') => {
    if (!selected || !isBox(selected)) return;
    const corners = cornersOf(selected);
    if (!corners) return;
    const added = what === 'angles' ? angleMarks(selected, corners) : edgeLabels(selected, corners, what);
    if (!added.length) return;
    commit([...items, ...added]);
    // The first label, so the teacher can type over it straight away.
    setSelectedId(added.find(isText)?.id ?? null);
  };

  /** Colours go on the line when the pen is in hand or the selection has no fill to colour. */
  const swatchesColourLine = tool === 'pen' || tool === 'line' || tool === 'arrow' || tool === 'text'
    || (!!selected && !isBox(selected));

  const pickLineColour = (colour: string) => {
    setStroke(colour);
    if (selected) changeSelected((i) => ({ ...i, ...(isText(i) ? { fill: colour } : { stroke: colour }) } as DrawingItem));
  };

  const pickFill = (colour: string) => {
    setFill(colour);
    if (selected && isBox(selected)) changeSelected((i) => ({ ...i, fill: colour } as DrawingItem));
  };

  const currentShape = SHAPES.find((shape) => shape.kind === tool);
  const currentSymbol = isSymbolTool(tool) ? tool.slice('symbol:'.length) : null;

  const kept = useMemo(() => drawingBounds(items, margin), [items, margin]);

  const resizeHandle = (x: number, y: number, onGrab: (event: React.PointerEvent) => void, key: string, cursor = 'nwse-resize') => (
    <rect key={key} x={x - 6} y={y - 6} width={12} height={12} rx={2}
      fill="#ffffff" stroke="#2563eb" strokeWidth={2} style={{ cursor }}
      onPointerDown={onGrab} />
  );

  /** The outline, corner squares and turning handle round the selected item. */
  const selectionHandles = (item: DrawingItem) => {
    if (isLine(item)) {
      return (
        <>
          {resizeHandle(item.x1, item.y1, (e) => grabHandle(e, item, 'end1'), 'e1', 'move')}
          {resizeHandle(item.x2, item.y2, (e) => grabHandle(e, item, 'end2'), 'e2', 'move')}
        </>
      );
    }
    const box = localBox(item);
    if (!box) return null;
    const pad = isPen(item) ? item.strokeWidth / 2 + 3 : 0;
    const outline = { x: box.x - pad, y: box.y - pad, w: box.w + pad * 2, h: box.h + pad * 2 };
    const rotation = rotationOf(item);
    const [px, py] = pivotOf(item);
    const place = (x: number, y: number) => turnAbout(x, y, px, py, rotation);
    const [topX, topY] = place(outline.x + outline.w / 2, outline.y);
    const [knobX, knobY] = place(outline.x + outline.w / 2, outline.y - 26);
    return (
      <>
        <rect x={outline.x} y={outline.y} width={outline.w} height={outline.h} transform={rotationAttr(item)}
          fill="none" stroke="#2563eb" strokeDasharray="4 3" strokeWidth={1} pointerEvents="none" />
        {!isText(item) && CORNER_SIGNS.map(([ex, ey], corner) => {
          const [hx, hy] = place(outline.x + (ex > 0 ? outline.w : 0), outline.y + (ey > 0 ? outline.h : 0));
          return resizeHandle(hx, hy, (e) => grabHandle(e, item, 'resize', corner), `c${corner}`, ex === ey ? 'nwse-resize' : 'nesw-resize');
        })}
        <line x1={topX} y1={topY} x2={knobX} y2={knobY} stroke="#2563eb" strokeWidth={1} pointerEvents="none" />
        <circle cx={knobX} cy={knobY} r={7} fill="#ffffff" stroke="#2563eb" strokeWidth={2}
          style={{ cursor: 'grab' }} onPointerDown={(e) => grabHandle(e, item, 'rotate')}>
          <title>Drag to turn. Hold Shift to turn in steps of 15°.</title>
        </circle>
      </>
    );
  };

  const button = (active: boolean) =>
    `flex items-center justify-center h-8 w-8 rounded-lg border transition ${
      active ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`;

  const toolButton = (entry: typeof TOOLS[number]) => (
    <button key={entry.tool} type="button" title={entry.label} aria-label={entry.label}
      aria-pressed={tool === entry.tool}
      onClick={() => { setTool(entry.tool); setShowShapes(false); if (entry.tool !== 'select') setSelectedId(null); }}
      className={button(tool === entry.tool)}>
      {entry.icon}
    </button>
  );

  const sheetCursor = tool === 'select' ? 'default' : tool === 'eraser' ? 'none' : 'crosshair';
  const canTurn = !!selected && (isBox(selected) || isText(selected));

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-3" onMouseDown={(e) => e.stopPropagation()}>
      <div className="flex max-h-[96vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">Draw a diagram</h2>
            <p className="text-xs text-slate-500">Draw freehand with the pen, add shapes, arrows and labels, then select anything to move, resize, turn or recolour it. Only the part inside the dashed frame goes into the question.</p>
          </div>
          <button type="button" onClick={requestClose} className="rounded p-1 text-slate-400 hover:text-slate-700" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tools */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2">
          <div className="flex gap-1">
            {TOOLS.slice(0, 3).map(toolButton)}

            {/* Every shape, in a picker: they don't fit along the toolbar. */}
            <div className="relative">
              <button type="button" aria-expanded={showShapes} aria-label="Shapes"
                title={currentShape || currentSymbol ? `Drawing: ${(currentShape?.label ?? currentSymbol)!.toLowerCase()}` : 'Pick a shape to draw'}
                onClick={() => setShowShapes((open) => !open)}
                className={`flex h-8 items-center gap-1 rounded-lg border px-2 text-xs font-medium transition ${
                  currentShape || currentSymbol ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
                {currentShape?.label ?? currentSymbol ?? 'Shapes'} <ChevronDown className="h-3.5 w-3.5" />
              </button>
              {showShapes && (
                <div className="absolute left-0 top-full z-10 mt-1 max-h-[60vh] w-80 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
                  <p className="px-1 pb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">Basic</p>
                  <div className="grid grid-cols-4 gap-1">
                    {SHAPES.map((shape) => (
                      <button key={shape.kind} type="button" title={shape.label} aria-label={shape.label}
                        onClick={() => { setTool(shape.kind); setShowShapes(false); setSelectedId(null); }}
                        className={`flex flex-col items-center gap-0.5 rounded-md border p-1.5 text-[10px] leading-tight transition ${
                          tool === shape.kind ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-transparent text-slate-600 hover:bg-slate-50'}`}>
                        {shapeIcon(shape.kind)}
                        <span className="text-center">{shape.label}</span>
                      </button>
                    ))}
                  </div>
                  {LIBRARY_CATEGORIES.map((category) => (
                    <div key={category.name}>
                      <p className="px-1 pb-1 pt-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">{category.name}</p>
                      <div className="grid grid-cols-4 gap-1">
                        {category.shapes.map((shape) => (
                          <button key={shape.label} type="button" title={shape.label} aria-label={shape.label}
                            onClick={() => { setTool(`symbol:${shape.label}`); setShowShapes(false); setSelectedId(null); }}
                            className={`flex flex-col items-center gap-0.5 rounded-md border p-1.5 text-[10px] leading-tight transition ${
                              currentSymbol === shape.label ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-transparent text-slate-600 hover:bg-slate-50'}`}>
                            {libraryIcon(shape.label)}
                            <span className="text-center">{shape.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                  <p className="px-1 pt-2 text-[10px] text-slate-400">Drag on the sheet to draw it, or click to drop it at the usual size.</p>
                </div>
              )}
            </div>

            {TOOLS.slice(3).map(toolButton)}
          </div>

          <span className="mx-1 h-6 w-px bg-slate-200" />

          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            Fill
            <input type="color" value={fill === 'none' ? '#ffffff' : fill} aria-label="Fill colour"
              onChange={(e) => pickFill(e.target.value)}
              className="h-7 w-7 cursor-pointer rounded border-0 bg-transparent p-0" />
            <button type="button" onClick={() => pickFill('none')}
              className={`rounded border px-1.5 py-0.5 text-[11px] ${fill === 'none' ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500'}`}>
              None
            </button>
          </label>

          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            {tool === 'pen' ? 'Pen' : 'Line'}
            <input type="color" value={stroke} aria-label="Line and pen colour"
              onChange={(e) => pickLineColour(e.target.value)}
              className="h-7 w-7 cursor-pointer rounded border-0 bg-transparent p-0" />
          </label>

          {tool === 'eraser' ? (
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              Eraser size
              <input type="range" min={4} max={60} value={eraserSize} aria-label="Eraser size"
                onChange={(e) => setEraserSize(Number(e.target.value))} className="w-20" />
            </label>
          ) : (
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              Thickness
              <input type="range" min={1} max={20} value={strokeWidth} aria-label="Line thickness"
                onChange={(e) => {
                  const width = Number(e.target.value);
                  setStrokeWidth(width);
                  if (selected && !isText(selected)) changeSelected((i) => ({ ...i, strokeWidth: width } as DrawingItem));
                }}
                className="w-20" />
              <span className="w-6 font-mono text-slate-400">{strokeWidth}</span>
            </label>
          )}

          <div className="ml-auto flex items-center gap-1" title={swatchesColourLine ? 'Pen and line colour' : 'Fill colour'}>
            <span className="mr-0.5 text-[11px] text-slate-500">{swatchesColourLine ? 'Pen colour' : 'Fill'}</span>
            {SWATCHES.filter((colour) => !swatchesColourLine || colour !== 'none').map((colour) => (
              <button key={colour} type="button" title={colour === 'none' ? 'No fill' : colour}
                aria-label={`${swatchesColourLine ? 'Line' : 'Fill'} ${colour}`}
                onClick={() => (swatchesColourLine ? pickLineColour(colour) : pickFill(colour))}
                className={`h-5 w-5 rounded-full border ${
                  (swatchesColourLine ? stroke : fill) === colour ? 'border-slate-800 ring-2 ring-blue-400' : 'border-slate-300'}`}
                style={{ background: colour === 'none' ? 'repeating-linear-gradient(45deg,#d1d5db 0,#d1d5db 3px,#fff 3px,#fff 6px)' : colour }} />
            ))}
          </div>
        </div>

        {/* Sheet */}
        <div className="flex-1 overflow-auto bg-slate-100 p-3">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            className="mx-auto block max-w-full rounded-lg border border-slate-300 bg-white shadow-sm"
            // Height follows the width on a narrow screen, so the pointer
            // lands where the drawing is.
            style={{ cursor: sheetCursor, touchAction: 'none', height: 'auto', userSelect: 'none' }}
            onPointerDown={startOnCanvas}
            onPointerMove={moveOnCanvas}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onPointerLeave={() => setHover(null)}
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
              <g key={item.id} onPointerDown={(e) => grabItem(e, item)} style={{ cursor: tool === 'select' ? 'move' : undefined }}>
                {/* Thin lines and words are fiddly to hit, so they get an
                    invisible patch to grab. It stays on the board and never
                    reaches the picture. */}
                {isText(item) && (
                  <rect x={textLeft(item)} y={item.y - item.fontSize} width={textWidth(item)} height={item.fontSize * 1.4}
                    transform={rotationAttr(item)} fill="transparent" />
                )}
                {isPen(item) && (
                  <path d={penPath(item.points)} fill="none" stroke="transparent" strokeWidth={item.strokeWidth + 12}
                    strokeLinecap="round" strokeLinejoin="round" />
                )}
                {isLine(item) && (
                  <line x1={item.x1} y1={item.y1} x2={item.x2} y2={item.y2} stroke="transparent" strokeWidth={item.strokeWidth + 12} />
                )}
                <g dangerouslySetInnerHTML={{ __html: itemToSvg(item) }} />
              </g>
            ))}

            {/* The part of the sheet the picture keeps. Only this goes into
                the question, so the empty sheet around it takes no space. */}
            {items.length > 0 && (
              <rect x={kept.x} y={kept.y} width={kept.w} height={kept.h}
                fill="none" stroke="#94a3b8" strokeDasharray="6 4" strokeWidth={1} pointerEvents="none" />
            )}

            {selected && tool === 'select' && selectionHandles(selected)}

            {/* How much the eraser will rub out. */}
            {tool === 'eraser' && hover && (
              <circle cx={hover.x} cy={hover.y} r={eraserSize / 2} fill="rgba(148,163,184,0.15)"
                stroke="#64748b" strokeWidth={1} pointerEvents="none" />
            )}
          </svg>
        </div>

        {/* What is selected */}
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 bg-slate-50 px-4 py-2">
          {selected && isText(selected) ? (
            <label className="flex items-center gap-2 text-xs text-slate-600">
              Label
              <input value={selected.text} autoFocus
                onChange={(e) => update(selected.id, { text: e.target.value } as Partial<DrawingItem>)}
                className="w-48 rounded border border-slate-300 px-2 py-1 text-sm" />
              Size
              <input type="range" min={10} max={48} value={selected.fontSize} aria-label="Label size"
                onChange={(e) => update(selected.id, { fontSize: Number(e.target.value) } as Partial<DrawingItem>)}
                className="w-20" />
            </label>
          ) : (
            <span className="text-xs text-slate-500">
              {selected
                ? isLine(selected)
                  ? 'Drag the line to move it, or a square at either end to move that end.'
                  : 'Drag to move. Drag a corner square to resize (Shift keeps the proportions), or the round handle to turn it.'
                : tool === 'pen'
                  ? 'Draw on the sheet. Pick the arrow (Select) to move or resize what you drew.'
                  : tool === 'eraser'
                    ? 'Drag over pen lines to rub them out.'
                    : `${items.length} item${items.length === 1 ? '' : 's'} on the sheet. To label a part, pick the T tool and click where the text should go, then add an arrow.`}
            </span>
          )}
          {selected && canTurn && (
            <label className="flex items-center gap-1 text-xs text-slate-600" title="How far it is turned, in degrees">
              Turn
              <input type="number" min={-180} max={180} step={5} value={Math.round(rotationOf(selected))} aria-label="Turn in degrees"
                onChange={(e) => changeSelected((i) => ({ ...i, rotation: normalise(Number(e.target.value) || 0) } as DrawingItem))}
                className="w-16 rounded border border-slate-300 px-1.5 py-0.5 text-right font-mono" />
              °
            </label>
          )}
          {selected && isBox(selected) && LABELLED_KINDS.has(selected.kind) && (
            <span className="flex items-center gap-1">
              <button type="button" onClick={() => labelShape('sides')}
                title="Put a label beside each side, to change to the lengths the question gives"
                className="rounded-lg border border-blue-200 bg-white px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50">
                Label sides
              </button>
              <button type="button" onClick={() => labelShape('corners')}
                title="Put a letter at each corner: A, B, C…"
                className="rounded-lg border border-blue-200 bg-white px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50">
                Label corners
              </button>
              {!SQUARE_CORNERED.has(selected.kind) && (
                <button type="button" onClick={() => labelShape('angles')}
                  title="Mark each angle with an arc and a letter (θ, α…) to change to its size, e.g. 30°"
                  className="rounded-lg border border-blue-200 bg-white px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50">
                  Mark angles
                </button>
              )}
            </span>
          )}

          <div className="ml-auto flex items-center gap-1">
            <button type="button" onClick={undo} disabled={!past.length} title="Undo (Ctrl+Z)" aria-label="Undo"
              className={`${button(false)} disabled:opacity-40`}><Undo2 className="h-4 w-4" /></button>
            <button type="button" onClick={redo} disabled={!future.length} title="Redo (Ctrl+Y)" aria-label="Redo"
              className={`${button(false)} disabled:opacity-40`}><Redo2 className="h-4 w-4" /></button>
            <button type="button" onClick={removeSelected} disabled={!selected} title="Delete the selected item (Delete)" aria-label="Delete the selected item"
              className={`${button(false)} text-rose-600 disabled:opacity-40`}><Trash2 className="h-4 w-4" /></button>
            <button type="button" onClick={clearAll} disabled={!items.length} title="Clear the whole sheet (Undo brings it back)"
              className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40">
              Clear
            </button>
            <label className="ml-1 mr-1 flex items-center gap-1.5 text-xs text-slate-600"
              title="Empty space kept around the drawing in the question. The dashed frame on the sheet shows it.">
              Space around
              <input type="range" min={0} max={60} value={margin} aria-label="Space around the drawing"
                onChange={(e) => setMargin(Number(e.target.value))} className="w-16" />
              <span className="w-8 font-mono text-slate-400">{margin}px</span>
            </label>
            <button type="button" onClick={() => setBackground((b) => (b === 'transparent' ? '#ffffff' : 'transparent'))}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-50">
              {background === 'transparent' ? 'No background' : background === '#ffffff' ? 'White background' : 'Coloured background'}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3">
          <button type="button" onClick={requestClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Cancel
          </button>
          <button type="button" disabled={!items.length}
            onClick={() => onInsert(drawingToDataUrl(items, background, margin), kept.w)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
            {editingExisting ? 'Save changes' : 'Insert drawing'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ShapeCanvas;
