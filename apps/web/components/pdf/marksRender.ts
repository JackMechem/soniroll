import { fontCss, frameOf, imageKey, layoutText, linePlace, shapePath, turnOf } from "@/components/pdf/geometry";
import { inkPath, isBoxShape, type Mark, type TextMark } from "@/components/pdf/markup";

export { fontFamily } from "@/components/pdf/geometry";

/** Every mark's opacity: highlighter strokes are see-through unless set otherwise. */
export function opacityOf(m: Mark) {
  return m.opacity ?? (m.t === "ink" && m.highlight ? 0.4 : 1);
}

/** How far under a line of text its underline goes, and how thick (text is drawn centred on its
    line, so the baseline sits about 0.3 of the size below the middle). */
export function underlineOf(m: TextMark) {
  return { dy: m.size * 0.4, thick: Math.max(0.8, m.size * 0.06) };
}

/** Pictures for image marks, by `kind:id`, ready to draw. */
export type MarkImages = Map<string, CanvasImageSource>;

/** Draws marks on a canvas whose 1000 units span `scale × 1000` pixels (for downloads). */
export function drawMarks(ctx: CanvasRenderingContext2D, marks: Mark[], scale: number, images?: MarkImages) {
  ctx.save();
  ctx.scale(scale, scale);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const m of marks) {
    ctx.save();
    ctx.globalAlpha = opacityOf(m);
    const turn = turnOf(m);
    if (turn) {
      ctx.translate(turn.cx, turn.cy);
      ctx.rotate((turn.deg * Math.PI) / 180);
      ctx.translate(-turn.cx, -turn.cy);
    }
    if (m.t === "ink") {
      if (m.highlight) ctx.globalCompositeOperation = "multiply";
      ctx.strokeStyle = m.color;
      ctx.lineWidth = m.width;
      ctx.stroke(new Path2D(inkPath(m.pts.length === 2 ? [...m.pts, m.pts[0] + 0.01, m.pts[1]] : m.pts)));
    } else if (m.t === "shape") {
      ctx.strokeStyle = m.color;
      ctx.lineWidth = m.width;
      const x = Math.min(m.x1, m.x2);
      const y = Math.min(m.y1, m.y2);
      const w = Math.abs(m.x2 - m.x1);
      const h = Math.abs(m.y2 - m.y1);
      if (m.shape === "rect" || m.shape === "ellipse") {
        ctx.beginPath();
        if (m.shape === "rect") ctx.rect(x, y, w, h);
        else ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
        if (m.fill) {
          ctx.fillStyle = m.fill;
          ctx.fill();
        }
        if (m.width > 0) ctx.stroke();
      } else if (m.width > 0 || !isBoxShape(m.shape)) ctx.stroke(new Path2D(shapePath(m)));
    } else if (m.t === "image") {
      const img = images?.get(imageKey(m));
      if (img) ctx.drawImage(img, m.x, m.y, m.w, m.h);
    } else drawText(ctx, m);
    ctx.restore();
  }
  ctx.restore();
}

function drawText(ctx: CanvasRenderingContext2D, m: TextMark) {
  const lay = layoutText(m);
  const f = frameOf(m);
  const bx = f.cx - f.w / 2;
  const by = f.cy - f.h / 2;
  if (m.frame === "fill") {
    ctx.fillStyle = m.bg ?? "#ffffff";
    ctx.fillRect(bx, by, f.w, f.h);
  }
  ctx.strokeStyle = m.color;
  ctx.lineWidth = Math.max(1.5, m.size * 0.07);
  if (m.frame === "box") ctx.strokeRect(bx, by, f.w, f.h);
  if (m.frame === "circle") {
    ctx.beginPath();
    ctx.arc(f.cx, f.cy, f.w / 2, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = m.color;
  ctx.font = fontCss(m, m.size);
  ctx.textBaseline = "middle";
  const ul = underlineOf(m);
  lay.lines.forEach((line, i) => {
    const p = linePlace(m, lay, i);
    ctx.textAlign = p.anchor === "start" ? "left" : p.anchor === "end" ? "right" : "center";
    const text = line.text.replace(/\s+$/, "");
    ctx.fillText(text, f.cx + p.x, f.cy + p.y);
    if (m.underline && text) ctx.fillRect(f.cx + p.left, f.cy + p.y + ul.dy, line.width, ul.thick);
  });
}
