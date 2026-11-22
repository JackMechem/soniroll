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

  return (
    <div className="flex flex-col gap-6">
      <div className="-mb-3 flex items-center justify-end gap-2">
        {arranging && <span className="mr-auto text-xs text-muted">Move sections with ↑ ↓, hide the ones you don&apos;t need. Kept for this page.</span>}
        <button
          type="button"
          onClick={() => setArranging((a) => !a)}
          aria-pressed={arranging}
          className={`flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors ${arranging ? "bg-accent text-accent-foreground hover:bg-accent-hover" : "text-muted hover:bg-surface-hover hover:text-foreground"}`}
        >
          <SlidersIcon className="h-3.5 w-3.5" /> {arranging ? "Done" : "Arrange"}
        </button>
      </div>
      {shown.map((id, i) => {
        const s = byId.get(id)!;
        const isHidden = hidden.has(id);
        return (
          <section key={id} className={`flex flex-col gap-2 ${arranging ? "rounded-lg bg-foreground/[0.03] p-3" : ""}`}>
            <div className="flex min-h-8 items-center gap-2">
              <h2 className={`text-sm font-medium ${isHidden ? "text-muted line-through" : ""}`}>{s.title}</h2>
              {!arranging && s.action && <div className="ml-auto flex items-center gap-2">{s.action}</div>}
              {arranging && (
                <div className="ml-auto flex items-center gap-0.5">
                  <button type="button" onClick={() => move(id, -1)} disabled={i === 0} aria-label={`Move ${s.title} up`} className={small}>
                    ↑
                  </button>
                  <button type="button" onClick={() => move(id, 1)} disabled={i === shown.length - 1} aria-label={`Move ${s.title} down`} className={small}>
                    ↓
                  </button>
                  <button type="button" onClick={() => toggle(id)} aria-label={isHidden ? `Show ${s.title}` : `Hide ${s.title}`} title={isHidden ? "Show" : "Hide"} className={small}>
                    {isHidden ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                  </button>
                </div>
              )}
            </div>
            {!arranging && s.content}
          </section>
        );
      })}
    </div>
  );
}
