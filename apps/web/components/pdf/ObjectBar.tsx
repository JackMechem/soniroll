"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { useEdgeFade } from "@/components/library/ui";
import { Pills, Pop, RangeRow, Swatch, keepFocus, keepFocusUnlessField } from "@/components/pdf/editorParts";
import { FONTS, fontFamily } from "@/components/pdf/geometry";
import { COLORS, FILLS, HIGHLIGHTS, INKS, isBoxShape, type Mark, type TextAlign, type TextMark } from "@/components/pdf/markup";
import { opacityOf } from "@/components/pdf/marksRender";
import {
  AlignCenterIcon,
  AlignLeftIcon,
  AlignRightIcon,
  BringForwardIcon,
  CopyIcon,
  DotsVerticalIcon,
  LockIcon,
  SendBackwardIcon,
  TrashIcon,
  UnlockIcon,
} from "@/components/tools";

/** Text sizes offered, in points (as the page prints). */
export const SIZE_PRESETS = [6, 8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 60, 72, 96];

export type BarActions = {
  /** Changes every selected mark (text is kept anchored by the editor). */
  onPatch: (change: (m: Mark) => Mark) => void;
  onDuplicate: () => void;
  onOrder: (to: "forward" | "backward" | "front" | "back") => void;
  onLock: (locked: boolean) => void;
  onDelete: () => void;
};

const btn = (on = false) =>
  `flex h-9 min-w-9 shrink-0 items-center justify-center rounded-lg px-1.5 text-sm transition-colors pointer-coarse:h-10 pointer-coarse:min-w-10 ${on ? "bg-accent/15 text-accent" : "text-foreground/85 hover:bg-surface-hover"}`;
const sep = <span className="mx-0.5 h-6 w-px shrink-0 bg-foreground/10" />;

/**
 * The toolbar for what's selected (or being typed): floating by the selection, or docked at the
 * bottom on a phone. Text: font, size, bold/italic/underline, colour, alignment, frame and fill,
 * line height. Strokes: colour, width, opacity. Shapes: line colour, fill, width. Pictures:
 * opacity. Always: duplicate, forward/backward (front/back, lock in ⋮), delete. Several marks of
 * different kinds get the controls they share.
 */
export default function ObjectBar({ marks, ptPerUnit, actions, style, docked }: { marks: Mark[]; ptPerUnit: number; actions: BarActions; style?: CSSProperties; docked: boolean }) {
  const texts = marks.filter((m): m is TextMark => m.t === "text");
  const allText = texts.length === marks.length;
  const allInk = marks.every((m) => m.t === "ink");
  const allShape = marks.every((m) => m.t === "shape");
  const allImage = marks.every((m) => m.t === "image");
  const first = marks[0];
  const locked = marks.every((m) => m.locked);
  const { onPatch } = actions;
  const coloured = marks.filter((m) => m.t !== "image");
  const color = coloured[0] && "color" in coloured[0] ? coloured[0].color : "#1f2328";

  const { attach: fadeRef, style: fade } = useEdgeFade<HTMLDivElement>();
  return (
    <div
      data-keep-typing
      onMouseDown={keepFocusUnlessField}
      onPointerDown={(e) => e.stopPropagation()}
      className={`pointer-events-auto rounded-2xl bg-surface p-1 shadow-lg ring-1 ring-foreground/10 ${docked ? "max-w-full overflow-hidden" : "absolute z-[5]"}`}
      style={style}
      role="toolbar"
      aria-label="Selected"
    >
      <div ref={docked ? fadeRef : undefined} style={docked ? fade : undefined} className={`flex items-center gap-0.5 ${docked ? "overflow-x-auto [scrollbar-width:none]" : ""}`}>
      {locked ? (
        <button type="button" onMouseDown={keepFocus} onClick={() => actions.onLock(false)} className={`${btn()} gap-1.5 px-2.5`}>
          <UnlockIcon className="h-4 w-4" /> Unlock
        </button>
      ) : (
        <>
          {allText && texts.length > 0 && <TextControls texts={texts} ptPerUnit={ptPerUnit} onPatch={onPatch} />}
          {!allText && !allImage && (
            <ColourPop
              label={allShape ? "Line colour" : "Colour"}
              color={color}
              choices={allInk && marks.every((m) => m.t === "ink" && m.highlight) ? HIGHLIGHTS : allInk ? INKS : COLORS}
              onPick={(c) => onPatch((m) => (m.t === "image" ? m : { ...m, color: c, ...(m.t === "shape" && m.width === 0 && !m.fill ? { width: 3 } : {}) }))}
              none={allShape && marks.every((m) => m.t === "shape" && isBoxShape(m.shape)) ? () => onPatch((m) => (m.t === "shape" ? { ...m, width: 0, fill: m.fill ?? "#ffffff" } : m)) : undefined}
              noneOn={allShape && marks.every((m) => m.t === "shape" && m.width === 0)}
            />
          )}
          {allShape && marks.every((m) => m.t === "shape" && (m.shape === "rect" || m.shape === "ellipse")) && (
            <ColourPop
              label="Fill"
              fill
              color={(first.t === "shape" && first.fill) || ""}
              choices={FILLS}
              onPick={(c) => onPatch((m) => (m.t === "shape" ? { ...m, fill: c } : m))}
              none={() => onPatch((m) => (m.t === "shape" ? { ...m, fill: undefined, width: m.width || 3 } : m))}
              noneOn={first.t === "shape" && !first.fill}
            />
          )}
          {(allInk || allShape) && (
            <Pop label="Line width" trigger={<span className={btn()}><WidthGlyph /></span>}>
              {() => (
                <div className="w-56">
                  <RangeRow
                    label="Line width"
                    value={first.t === "ink" || first.t === "shape" ? Math.min(first.width, first.t === "ink" && first.highlight ? 60 : 24) : 3}
                    min={first.t === "ink" && first.highlight ? 4 : 0.5}
                    max={first.t === "ink" && first.highlight ? 60 : 24}
                    step={0.5}
                    format={(v) => String(v)}
                    onChange={(v) => onPatch((m) => (m.t === "ink" || m.t === "shape" ? { ...m, width: v } : m))}
                  />
                </div>
              )}
            </Pop>
          )}
          {!allText && (
            <Pop label="Opacity" trigger={<span className={`${btn()} text-xs font-medium tabular-nums`}>{Math.round(opacityOf(first) * 100)}%</span>}>
              {() => (
                <div className="w-56">
                  <RangeRow label="Opacity" value={Math.round(opacityOf(first) * 100)} min={10} max={100} step={5} format={(v) => `${v}%`} onChange={(v) => onPatch((m) => ({ ...m, opacity: v >= 100 && !(m.t === "ink" && m.highlight) ? undefined : v / 100 }))} />
                </div>
              )}
            </Pop>
          )}
          {sep}
          <button type="button" onMouseDown={keepFocus} onClick={actions.onDuplicate} className={btn()} title="Duplicate (Ctrl+D)" aria-label="Duplicate">
            <CopyIcon className="h-[18px] w-[18px]" />
          </button>
          <button type="button" onMouseDown={keepFocus} onClick={() => actions.onOrder("forward")} className={btn()} title="Bring forward (Ctrl+])" aria-label="Bring forward">
            <BringForwardIcon className="h-[18px] w-[18px]" />
          </button>
          <button type="button" onMouseDown={keepFocus} onClick={() => actions.onOrder("backward")} className={btn()} title="Send backward (Ctrl+[)" aria-label="Send backward">
            <SendBackwardIcon className="h-[18px] w-[18px]" />
          </button>
          <Pop label="More" trigger={<span className={btn()}><DotsVerticalIcon className="h-[18px] w-[18px]" /></span>}>
            {(close) => (
              <div className="flex w-52 flex-col">
                <MenuRow onClick={() => (actions.onOrder("front"), close())} hint="Ctrl+Shift+]">Bring to front</MenuRow>
                <MenuRow onClick={() => (actions.onOrder("back"), close())} hint="Ctrl+Shift+[">Send to back</MenuRow>
                <MenuRow onClick={() => (actions.onLock(true), close())} icon={<LockIcon className="h-4 w-4" />}>
                  Lock
                </MenuRow>
              </div>
            )}
          </Pop>
        </>
      )}
      <button type="button" onMouseDown={keepFocus} onClick={actions.onDelete} className={`${btn()} text-danger`} title="Delete (Del)" aria-label="Delete">
        <TrashIcon className="h-[18px] w-[18px]" />
      </button>
      </div>
    </div>
  );
}

function MenuRow({ onClick, hint, icon, children }: { onClick: () => void; hint?: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <button type="button" onMouseDown={keepFocus} onClick={onClick} className="flex h-9 items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-surface-hover">
      {icon}
      <span className="flex-1">{children}</span>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </button>
  );
}

function WidthGlyph() {
  return (
    <svg viewBox="0 0 20 20" className="h-[18px] w-[18px]" aria-hidden>
      <path d="M3 5h14" stroke="currentColor" strokeWidth={1} />
      <path d="M3 10h14" stroke="currentColor" strokeWidth={2} />
      <path d="M3 15.5h14" stroke="currentColor" strokeWidth={3.5} />
    </svg>
  );
}

function ColourPop({
  label,
  color,
  choices,
  onPick,
  none,
  noneOn,
  fill,
}: {
  label: string;
  color: string;
  choices: readonly { name: string; color: string }[];
  onPick: (c: string) => void;
  none?: () => void;
  noneOn?: boolean;
  fill?: boolean;
}) {
  return (
    <Pop
      label={label}
      trigger={
        <span className={btn()}>
          {fill ? (
            <span className="h-5 w-5 rounded-md ring-2 ring-foreground/15" style={{ background: noneOn ? "repeating-linear-gradient(45deg, transparent 0 3px, rgb(127 127 127 / 0.4) 3px 4px)" : color }} />
          ) : (
            <span className="h-5 w-5 rounded-full ring-2 ring-foreground/15" style={{ background: noneOn ? "transparent" : color }} />
          )}
        </span>
      }
    >
      {(close) => (
        <div className="flex w-[15.5rem] flex-col gap-2">
          <p className="text-xs font-semibold text-muted">{label}</p>
          <div className="flex flex-wrap gap-1.5">
            {none && (
              <button
                type="button"
                onMouseDown={keepFocus}
                onClick={() => {
                  none();
                  close();
                }}
                aria-pressed={noneOn}
                className={`h-8 rounded-full px-2.5 text-xs ${noneOn ? "bg-accent/15 font-medium text-accent" : "bg-foreground/[0.05] hover:bg-surface-hover"}`}
              >
                None
              </button>
            )}
            {choices.map((c) => (
              <Swatch key={c.color} name={c.name} color={c.color} on={!noneOn && color.toLowerCase() === c.color} onClick={() => onPick(c.color)} />
            ))}
          </div>
        </div>
      )}
    </Pop>
  );
}

const ALIGNS: { value: TextAlign; icon: typeof AlignLeftIcon; label: string }[] = [
  { value: "left", icon: AlignLeftIcon, label: "Left" },
  { value: "center", icon: AlignCenterIcon, label: "Centre" },
  { value: "right", icon: AlignRightIcon, label: "Right" },
];

/** A text size in points: −, the number (type one, or pick from the list), +. */
function SizeField({ pt, onSet, onStep }: { pt: number; onSet: (pt: number) => void; onStep: (dir: 1 | -1) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? String(Math.round(pt * 2) / 2);
  const commit = () => {
    const n = parseFloat(shown);
    if (isFinite(n) && n > 0) onSet(Math.min(400, Math.max(2, n)));
    setDraft(null);
  };
  return (
    <div className="flex shrink-0 items-center rounded-lg bg-foreground/[0.05]">
      <button type="button" onMouseDown={keepFocus} onClick={() => onStep(-1)} className="flex h-9 w-7 items-center justify-center rounded-l-lg text-base hover:bg-surface-hover pointer-coarse:h-10" aria-label="Smaller" title="Smaller (Ctrl+Shift+<)">
        −
      </button>
      <input
        value={shown}
        inputMode="decimal"
        aria-label="Text size in points"
        title="Text size (points)"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") {
            commit();
            (e.target as HTMLInputElement).blur();
          }
          if (e.key === "Escape") setDraft(null);
        }}
        className="h-9 w-10 bg-transparent text-center text-sm tabular-nums outline-none pointer-coarse:h-10"
      />
      <Pop label="Sizes" className="shrink-0" trigger={<span className="flex h-9 w-4 items-center justify-center text-[10px] text-muted pointer-coarse:h-10">▾</span>}>
        {(close) => (
          <div className="grid w-44 grid-cols-3 gap-1">
            {SIZE_PRESETS.map((s) => (
              <button
                key={s}
                type="button"
                onMouseDown={keepFocus}
                onClick={() => {
                  onSet(s);
                  close();
                }}
                className={`h-8 rounded-md text-sm tabular-nums ${Math.abs(s - pt) < 0.25 ? "bg-accent/15 font-medium text-accent" : "bg-foreground/[0.04] hover:bg-surface-hover"}`}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </Pop>
      <button type="button" onMouseDown={keepFocus} onClick={() => onStep(1)} className="flex h-9 w-7 items-center justify-center rounded-r-lg text-base hover:bg-surface-hover pointer-coarse:h-10" aria-label="Bigger" title="Bigger (Ctrl+Shift+>)">
        +
      </button>
    </div>
  );
}

/** The next preset size up or down from `pt` (Ctrl/⌘+Shift+> and <, and − / +). */
export function stepSize(pt: number, dir: 1 | -1) {
  if (dir > 0) return SIZE_PRESETS.find((s) => s > pt + 0.25) ?? Math.min(400, Math.round(pt * 1.2));
  return [...SIZE_PRESETS].reverse().find((s) => s < pt - 0.25) ?? Math.max(2, Math.round(pt / 1.2));
}

function TextControls({ texts, ptPerUnit, onPatch }: { texts: TextMark[]; ptPerUnit: number; onPatch: BarActions["onPatch"] }) {
  const t = texts[0];
  const pt = t.size * ptPerUnit;
  const patchText = (change: (m: TextMark) => TextMark) => onPatch((m) => (m.t === "text" ? change(m) : m));
  const toggle = (k: "bold" | "italic" | "underline") => {
    const on = !texts.every((m) => m[k]);
    patchText((m) => ({ ...m, [k]: on || undefined }));
  };
  const align = t.align ?? "center";
  const AlignIcon = ALIGNS.find((a) => a.value === align)!.icon;
  const nextAlign = ALIGNS[(ALIGNS.findIndex((a) => a.value === align) + 1) % 3];
  const font = FONTS.find((f) => f.font === t.font) ?? FONTS[0];
  return (
    <>
      <Pop
        label="Font"
        trigger={
          <span className={`${btn()} w-[6.5rem] justify-between gap-1 px-2 max-sm:w-[5.5rem]`}>
            <span className="truncate text-sm" style={{ fontFamily: t.font === "music" ? undefined : fontFamily(t.font) }}>
              {font.label}
            </span>
            <span className="text-[10px] text-muted">▾</span>
          </span>
        }
      >
        {(close) => (
          <div className="flex w-48 flex-col">
            {FONTS.map((f) => (
              <button
                key={f.font}
                type="button"
                onMouseDown={keepFocus}
                onClick={() => {
                  patchText((m) => ({ ...m, font: f.font }));
                  close();
                }}
                className={`flex h-10 items-center rounded-md px-2 text-left ${f.font === t.font ? "bg-accent/15 text-accent" : "hover:bg-surface-hover"}`}
                style={{ fontFamily: f.font === "music" ? undefined : fontFamily(f.font), fontSize: 15 }}
              >
                {f.label}
                {f.font === "music" && <span className="ml-auto text-xs text-muted">Symbols</span>}
              </button>
            ))}
          </div>
        )}
      </Pop>
      <SizeField
        pt={pt}
        onSet={(p) => patchText((m) => ({ ...m, size: p / ptPerUnit }))}
        onStep={(dir) => patchText((m) => ({ ...m, size: stepSize(m.size * ptPerUnit, dir) / ptPerUnit }))}
      />
      <button type="button" onMouseDown={keepFocus} onClick={() => toggle("bold")} className={`${btn(texts.every((m) => m.bold))} w-9 font-bold`} aria-pressed={texts.every((m) => m.bold)} title="Bold (Ctrl+B)" aria-label="Bold">
        B
      </button>
      <button type="button" onMouseDown={keepFocus} onClick={() => toggle("italic")} className={`${btn(texts.every((m) => m.italic))} w-9 font-serif italic`} aria-pressed={texts.every((m) => m.italic)} title="Italic (Ctrl+I)" aria-label="Italic">
        I
      </button>
      <button type="button" onMouseDown={keepFocus} onClick={() => toggle("underline")} className={`${btn(texts.every((m) => m.underline))} w-9 underline`} aria-pressed={texts.every((m) => m.underline)} title="Underline (Ctrl+U)" aria-label="Underline">
        U
      </button>
      <ColourPop label="Text colour" color={t.color} choices={COLORS} onPick={(c) => patchText((m) => ({ ...m, color: c }))} />
      <button type="button" onMouseDown={keepFocus} onClick={() => patchText((m) => ({ ...m, align: nextAlign.value }))} className={btn()} title={`Aligned ${ALIGNS.find((a) => a.value === align)!.label.toLowerCase()} (click for ${nextAlign.label.toLowerCase()})`} aria-label="Alignment">
        <AlignIcon className="h-[18px] w-[18px]" />
      </button>
      <Pop label="Frame, fill and spacing" trigger={<span className={btn(!!t.frame)}><FrameGlyph frame={t.frame} /></span>}>
        {() => (
          <div className="flex w-60 flex-col gap-3">
            <div>
              <p className="mb-1 text-xs font-semibold text-muted">Frame</p>
              <Pills
                value={t.frame ?? "none"}
                options={[
                  { value: "none", label: "None" },
                  { value: "box", label: "Box" },
                  { value: "circle", label: "Circle" },
                  { value: "fill", label: "Fill", title: "A box filled behind the text, covering what's under it" },
                ]}
                onChange={(v) => patchText((m) => ({ ...m, frame: v === "none" ? undefined : v }))}
              />
            </div>
            {t.frame === "fill" && (
              <div>
                <p className="mb-1 text-xs font-semibold text-muted">Fill</p>
                <div className="flex flex-wrap gap-1.5">
                  {FILLS.map((c) => (
                    <Swatch key={c.color} name={c.name} color={c.color} on={(t.bg ?? "#ffffff") === c.color} onClick={() => patchText((m) => ({ ...m, bg: c.color === "#ffffff" ? undefined : c.color }))} />
                  ))}
                </div>
              </div>
            )}
            <RangeRow
              label="Line spacing"
              value={t.lh ?? (t.font === "music" ? 1 : 1.25)}
              min={0.8}
              max={2.5}
              step={0.05}
              format={(v) => v.toFixed(2)}
              onChange={(v) => patchText((m) => ({ ...m, lh: Math.abs(v - 1.25) < 0.001 && m.font !== "music" ? undefined : v }))}
            />
          </div>
        )}
      </Pop>
    </>
  );
}

function FrameGlyph({ frame }: { frame?: TextMark["frame"] }) {
  return (
    <svg viewBox="0 0 20 20" className="h-[18px] w-[18px]" aria-hidden fill="none" stroke="currentColor" strokeWidth={1.6}>
      {frame === "circle" ? <circle cx="10" cy="10" r="7.5" /> : <rect x="2.5" y="3.5" width="15" height="13" rx="1.5" fill={frame === "fill" ? "currentColor" : "none"} fillOpacity={0.3} strokeDasharray={frame ? undefined : "2.5 2"} />}
      <path d="M7 7.5h6M10 7.5v6" />
    </svg>
  );
}
