"use client";

import { UNDER_TUNES } from "@/components/library/hrefs";
import { useRef, useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import { Hero, LibraryPage, Pill } from "@/components/library/ui";
import SwitchRow from "@/components/SwitchRow";
import { DownloadIcon, LibraryIcon, TrashIcon } from "@/components/tools";
import { decodeChartString, looksLikeChartString } from "@/lib/chartString";
import { parseIrealPlaylist } from "@/lib/iRealPro";
import { useChordChartsLibrary } from "@/lib/useChordChartsLibrary";

/** A soniroll chart link first, quietly falling back to an iReal Pro playlist link — never naming
    iReal Pro anywhere a user can see. */
function parsePlaylistInput(text: string) {
  if (looksLikeChartString(text)) return decodeChartString(text);
  try {
    return parseIrealPlaylist(text);
  } catch {
    throw new Error("Couldn't read that — paste a soniroll chord chart link.");
  }
}

/** Importing chord charts: paste a chart link or playlist link (or pick a file it's saved in). */
export default function ImportChartsPage() {
  const { importSongs, clearAll, totalSongs } = useChordChartsLibrary(null);
  const [text, setText] = useState("");
  const [replaceExisting, setReplaceExisting] = useState(true);
  // Every imported chart's tune gets a tag: what's typed, or the playlist's name.
  const [tagTunes, setTagTunes] = useState(true);
  const [tag, setTag] = useState("");
  const [importing, setImporting] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "error"; message: string } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function run(input: string) {
    let playlist;
    try {
      playlist = parsePlaylistInput(input);
    } catch (e) {
      setStatus({ kind: "error", message: e instanceof Error ? e.message : "Couldn't read that." });
      return;
    }
    setImporting(true);
    setStatus(null);
    try {
      const tagName = tagTunes ? (tag.trim() || playlist.name || "").trim() : "";
      const { added, skipped, updated, linked } = await importSongs(playlist.songs, playlist.name, { replaceExisting, tags: tagName ? [tagName] : [] });
      const plural = (n: number, what = "chart") => `${n} ${what}${n === 1 ? "" : "s"}`;
      setStatus({
        kind: "ok",
        message:
          `Imported ${plural(added)} into "${playlist.name}".` +
          (updated ? ` Updated ${plural(updated)} you already had.` : "") +
          (skipped > 0 ? ` (${skipped} already in your library, left as they were.)` : "") +
          (linked && linked.linked ? ` ${plural(linked.linked)} joined tunes you have.` : "") +
          (linked && linked.created ? ` ${plural(linked.created, "new tune")} ${linked.created === 1 ? "is" : "are"} in your Library list.` : "") +
          (linked && tagName ? ` Tagged “${tagName}”.` : ""),
      });
      setText("");
      if (fileRef.current) fileRef.current.value = "";
    } catch (e) {
      setStatus({ kind: "error", message: e instanceof Error ? e.message : "Couldn't import that link." });
    } finally {
      setImporting(false);
    }
  }

  return (
    <LibraryPage>
      <Hero
        title="Import charts"
        icon={LibraryIcon}
        crumbs={UNDER_TUNES}
        subtitle={`Add charts to your library — you have ${totalSongs} now.`}
      />
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <section className="flex flex-col gap-4 rounded-lg bg-surface p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-foreground/[0.05] text-xs font-medium text-muted">1</span>
            <h2 className="text-sm font-medium">Paste a chart link or a playlist link from iReal Pro</h2>
          </div>
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste a chord chart link or an iReal Pro playlist link"
            rows={6}
            className="w-full resize-y rounded-md bg-background p-3 font-mono text-xs outline-none focus:ring-2 focus:ring-accent/40"
          />
          <button type="button" onClick={() => fileRef.current?.click()} className="flex items-center gap-2 self-start text-sm font-medium text-accent hover:underline">
            …or choose a file it&apos;s saved in
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".txt,.html,text/plain,text/html"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = () => typeof reader.result === "string" && void run(reader.result);
              reader.onerror = () => setStatus({ kind: "error", message: "Couldn't read that file." });
              reader.readAsText(file);
            }}
          />
          <div className="flex items-center gap-3 border-t border-foreground/10 pt-4">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-foreground/[0.05] text-xs font-medium text-muted">2</span>
            <h2 className="text-sm font-medium">Choose how</h2>
          </div>
          <div className="flex max-w-lg flex-col gap-3 rounded-lg bg-foreground/[0.05] p-3">
            <SwitchRow
              label="Update charts you already have"
              checked={replaceExisting}
              onChange={setReplaceExisting}
              hint="When a chart in the link is already in your library (same title, composer and key), replace yours with the one from the link — it stays in the same folder. Turn this off to only add charts you don't have yet."
            />
            <div className="flex flex-col gap-2">
              <SwitchRow
                label="Tag the tunes"
                checked={tagTunes}
                onChange={setTagTunes}
                hint="Each chart joins the tune with its name (or a new tune in your Library list). This gives all those tunes a tag, so you can find them together. Leave the box empty to use the playlist's name."
              />
              {tagTunes && (
                <input
                  value={tag}
                  onChange={(e) => setTag(e.target.value)}
                  placeholder="Tag (the playlist's name)"
                  aria-label="Tag for the imported tunes"
                  className="h-10 w-full rounded-md bg-surface px-3 text-base outline-none placeholder:text-muted focus:ring-2 focus:ring-accent/40 sm:h-9 sm:text-sm"
                />
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => text.trim() && !importing && void run(text)}
              disabled={!text.trim() || importing}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-40"
            >
              <DownloadIcon className="h-4 w-4" />
              {importing ? "Importing…" : "Import"}
            </button>
          </div>
          {status && (
            <div className={`flex flex-col gap-2 rounded-md p-3 ${status.kind === "error" ? "bg-danger/10" : "bg-accent/10"}`}>
              <p className={`text-sm ${status.kind === "error" ? "text-danger" : ""}`}>{status.message}</p>
              {status.kind === "ok" && (
                <div className="flex flex-wrap gap-2">
                  <Pill label="See your tunes" href="/tunes" />
                </div>
              )}
            </div>
          )}
        </section>

        <aside className="flex flex-col gap-4">
          <section className="flex flex-col gap-2 rounded-lg bg-surface p-4 text-sm">
            <h2 className="text-sm font-medium">What happens</h2>
            <p className="text-muted">An iReal Pro playlist comes in as a folder of the same name. Charts you already have are updated or left alone, never doubled up.</p>
            <p className="text-muted">Every chart joins the tune with the same name. A chart with no tune yet gets a new one in your Library list; move it to Tunes I Know or Tunes to Learn whenever you like.</p>
            <p className="text-muted">The chart builder can turn a chart you make into a link to share.</p>
          </section>
          <section className="flex flex-col gap-2 rounded-lg bg-surface p-4 text-sm">
            <h2 className="text-sm font-medium text-danger">Start over</h2>
            <p className="text-muted">Remove every chart and folder in your library.</p>
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              disabled={totalSongs === 0}
              className="flex items-center gap-1.5 self-start rounded-md bg-danger/10 px-3 py-2 text-sm font-medium text-danger hover:bg-danger/20 disabled:opacity-40"
            >
              <TrashIcon className="h-4 w-4" /> Delete all chord charts
            </button>
          </section>
        </aside>
      </div>
      {confirmClear && (
        <ConfirmDialog
          title="Delete all chord charts?"
          message="This removes every imported or created chart and every folder. You can import them again any time."
          confirmLabel="Delete all"
          onConfirm={() => {
            void clearAll();
            setConfirmClear(false);
          }}
          onCancel={() => setConfirmClear(false)}
        />
      )}
    </LibraryPage>
  );
}
