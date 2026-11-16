"use client";

import Image from "next/image";
import { createElement } from "react";
import { BookmarkIcon, CalendarIcon, DocumentIcon, FileIcon, GraduationCapIcon, HelpIcon, HomeIcon, MaximizeIcon, MicIcon, NAV_LINKS, SetlistIcon, UserIcon } from "@/components/tools";
import { HELP_TOPICS, type HelpTopic } from "@/lib/helpContent";

/** Pieces shared by the Help page and the first-visit intros (`ToolIntro`). */

type IconType = (props: { className?: string }) => React.JSX.Element;

const EXTRA_ICONS: Record<string, IconType> = {
  dashboard: HomeIcon,
  "shed-log": CalendarIcon,
  "shed-notes": DocumentIcon,
  "split-screen": MaximizeIcon,
  presets: BookmarkIcon,
  account: UserIcon,
  tunes: SetlistIcon,
  recordings: MicIcon,
  files: FileIcon,
  lessons: GraduationCapIcon,
};

export const ICON_BY_ID: Record<string, IconType> = Object.fromEntries(
  HELP_TOPICS.map((t) => [t.id, EXTRA_ICONS[t.id] ?? NAV_LINKS.find((l) => l.href === t.href)?.icon ?? HelpIcon]),
);

/** Screenshot folder — bump when retaking them (Next caches optimized images by URL). */
const SHOTS = "v3";

export function Shot({ name, alt }: { name: string; alt: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-surface-hover bg-background shadow-lg">
      <div className="flex items-center gap-1.5 border-b border-surface-hover bg-surface px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
      </div>
      <Image src={`/help/${SHOTS}/${name}-light.jpg`} alt={alt} width={1280} height={800} className="block h-auto w-full dark:hidden" />
      <Image src={`/help/${SHOTS}/${name}-dark.jpg`} alt={alt} width={1280} height={800} className="hidden h-auto w-full dark:block" />
    </div>
  );
}

export function TopicIcon({ topic, size = "md" }: { topic: HelpTopic; size?: "sm" | "md" | "lg" }) {
  const box = size === "lg" ? "h-14 w-14 rounded-2xl" : size === "md" ? "h-9 w-9 rounded-xl" : "h-7 w-7 rounded-lg";
  const icon = size === "lg" ? "h-7 w-7" : size === "md" ? "h-5 w-5" : "h-4 w-4";
  return (
    <span className={`flex shrink-0 items-center justify-center bg-accent/15 text-accent ${box}`}>
      {createElement(ICON_BY_ID[topic.id] ?? HelpIcon, { className: icon })}
    </span>
  );
}

