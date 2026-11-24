"use client";

import { TOUCH_TEXT } from "@/components/practicelog/touch";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { tuneHref } from "@/components/library/useTuneActions";
import { setlistHref } from "@/components/library/setlistParts";
import { Segmented } from "@/components/metronome/MetronomeOptions";
import { ChordChartIcon, CheckIcon, CloseIcon, NoteIcon, PlusIcon, SearchIcon, SetlistIcon, NAV_LINKS, findToolLink } from "@/components/tools";
import { sortByText } from "@jam-practice/core/sortText";
import { type Attachment, attachmentKey, isFileAttachment } from "@/lib/practiceLog";
import { useConvexAuth } from "@convex-dev/auth/react";
import { FilesPickerTab, fileAttachmentHref, fileAttachmentIcon } from "@/components/practicelog/FileAttachments";
import { useTuneIndex } from "@/lib/recordings";
import { useChordChartsLibrary } from "@/lib/useChordChartsLibrary";
import { useSetlists } from "@/lib/useSetlists";
import { TUNE_LIST_LABEL } from "@jam-practice/core/tuneLibrary";

type IconType = (props: { className?: string }) => React.JSX.Element;

/** Tools you can attach (everything in the sidebar but the library pages and Community). */
const TOOL_LINKS = NAV_LINKS.filter((l) => !["/community", "/tunes", "/chord-charts", "/shed-log"].includes(l.href));

/** What an attachment links to, its current name (falling back to the name saved with it, when
    the thing itself has been deleted), and its icon. */
export function useAttachmentResolver() {
  const tunes = useTuneIndex();
  const { setlists } = useSetlists();
  const { allSongs } = useChordChartsLibrary(null);
  return useMemo(() => {
    const setlistById = new Map(setlists.map((s) => [s.id, s]));
    const chartById = new Map(allSongs.map((s) => [s.id, s]));
    return (a: Attachment): { href: string | null; label: string; icon: IconType; kindLabel: string } => {
      switch (a.kind) {
        case "tune": {
          const t = tunes.get(a.id);
          return { href: t ? tuneHref(t.list, a.id) : null, label: t?.tune.name ?? a.label, icon: NoteIcon, kindLabel: "Tune" };
        }
        case "setlist": {
          const s = setlistById.get(a.id);
          return { href: s ? setlistHref(a.id) : null, label: s?.name ?? a.label, icon: SetlistIcon, kindLabel: "Setlist" };
        }
        case "chart": {
          const c = chartById.get(a.id);
          return { href: c ? `/chord-charts/view?id=${encodeURIComponent(a.id)}` : null, label: c?.title ?? a.label, icon: ChordChartIcon, kindLabel: "Chord chart" };
        }
        case "tool": {
          const tool = findToolLink(a.href);
          return { href: a.href, label: tool?.label ?? a.label, icon: tool?.icon ?? NoteIcon, kindLabel: "Tool" };
        }
        // Your files: opened beside the page (the chip's click), a folder or tag in Files.
        case "file":
        case "folder":
        case "fileTag":
          return { href: fileAttachmentHref(a), label: a.label, icon: fileAttachmentIcon(a), kindLabel: a.kind === "file" ? "File" : a.kind === "folder" ? "Folder" : "Tag" };
      }
    };
  }, [tunes, setlists, allSongs]);
}

/** Attachments as chips that open what they point at (a file opens in the side view); with
    `onChange`, each has a × and there's an "Attach" button. `noFiles`: files, folders and tags are
    left out here (the routine and task pages list them under Files) and kept as they are. */
export function AttachmentList({
  items: all,
  onChange: changeAll,
  compact = false,
  addLabel = "Attach",
  noFiles = false,
}: {
  items: Attachment[];
  onChange?: (items: Attachment[]) => void;
  compact?: boolean;
  addLabel?: string;
  noFiles?: boolean;
}) {
  const resolve = useAttachmentResolver();
  const [picking, setPicking] = useState(false);
  const items = noFiles ? all.filter((a) => !isFileAttachment(a)) : all;
  const onChange = changeAll && (noFiles ? (next: Attachment[]) => changeAll([...next, ...all.filter(isFileAttachment)]) : changeAll);
  if (!items.length && !onChange) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {items.map((a) => {
        const r = resolve(a);
        const Icon = r.icon;
        const chip = (
          <>
            <Icon className="h-3.5 w-3.5 shrink-0 text-muted" />
            <span className="truncate">{r.label}</span>
          </>
        );
        const cls = `flex max-w-[16rem] items-center gap-1.5 rounded-md bg-foreground/[0.05] ${compact ? "h-6 px-2 text-xs" : "h-7 px-2.5 text-sm"} font-medium`;
        return (
          <span key={attachmentKey(a)} className={`${cls} ${r.href ? "" : "text-muted line-through"}`} title={`${r.kindLabel}: ${r.label}${r.href ? "" : " (deleted)"}`}>
            {r.href ? (
              <Link
                href={r.href}
                className="flex min-w-0 items-center gap-1.5 hover:underline"
              >
                {chip}
              </Link>
            ) : (
              chip
            )}
            {onChange && (
              <button
                type="button"
                onClick={() => onChange(items.filter((x) => attachmentKey(x) !== attachmentKey(a)))}
                aria-label={`Remove ${r.label}`}
                className="-mr-1 rounded-sm p-0.5 text-muted hover:bg-surface-hover hover:text-foreground"
              >
                <CloseIcon className="h-3 w-3" />
              </button>
            )}
          </span>
        );
      })}
      {/* Filled like "Add notes" beside it (not a dashed outline). */}
      {onChange && (
        <button
          type="button"
          onClick={() => setPicking(true)}
          className={`flex items-center gap-1 rounded-md bg-foreground/[0.05] ${compact ? "h-6 px-2" : "h-8 px-2.5"} text-xs font-medium transition-colors hover:bg-surface-hover ${TOUCH_TEXT}`}
        >
          <PlusIcon className="h-3.5 w-3.5" /> {addLabel}
        </button>
      )}
      {picking && onChange && <AttachmentPicker selected={items} onChange={onChange} onClose={() => setPicking(false)} noFiles={noFiles} />}
    </div>
  );
}

type Tab = "tunes" | "setlists" | "charts" | "tools" | "files";

/** Pick tunes, setlists, chord charts, tools and (signed in) your files, folders and tags to attach
    — tap to add or remove, Done to close. `only: "files"`: just the Files tab ("Add files" on the
    routine and task pages); `noFiles`: no Files tab. */
export function AttachmentPicker({
  selected,
  onChange,
  onClose,
  only,
  noFiles = false,
}: {
  selected: Attachment[];
  onChange: (items: Attachment[]) => void;
  onClose: () => void;
  only?: "files";
  noFiles?: boolean;
}) {
  const tunes = useTuneIndex();
  const { setlists } = useSetlists();
  const { allSongs } = useChordChartsLibrary(null);
  const { isAuthenticated } = useConvexAuth();
  const [tab, setTab] = useState<Tab>(only ?? "tunes");
  const [query, setQuery] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const rows = useMemo((): { attachment: Attachment; title: string; detail: string }[] => {
    const q = query.trim().toLowerCase();
    const match = (text: string) => !q || q.split(/\s+/).every((w) => text.toLowerCase().includes(w));
    if (tab === "tunes") {
      const all = [...tunes.values()].filter((t) => match(t.tune.name));
      return sortByText(all, (t) => t.tune.name).map((t) => ({
        attachment: { kind: "tune", id: t.tune.id, list: t.list, label: t.tune.name },
        title: t.tune.name,
        detail: TUNE_LIST_LABEL[t.list],
      }));
    }
    if (tab === "setlists") {
      return sortByText(setlists.filter((s) => match(s.name)), (s) => s.name).map((s) => ({
        attachment: { kind: "setlist", id: s.id, label: s.name },
        title: s.name,
        detail: `${s.tuneIds.length} tune${s.tuneIds.length === 1 ? "" : "s"}`,
      }));
    }
    if (tab === "files") return [];
    if (tab === "charts") {
      const all = allSongs.filter((s) => match(`${s.title} ${s.composer}`));
      return sortByText(all, (s) => s.title)
        .slice(0, 200)
        .map((s) => ({ attachment: { kind: "chart", id: s.id, label: s.title }, title: s.title, detail: [s.composer, s.key].filter(Boolean).join(" · ") }));
    }
    return TOOL_LINKS.filter((l) => match(`${l.label} ${l.category}`)).map((l) => ({
      attachment: { kind: "tool", href: l.href, label: l.label },
      title: l.label,
      detail: l.category,
    }));
  }, [tab, query, tunes, setlists, allSongs]);

  const keys = new Set(selected.map(attachmentKey));
  function toggle(a: Attachment) {
    const k = attachmentKey(a);
    onChange(keys.has(k) ? selected.filter((x) => attachmentKey(x) !== k) : [...selected, a]);
  }

  const empty: Record<Tab, string> = {
    tunes: "No tunes yet — add some on the Tunes page.",
    setlists: "No setlists yet — make one on the Tunes page.",
    charts: "No chord charts yet — import or make some on the Chord Charts page.",
    tools: "No tools match.",
    files: "",
  };
  const pickRow = (r: { attachment: Attachment; title: string; detail: string; group?: string; icon?: IconType }, prevGroup: string | undefined) => {
    const on = keys.has(attachmentKey(r.attachment));
    const Icon = r.icon;
    return (
      <li key={attachmentKey(r.attachment)}>
        {r.group && r.group !== prevGroup && <p className="bg-foreground/[0.03] px-3 pb-1 pt-2.5 text-xs font-semibold text-muted">{r.group}</p>}
        <button type="button" onClick={() => toggle(r.attachment)} aria-pressed={on} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-hover">
          <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${on ? "border-accent bg-accent text-accent-foreground" : "border-foreground/25"}`}>
            {on && <CheckIcon className="h-3.5 w-3.5" />}
          </span>
          {Icon && <Icon className="h-4 w-4 shrink-0 text-muted" />}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{r.title}</span>
            {r.detail && <span className="block truncate text-xs text-muted">{r.detail}</span>}
          </span>
        </button>
      </li>
    );
  };
  const listOf = (list: { attachment: Attachment; title: string; detail: string; group?: string; icon?: IconType }[], emptyText: string) => (
    <ul className="min-h-0 flex-1 divide-y divide-foreground/10 overflow-y-auto rounded-md bg-foreground/[0.05]">
      {list.length === 0 ? <li className="px-3 py-6 text-center text-sm text-muted">{emptyText}</li> : list.map((r, i) => pickRow(r, list[i - 1]?.group))}
    </ul>
  );
  const tabs: { value: Tab; label: string }[] = [
    { value: "tunes", label: "Tunes" },
    { value: "setlists", label: "Setlists" },
    { value: "charts", label: "Charts" },
    { value: "tools", label: "Tools" },
    ...(isAuthenticated && !noFiles ? [{ value: "files" as Tab, label: "Files" }] : []),
  ];

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-overlay p-4 pt-[8vh]" onClick={onClose}>
      <div role="dialog" aria-label={only ? "Add files" : "Attach"} className="flex max-h-[80vh] w-full max-w-lg flex-col gap-3 rounded-xl ring-1 ring-foreground/[0.06] bg-surface p-5 text-left text-foreground shadow-2xl shadow-black/20" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold">{only ? "Add files" : "Attach"}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="-mr-1.5 flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface-hover hover:text-foreground">
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
        {!only && (
          <Segmented
            label="What to attach"
            value={tab}
            onChange={(t) => {
              setTab(t);
              setQuery("");
            }}
            options={tabs}
          />
        )}
        <div className="flex h-9 items-center gap-2 rounded-md bg-foreground/[0.05] px-3 focus-within:ring-2 focus-within:ring-accent/40">
          <SearchIcon className="h-4 w-4 shrink-0 text-muted" />
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" aria-label="Search" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
        </div>
        {tab === "files" ? (
          <FilesPickerTab query={query} selected={selected} onChange={onChange} renderRows={listOf} />
        ) : (
          listOf(rows, query ? "Nothing matches." : empty[tab])
        )}
        <div className="flex justify-end">
          <button type="button" onClick={onClose} className="h-9 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground hover:bg-accent-hover">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
