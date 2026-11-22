"use client";

import { useState } from "react";
import { EyeIcon, EyeOffIcon, SlidersIcon } from "@/components/tools";
import { useSyncedSettings } from "@/lib/useSyncedSettings";

/** Each routine's and task's page layout: the order of its sections and the ones hidden, by page
    (`routine:<id>`, `routine:<id>/task:<id>`, `day:<date>/task:<id>`). Synced with the account. */
const LAYOUTS_KEY = "jam-practice-shed-pages";
type PageLayout = { order: string[]; hidden: string[] };
// One key holding them all: a synced setting only hands back the keys its defaults have.
const NO_LAYOUTS: { pages: Record<string, PageLayout> } = { pages: {} };

export type PageSection = {
  id: string;
  title: string;
  /** A count after the title (recordings, days). */
  count?: number;
  /** Beside the title (a section's own buttons). */
  action?: React.ReactNode;
  content: React.ReactNode;
  /** Hidden until you show it. */
  hiddenByDefault?: boolean;
};

/**
 * A routine's or task's page as a dashboard you arrange: its sections in your order, the ones you
 * don't want hidden. "Arrange" switches to moving them (↑ ↓) and showing or hiding them; that's
 * kept for this page.
 */
export default function PageSections({ pageKey, sections }: { pageKey: string; sections: PageSection[] }) {
  const [layouts, setLayouts] = useSyncedSettings(LAYOUTS_KEY, NO_LAYOUTS);
  const [arranging, setArranging] = useState(false);
  const saved = layouts.pages?.[pageKey];
  const byId = new Map(sections.map((s) => [s.id, s]));
  // Saved order first, then any section the page has gained since.
  const order = [...(saved?.order ?? []).filter((id) => byId.has(id)), ...sections.map((s) => s.id).filter((id) => !saved?.order.includes(id))];
  const hidden = new Set(saved?.hidden ?? sections.filter((s) => s.hiddenByDefault).map((s) => s.id));

  const save = (next: PageLayout) => setLayouts({ pages: { ...layouts.pages, [pageKey]: next } });
  const move = (id: string, by: -1 | 1) => {
    const i = order.indexOf(id);
    const j = i + by;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    save({ order: next, hidden: [...hidden] });
  };
  const toggle = (id: string) => {
    const next = new Set(hidden);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    save({ order, hidden: [...next] });
  };

  const shown = arranging ? order : order.filter((id) => !hidden.has(id));
  const small = "flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-hover hover:text-foreground disabled:opacity-30";

  // Arranging: the sections as a list to reorder and show or hide, then Done.
  if (arranging) {
    return (
      <section className="flex flex-col gap-2">
        <div className="flex min-h-8 items-center gap-2">
          <h2 className="text-sm font-semibold">Arrange this page</h2>
          <button type="button" onClick={() => setArranging(false)} className="ml-auto flex h-8 items-center rounded-md bg-accent px-3 text-sm font-medium text-accent-foreground hover:bg-accent-hover">
            Done
          </button>
        </div>
        <p className="text-xs text-muted">Move sections up or down and hide the ones you don&apos;t need. Kept for this page.</p>
        <ul className="flex flex-col divide-y divide-foreground/[0.06] overflow-hidden rounded-xl bg-foreground/[0.04]">
          {order.map((id, i) => {
            const sec = byId.get(id)!;
            const isHidden = hidden.has(id);
            return (
              <li key={id} className="flex min-h-12 items-center gap-2 px-4">
                <span className={`min-w-0 flex-1 truncate text-sm font-medium ${isHidden ? "text-muted line-through" : ""}`}>{sec.title}</span>
                <button type="button" onClick={() => move(id, -1)} disabled={i === 0} aria-label={`Move ${sec.title} up`} className={small}>
                  ↑
                </button>
                <button type="button" onClick={() => move(id, 1)} disabled={i === order.length - 1} aria-label={`Move ${sec.title} down`} className={small}>
                  ↓
                </button>
                <button type="button" onClick={() => toggle(id)} aria-label={isHidden ? `Show ${sec.title}` : `Hide ${sec.title}`} title={isHidden ? "Show" : "Hide"} className={small}>
                  {isHidden ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-7">
      {shown.map((id) => {
        const sec = byId.get(id)!;
        return (
          <section key={id} className="flex flex-col gap-2.5">
            <div className="flex min-h-8 items-center gap-2">
              <h2 className="text-sm font-semibold">
                {sec.title}
                {sec.count !== undefined && sec.count > 0 && <span className="ml-1.5 font-normal tabular-nums text-muted">{sec.count}</span>}
              </h2>
              {sec.action && <div className="ml-auto flex items-center gap-1">{sec.action}</div>}
            </div>
            {sec.content}
          </section>
        );
      })}
      <button type="button" onClick={() => setArranging(true)} className="flex h-8 items-center gap-1.5 self-center rounded-md px-3 text-xs font-medium text-muted transition-colors hover:bg-surface-hover hover:text-foreground">
        <SlidersIcon className="h-3.5 w-3.5" /> Arrange this page
      </button>
    </div>
  );
}
