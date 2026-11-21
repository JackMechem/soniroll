"use client";

import { SETLISTS_CRUMB, UNDER_TUNES } from "@/components/library/hrefs";
import PageBar from "@/components/PageBar";
import { mainChartId } from "@jam-practice/core/tuneLibrary";
import { useConvexAuth } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { api } from "@jam-practice/convex/_generated/api";
import ConfirmDialog from "@/components/ConfirmDialog";
import ContextMenu, { type MenuItem, type MenuState } from "@/components/ContextMenu";
import PromptDialog from "@/components/PromptDialog";
import { MenuButton, menuPosition } from "@/components/library/shared";
import { EmptyState, Hero, KeyBadge, LibraryPage, Pill } from "@/components/library/ui";
import { DraggableList, PlayInfoLine, SetlistTuneDialog, TunePickerModal, playInfo } from "@/components/library/setlistParts";
import { tuneHref, useTuneLists, type TuneListId } from "@/components/library/useTuneActions";
import { ChordChartIcon, DotsVerticalIcon, DragIcon, LibraryIcon, PlusIcon, ShareIcon, SlidesIcon, UsersIcon } from "@/components/tools";
import { useShareSetlist } from "@/lib/shareSetlist";
import type { Tune } from "@/lib/types";
import { useChordChartsLibrary } from "@/lib/useChordChartsLibrary";
import { useSetlists } from "@/lib/useSetlists";

/**
 * One setlist (`/tunes/setlist?id=`), the web side of the mobile app's setlist screen: its tunes in
 * order, numbered, each opening its tune page; drag a row's grip to reorder, or use its ⋮ (move
 * to top / up / down, key & tempo for this set, open its chart, remove). "View all charts" opens
 * every tune's chart in order, one per page (`/setlist-charts`). The header has + (add tunes) and
 * ⋮ for the setlist: rename, description, share link (anyone with it can open it, no account
 * needed — it always shows the setlist as it is now), post to Community (or view the post, once
 * it's posted), stop sharing, delete.
 */
export default function SetlistPage({ id }: { id: string }) {
  const router = useRouter();
  const { isAuthenticated } = useConvexAuth();
  const { setlists, patch, remove } = useSetlists();
  const lists = useTuneLists();
  const { share, unshare } = useShareSetlist();
  const { allSongs } = useChordChartsLibrary(null);
  const chartKeys = useMemo(() => {
    const m = new Map<string, string>();
    for (const song of allSongs) m.set(song.id, song.key);
    return m;
  }, [allSongs]);
  const setlist = setlists.find((s) => s.id === id);
  const postId = useQuery(api.communityTunes.postForSetlist, isAuthenticated && id ? { setlistId: id } : "skip") ?? null;

  const [menu, setMenu] = useState<MenuState | null>(null);
  const [picking, setPicking] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [describing, setDescribing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [settingsFor, setSettingsFor] = useState<Tune | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  if (!setlist) {
    return (
      <LibraryPage>
        <PageBar crumbs={[...UNDER_TUNES, SETLISTS_CRUMB, { label: "Setlist" }]} icon={LibraryIcon} />
        <EmptyState boxed title="Setlist not found" body="It may have been deleted." action={<Pill label="All setlists" href="/tunes?tab=setlists" />} />
      </LibraryPage>
    );
  }

  const found: { tune: Tune; list: TuneListId }[] = [];
  for (const tuneId of setlist.tuneIds) {
    for (const list of ["tunes", "learn", "library"] as TuneListId[]) {
      const tune = lists[list].tunes.find((t) => t.id === tuneId);
      if (tune) {
        found.push({ tune, list });
        break;
      }
    }
  }
  const tunes = found.map((f) => f.tune);
  const info = (tune: Tune) => playInfo(tune, setlist.overrides?.[tune.id], mainChartId(tune) ? chartKeys.get(mainChartId(tune)!) : undefined);

  async function doShare() {
    if (!setlist) return;
    if (!isAuthenticated) {
      setMessage({ text: "Sign in to share a setlist by link.", error: true });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const { id: shareId, result } = await share(setlist, tunes);
      if (shareId !== setlist.shareId) patch(setlist.id, { shareId });
      if (result === "copied") setMessage({ text: "Link copied — anyone with it can open this setlist." });
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : "Couldn't share that.", error: true });
    } finally {
      setBusy(false);
    }
  }

  function move(from: number, to: number) {
    if (!setlist || to < 0 || to >= setlist.tuneIds.length) return;
    const next = [...setlist.tuneIds];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    patch(setlist.id, { tuneIds: next });
  }

  const post = () => router.push(postId ? `/post/${postId}` : `/community/new?setlist=${encodeURIComponent(setlist.id)}`);

  function openSetlistMenu(e: React.MouseEvent) {
    if (!setlist) return;
    const items: MenuItem[] = [
      { label: "Rename", onSelect: () => setRenaming(true) },
      { label: setlist.description ? "Edit description" : "Add a description", onSelect: () => setDescribing(true) },
      { label: "Share link", onSelect: () => void doShare() },
      { label: postId ? "View post" : "Post to Community", onSelect: post },
    ];
    if (setlist.shareId) {
      const shareId = setlist.shareId;
      items.push({
        label: "Stop sharing link",
        onSelect: () => {
          patch(setlist.id, { shareId: undefined });
          void unshare(shareId);
        },
      });
    }
    items.push({ label: "Delete setlist", danger: true, onSelect: () => setConfirmDelete(true) });
    setMenu({ ...menuPosition(e), items });
  }

  function openTuneMenu(e: React.MouseEvent, i: number) {
    if (!setlist) return;
    const { tune } = found[i];
    const items: MenuItem[] = [];
    if (i > 0) items.push({ label: "Move to top", onSelect: () => move(i, 0) }, { label: "Move up", onSelect: () => move(i, i - 1) });
    if (i < found.length - 1) items.push({ label: "Move down", onSelect: () => move(i, i + 1) });
    items.push({ label: "Key & tempo for this set", onSelect: () => setSettingsFor(tune) });
    const chartId = mainChartId(tune);
    if (chartId) items.push({ label: "Open chord chart", onSelect: () => router.push(`/chord-charts/view?id=${encodeURIComponent(chartId)}`) });
    items.push({ label: "Remove from setlist", danger: true, onSelect: () => patch(setlist.id, { tuneIds: setlist.tuneIds.filter((x) => x !== tune.id) }) });
    setMenu({ ...menuPosition(e), items });
  }

  const settings = settingsFor ? info(settingsFor) : null;

  const withCharts = tunes.filter((t) => mainChartId(t)).length;
  const changed = tunes.filter((t) => setlist.overrides?.[t.id]).length;

  return (
    <LibraryPage>
      <Hero
        title={setlist.name}
        icon={LibraryIcon}
        crumbs={[...UNDER_TUNES, SETLISTS_CRUMB]}
        subtitle={
          <span className="flex flex-col gap-1">
            {setlist.description && <span className="whitespace-pre-line text-foreground/80">{setlist.description}</span>}
            <span className="flex flex-wrap items-center gap-x-1.5">
              <span>
                {tunes.length} tune{tunes.length === 1 ? "" : "s"} · {withCharts} with a chart
              </span>
              {changed > 0 && <span>· {changed} with a key or tempo for this set</span>}
              {setlist.shareId && (
                <span className="inline-flex items-center gap-1">
                  · <ShareIcon className="h-3 w-3" /> Shared by link
                </span>
              )}
            </span>
          </span>
        }
        actions={
          <>
            <Pill icon={PlusIcon} label="Add tunes" onClick={() => setPicking(true)} iconOnlyOnPhone />
            <button type="button" onClick={openSetlistMenu} aria-label="Setlist options" className="flex h-10 w-10 items-center justify-center rounded-md bg-foreground/[0.05] text-muted hover:bg-surface-hover hover:text-foreground sm:h-9 sm:w-9">
              <DotsVerticalIcon className="h-4 w-4" />
            </button>
          </>
        }
      />

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="flex min-w-0 flex-col gap-3">
          {found.length === 0 ? (
            <EmptyState
              boxed
              title="No tunes yet"
              body="Add tunes from your lists, or a jazz standard. Drag them into order once they're here."
              action={<Pill primary icon={PlusIcon} label="Add tunes" onClick={() => setPicking(true)} />}
            />
          ) : (
            <div className="overflow-hidden rounded-lg bg-surface">
              <DraggableList
                keys={found.map((f) => f.tune.id)}
                onReorder={(order) => patch(setlist.id, { tuneIds: [...order, ...setlist.tuneIds.filter((x) => !order.includes(x))] })}
                renderRow={(key, i, handle, dragging) => {
                  const { tune, list } = found.find((f) => f.tune.id === key)!;
                  const playing = info(tune);
                  return (
                    <div className={`group flex items-center border-b border-foreground/10 pl-1 ${dragging ? "bg-surface-hover shadow-lg" : "bg-surface hover:bg-surface-hover"}`}>
                      {handle(
                        <span aria-label={`Drag to reorder ${tune.name}`} className="flex h-14 w-8 items-center justify-center text-muted/60 group-hover:text-muted">
                          <DragIcon className="h-4 w-4" />
                        </span>,
                      )}
                      <Link href={tuneHref(list, tune.id)} className="flex min-w-0 flex-1 items-center gap-3 py-2">
                        <span className="w-5 text-right text-sm tabular-nums text-muted">{i + 1}</span>
                        <KeyBadge label={playing.key} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate text-sm font-medium">{tune.name}</span>
                            {mainChartId(tune) && (
                              <span title="Has a chord chart" className="shrink-0 text-muted">
                                <ChordChartIcon className="h-3.5 w-3.5" />
                              </span>
                            )}
                          </span>
                          <PlayInfoLine info={playing} timeSignature={tune.timeSignature} />
                        </span>
                      </Link>
                      <div className="pr-1.5">
                        <MenuButton label={`Options for ${tune.name}`} onClick={(e) => openTuneMenu(e, i)} alwaysVisible />
                      </div>
                    </div>
                  );
                }}
              />
              <div>
                <button type="button" onClick={() => setPicking(true)} className="flex h-11 w-full items-center justify-center gap-1.5 text-sm font-medium text-muted transition-colors hover:bg-surface-hover hover:text-foreground">
                  <PlusIcon className="h-4 w-4" />
                  Add tunes
                </button>
              </div>
            </div>
          )}
        </div>

        <aside className="flex flex-col gap-2 rounded-lg bg-surface p-3 lg:sticky lg:top-6">
          {found.length > 0 && (
            <Link href={`/setlist-charts?mine=${encodeURIComponent(setlist.id)}`} className="flex items-center gap-3 rounded-md bg-accent p-3 text-accent-foreground hover:bg-accent-hover">
              <SlidesIcon className="h-4 w-4 shrink-0" />
              <span className="min-w-0">
                <span className="block text-sm font-medium">View all charts</span>
                <span className="block text-xs opacity-80">Every chart in order, in this set&apos;s keys</span>
              </span>
            </Link>
          )}
          <button type="button" onClick={() => void doShare()} disabled={busy} className="flex items-center gap-3 rounded-md bg-foreground/[0.05] p-3 text-left hover:bg-surface-hover disabled:opacity-50">
            <ShareIcon className="h-4 w-4 shrink-0 text-muted" />
            <span className="min-w-0">
              <span className="block text-sm font-medium">{busy ? "Sharing…" : "Share link"}</span>
              <span className="block text-xs text-muted">Anyone with it can open the setlist</span>
            </span>
          </button>
          <button type="button" onClick={post} className="flex items-center gap-3 rounded-md bg-foreground/[0.05] p-3 text-left hover:bg-surface-hover">
            <UsersIcon className="h-4 w-4 shrink-0 text-muted" />
            <span className="min-w-0">
              <span className="block text-sm font-medium">{postId ? "View post" : "Post to Community"}</span>
              <span className="block text-xs text-muted">{postId ? "It stays in sync with this setlist" : "Share it with other musicians"}</span>
            </span>
          </button>
          {message && <p className={`px-1 text-sm ${message.error ? "text-danger" : "text-muted"}`}>{message.text}</p>}
        </aside>
      </div>

      {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
      {picking && <TunePickerModal exclude={setlist.tuneIds} onAdd={(ids) => patch(setlist.id, { tuneIds: [...setlist.tuneIds, ...ids] })} onClose={() => setPicking(false)} />}
      {settingsFor && settings && (
        <SetlistTuneDialog
          tuneName={settingsFor.name}
          minor={settings.minor}
          defaultKey={settings.defaultKey}
          defaultTempo={settings.defaultTempo}
          value={setlist.overrides?.[settingsFor.id]}
          onSave={(next) => {
            const overrides = { ...(setlist.overrides ?? {}) };
            if (next) overrides[settingsFor.id] = next;
            else delete overrides[settingsFor.id];
            patch(setlist.id, { overrides });
          }}
          onClose={() => setSettingsFor(null)}
        />
      )}
      {renaming && (
        <PromptDialog
          title="Rename setlist"
          initialValue={setlist.name}
          onSubmit={(name) => {
            patch(setlist.id, { name });
            setRenaming(false);
          }}
          onCancel={() => setRenaming(false)}
        />
      )}
      {describing && (
        <PromptDialog
          title="Description"
          initialValue={setlist.description}
          placeholder="e.g. Friday at the Blue Room, 2 sets"
          allowEmpty
          onSubmit={(description) => {
            patch(setlist.id, { description });
            setDescribing(false);
          }}
          onCancel={() => setDescribing(false)}
        />
      )}
      {confirmDelete && (
        <ConfirmDialog
          title={`Delete "${setlist.name}"?`}
          message={`The setlist goes away; its tunes stay in your lists.${setlist.shareId ? " Its shared link stops working." : ""}`}
          confirmLabel="Delete"
          onConfirm={() => {
            if (setlist.shareId) void unshare(setlist.shareId);
            remove(setlist.id);
            router.push("/tunes");
          }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </LibraryPage>
  );
}
