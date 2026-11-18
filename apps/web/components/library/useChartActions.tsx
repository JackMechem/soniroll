"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import ContextMenu, { type MenuItem, type MenuState } from "@/components/ContextMenu";
import PromptDialog from "@/components/PromptDialog";
import { menuPosition } from "@/components/library/shared";
import { useRecentCharts } from "@/lib/recents";
import { useChordChartsLibrary, type LibrarySongMeta } from "@/lib/useChordChartsLibrary";

/** The `/chord-charts/playlist?id=` id for "All charts" — every chart in the library, once. */
export const ALL_CHARTS_ID = "all";

/**
 * The ⋮ menus for chord charts and playlists, shared by every Chord Charts page. A chart lives once
 * in the library and can be in several playlists, so its menu is Edit / Remove from <the playlist
 * it was opened in> / Add to or Remove from each playlist / Add to a new playlist… / Delete. A
 * playlist's: Delete playlist (charts stay in All charts) or Delete playlist and its charts. Returns the openers plus `element` — the menu and its dialogs — to render once.
 */
export function useChartActions(options: { onPlaylistDeleted?: () => void; onSongDeleted?: () => void } = {}) {
  const router = useRouter();
  const { playlists, addToPlaylist, removeFromPlaylist, deleteSong, deletePlaylist } = useChordChartsLibrary(null);
  const recents = useRecentCharts();
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [addingToNew, setAddingToNew] = useState<string | null>(null);
  const [deletingSong, setDeletingSong] = useState<{ id: string; title: string } | null>(null);
  const [deletingPlaylist, setDeletingPlaylist] = useState<{ id: string; name: string; count: number; deleteCharts: boolean } | null>(null);

  /** `playlistId`: the playlist the chart is being shown in (offers "Remove from" it first), or null. */
  function openSongMenu(e: React.MouseEvent, song: Pick<LibrarySongMeta, "id" | "title" | "playlistIds">, playlistId: string | null) {
    const current = playlists.find((p) => p.id === playlistId);
    const items: MenuItem[] = [
      { label: "Edit chart", onSelect: () => router.push(`/chord-charts/edit?id=${encodeURIComponent(song.id)}`) },
      ...(current ? [{ label: `Remove from ${current.name}`, onSelect: () => void removeFromPlaylist(song.id, current.id) }] : []),
      ...playlists
        .filter((p) => p.id !== playlistId)
        .slice(0, 10)
        .map((p) =>
          song.playlistIds.includes(p.id)
            ? { label: `Remove from ${p.name}`, onSelect: () => void removeFromPlaylist(song.id, p.id) }
            : { label: `Add to ${p.name}`, onSelect: () => void addToPlaylist(song.id, p.name) },
        ),
      { label: "Add to a new folder…", onSelect: () => setAddingToNew(song.id) },
      { label: "Delete chart", danger: true, onSelect: () => setDeletingSong(song) },
    ];
    setMenu({ ...menuPosition(e), items });
  }

  function openPlaylistMenu(e: React.MouseEvent, playlist: { id: string; name: string; count: number }) {
    if (playlist.id === ALL_CHARTS_ID) return;
    setMenu({
      ...menuPosition(e),
      items: [
        { label: "Delete folder", danger: true, onSelect: () => setDeletingPlaylist({ ...playlist, deleteCharts: false }) },
        { label: "Delete folder and its charts", danger: true, onSelect: () => setDeletingPlaylist({ ...playlist, deleteCharts: true }) },
      ],
    });
  }

  const element = (
    <>
      {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
      {addingToNew && (
        <PromptDialog
          title="Add to a new folder"
          initialValue=""
          onSubmit={(name) => {
            if (name.trim()) void addToPlaylist(addingToNew, name.trim());
            setAddingToNew(null);
          }}
          onCancel={() => setAddingToNew(null)}
        />
      )}
      {deletingSong && (
        <ConfirmDialog
          title={`Delete "${deletingSong.title}"?`}
          message="This removes the chart from your library and every folder it's in. This can't be undone."
          confirmLabel="Delete"
          onConfirm={() => {
            void deleteSong(deletingSong.id);
            recents.forget(deletingSong.id);
            setDeletingSong(null);
            options.onSongDeleted?.();
          }}
          onCancel={() => setDeletingSong(null)}
        />
      )}
      {deletingPlaylist && (
        <ConfirmDialog
          title={`Delete "${deletingPlaylist.name}"?`}
          message={
            deletingPlaylist.deleteCharts
              ? `This deletes the folder and its ${deletingPlaylist.count} chart${deletingPlaylist.count === 1 ? "" : "s"} — except any that are also in another folder, which stay. Tunes linked to deleted charts keep their notes and keys. This can't be undone.`
              : `Only the folder goes — its ${deletingPlaylist.count} chart${deletingPlaylist.count === 1 ? "" : "s"} stay in All charts and any other folders.`
          }
          confirmLabel={deletingPlaylist.deleteCharts ? "Delete both" : "Delete folder"}
          onConfirm={() => {
            void deletePlaylist(deletingPlaylist.id, { deleteCharts: deletingPlaylist.deleteCharts });
            setDeletingPlaylist(null);
            options.onPlaylistDeleted?.();
          }}
          onCancel={() => setDeletingPlaylist(null)}
        />
      )}
    </>
  );

  return { openSongMenu, openPlaylistMenu, element };
}
