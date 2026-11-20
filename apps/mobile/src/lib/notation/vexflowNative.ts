import * as VF from 'vexflow/core';
import { Element, Font, SVGContext } from 'vexflow/core';

import { NOTATION_FONTS, type GlyphFont } from './glyphData';

/**
 * Runs VexFlow — the same engraving library `apps/web/components/StickControlStave.tsx` uses — on
 * React Native, so the notation comes out of the *same* layout code as the website rather than a
 * hand-drawn approximation of it.
 *
 * VexFlow needs a browser for exactly two things, both replaced here:
 *
 * 1. **An SVG DOM to draw into.** Its own `SVGContext` only ever calls `createElementNS`,
 *    `appendChild`, `setAttribute(NS)` and `.style` on the nodes it creates, so `NativeSVGContext`
 *    overrides its one `create()` method to hand back tiny plain-object nodes (`FakeNode`). Every
 *    drawing call (paths, rects, text, groups, rounding, attribute inheritance) is VexFlow's own,
 *    untouched; the resulting tree is then rendered with `react-native-svg` (`NotationSvg.tsx`).
 * 2. **Text measurement.** VexFlow 5 sizes every glyph — noteheads, flags, clefs, the R/L
 *    captions — by asking a `<canvas>` `measureText()`. `installTextMeasurement` gives it a
 *    stand-in canvas that computes the identical metrics a browser would (advance width, actual
 *    bounding box) from `glyphData.ts`, which is extracted from the exact Bravura/Academico font
 *    files VexFlow embeds and loads on the web (see `scripts/extract-notation-glyphs.py`).
 *
 * `<text>` elements are drawn as glyph outline paths from that same data rather than as native
 * text, so no font needs loading on the device and nothing depends on the platform's text
 * shaping. Font fallback follows the browser's rule: each character comes from the first family in
 * the font list that has it (the R/L captions are in the list "Bravura,Academico"; Bravura has no
 * Latin letters, so they come from Academico — the same as on the web).
 */

export type FakeNode = {
  nodeName: string;
  attrs: Record<string, string>;
  children: FakeNode[];
  textContent: string;
  style: Record<string, string>;
  setAttribute(name: string, value: unknown): void;
  setAttributeNS(ns: unknown, name: string, value: unknown): void;
  appendChild(child: FakeNode): FakeNode;
  removeChild(child: FakeNode): FakeNode;
  readonly lastChild: FakeNode | undefined;
};

function createNode(nodeName: string): FakeNode {
  return {
    nodeName,
    attrs: {},
    children: [],
    textContent: '',
    style: {},
    setAttribute(name, value) {
      this.attrs[name] = String(value);
    },
    setAttributeNS(_ns, name, value) {
      this.attrs[name] = String(value);
    },
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    removeChild(child) {
      this.children = this.children.filter((c) => c !== child);
      return child;
    },
    get lastChild() {
      return this.children[this.children.length - 1];
    },
  };
}

class NativeSVGContext extends SVGContext {
  // `never` satisfies every typed overload of the base method — callers only use the DOM subset
  // `FakeNode` implements.
  create(svgElementType: string): never {
    return createNode(svgElementType) as never;
  }
}

// Hermes may not have `structuredClone` (SVGContext.save/restore use it on plain attribute objects).
if (typeof globalThis.structuredClone !== 'function') {
  (globalThis as { structuredClone?: unknown }).structuredClone = <T,>(value: T): T =>
    JSON.parse(JSON.stringify(value));
}

function familyList(family: string): string[] {
  return family
    .split(',')
    .map((f) => f.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);
}

/** The font a character actually renders in: the first listed family that has the glyph. */
function resolveGlyph(families: string[], char: string): { font: GlyphFont; glyph: GlyphFont['glyphs'][string] } | null {
  for (const name of families) {
    const font = NOTATION_FONTS[name];
    const glyph = font?.glyphs[char];
    if (font && glyph) return { font, glyph };
  }
  return null;
}

const missingWarned = new Set<string>();

/** Lays out `text` the way a browser does for a single run: glyphs side by side by advance width
    (no kerning — VexFlow only ever measures/draws single glyphs or short Latin captions). */
export function layoutText(text: string, family: string, sizePx: number) {
  const families = familyList(family);
  const glyphs: { d: string; x: number; scale: number }[] = [];
  let pen = 0;
  let ascent = 0;
  let descent = 0;
  let left = 0;
  let right = 0;
  let fontAscent = 0;
  let fontDescent = 0;
  for (const char of Array.from(text)) {
    const hit = resolveGlyph(families, char);
    if (!hit) {
      if (typeof __DEV__ !== 'undefined' && __DEV__ && !missingWarned.has(family + char)) {
        missingWarned.add(family + char);
        console.warn(`notation: no glyph for U+${char.codePointAt(0)?.toString(16)} in ${family}`);
      }
      continue;
    }
    const s = sizePx / hit.font.unitsPerEm;
    const [xMin, yMin, xMax, yMax] = hit.glyph.b;
    ascent = Math.max(ascent, yMax * s);
    descent = Math.max(descent, -yMin * s);
    left = Math.max(left, -(pen + xMin * s));
    right = Math.max(right, pen + xMax * s);
    fontAscent = Math.max(fontAscent, hit.font.ascender * s);
    fontDescent = Math.max(fontDescent, -hit.font.descender * s);
    if (hit.glyph.d) glyphs.push({ d: hit.glyph.d, x: pen, scale: s });
    pen += hit.glyph.a * s;
  }
  return {
    glyphs,
    metrics: {
      width: pen,
      actualBoundingBoxAscent: ascent,
      actualBoundingBoxDescent: descent,
      actualBoundingBoxLeft: left,
      actualBoundingBoxRight: right,
      fontBoundingBoxAscent: fontAscent,
      fontBoundingBoxDescent: fontDescent,
    },
  };
}

/** `[style] [weight] <size> <family>` — VexFlow's own `Font.fromCSSString` needs the DOM to do this. */
function parseCSSFont(css: string): { size: string; family: string; weight: string; style: string } {
  const m = /^\s*(?:(italic|oblique|normal)\s+)?(?:(bold|bolder|lighter|normal|\d{3})\s+)?([\d.]+[a-z%]*)\s+(.+)$/i.exec(css);
  return m
    ? { style: m[1] ?? 'normal', weight: m[2] ?? 'normal', size: m[3], family: m[4] }
    : { style: 'normal', weight: 'normal', size: '10pt', family: css };
}

declare const __DEV__: boolean | undefined;

// The ESM build exports the `VexFlow` class by name; the CommonJS/UMD build *is* the class (so it
// arrives as the default/namespace object). Metro may resolve either, so accept both.
const VexFlowApi: { setFonts: (...names: string[]) => void } =
  (VF as unknown as { VexFlow?: never }).VexFlow ??
  (VF as unknown as { default?: never }).default ??
  (VF as never);

let installed = false;

/** Points VexFlow's text measurement at the glyph data and sets the same fonts the web uses
    (`vexflow`'s own default entry calls `setFonts('Bravura', 'Academico')`; the `core` entry used
    here, which skips loading web fonts, doesn't). Idempotent. */
export function installVexFlowNative() {
  if (installed) return;
  installed = true;
  VexFlowApi.setFonts('Bravura', 'Academico');
  // VexFlow parses a CSS font string with a DOM element (`Font.fromCSSString`); the modifiers that
  // copy their note's font (parentheses around a ghost note) would crash without one.
  (Font as unknown as { fromCSSString: (css: string) => ReturnType<typeof parseCSSFont> }).fromCSSString = parseCSSFont;
  const measureContext = {
    font: '',
    measureText(text: string) {
      const { size, family } = parseCSSFont(this.font);
      return layoutText(text, family, Font.convertSizeToPixelValue(size)).metrics;
    },
  };
  Element.setTextMeasurementCanvas({ getContext: () => measureContext } as unknown as HTMLCanvasElement);
}

/** A fresh drawing surface: draw into `context` with ordinary VexFlow calls, then read `root`. */
export function createNativeContext() {
  installVexFlowNative();
  const host = createNode('div');
  const context = new NativeSVGContext(host as unknown as HTMLElement);
  const root = host.children[0];
  return { context, root };
}

export { Font };

/** One thing to draw. `fill`/`stroke` of `'ink'` means VexFlow's default black — the renderer
    substitutes the notation colour, the same way web overrides the root `<svg>`'s black with
    `currentColor`. */
export type DrawItem =
  | {
      kind: 'path';
      d: string;
      fill: string;
      stroke: string;
      strokeWidth: number;
      strokeDasharray?: string;
      strokeLinecap?: 'butt' | 'round' | 'square';
      /** Glyph outlines: translate + uniform scale (y already flipped in the outline data). */
      glyph?: { x: number; y: number; scale: number };
      /** The `data-tag` of the group it was drawn in (see `tagGroups`), e.g. a note to light. */
      tag?: string;
    }
  | { kind: 'rect'; x: number; y: number; width: number; height: number; fill: string; stroke: string; strokeWidth: number; tag?: string };

/** Marks the groups VexFlow drew for some elements (a `StaveNote`'s group, by its id) with a
    `data-tag`, which `flattenTree` then copies onto everything drawn inside them — the native
    stand-in for the web's `getSVGElement()?.setAttribute(...)` (that needs a DOM). */
export function tagGroups(root: FakeNode, tags: Map<string, string>) {
  if (!tags.size) return;
  const byId = new Map<string, string>();
  for (const [id, tag] of tags) byId.set(`vf-${id}`, tag);
  const walk = (node: FakeNode) => {
    const tag = node.attrs.id ? byId.get(node.attrs.id) : undefined;
    if (tag !== undefined) node.attrs['data-tag'] = tag;
    for (const child of node.children) walk(child);
  };
  walk(root);
}

const INK = new Set(['black', '#000', '#000000', 'currentColor']);

function paint(value: string | undefined): string {
  if (value === undefined) return 'ink';
  return INK.has(value) ? 'ink' : value;
}

/** Flattens a drawn tree into absolute draw items, resolving inherited attributes the way SVG
    does (VexFlow only writes an attribute on a node when it differs from its group's). Rotation
    groups aren't used by this notation and aren't supported. */
export function flattenTree(root: FakeNode): DrawItem[] {
  const items: DrawItem[] = [];
  function walk(node: FakeNode, inherited: Record<string, string>) {
    const a = { ...inherited, ...node.attrs };
    if (a.opacity === '0') return; // VexFlow's invisible pointer-hit rects
    const strokeWidth = Number(a['stroke-width'] ?? 1);
    if (node.nodeName === 'path' && a.d) {
      items.push({
        kind: 'path',
        d: a.d,
        fill: paint(a.fill),
        stroke: paint(a.stroke),
        strokeWidth,
        strokeDasharray: a['stroke-dasharray'] && a['stroke-dasharray'] !== 'none' ? a['stroke-dasharray'] : undefined,
        strokeLinecap: a['stroke-linecap'] as 'butt' | 'round' | 'square' | undefined,
        ...(a['data-tag'] !== undefined ? { tag: a['data-tag'] } : null),
      });
    } else if (node.nodeName === 'rect') {
      items.push({
        kind: 'rect',
        x: Number(a.x ?? 0),
        y: Number(a.y ?? 0),
        width: Number(a.width ?? 0),
        height: Number(a.height ?? 0),
        fill: paint(a.fill),
        stroke: paint(a.stroke),
        strokeWidth,
        ...(a['data-tag'] !== undefined ? { tag: a['data-tag'] } : null),
      });
    } else if (node.nodeName === 'text' && node.textContent) {
      const px = Font.convertSizeToPixelValue(a['font-size'] ?? '10pt');
      const { glyphs } = layoutText(node.textContent, a['font-family'] ?? '', px);
      const x = Number(a.x ?? 0);
      const y = Number(a.y ?? 0);
      for (const g of glyphs) {
        items.push({
          kind: 'path',
          d: g.d,
          fill: paint(a.fill),
          stroke: 'none',
          strokeWidth: 0,
          glyph: { x: x + g.x, y, scale: g.scale },
          ...(a['data-tag'] !== undefined ? { tag: a['data-tag'] } : null),
        });
      }
    }
    for (const child of node.children) walk(child, a);
  }
  walk(root, {});
  return items;
}
