"use client";

import { useEffect, useRef, useState } from "react";
import ContextMenu, { type MenuState } from "@/components/ContextMenu";
import Flyout, { FlyoutItem } from "@/components/Flyout";
import NowPracticingPill from "@/components/practicelog/NowPracticing";
import { CloseIcon, DotsVerticalIcon, PencilIcon, PlusIcon } from "@/components/tools";
import {
  MAX_TABS,
  closeOtherTabs,
  closeTab,
  duplicateTab,
  moveTab,
  newTab,
  renameTab,
  switchTab,
  useTabs,
  type TabView,
} from "@/lib/useTabs";
import { DuplicateIcon, NewTabIcon, TabLabel, tabName, tabShortcut, useTabName } from "./tabParts";

const DRAG_TYPE = "application/x-soniroll-tab";

/**
 * The tab strip over the page on desktop widths (`lib/useTabs.ts`), always shown (Jack: "so there
 * is always a tab you are working in") — with one tab it's the page you're on, without a × (nothing
 * is saved until there are two; renaming waits until then too). Click a tab to show it, double-click (or ⋮ / right-click) to rename,
 * drag to reorder, × or a middle click to close; + (or a double-click on the empty strip) for a
 * new tab, which opens the dashboard. The active tab is the page's own colour, joined to it.
 */
export default function TabStrip() {
  const { tabs, activeId } = useTabs();
  const [editing, setEditing] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [drag, setDrag] = useState<{ id: string; drop: number | null } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // With more tabs than fit, the strip scrolls: keep the one on screen in view.
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeId, tabs.length]);
  const single = tabs.length < 2;
  const full = tabs.length >= MAX_TABS;
  const active = tabs.find((t) => t.id === activeId) ?? tabs[0];

  const menuItems = (tab: TabView) =>
    single
      ? [
          { label: "New tab", icon: <NewTabIcon className="h-4 w-4" />, onSelect: () => newTab() },
          { label: "Duplicate", icon: <DuplicateIcon className="h-4 w-4" />, onSelect: () => duplicateTab(tab.id) },
        ]
      : [
          { label: "Rename", icon: <PencilIcon className="h-4 w-4" />, onSelect: () => setEditing(tab.id) },
          ...(full ? [] : [{ label: "Duplicate", icon: <DuplicateIcon className="h-4 w-4" />, onSelect: () => duplicateTab(tab.id) }]),
          { label: "Close other tabs", onSelect: () => closeOtherTabs(tab.id), divider: true },
          { label: "Close tab", icon: <CloseIcon className="h-4 w-4" />, onSelect: () => closeTab(tab.id) },
        ];

  function drop() {
    if (!drag || drag.drop === null) return setDrag(null);
    const from = tabs.findIndex((t) => t.id === drag.id);
    moveTab(drag.id, drag.drop > from ? drag.drop - 1 : drag.drop);
    setDrag(null);
  }

  return (
    <div
      className="hidden h-11 shrink-0 items-end gap-1 bg-surface pl-[calc(0.5rem+var(--sidebar-toggle-room,0px))] pr-2 pt-1.5 lg:flex"
    >
      <div ref={listRef} role="tablist" aria-label="Tabs" className="flex min-w-0 items-end gap-1 overflow-x-auto [scrollbar-width:none]">
        {tabs.map((tab, i) => {
          const on = tab.id === activeId;
          const shortcut = tabShortcut(i, tabs.length);
          return (
            <div
              key={tab.id}
              className={`group relative flex w-52 min-w-[7.5rem] items-center rounded-t-xl transition-colors ${
                on ? "h-[2.375rem] bg-background text-foreground" : "mb-1 h-8 rounded-b-xl text-muted hover:bg-surface-hover hover:text-foreground"
              } ${drag?.id === tab.id ? "opacity-50" : ""}`}
              onDragOver={(e) => {
                if (!drag) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                const r = e.currentTarget.getBoundingClientRect();
                const at = e.clientX < r.left + r.width / 2 ? i : i + 1;
                if (drag.drop !== at) setDrag({ ...drag, drop: at });
              }}
              onDrop={(e) => {
                e.preventDefault();
                drop();
              }}
            >
              {drag && drag.drop === i && <span aria-hidden className="absolute -left-[3px] top-1.5 bottom-1.5 w-0.5 rounded-full bg-accent" />}
              {drag && drag.drop === tabs.length && i === tabs.length - 1 && (
                <span aria-hidden className="absolute -right-[3px] top-1.5 bottom-1.5 w-0.5 rounded-full bg-accent" />
              )}
              {editing === tab.id ? (
                <RenameField tab={tab} onDone={() => setEditing(null)} />
              ) : (
                <button
                  type="button"
                  role="tab"
                  aria-selected={on}
                  draggable={!single}
                  title={shortcut ? `(${shortcut})` : undefined}
                  onClick={() => switchTab(tab.id)}
                  onDoubleClick={() => !single && setEditing(tab.id)}
                  onAuxClick={(e) => {
                    if (e.button !== 1) return;
                    e.preventDefault();
                    closeTab(tab.id);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setMenu({ x: e.clientX, y: e.clientY, items: menuItems(tab) });
                  }}
                  onDragStart={(e) => {
                    e.dataTransfer.setData(DRAG_TYPE, tab.id);
                    e.dataTransfer.effectAllowed = "move";
                    setDrag({ id: tab.id, drop: null });
                  }}
                  onDragEnd={() => setDrag(null)}
                  className={`flex h-full min-w-0 flex-1 items-center gap-2 rounded-[inherit] pl-3 ${single ? "pr-3" : "pr-8"} text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${on ? "font-medium" : ""}`}
                >
                  <TabLabel tab={tab} active={on} hint={shortcut ? ` (${shortcut})` : ""} />
                </button>
              )}
              {editing !== tab.id && !single && (
                <button
                  type="button"
                  onClick={() => closeTab(tab.id)}
                  aria-label={`Close ${tabName(tab)}`}
                  title="Close tab"
                  className={`absolute right-1.5 flex h-6 w-6 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-hover hover:text-foreground focus-visible:opacity-100 ${
                    on ? "" : "opacity-0 group-hover:opacity-100"
                  }`}
                >
                  <CloseIcon className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => newTab()}
        disabled={full}
        aria-label="New tab"
        title={full ? `Up to ${MAX_TABS} tabs` : "New tab"}
        className="mb-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-muted transition-colors hover:bg-surface-hover hover:text-foreground disabled:opacity-40"
      >
        <PlusIcon className="h-4 w-4" />
      </button>
      {/* The empty rest of the strip: double-click for a new tab, as in a browser. */}
      <div className="h-full flex-1" onDoubleClick={() => !full && newTab()} />
      {/* What you're practicing (or next today), in the one row that's always there: opens its
          task over the page. */}
      <div className="mb-1 flex min-w-0 shrink items-center">
        <NowPracticingPill />
      </div>
      <Flyout
        icon={DotsVerticalIcon}
        label="Tab options"
        align="end"
        buttonClassName="mb-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
      >
        {(close) => {
          const run = (fn: () => void) => () => {
            close();
            fn();
          };
          return (
            <>
              {!full && <FlyoutItem icon={NewTabIcon} label="New tab" onSelect={run(() => newTab())} />}
              {!single && <FlyoutItem icon={PencilIcon} label="Rename this tab" onSelect={run(() => setEditing(active.id))} />}
              {!full && <FlyoutItem icon={DuplicateIcon} label="Duplicate this tab" onSelect={run(() => duplicateTab(active.id))} />}
              {!single && <FlyoutItem icon={CloseIcon} label="Close other tabs" onSelect={run(() => closeOtherTabs(active.id))} />}
              {!single && <FlyoutItem icon={CloseIcon} label="Close this tab" onSelect={run(() => closeTab(active.id))} />}
            </>
          );
        }}
      </Flyout>
      {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
    </div>
  );
}

/** Renaming a tab in place: Enter or clicking away keeps it, Escape doesn't. Empty goes back to
    its page's name. */
function RenameField({ tab, onDone }: { tab: TabView; onDone: () => void }) {
  const pageName = useTabName({ ...tab, name: null });
  const [value, setValue] = useState(tab.name ?? pageName);
  const finished = useRef(false);
  const finish = (keep: boolean) => {
    if (finished.current) return;
    finished.current = true;
    if (keep) renameTab(tab.id, value === pageName || value === tabName({ ...tab, name: null }) ? "" : value);
    onDone();
  };
  return (
    <input
      autoFocus
      value={value}
      maxLength={60}
      aria-label="Tab name"
      onChange={(e) => setValue(e.target.value)}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter") finish(true);
        else if (e.key === "Escape") finish(false);
        else return;
        e.preventDefault();
      }}
      className="mx-1.5 h-7 min-w-0 flex-1 rounded-md bg-foreground/[0.06] px-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-accent"
    />
  );
}
