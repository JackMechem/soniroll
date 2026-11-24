"use client";

import { useEffect, useRef } from "react";
import { fontFamily, frameOf, layoutText } from "@/components/pdf/geometry";
import type { TextMark } from "@/components/pdf/markup";

/** Below this the box is typed in at 16px and shrunk to size (phones zoom into smaller text boxes). */
const MIN_INPUT_PX = 16;

/**
 * Typing a text mark, in place on the page: a real text box (caret, selecting, pasting plain text,
 * accented letters) laid exactly over where the text is drawn, in its font, size, alignment and
 * turn. Enter starts a new line; Escape, Ctrl/⌘+Enter or clicking away finishes. Ctrl/⌘+B, I and
 * U toggle bold, italic and underline (for the whole box); Ctrl/⌘+Shift+> and < change the size.
 */
export default function TextEditor({
  mark,
  px,
  caret,
  onChange,
  onToggle,
  onSize,
  onDone,
}: {
  mark: TextMark;
  /** Screen pixels per unit. */
  px: number;
  /** Where the caret starts (the end when left out). */
  caret?: number;
  onChange: (text: string) => void;
  onToggle: (style: "bold" | "italic" | "underline") => void;
  onSize: (dir: 1 | -1) => void;
  onDone: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const startCaret = useRef(caret);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    const at = startCaret.current ?? el.value.length;
    el.setSelectionRange(at, at);
  }, []);

  const f = frameOf(mark);
  const lay = layoutText(mark);
  const fontPx = mark.size * px;
  const k = fontPx < MIN_INPUT_PX ? fontPx / MIN_INPUT_PX : 1;
  const fixed = !!mark.w;
  // Room for the caret at the end of the longest line.
  const slack = fixed ? 0 : 3 / k;
  const align = mark.align ?? "center";
  const innerLeft = ((f.w - lay.innerW) / 2) * px;
  const innerTop = ((f.h - lay.innerH) / 2) * px;
  // Italic letters lean past their measured width: room on the right (padding, so the text still
  // wraps where it's drawn), or the box would clip the last letter's top.
  const lean = mark.italic ? (mark.size * 0.25 * px) / k : 0;
  const width = (lay.innerW * px) / k + slack + lean;
  return (
    <div
      className="absolute"
      style={{
        left: (f.cx - f.w / 2) * px,
        top: (f.cy - f.h / 2) * px,
        width: f.w * px,
        height: f.h * px,
        transform: f.rot ? `rotate(${f.rot}deg)` : undefined,
      }}
    >
      <textarea
        ref={ref}
        value={mark.text}
        aria-label="Text"
        spellCheck
        wrap={fixed ? "soft" : "off"}
        onChange={(e) => onChange(e.target.value)}
        onPointerDown={(e) => e.stopPropagation()}
        onBlur={(e) => {
          if ((e.relatedTarget as HTMLElement | null)?.closest("[data-keep-typing]")) return;
          onDone();
        }}
        onKeyDown={(e) => {
          const mod = e.ctrlKey || e.metaKey;
          if (e.key === "Escape" || (mod && e.key === "Enter")) {
            e.preventDefault();
            e.stopPropagation();
            onDone();
            return;
          }
          if (mod && !e.shiftKey && !e.altKey) {
            const k2 = e.key.toLowerCase();
            const style = k2 === "b" ? "bold" : k2 === "i" ? "italic" : k2 === "u" ? "underline" : null;
            if (style) {
              e.preventDefault();
              onToggle(style);
            }
          }
          if (mod && e.shiftKey && (e.code === "Period" || e.code === "Comma")) {
            e.preventDefault();
            onSize(e.code === "Period" ? 1 : -1);
          }
        }}
        className="absolute m-0 resize-none overflow-hidden border-0 bg-transparent p-0 outline-none"
        style={{
          left: align === "right" && !fixed ? innerLeft - slack * k : innerLeft,
          top: innerTop,
          width,
          height: (lay.innerH * px) / k + 2,
          transform: k < 1 ? `scale(${k})` : undefined,
          transformOrigin: "0 0",
          fontSize: fontPx / k,
          lineHeight: `${(lay.lineH * px) / k}px`,
          fontFamily: fontFamily(mark.font),
          fontWeight: mark.bold ? 700 : 400,
          fontStyle: mark.italic ? "italic" : "normal",
          textDecoration: mark.underline ? "underline" : "none",
          textAlign: align,
          color: mark.color,
          caretColor: mark.color,
          paddingRight: lean,
          boxSizing: "border-box",
          whiteSpace: fixed ? "pre-wrap" : "pre",
          overflowWrap: fixed ? "break-word" : "normal",
          letterSpacing: 0,
          // Text sits on the paper, not the theme.
          colorScheme: "light",
        }}
      />
    </div>
  );
}

/** Phones only show the keyboard for a box focused during the tap itself, and the text box appears
    a moment later: so the tap focuses a hidden field at once, and the text box takes over from it
    (the keyboard stays up). */
export function primeKeyboard() {
  if (typeof window === "undefined" || !window.matchMedia("(pointer: coarse)").matches) return;
  let el = document.getElementById("pdf-keyboard-proxy") as HTMLInputElement | null;
  if (!el) {
    el = document.createElement("input");
    el.id = "pdf-keyboard-proxy";
    el.setAttribute("aria-hidden", "true");
    el.tabIndex = -1;
    Object.assign(el.style, { position: "fixed", top: "0", left: "0", width: "1px", height: "1px", opacity: "0", fontSize: "16px", pointerEvents: "none" });
    document.body.appendChild(el);
  }
  el.focus({ preventScroll: true });
}
