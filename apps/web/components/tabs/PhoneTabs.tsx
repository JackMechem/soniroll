"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Flyout, { FlyoutItem } from "@/components/Flyout";
import PromptDialog from "@/components/PromptDialog";
import { CloseIcon, DotsVerticalIcon, PencilIcon } from "@/components/tools";
import { MAX_TABS, closeTab, duplicateTab, newTab, renameTab, switchTab, useTabs, type TabView } from "@/lib/useTabs";
import { DuplicateIcon, NewTabIcon, TabLabel, PageNameText, tabName } from "./tabParts";

const OPEN_EVENT = "open-tabs-sheet";

/** Opens the phone's list of tabs (the phone menu's ⋮ has "Tabs"). */
export function openTabsSheet() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

/**
 * Tabs on a phone: no strip, just a count in the top bar once there are two or more (tap it for
 * the list), and the list itself — tap a tab to show it, ⋮ to rename or duplicate it, × to close
 * it, and New tab. A phone shows one page of a tab at a time (no split screen there): its main
 * page, with the others under it ("Also in this tab") to show instead.
 */
export default function PhoneTabsButton() {
  const { tabs } = useTabs();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);
  return (
    <>
      {tabs.length > 1 && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Tabs (${tabs.length} open)`}
          title="Tabs"
          className="flex h-10 w-10 items-center justify-center rounded-md text-foreground hover:bg-surface-hover"
        >
          <span className="flex h-[1.375rem] min-w-[1.375rem] items-center justify-center rounded-md px-1 text-xs font-semibold tabular-nums ring-[1.5px] ring-current">
            {tabs.length}
          </span>
        </button>
      )}
      {open && <TabsSheet onClose={() => setOpen(false)} />}
    </>
  );
}

/** A tab's other pages (beside its main one on a desktop): a phone shows one page at a time, so
    each is a button that shows that page of the tab. */
function OtherPages({ tab, onPick }: { tab: TabView; onPick: () => void }) {
  return (
    <div className="-mt-1 flex flex-wrap items-center gap-1.5 px-4 pb-2.5 pl-12 text-xs text-muted">
      <span>Also in this tab:</span>
      {tab.pageHrefs.slice(1).map((href, i) => (
        <button
          key={`${i}:${href}`}
          type="button"
          onClick={() => {
            onPick();
            switchTab(tab.id, href);
          }}
          className="h-7 max-w-full truncate rounded-full bg-foreground/[0.06] px-2.5 font-medium text-foreground hover:bg-surface-hover"
        >
          <PageNameText href={href} />
        </button>
      ))}
    </div>
  );
}

function TabsSheet({ onClose }: { onClose: () => void }) {
  const { tabs, activeId } = useTabs();
  const [renaming, setRenaming] = useState<TabView | null>(null);
  const full = tabs.length >= MAX_TABS;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !renaming) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, renaming]);

  return createPortal(
    <>
      <div className="fixed inset-0 z-[60] bg-overlay" aria-hidden onClick={onClose} />
      <div
        role="dialog"
        aria-label="Tabs"
        className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-[60] flex max-h-[80dvh] flex-col overflow-hidden rounded-3xl bg-surface text-foreground shadow-[0_24px_60px_-16px_rgba(0,0,0,0.45)] ring-1 ring-foreground/[0.06] lg:inset-x-auto lg:right-4 lg:w-96"
      >
        <div className="flex shrink-0 items-center gap-2 px-5 pb-2 pt-4 pr-3">
          <h2 className="min-w-0 flex-1 truncate text-base font-semibold">Tabs</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            title="Close"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted hover:bg-background hover:text-foreground"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
        <ul className="flex min-h-0 flex-col gap-1 overflow-y-auto overscroll-contain px-3 pb-2">
          {tabs.map((tab) => {
            const on = tab.id === activeId;
            return (
              <li key={tab.id} className={`flex flex-col rounded-2xl ${on ? "bg-accent/15" : "bg-foreground/[0.04]"}`}>
                <div className="flex items-center gap-1 pr-1">
                  <button
                    type="button"
                    aria-current={on ? "page" : undefined}
                    onClick={() => {
                      onClose();
                      switchTab(tab.id);
                    }}
                    className={`flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-2xl px-4 text-left text-sm ${on ? "font-semibold" : "font-medium"}`}
                  >
                    <TabLabel tab={tab} active={on} iconClassName="h-5 w-5" mark={false} />
                  </button>
                  {tabs.length > 1 && (
                    <>
                      <Flyout
                        icon={DotsVerticalIcon}
                        label={`Options for ${tabName(tab)}`}
                        align="end"
                        buttonClassName="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-hover hover:text-foreground"
                      >
                        {(close) => (
                          <>
                            <FlyoutItem
                              icon={PencilIcon}
                              label="Rename"
                              onSelect={() => {
                                close();
                                setRenaming(tab);
                              }}
                            />
                            {!full && (
                              <FlyoutItem
                                icon={DuplicateIcon}
                                label="Duplicate"
                                onSelect={() => {
                                  close();
                                  duplicateTab(tab.id);
                                }}
                              />
                            )}
                          </>
                        )}
                      </Flyout>
                      <button
                        type="button"
                        onClick={() => closeTab(tab.id)}
                        aria-label={`Close ${tabName(tab)}`}
                        title="Close tab"
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-hover hover:text-foreground"
                      >
                        <CloseIcon className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>
                {tab.panes > 1 && <OtherPages tab={tab} onPick={onClose} />}
              </li>
            );
          })}
        </ul>
        <div className="shrink-0 px-3 pb-4 pt-2">
          <button
            type="button"
            disabled={full}
            onClick={() => {
              onClose();
              newTab();
            }}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-accent text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            <NewTabIcon className="h-5 w-5" />
            {full ? `Up to ${MAX_TABS} tabs` : "New tab"}
          </button>
        </div>
      </div>
      {renaming && (
        <PromptDialog
          title="Rename tab"
          initialValue={renaming.name ?? tabName(renaming)}
          confirmLabel="Rename"
          allowEmpty
          onSubmit={(value) => {
            renameTab(renaming.id, value === tabName({ ...renaming, name: null }) ? "" : value);
            setRenaming(null);
          }}
          onCancel={() => setRenaming(null)}
        />
      )}
    </>,
    document.body,
  );
}
