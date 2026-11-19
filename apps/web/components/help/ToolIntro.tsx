"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { TopicIcon } from "@/components/help/helpParts";
import { CloseIcon, HelpIcon } from "@/components/tools";
import { TOUCH_HIT_ROUND } from "@/components/SettingsBar";
import type { HelpTopic } from "@/lib/helpContent";

/**
 * A page's quick intro: what it's for and its steps, with a link to the full guide on the Help
 * page. Opens only from the ? next to the page title (`IntroButton`). It used to open by itself on
 * a page's first visit, with a screenshot; Jack found that outdated and annoying (FB-23), so it
 * doesn't any more (the old "seen" list in localStorage, `jam-practice-intros-seen`, is unused).
 */

/** Whether a page's intro is showing: after pressing its ? button. */
export function useIntro(topic: HelpTopic | undefined) {
  const [asked, setAsked] = useState(false);
  return {
    open: !!topic && asked,
    show: () => setAsked(true),
    close: () => setAsked(false),
  };
}

export function IntroButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`${TOUCH_HIT_ROUND} flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface-hover hover:text-foreground`}
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
        <ol className="divide-y divide-foreground/10 rounded-lg bg-foreground/[0.05]">
          {topic.steps.map((s, i) => (
            // A touch-screen-only step is the topic's last, so leaving it out with a mouse keeps the numbering.
            <li key={s.title} className={`gap-3 px-3 py-2.5 ${s.touch ? "hidden [@media(pointer:coarse)]:flex" : "flex"}`}>
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
