"use client";

import { fontFamily, frameOf, imageKey, layoutText, linePlace, shapePath, turnOf } from "@/components/pdf/geometry";
import { inkPath, type Mark, type TextMark } from "@/components/pdf/markup";
import { opacityOf, underlineOf } from "@/components/pdf/marksRender";

/** One mark drawn in the page's SVG (units). `images`: picture addresses by `kind:id`.
    `hideText`: the frame only (its text is being typed in a box over it). */
export default function MarkSvg({ m, images, hideText }: { m: Mark; images?: Record<string, string | null | undefined>; hideText?: boolean }) {
  const turn = turnOf(m);
  const opacity = opacityOf(m);
  const transform = turn ? `rotate(${turn.deg} ${turn.cx} ${turn.cy})` : undefined;
  const blend = m.t === "ink" && m.highlight ? { mixBlendMode: "multiply" as const } : undefined;
  return (
    <g transform={transform} opacity={opacity < 1 ? opacity : undefined} style={blend}>
      <Inner m={m} images={images} hideText={hideText} />
    </g>
  );
}

function Inner({ m, images, hideText }: { m: Mark; images?: Record<string, string | null | undefined>; hideText?: boolean }) {
  if (m.t === "ink") {
    const pts = m.pts.length === 2 ? [...m.pts, m.pts[0] + 0.01, m.pts[1]] : m.pts;
    return <path d={inkPath(pts)} fill="none" stroke={m.color} strokeWidth={m.width} strokeLinecap="round" strokeLinejoin="round" />;
  }
  if (m.t === "shape") {
    const line = { stroke: m.width > 0 ? m.color : "none", strokeWidth: m.width, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
    const x = Math.min(m.x1, m.x2);
    const y = Math.min(m.y1, m.y2);
    const w = Math.abs(m.x2 - m.x1);
    const h = Math.abs(m.y2 - m.y1);
    if (m.shape === "rect") return <rect x={x} y={y} width={w} height={h} fill={m.fill ?? "none"} {...line} />;
    if (m.shape === "ellipse") return <ellipse cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} fill={m.fill ?? "none"} {...line} />;
    return <path d={shapePath(m)} fill="none" {...line} />;
  }
  if (m.t === "image") {
    const url = images?.[imageKey(m)];
    if (url) return <image href={url} x={m.x} y={m.y} width={m.w} height={m.h} preserveAspectRatio="none" />;
    // Still loading, or kept on another device.
    return (
      <g>
        <rect x={m.x} y={m.y} width={m.w} height={m.h} fill="#f1f3f5" stroke="#c9ced4" strokeWidth={1.5} strokeDasharray="6 4" />
        <text x={m.x + m.w / 2} y={m.y + m.h / 2} fill="#8a9099" fontSize={Math.min(16, m.w / 8)} textAnchor="middle" dominantBaseline="central" fontFamily="Helvetica, Arial, sans-serif">
          {url === null ? "Picture not on this device" : "Picture"}
        </text>
      </g>
    );
  }
  return <TextSvg m={m} hideText={hideText} />;
}

function TextSvg({ m, hideText }: { m: TextMark; hideText?: boolean }) {
  const lay = layoutText(m);
  const f = frameOf(m);
  const bx = f.cx - f.w / 2;
  const by = f.cy - f.h / 2;
  const sw = Math.max(1.5, m.size * 0.07);
  const ul = underlineOf(m);
  return (
    <g>
      {m.frame === "fill" && <rect x={bx} y={by} width={f.w} height={f.h} fill={m.bg ?? "#ffffff"} />}
      {m.frame === "box" && <rect x={bx} y={by} width={f.w} height={f.h} fill="none" stroke={m.color} strokeWidth={sw} />}
      {m.frame === "circle" && <circle cx={f.cx} cy={f.cy} r={f.w / 2} fill="none" stroke={m.color} strokeWidth={sw} />}
      {!hideText && (
        <text fill={m.color} fontSize={m.size} fontFamily={fontFamily(m.font)} fontWeight={m.bold ? 700 : 400} fontStyle={m.italic ? "italic" : undefined} dominantBaseline="central" style={{ whiteSpace: "pre" }}>
          {lay.lines.map((line, i) => {
            const p = linePlace(m, lay, i);
            return (
              <tspan key={i} x={f.cx + p.x} y={f.cy + p.y} textAnchor={p.anchor}>
                {line.text.replace(/\s+$/, "") || " "}
              </tspan>
            );
          })}
        </text>
      )}
      {!hideText &&
        m.underline &&
        lay.lines.map((line, i) => {
          if (!line.width) return null;
          const p = linePlace(m, lay, i);
          return <rect key={`u${i}`} x={f.cx + p.left} y={f.cy + p.y + ul.dy} width={line.width} height={ul.thick} fill={m.color} />;
        })}
    </g>
  );
}
