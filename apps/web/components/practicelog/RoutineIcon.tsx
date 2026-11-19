"use client";

import { createElement, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FlameIcon } from "@/components/practicelog/Celebrations";
import {
  BassIcon,
  BookIcon,
  ChordChartIcon,
  ChordIcon,
  DrumIcon,
  EarIcon,
  HeartIcon,
  MetronomeIcon,
  MicIcon,
  NoteIcon,
  PencilIcon,
  ScaleIcon,
  SetlistIcon,
  StarIcon,
  StopwatchIcon,
  SyncopationIcon,
  TunerIcon,
  WaveIcon,
  svgProps,
} from "@/components/tools";
import { ROUTINE_COLORS } from "@/lib/practiceLog";

type Icon = (props: { className?: string }) => React.JSX.Element;

function GuitarIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M19 3l2 2-5.5 5.5" />
      <path d="M14 7l3 3" />
      <path d="M12.5 9.5a3.5 3.5 0 0 0-5 .5c-.8 1-1 2.2-2.4 2.6C3.4 13 2.5 14.6 3.4 16.6c.8 1.7 2.3 3.2 4 4 2 .9 3.6 0 4-1.7.4-1.4 1.6-1.6 2.6-2.4a3.5 3.5 0 0 0 .5-5z" />
      <circle cx="9" cy="15" r="1.3" />
    </svg>
  );
}

function PianoIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M8 4v16M12 4v16M16 4v16" />
      <path d="M6.5 4v8h3V4M14.5 4v8h3V4" fill="currentColor" />
    </svg>
  );
}

function DumbbellIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M7 6v12M4 9v6M17 6v12M20 9v6M7 12h10" />
    </svg>
  );
}

function BulbIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M9 18h6M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.3 1 2.1h5c0-.8.4-1.6 1-2.1A6 6 0 0 0 12 3z" />
    </svg>
  );
}

function SunIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
    </svg>
  );
}

/** Bars rising — "stats". */
export function ChartIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M4 20h16M7 16v-4M12 16V7M17 16v-7" />
    </svg>
  );
}

function TargetIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
    </svg>
  );
}

function BoltIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M13 2L4 14h7l-1 8 9-12h-7z" />
    </svg>
  );
}

const Star: Icon = ({ className }) => <StarIcon className={className} filled />;
const Heart: Icon = ({ className }) => <HeartIcon className={className} filled />;

/** The icons a routine can have, by id (stored on the routine). */
export const ROUTINE_ICONS: { id: string; label: string; icon: Icon }[] = [
  { id: "note", label: "Note", icon: NoteIcon },
  { id: "metronome", label: "Metronome", icon: MetronomeIcon },
  { id: "drum", label: "Drums", icon: DrumIcon },
  { id: "rhythm", label: "Rhythm", icon: SyncopationIcon },
  { id: "guitar", label: "Guitar", icon: GuitarIcon },
  { id: "bass", label: "Bass", icon: BassIcon },
  { id: "piano", label: "Piano", icon: PianoIcon },
  { id: "mic", label: "Voice", icon: MicIcon },
  { id: "ear", label: "Ear training", icon: EarIcon },
  { id: "chord", label: "Chords", icon: ChordIcon },
  { id: "scale", label: "Scales", icon: ScaleIcon },
  { id: "tuner", label: "Tuning", icon: TunerIcon },
  { id: "wave", label: "Listening", icon: WaveIcon },
  { id: "chart", label: "Charts", icon: ChordChartIcon },
  { id: "setlist", label: "Repertoire", icon: SetlistIcon },
  { id: "book", label: "Reading", icon: BookIcon },
  { id: "pencil", label: "Writing", icon: PencilIcon },
  { id: "bulb", label: "Theory", icon: BulbIcon },
  { id: "dumbbell", label: "Technique", icon: DumbbellIcon },
  { id: "target", label: "Focus", icon: TargetIcon },
  { id: "bolt", label: "Speed", icon: BoltIcon },
  { id: "stopwatch", label: "Timed", icon: StopwatchIcon },
  { id: "flame", label: "Flame", icon: FlameIcon },
  { id: "star", label: "Star", icon: Star },
  { id: "heart", label: "Heart", icon: Heart },
  { id: "sun", label: "Morning", icon: SunIcon },
  { id: "moon", label: "Evening", icon: MoonIcon },
];

const BY_ID: Record<string, Icon> = Object.fromEntries(ROUTINE_ICONS.map((i) => [i.id, i.icon]));

/** A routine icon by id, as an element (the default note for an unknown id). */
export function routineIconElement(id: string | undefined, className: string) {
  return createElement((id && BY_ID[id]) || NoteIcon, { className });
}

const SIZES = { xs: "h-4 w-4", sm: "h-6 w-6", md: "h-8 w-8", lg: "h-11 w-11" } as const;
const ICON_SIZES = { xs: "h-2.5 w-2.5", sm: "h-3.5 w-3.5", md: "h-4 w-4", lg: "h-6 w-6" } as const;

/** A routine's icon in a circle of its color — how a routine is shown everywhere. */
export default function RoutineIcon({ icon, color, size = "sm" }: { icon: string | undefined; color: number; size?: keyof typeof SIZES }) {
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-full text-white ${SIZES[size]}`} style={{ background: ROUTINE_COLORS[color % ROUTINE_COLORS.length] }}>
      {routineIconElement(icon, ICON_SIZES[size])}
    </span>
  );
}

/** Pick a routine's icon. */
export function RoutineIconPicker({ value, color, onChange }: { value: string | undefined; color: number; onChange: (id: string) => void }) {
  const c = ROUTINE_COLORS[color % ROUTINE_COLORS.length];
  const current = value ?? "note";
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Icon">
      {ROUTINE_ICONS.map(({ id, label, icon: Icon }) => {
        const on = id === current;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={label}
            title={label}
            onClick={() => onChange(id)}
            className={`flex h-10 w-10 items-center justify-center rounded-md border transition-colors ${on ? "border-transparent text-white" : "border-foreground/15 text-muted hover:bg-surface-hover hover:text-foreground"}`}
            style={on ? { background: c } : undefined}
          >
            <Icon className="h-5 w-5" />
          </button>
        );
      })}
    </div>
  );
}

/** The routine's icon as a button that opens the picker in a popover below it (above when there's
    no room). Portaled and fixed, kept on screen; Escape, a click outside or a pick closes it. */
export function RoutineIconButton({ value, color, onChange }: { value: string | undefined; color: number; onChange: (id: string) => void }) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const close = () => setAnchor(null);

  // Fit it on screen once it's drawn (style set directly: no state change in an effect).
  useLayoutEffect(() => {
    const el = popRef.current;
    if (!anchor || !el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const left = Math.max(8, Math.min(anchor.left, window.innerWidth - w - 8));
    const below = anchor.bottom + 6;
    const top = below + h > window.innerHeight - 8 ? Math.max(8, anchor.top - h - 6) : below;
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.visibility = "visible";
  }, [anchor]);

  useEffect(() => {
    if (!anchor) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!popRef.current?.contains(t) && !buttonRef.current?.contains(t)) setAnchor(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAnchor(null);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
    };
  }, [anchor]);

  const label = ROUTINE_ICONS.find((i) => i.id === (value ?? "note"))?.label ?? "Note";
  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (anchor ? close() : setAnchor(buttonRef.current?.getBoundingClientRect() ?? null))}
        aria-label={`Icon: ${label}. Change it`}
        title="Change the icon"
        aria-haspopup="dialog"
        aria-expanded={!!anchor}
        className="relative shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
      >
        <RoutineIcon icon={value} color={color} size="md" />
        <span aria-hidden className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-surface text-muted ring-1 ring-foreground/10">
          <PencilIcon className="h-2.5 w-2.5" />
        </span>
      </button>
      {anchor &&
        createPortal(
          <div
            ref={popRef}
            role="dialog"
            aria-label="Pick an icon"
            style={{ position: "fixed", top: anchor.bottom + 6, left: anchor.left, visibility: "hidden", width: "min(332px, calc(100vw - 16px))" }}
            className="z-[70] max-h-[calc(100dvh-16px)] overflow-y-auto rounded-lg bg-surface p-2 shadow-lg ring-1 ring-foreground/10"
          >
            <RoutineIconPicker
              value={value}
              color={color}
              onChange={(id) => {
                onChange(id);
                close();
                buttonRef.current?.focus();
              }}
            />
          </div>,
          document.body,
        )}
    </>
  );
}
