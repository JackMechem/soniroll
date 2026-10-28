"use client";

import {
  CATEGORIES,
  type Category,
  type NavLinkInfo,
  NAV_LINKS_DATA,
  filterNavLinks,
  groupByCategory,
} from "@jam-practice/core/navLinks";

// Shared by the sidebar and the command palette.
export { CATEGORIES, groupByCategory };
export type { Category };

export function svgProps(className?: string) {
  return {
    "aria-hidden": true,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: className ?? "h-4 w-4",
  };
}

export function MetronomeIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M8 21h8l-2.5-16h-3z" />
      <path d="M12 16l4-8" />
    </svg>
  );
}

export function NoteIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  );
}

export function StopwatchIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2.5 2M9 2h6M12 2v3" />
    </svg>
  );
}

/** A calendar page with a check — the Shed Log. */
export function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4M9 15.5l2 2 4-4" />
    </svg>
  );
}

export function MeterIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M4 5v14M20 5v14M12 5v14M4 12h16" />
    </svg>
  );
}

export function SpeakerIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M11 5L6 9H3v6h3l5 4z" />
      <path d="M15.5 8.5a5 5 0 010 7M18.5 6a9 9 0 010 12" />
    </svg>
  );
}

export function SlidersIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </svg>
  );
}

export function GearIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function ListIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />
    </svg>
  );
}

export function DotsVerticalIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M12 5h.01M12 12h.01M12 19h.01" strokeWidth={3} />
    </svg>
  );
}

/** Books on a shelf — the Library (tunes, setlists, charts, files). */
export function LibraryIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M4 4h3v16H4zM9 4h3v16H9z" />
      <path d="M14.5 5.2l2.9-.8 3.9 14.8-2.9.8z" />
      <path d="M3 20h18" />
    </svg>
  );
}

export function BookIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2z" />
      <path d="M4 21a2 2 0 012-2h13v2H6" />
    </svg>
  );
}

export function PlusIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function CheckIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M4 12.5l5 5L20 6.5" />
    </svg>
  );
}

export function PencilIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M4 20h4L19 9a2.8 2.8 0 00-4-4L4 16z" />
      <path d="M13.5 6.5l4 4" />
    </svg>
  );
}

export function TrashIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
    </svg>
  );
}

export function ChecklistIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M3 6l2 2 3-3.5M3 13l2 2 3-3.5M12 7h9M12 14h9M12 20h9M3 20h.01" />
    </svg>
  );
}

export function MicIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0014 0M12 18v3M9 21h6" />
    </svg>
  );
}

export function ScaleIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M4 20v-3M9 20v-6M14 20v-9M19 20v-12" />
      <path d="M4 17l5-3 5-3 5-3" />
    </svg>
  );
}

export function IntervalIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <circle cx="6" cy="18" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <path d="M8 16L16 8" />
      <path d="M16 8h-4.5M16 8v4.5" />
    </svg>
  );
}

export function UserIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20a8 8 0 0116 0" />
    </svg>
  );
}

/** A simplified, single-color "G" mark for the Google sign-in button — not Google's official
    multi-color logomark, kept monochrome to match every other icon on this site (all plain
    `currentColor` strokes/fills), since the button's own "Continue with Google" label already
    carries the actual identification. */
export function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={className ?? "h-4 w-4"}>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
      <text x="12" y="16.5" textAnchor="middle" fontSize="11" fontWeight="700" fill="currentColor">
        G
      </text>
    </svg>
  );
}

export function EarIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M4 13a8 8 0 0116 0v4" />
      <rect x="3" y="13" width="4" height="7" rx="2" />
      <rect x="17" y="13" width="4" height="7" rx="2" />
    </svg>
  );
}

export function ChordIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <ellipse cx="7" cy="19" rx="3" ry="2.2" />
      <ellipse cx="7" cy="13.5" rx="3" ry="2.2" />
      <ellipse cx="7" cy="8" rx="3" ry="2.2" />
      <path d="M10 19V4M10 4l6 1.5" />
    </svg>
  );
}

/** An upright bass — scroll, neck and the body's two bouts — for Bass Genius. */
export function BassIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M12 2.5v9" />
      <path d="M11 2.5h2" />
      <path d="M12 11.5c-2.4 0-3.6 1.2-3.2 2.8.3 1.1-.9 1.6-1.2 2.9-.6 2.6 1.5 4.3 4.4 4.3s5-1.7 4.4-4.3c-.3-1.3-1.5-1.8-1.2-2.9.4-1.6-.8-2.8-3.2-2.8Z" />
      <path d="M10.5 14.5v4.5M13.5 14.5v4.5M10.2 19.5h3.6" />
    </svg>
  );
}

/** Three little chord stacks stepping along, for Guess the Progression. */
export function ProgressionIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <circle cx="5" cy="15" r="1.8" />
      <circle cx="5" cy="10" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="12" cy="7" r="1.8" />
      <circle cx="19" cy="9" r="1.8" />
      <circle cx="19" cy="4" r="1.8" />
      <path d="M3 20h18" />
    </svg>
  );
}

export function TunerIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M4 17a8 8 0 0116 0" />
      <path d="M12 17l4-7" />
      <circle cx="12" cy="17" r="1.2" />
    </svg>
  );
}

export function EyeIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function EyeOffIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M10.7 5.1A10.6 10.6 0 0112 5c6.4 0 10 7 10 7a17 17 0 01-2.6 3.4M6.6 6.6A16.7 16.7 0 002 12s3.6 7 10 7a10.5 10.5 0 005.4-1.5" />
      <path d="M9.9 9.9a3 3 0 004.2 4.2M3 3l18 18" />
    </svg>
  );
}

export function WaveIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M3 12h2M7 8v8M11 4v16M15 8v8M19 10v4M21 12h.01" />
    </svg>
  );
}

export function RepeatIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M17 2l4 4-4 4" />
      <path d="M3 11v-1a4 4 0 014-4h14" />
      <path d="M7 22l-4-4 4-4" />
      <path d="M21 13v1a4 4 0 01-4 4H3" />
    </svg>
  );
}

export function PlayIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)} fill="currentColor" stroke="none">
      <path d="M8 5.5v13a1 1 0 001.5.86l11-6.5a1 1 0 000-1.72l-11-6.5A1 1 0 008 5.5z" />
    </svg>
  );
}

export function PauseIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)} fill="currentColor" stroke="none">
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  );
}

export function SkipForwardIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)} fill="currentColor" stroke="none">
      <path d="M6 5.5v13a1 1 0 001.5.86l9-6.5a1 1 0 000-1.72l-9-6.5A1 1 0 006 5.5z" />
      <rect x="17" y="5" width="2.5" height="14" rx="1" />
    </svg>
  );
}

export function FlagIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M5 21V4M5 4h11l-2 4 2 4H5" />
    </svg>
  );
}

export function MaximizeIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
    </svg>
  );
}

export function MinimizeIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
    </svg>
  );
}

export function ExpandHeightIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4" />
    </svg>
  );
}

export function ShrinkHeightIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M4 12h16M8 4l4 4 4-4M8 20l4-4 4 4" />
    </svg>
  );
}

export function RecordIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)} fill="currentColor" stroke="none">
      <circle cx="12" cy="12" r="7" />
    </svg>
  );
}

export function StopIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)} fill="currentColor" stroke="none">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

export function GraduationCapIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M22 10 12 5 2 10l10 5 10-5z" />
      <path d="M6 12v5c3 2 9 2 12 0v-5" />
    </svg>
  );
}

export function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M12 3v12M7 10l5 5 5-5M4 20h16" />
    </svg>
  );
}

export function UploadIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M12 16V4M7 9l5-5 5 5M4 20h16" />
    </svg>
  );
}

/** A page with a folded corner — any file. */
export function FileIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" />
      <path d="M14 3v5h5" />
    </svg>
  );
}

/** A page with lines — a PDF or document. */
/** A folder (closed). */
export function FolderIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
    </svg>
  );
}

/** A folder, open. */
export function FolderOpenIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M3 17V7a2 2 0 012-2h4l2 2h7a2 2 0 012 2v1" />
      <path d="M3 17l2.2-6.2A2 2 0 017.1 9.5H20a1.5 1.5 0 011.4 2l-2 5.6A2 2 0 0117.5 19H5a2 2 0 01-2-2z" />
    </svg>
  );
}

/** A folder with a plus: new folder. */
export function FolderPlusIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
      <path d="M12 10.5v5M9.5 13h5" />
    </svg>
  );
}

/** A page with a plus: new note. */
export function NotePlusIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" />
      <path d="M14 3v5h5M12 11v6M9 14h6" />
    </svg>
  );
}

/** Score Writer: a staff with a note on it. */
export function ScoreIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M3 7h18M3 11h18M3 15h18M3 19h18" strokeOpacity={0.45} />
      <path d="M15 17V4l4 2" />
      <ellipse cx="12.5" cy="17" rx="2.6" ry="2" transform="rotate(-20 12.5 17)" fill="currentColor" />
    </svg>
  );
}

export function DocumentIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </svg>
  );
}

export function ImageIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="1.5" />
      <path d="M21 16l-5-5-9 9" />
    </svg>
  );
}

export function VideoIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <rect x="3" y="6" width="13" height="12" rx="2" />
      <path d="M16 10l5-3v10l-5-3" />
    </svg>
  );
}

export function HelpIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 015 0c0 1.5-2.500 2-2.500 3.500M12 17h.01" />
    </svg>
  );
}

export function SearchIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-4-4" />
    </svg>
  );
}

export function ShuffleIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M3 7h3c5 0 5 10 10 10h5M3 17h3c1.8 0 3-.9 4-2M14 9c.9-1.2 2-2 4-2h3" />
      <path d="M18 4l3 3-3 3M18 14l3 3-3 3" />
    </svg>
  );
}

export function MetricModulationIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M8 21h8l-2.5-16h-3z" />
      <path d="M12 17l3-7" />
      <path d="M4 6l-2 2 2 2M20 6l2 2-2 2" />
    </svg>
  );
}

/** Time Test: a target, for landing on the click. */
export function TimeTestIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" />
    </svg>
  );
}

export function TempoTrainerIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M8 21h8l-2.5-16h-3z" />
      <path d="M12 16l4-8" />
      <path d="M4 4l16 16" />
    </svg>
  );
}

export function ChordChartIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 10h18M9 10v10M15 10v10" />
    </svg>
  );
}

export function LinkIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

export function HeartIcon({ className, filled }: { className?: string; filled?: boolean }) {
  return (
    <svg {...svgProps(className)} fill={filled ? "currentColor" : "none"}>
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

export function ShareIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="M8.59 10.51l6.83-3.02M8.59 13.49l6.83 3.02" />
    </svg>
  );
}

export function HomeIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M3 11l9-8 9 8" />
      <path d="M5 10v10h5v-6h4v6h5V10" />
    </svg>
  );
}

export function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

export function LogOutIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M9 4H5a2 2 0 00-2 2v12a2 2 0 002 2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

/** The sidebar's favorite/star toggle — `filled` for a favorited tool, outline otherwise. */
export function StarIcon({ className, filled }: { className?: string; filled?: boolean }) {
  return (
    <svg {...svgProps(className)} fill={filled ? "currentColor" : "none"}>
      <path
        d="M12 3.5l2.6 5.4 5.9.6-4.4 4 1.2 5.9L12 16.5l-5.3 2.9 1.2-5.9-4.4-4 5.9-.6z"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function GlobeIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 010 18 14 14 0 010-18z" />
    </svg>
  );
}

export function DrumIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <ellipse cx="12" cy="7" rx="8" ry="3.5" />
      <path d="M4 7v9a8 3.5 0 0016 0V7" />
      <path d="M8 5L3 1M16 5l5-4" />
    </svg>
  );
}

export function UsersIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0113 0" />
      <path d="M15.5 5.5a3.5 3.5 0 010 6.8" />
      <path d="M17.5 13.5a6.5 6.5 0 014 6.5" />
    </svg>
  );
}

/** One icon per category, shown next to its own collapsible header in the sidebar
    (`components/Sidebar.tsx`'s `NavItems`) — a decorative, category-level choice, separate from
    (and not required to match) whichever icon a tool inside it happens to use for itself. */
export const CATEGORY_ICONS: Record<Category, (props: { className?: string }) => React.JSX.Element> = {
  Community: UsersIcon,
  "Play along": BassIcon,
  "Time & rhythm": MetronomeIcon,
  "Ear training": EarIcon,
  "On your instrument": NoteIcon,
  Drums: DrumIcon,
  "Practice tools": StopwatchIcon,
};

/** One color per category: the sidebar's icon tiles, so a tool's group reads at a glance. CSS
    variables (`app/globals.css`, `--cat-0`…`--cat-6`) derived from the theme's accent, so they
    suit whichever theme is on. Text/icons on a solid one use `--accent-foreground`. */
export const CATEGORY_COLORS: Record<Category, string> = {
  Community: "var(--cat-0)",
  "Play along": "var(--cat-1)",
  "Time & rhythm": "var(--cat-2)",
  "Ear training": "var(--cat-3)",
  "On your instrument": "var(--cat-4)",
  Drums: "var(--cat-5)",
  "Practice tools": "var(--cat-6)",
};

/** Every tool's own icon component (web-only SVG JSX) — the one thing `@jam-practice/core/navLinks`
    doesn't carry, since that package has no React-DOM dependency. Keyed by `href` so it's a plain
    lookup alongside the shared label/description/category data below, rather than a second,
    separately-ordered list that could drift out of sync with it. */
const NAV_LINK_ICONS: Record<string, (props: { className?: string }) => React.JSX.Element> = {
  "/jam-practice": ShuffleIcon,
  "/bass-genius": BassIcon,
  "/note-trainer": NoteIcon,
  "/scale-trainer": ScaleIcon,
  "/interval-trainer": IntervalIcon,
  "/guess-the-interval": EarIcon,
  "/guess-the-chord": ChordIcon,
  "/guess-the-progression": ProgressionIcon,
  "/lessons": GraduationCapIcon,
  "/practice-timer": StopwatchIcon,
  "/shed-log": CalendarIcon,
  "/shed-notes": DocumentIcon,
  "/score-writer": ScoreIcon,
  "/metronome": MetronomeIcon,
  "/random-metric-modulation": MetricModulationIcon,
  "/tempo-trainer": TempoTrainerIcon,
  "/tuner": TunerIcon,
  "/slow-downer": WaveIcon,
  "/chord-charts": ChordChartIcon,
  "/tunes": LibraryIcon,
  "/recorder": RecordIcon,
  "/random-sticking-warmup": DrumIcon,
  "/drum-generator": DrumIcon,
  "/time-test": TimeTestIcon,
  "/syncopation": SyncopationIcon,
  "/community": UsersIcon,
};

/** The sidebar/search source of truth — `@jam-practice/core/navLinks`'s plain data (also used
    directly by `apps/mobile`'s own menu/search screen), each entry paired here with its web icon
    component via `NAV_LINK_ICONS`. */
export const NAV_LINKS: (NavLinkInfo & { icon: (props: { className?: string }) => React.JSX.Element })[] =
  NAV_LINKS_DATA.map((link) => ({ ...link, icon: NAV_LINK_ICONS[link.href] }));

export function filterLinks(query: string) {
  return filterNavLinks(NAV_LINKS, query);
}

/** Syncopation: an off-beat figure — an eighth rest, then two beamed notes. */
export function SyncopationIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M4 6l3-1-2 4" />
      <path d="M12 18V5h8v11" />
      <circle cx="10" cy="18" r="2" />
      <circle cx="18" cy="16" r="2" />
    </svg>
  );
}

/** A setlist — a numbered list with a note. */
export function SetlistIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M3 6h11M3 11h11M3 16h7" />
      <path d="M18 18V7l3-1" />
      <circle cx="16" cy="18" r="2" />
    </svg>
  );
}

/** Pages of slides — "view all charts", one per page. */
export function SlidesIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <rect x="6" y="6" width="15" height="12" rx="2" />
      <path d="M3 9v8a2 2 0 002 2h11" />
      <path d="M12 10v4l3-2z" />
    </svg>
  );
}

/** A drag grip — six dots. */
export function DragIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)} fill="currentColor" stroke="none">
      {[6, 12, 18].map((y) => (
        <g key={y}>
          <circle cx="9" cy={y} r="1.6" />
          <circle cx="15" cy={y} r="1.6" />
        </g>
      ))}
    </svg>
  );
}

export function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

export function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

export function CloseIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

export function FeedbackIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 21 12z" />
      <path d="M9 10h6M9 13.5h4" />
    </svg>
  );
}

export function BugIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M8 8a4 4 0 0 1 8 0v1H8V8zM6 9h12v4a6 6 0 0 1-12 0V9zM12 9v10M3 13h3M18 13h3M4 7l2.5 2M20 7l-2.5 2M4 19l2.5-2M20 19l-2.5-2" />
    </svg>
  );
}

export function MegaphoneIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M3 11v2a1 1 0 0 0 1 1h3l6 4V6L7 10H4a1 1 0 0 0-1 1zM17 9a4 4 0 0 1 0 6M8 14l1 5h2.5l-1-4.3" />
    </svg>
  );
}

export function SparkIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" />
    </svg>
  );
}

export function KeyboardIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <path d="M6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01M8 14h8" />
    </svg>
  );
}

export function CommandIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M9 6v12M15 6v12M6 9h12M6 15h12" />
      <path d="M9 9H6.5A2.5 2.5 0 1 1 9 6.5zM15 9h2.5A2.5 2.5 0 1 0 15 6.5zM9 15H6.5A2.5 2.5 0 1 0 9 17.5zM15 15h2.5a2.5 2.5 0 1 1-2.5 2.5z" />
    </svg>
  );
}
