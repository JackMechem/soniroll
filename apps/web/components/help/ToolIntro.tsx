"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Shot, TopicIcon } from "@/components/help/helpParts";
import { CloseIcon, HelpIcon } from "@/components/tools";
import type { HelpTopic } from "@/lib/helpContent";
import { useSiteSettings } from "@/lib/siteSettings";

/**
 * A page's quick intro: the help topic's screenshot, what it's for and its steps, with a link to
 * the full guide on the Help page. Opens by itself the first time a page is visited on this device
 * (remembered per topic in localStorage) and from the ? next to the page title (`IntroButton`).
 */

const SEEN_KEY = "jam-practice-intros-seen";
const listeners = new Set<() => void>();
let cache: string | null = null;

function readSeen(): string {
  if (cache === null) {
    try {
      cache = window.localStorage.getItem(SEEN_KEY) ?? "";
    } catch {
      cache = "*"; // storage unavailable: never pop up by itself
    }
  }
  return cache;
}

function hasSeen(raw: string, id: string) {
  return raw === "*" || raw.split(",").includes(id);
}

function markSeen(id: string) {
  const raw = readSeen();
  if (hasSeen(raw, id)) return;
  cache = raw ? `${raw},${id}` : id;
  try {
    window.localStorage.setItem(SEEN_KEY, cache);
  } catch {
    // storage unavailable
  }
  listeners.forEach((l) => l());
}

/** Forget which intros were seen, so each page's opens again the next time (Settings → Tools). */
export function resetIntros() {
  cache = "";
  try {
    window.localStorage.removeItem(SEEN_KEY);
  } catch {
    // storage unavailable
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Whether a page's intro is showing: on the first visit, or after pressing its ? button. */
export function useIntro(topic: HelpTopic | undefined) {
  const raw = useSyncExternalStore(subscribe, readSeen, () => "*");
  const [asked, setAsked] = useState(false);
  // Settings → Tools can turn off opening it by itself the first time.
  const [{ toolIntros }] = useSiteSettings();
  const open = !!topic && (asked || (toolIntros && !hasSeen(raw, topic.id)));
  return {
    open,
    show: () => setAsked(true),
    close: () => {
      if (topic) markSeen(topic.id);
      setAsked(false);
    },
  };
}

export function IntroButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface-hover hover:text-foreground"
    >
      <HelpIcon className="h-4 w-4" />
    </button>
  );
}

export default function ToolIntro({ topic, onClose }: { topic: HelpTopic; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-label={`How ${topic.title} works`}
        className="log-toast flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-xl ring-1 ring-foreground/[0.06] bg-surface p-5 text-left shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className="mt-0.5"><TopicIcon topic={topic} /></div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold tracking-tight">{topic.title}</h2>
            <p className="text-sm text-muted">{topic.tagline}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="-mr-1 -mt-1 flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface-hover hover:text-foreground">
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
        {topic.shot && <Shot name={topic.shot} alt={`${topic.title} screenshot`} />}
        <ol className="divide-y divide-foreground/10 rounded-lg bg-foreground/[0.05]">
          {topic.steps.map((s, i) => (
            <li key={s.title} className="flex gap-3 px-3 py-2.5">
              <span className="w-4 shrink-0 pt-px text-right text-sm tabular-nums text-muted">{i + 1}</span>
              <div className="min-w-0">
                <div className="text-sm font-medium">{s.title}</div>
                <div className="text-xs text-muted">{s.text}</div>
              </div>
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Link
            href={`/help?topic=${topic.id}`}
            onClick={onClose}
            className="flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-muted hover:bg-surface-hover hover:text-foreground"
          >
            <HelpIcon className="h-4 w-4" /> Full guide{topic.options?.length ? " and every option" : ""}
          </Link>
          <button type="button" onClick={onClose} className="h-9 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground hover:bg-accent-hover">
            Got it
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
