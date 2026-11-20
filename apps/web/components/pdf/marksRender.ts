import { chordFont, chordSymbolFont } from "@/components/ChordChart";
import { UNITS, inkPath, type Mark, type ShapeMark, type TextFont, type TextMark } from "@/components/pdf/markup";

/** The CSS font family for each kind of text. Plain text is a print face so it looks the same in
    a downloaded PDF; chord symbols use the charts' handwritten face; symbols are SMuFL (Petaluma). */
export function fontFamily(font: TextFont) {
  if (font === "hand") return chordFont.style.fontFamily;
  if (font === "music") return chordSymbolFont.style.fontFamily;
  return "Helvetica, Arial, sans-serif";
}

export function fontWeight(font: TextFont) {
  return font === "bold" ? 700 : 400;
}

let measureCtx: CanvasRenderingContext2D | null = null;

/** A text mark's box (centre `x`, `y`), from the text's measured width. */
export function textBox(m: TextMark) {
  const lines = m.text.split("\n");
  measureCtx ??= typeof document !== "undefined" ? document.createElement("canvas").getContext("2d") : null;
  let w = 0;
  for (const line of lines) {
    if (measureCtx) {
      measureCtx.font = `${fontWeight(m.font)} ${m.size}px ${fontFamily(m.font)}`;
      w = Math.max(w, measureCtx.measureText(line).width);
    } else w = Math.max(w, line.length * m.size * 0.55);
  }
  const lineH = m.size * (m.font === "music" ? 1 : 1.25);
  const h = lineH * lines.length;
  const pad = m.frame ? m.size * 0.3 : 0;
  if (m.frame === "circle") {
    const d = Math.max(w, h) + pad * 2;
    return { x: m.x - d / 2, y: m.y - d / 2, w: d, h: d, lineH, lines };
  }
  return { x: m.x - w / 2 - pad, y: m.y - h / 2 - pad, w: w + pad * 2, h: h + pad * 2, lineH, lines };
}

/** A shape's outline as SVG path data (lines, arrows, hairpins, brackets). Boxes and ellipses are
    drawn as their own elements. */
export function shapePath(m: ShapeMark) {
  const { x1, y1, x2, y2 } = m;
  if (m.shape === "line") return `M${x1} ${y1}L${x2} ${y2}`;
  if (m.shape === "arrow") {
    const a = Math.atan2(y2 - y1, x2 - x1);
    const len = Math.max(12, m.width * 5);
    const p = (da: number) => `${x2 - len * Math.cos(a + da)} ${y2 - len * Math.sin(a + da)}`;
    return `M${x1} ${y1}L${x2} ${y2}M${p(0.45)}L${x2} ${y2}L${p(-0.45)}`;
  }
  if (m.shape === "cresc" || m.shape === "dim") {
    // The open end is as tall as a third of the length, at most 30 units.
    const open = Math.min(30, Math.hypot(x2 - x1, y2 - y1) / 3) / 2;
    const a = Math.atan2(y2 - y1, x2 - x1);
    const nx = -Math.sin(a) * open;
    const ny = Math.cos(a) * open;
    const [px, py, ox, oy] = m.shape === "cresc" ? [x1, y1, x2, y2] : [x2, y2, x1, y1];
    return `M${ox + nx} ${oy + ny}L${px} ${py}L${ox - nx} ${oy - ny}`;
  }
  if (m.shape === "bracket") {
    // An ending bracket ("1." box): a line with short legs at each end, hanging down.
    const leg = 18;
    return `M${x1} ${y1 + leg}L${x1} ${y1}L${x2} ${y1}L${x2} ${y1 + leg}`;
  }
  return "";
}

/** A mark's bounds in units, for selecting and erasing. */
export function markBounds(m: Mark) {
  if (m.t === "text") return textBox(m);
  if (m.t === "ink") {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < m.pts.length; i += 2) {
      x0 = Math.min(x0, m.pts[i]);
      x1 = Math.max(x1, m.pts[i]);
      y0 = Math.min(y0, m.pts[i + 1]);
      y1 = Math.max(y1, m.pts[i + 1]);
    }
    const p = m.width / 2;
    return { x: x0 - p, y: y0 - p, w: x1 - x0 + p * 2, h: y1 - y0 + p * 2 };
  }
  const p = m.width / 2 + (m.shape === "bracket" ? 18 : m.shape === "cresc" || m.shape === "dim" ? 15 : 0);
  return { x: Math.min(m.x1, m.x2) - p, y: Math.min(m.y1, m.y2) - p, w: Math.abs(m.x2 - m.x1) + p * 2, h: Math.abs(m.y2 - m.y1) + p * 2 };
}

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** The top-most mark at `x`, `y` (units), within `tol`. */
export function hitTest(marks: Mark[], x: number, y: number, tol: number): Mark | null {
  for (let i = marks.length - 1; i >= 0; i--) {
    const m = marks[i];
    if (m.t === "ink") {
      const reach = m.width / 2 + tol;
      if (m.pts.length === 2 && Math.hypot(x - m.pts[0], y - m.pts[1]) < reach) return m;
      for (let j = 0; j + 3 < m.pts.length; j += 2) if (segDist(x, y, m.pts[j], m.pts[j + 1], m.pts[j + 2], m.pts[j + 3]) < reach) return m;
      continue;
    }
    if (m.t === "shape" && (m.shape === "line" || m.shape === "arrow")) {
      if (segDist(x, y, m.x1, m.y1, m.x2, m.y2) < m.width / 2 + tol) return m;
      continue;
    }
    const b = markBounds(m);
    if (x >= b.x - tol && x <= b.x + b.w + tol && y >= b.y - tol && y <= b.y + b.h + tol) return m;
  }
  return null;
}

/** Draws marks on a canvas whose 1000 units span `scale × 1000` pixels (for downloads). */
export function drawMarks(ctx: CanvasRenderingContext2D, marks: Mark[], scale: number) {
  ctx.save();
  ctx.scale(scale, scale);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const m of marks) {
    if (m.t === "ink") {
      ctx.save();
      if (m.highlight) {
        ctx.globalAlpha = 0.4;
        ctx.globalCompositeOperation = "multiply";
      }
      ctx.strokeStyle = m.color;
      ctx.lineWidth = m.width;
      ctx.stroke(new Path2D(inkPath(m.pts.length === 2 ? [...m.pts, m.pts[0] + 0.01, m.pts[1]] : m.pts)));
      ctx.restore();
    } else if (m.t === "shape") {
      ctx.strokeStyle = m.color;
      ctx.lineWidth = m.width;
      const x = Math.min(m.x1, m.x2);
      const y = Math.min(m.y1, m.y2);
      const w = Math.abs(m.x2 - m.x1);
      const h = Math.abs(m.y2 - m.y1);
      if (m.shape === "rect") ctx.strokeRect(x, y, w, h);
      else if (m.shape === "ellipse") {
        ctx.beginPath();
        ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else ctx.stroke(new Path2D(shapePath(m)));
    } else {
      const b = textBox(m);
      if (m.frame === "fill") {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(b.x, b.y, b.w, b.h);
      }
      ctx.strokeStyle = m.color;
      ctx.lineWidth = Math.max(1.5, m.size * 0.07);
      if (m.frame === "box") ctx.strokeRect(b.x, b.y, b.w, b.h);
      if (m.frame === "circle") {
        ctx.beginPath();
        ctx.arc(m.x, m.y, b.w / 2, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = m.color;
      ctx.font = `${fontWeight(m.font)} ${m.size}px ${fontFamily(m.font)}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      b.lines.forEach((line, i) => ctx.fillText(line, m.x, m.y - ((b.lines.length - 1) * b.lineH) / 2 + i * b.lineH));
    }
  }
  ctx.restore();
}

export { UNITS };
