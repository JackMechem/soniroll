import { useConvexAuth } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useRef } from "react";
import { api } from "@jam-practice/convex/_generated/api";
import { Id } from "@jam-practice/convex/_generated/dataModel";
import type { IRealSong } from "./iRealPro";
import {
  LIBRARY_DEFAULTS,
  LIBRARY_KEY,
  createPlaylistInLibrary,
  deletePlaylistFromLibrary,
  mergeIntoLibrary,
  addSongToPlaylist,
  removeSongFromPlaylist,
  removeSongFromLibrary,
  updateSongInLibrary,
  resolvePlaylists,
} from "./chordChartsLibrary";
import { usePersistedSettings } from "./usePersistedSettings";
import { useChartLinker } from "./useTuneLists";
import type { LinkResult } from "@jam-practice/core/tuneLibrary";

const IMPORT_CHUNK = 150;

/** Charts being deleted right now. The library query still lists one for a moment after its tune
    is gone (deleting a tune deletes its charts), and the tune auto-linker (`useAutoLinkCharts`)
    mustn't take it for a chart with no tune and make it a new one. */
export const deletingChartIds = new Set<string>();
const DELETING_HOLD_MS = 10_000;

export type LibrarySongMeta = {
  id: string;
  title: string;
  composer: string;
  style: string;
  key: string;
  timeSignature: { top: number; bottom: number };
  /** Every playlist this chart is in (a chart can be in several, or none). */
  playlistIds: string[];
  /** Those playlists' names, comma-separated ("" when it's in none) — for a row's subtitle. */
  playlistNames: string;
  /** The same names as a list (tags made from folders). */
  playlistNameList: string[];
};

export type LibraryPlaylist = { id: string; name: string; songs: LibrarySongMeta[] };

/**
 * The Chord Charts tool's library — signed out, this is a thin wrapper over
 * `lib/chordChartsLibrary.ts`'s pure functions and a `usePersistedSettings` blob, unchanged from
 * before this hook existed. Signed in, it's backed by three dedicated Convex tables instead of
 * the generic `syncedSettings` blob mechanism every other tool's settings use — see
 * `convex/schema.ts`'s own comment on `chordChartPlaylists` for why: that blob approach broke for
 * real on a "massive" iReal playlist import (a single JSON document over Convex's 1 MiB
 * per-document limit). The tables split a song's metadata from its (often much larger) parsed
 * bar list, so listing/searching/deduping a library never touches `bars` at all, and `bars` is
 * only ever fetched for whichever *one* song is currently selected (`selectedSongId`) — lazily,
 * the same on-demand pattern Community posts already use for their own "don't pull a big payload
 * down just to show a list" problem.
 *
 * Both backends are always read/called regardless of sign-in state, per rules-of-hooks — only the
 * *returned* values and which mutation actually runs branch on `isAuthenticated`, same pattern as
 * every other signed-in-aware hook in this app (`useSyncedSettings`, `usePracticeSessions`, ...).
 */
export function useChordChartsLibrary(selectedSongId: string | null) {
  const { isAuthenticated } = useConvexAuth();
  // Signed in, the library query reads every chart (~400 KB for a big library). Convex answers a
  // page's first batch of queries together, so subscribing to it with the rest made the whole page
  // — your name, favorites, today's practice, even mutations — wait for it: seconds on a cold
  // backend. So it subscribes only once the account's first answer is in (`users.current`, which
  // the sidebar already loads on every page, so this adds no query); until then it reads as still
  // loading.
  const me = useQuery(api.users.current, isAuthenticated ? {} : "skip");
  const defer = isAuthenticated && me === undefined;

  const [localLibrary, updateLocalLibrary] = usePersistedSettings(LIBRARY_KEY, LIBRARY_DEFAULTS);

  const convexLibrary = useQuery(api.chordCharts.library, isAuthenticated && !defer ? {} : "skip");
  // `selectedSongId` is device-local (persisted in localStorage regardless of sign-in state — see
  // ChordCharts.tsx's own VIEW_KEY), so it can be a signed-out-library id left over from before
  // the user signed in. Those are `crypto.randomUUID()` strings (lib/chordChartsLibrary.ts's
  // `freshId`) — always containing a "-", which a real Convex id never does — so sending one
  // through as a Convex document id fails argument validation and crashes the query outright.
  // Guard against that shape mismatch here rather than letting it reach the server.
  const validSelectedSongId =
    selectedSongId && !selectedSongId.includes("-") ? selectedSongId : null;
  const convexBars = useQuery(
    api.chordCharts.getSongBars,
    isAuthenticated && validSelectedSongId
      ? { songId: validSelectedSongId as Id<"chordChartSongs"> }
      : "skip",
  );
  const importMutation = useMutation(api.chordCharts.importSongs);
  const deleteMutation = useMutation(api.chordCharts.deleteSong);
  const clearMutation = useMutation(api.chordCharts.clearAll);
  const addToPlaylistMutation = useMutation(api.chordCharts.addToPlaylist);
  const removeFromPlaylistMutation = useMutation(api.chordCharts.removeFromPlaylist);
  const createPlaylistMutation = useMutation(api.chordCharts.createPlaylist);
  const updateMutation = useMutation(api.chordCharts.updateSong);
  const deletePlaylistMutation = useMutation(api.chordCharts.deletePlaylist);
  const migrateMutation = useMutation(api.chordCharts.migrateFromSyncedSettings);
  // Every chart belongs to a tune: what's imported is linked to its tune (or a new Library tune).
  const { link: linkToTunes } = useChartLinker();

  // Runs once per sign-in (not once ever, and not on every render) — the mutation itself is a
  // no-op once already migrated, so calling it again on a later sign-in costs one cheap read.
  const migratedRef = useRef(false);
  useEffect(() => {
    if (isAuthenticated && !defer && !migratedRef.current) {
      migratedRef.current = true;
      void migrateMutation({});
    }
    if (!isAuthenticated) migratedRef.current = false;
  }, [isAuthenticated, defer, migrateMutation]);

  // Every chart once ("All charts"), with the playlists it's in; and each playlist with its charts
  // (a chart in several playlists shows in each).
  const { allSongs, playlists } = useMemo((): { allSongs: LibrarySongMeta[]; playlists: LibraryPlaylist[] } => {
    if (!isAuthenticated) {
      const resolved = resolvePlaylists(localLibrary);
      const names = new Map(localLibrary.playlists.map((p) => [p.id, p.name]));
      const memberships = new Map<string, string[]>();
      for (const p of localLibrary.playlists) for (const id of p.songIds) memberships.set(id, [...(memberships.get(id) ?? []), p.id]);
      const all = localLibrary.songs.map((s) => ({
        id: s.id,
        title: s.title,
        composer: s.composer,
        style: s.style,
        key: s.key,
        timeSignature: s.timeSignature,
        playlistIds: memberships.get(s.id) ?? [],
        playlistNameList: (memberships.get(s.id) ?? []).map((id) => names.get(id)).filter((n): n is string => !!n),
        playlistNames: (memberships.get(s.id) ?? []).map((id) => names.get(id)).filter(Boolean).join(", "),
      }));
      const byId = new Map(all.map((s) => [s.id, s]));
      return {
        allSongs: all,
        playlists: resolved.map((p) => ({ id: p.id, name: p.name, songs: p.songs.map((s) => byId.get(s.id)!).filter(Boolean) })),
      };
    }
    if (!convexLibrary) return { allSongs: [], playlists: [] };
    const names = new Map(convexLibrary.playlists.map((p) => [p.id as string, p.name]));
    const all: LibrarySongMeta[] = convexLibrary.songs.map((s) => ({
      id: s.id,
      title: s.title,
      composer: s.composer,
      style: s.style,
      key: s.key,
      timeSignature: s.timeSignature,
      playlistIds: s.playlistIds,
      playlistNameList: s.playlistIds.map((id) => names.get(id)).filter((n): n is string => !!n),
      playlistNames: s.playlistIds.map((id) => names.get(id)).filter(Boolean).join(", "),
    }));
    const byPlaylist = new Map<string, LibrarySongMeta[]>();
    for (const song of all) for (const pid of song.playlistIds) byPlaylist.set(pid, [...(byPlaylist.get(pid) ?? []), song]);
    // Empty playlists are kept: one can be made before any chart is in it.
    return { allSongs: all, playlists: convexLibrary.playlists.map((p) => ({ id: p.id, name: p.name, songs: byPlaylist.get(p.id) ?? [] })) };
  }, [isAuthenticated, localLibrary, convexLibrary]);

  const totalSongs = isAuthenticated ? (convexLibrary?.songs.length ?? 0) : localLibrary.songs.length;
  const loading = isAuthenticated && convexLibrary === undefined;

  const selectedMeta = useMemo(() => {
    if (!isAuthenticated || !selectedSongId) return null;
    return allSongs.find((s) => s.id === selectedSongId) ?? null;
  }, [isAuthenticated, allSongs, selectedSongId]);

  const selectedSong: IRealSong | null = useMemo(() => {
    if (!selectedSongId) return null;
    if (!isAuthenticated) {
      return localLibrary.songs.find((s) => s.id === selectedSongId) ?? null;
    }
    if (!selectedMeta || !convexBars) return null;
    return {
      title: selectedMeta.title,
      composer: selectedMeta.composer,
      style: selectedMeta.style,
      key: selectedMeta.key,
      timeSignature: selectedMeta.timeSignature,
      bars: convexBars,
    };
  }, [selectedSongId, isAuthenticated, localLibrary.songs, selectedMeta, convexBars]);

  const selectedSongLoading =
    isAuthenticated && !!selectedSongId && !!selectedMeta && convexBars === undefined;

  /** `replaceExisting` overwrites charts already in the library (same title/composer/key) in
      place — for re-importing after the importer improved. Signed in, big imports go in chunks:
      one Convex function can only read 4,096 documents, and replacing reads each chart's bars.
      Each chart is then linked to a tune (`useChartLinker`; `tags` go on those tunes) unless
      `link: false` — for callers that link the chart to a tune themselves. */
  async function importSongs(
    songs: IRealSong[],
    playlistName: string | null,
    options: { replaceExisting?: boolean; link?: boolean; tags?: string[] } = {},
  ) {
    const result = await importOnly(songs, playlistName, options);
    let linked: LinkResult | null = null;
    if (options.link !== false) {
      const charts = songs.map((s, i) => ({ id: result.ids[i], title: s.title, timeSignature: s.timeSignature })).filter((c) => !!c.id);
      linked = linkToTunes(charts, { tags: options.tags });
    }
    return { ...result, linked };
  }

  async function importOnly(songs: IRealSong[], playlistName: string | null, options: { replaceExisting?: boolean }) {
    if (isAuthenticated) {
      const totals = { added: 0, skipped: 0, updated: 0, ids: [] as string[] };
      for (let i = 0; i < songs.length; i += IMPORT_CHUNK) {
        const r = await importMutation({ playlistName: playlistName ?? undefined, songs: songs.slice(i, i + IMPORT_CHUNK), replaceExisting: options.replaceExisting });
        totals.added += r.added;
        totals.skipped += r.skipped;
        totals.updated += r.updated;
        totals.ids.push(...r.ids);
      }
      return totals;
    }
    const result = mergeIntoLibrary(localLibrary, songs, playlistName, options);
    updateLocalLibrary(result.library);
    return { added: result.added, skipped: result.skipped, updated: result.updated, ids: result.ids };
  }

  /** Adds a chart to the playlist named `playlistName` (existing or new); it stays in any others. */
  async function addToPlaylist(songId: string, playlistName: string) {
    if (isAuthenticated) {
      await addToPlaylistMutation({ songId: songId as Id<"chordChartSongs">, playlistName });
      return;
    }
    updateLocalLibrary(addSongToPlaylist(localLibrary, songId, playlistName));
  }

  /** Takes a chart out of one playlist; it stays in All charts. */
  async function removeFromPlaylist(songId: string, playlistId: string) {
    if (isAuthenticated) {
      await removeFromPlaylistMutation({ songId: songId as Id<"chordChartSongs">, playlistId: playlistId as Id<"chordChartPlaylists"> });
      return;
    }
    updateLocalLibrary(removeSongFromPlaylist(localLibrary, songId, playlistId));
  }


  async function createPlaylist(name: string) {
    if (isAuthenticated) {
      await createPlaylistMutation({ name });
      return;
    }
    updateLocalLibrary(createPlaylistInLibrary(localLibrary, name));
  }

  async function updateSong(songId: string, song: IRealSong) {
    if (isAuthenticated) {
      await updateMutation({ songId: songId as Id<"chordChartSongs">, song });
      return;
    }
    updateLocalLibrary(updateSongInLibrary(localLibrary, songId, song));
  }

  /** Deletes a playlist; its charts stay in All charts unless `deleteCharts` (then the ones in no other playlist go too). */
  async function deletePlaylist(playlistId: string, options: { deleteCharts?: boolean } = {}) {
    if (isAuthenticated) {
      await deletePlaylistMutation({ playlistId: playlistId as Id<"chordChartPlaylists">, deleteCharts: options.deleteCharts });
      return;
    }
    updateLocalLibrary(deletePlaylistFromLibrary(localLibrary, playlistId, options));
  }

  async function deleteSong(songId: string) {
    deletingChartIds.add(songId);
    setTimeout(() => deletingChartIds.delete(songId), DELETING_HOLD_MS);
    if (isAuthenticated) {
      await deleteMutation({ songId: songId as Id<"chordChartSongs"> });
      return;
    }
    updateLocalLibrary(removeSongFromLibrary(localLibrary, songId));
  }

  async function clearAll() {
    if (isAuthenticated) {
      await clearMutation({});
      return;
    }
    updateLocalLibrary(LIBRARY_DEFAULTS);
  }

  return {
    playlists,
    allSongs,
    totalSongs,
    loading,
    selectedSong,
    selectedSongLoading,
    importSongs,
    deleteSong,
    addToPlaylist,
    removeFromPlaylist,
    createPlaylist,
    updateSong,
    deletePlaylist,
    clearAll,
  };
}
