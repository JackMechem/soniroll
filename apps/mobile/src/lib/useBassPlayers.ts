import { api } from '@jam-practice/convex/_generated/api';
import type { Id } from '@jam-practice/convex/_generated/dataModel';
import { BUILT_IN_PLAYERS, builtInExtrasFor, isBuiltInId } from '@jam-practice/core/bassBuiltIns';
import { cleanTranscription, newId, type Transcription } from '@jam-practice/core/bassTranscription';
import { sortByText } from '@jam-practice/core/sortText';
import { useConvexAuth } from '@convex-dev/auth/react';
import { useConvex, useMutation, useQuery } from 'convex/react';
import { useCallback, useMemo } from 'react';

import { createLocalStore } from '@/lib/localStore';

/**
 * Rhythm Section's bass players on the phone — the website's `apps/web/lib/useBassPlayers.ts`.
 * The built-in players (Ray Brown, transcribed by Rob Moreno) are there for everyone. Signed in,
 * your own players and their transcriptions are in your account (`convex/bassPlayers.ts`, the same
 * queries and mutations the website uses), so they're the same on both. Signed out they're kept on
 * this device only (the website keeps them in that browser), under the website's key and shape.
 */

export type BassPlayerMeta = {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  /** Comes with Rhythm Section (read-only). */
  builtIn?: boolean;
};
export type TranscriptionMeta = { id: string; playerId: string; title: string; measureCount: number; createdAt: number; updatedAt: number };

type LocalTranscription = { id: string; playerId: string; data: Transcription; createdAt: number; updatedAt: number };
type LocalStore = { players: BassPlayerMeta[]; transcriptions: LocalTranscription[] };

const local = createLocalStore<LocalStore>('jam-practice-bass-players', { players: [], transcriptions: [] }, (raw) => {
  const r = raw as Partial<LocalStore> | null;
  return { players: Array.isArray(r?.players) ? r.players : [], transcriptions: Array.isArray(r?.transcriptions) ? r.transcriptions : [] };
});

/** Deep-copies through JSON, so what's saved never shares objects with editor state. */
const plain = <T>(v: T): T => JSON.parse(JSON.stringify(v));

/** A built-in transcription by id. */
function builtInTranscription(id: string) {
  for (const p of BUILT_IN_PLAYERS) {
    const t = p.transcriptions.find((x) => x.id === id);
    if (t) return { ...t, playerId: p.id };
  }
  return null;
}

export function useBassPlayers() {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const { value: store, loaded } = local.useStore();
  const remote = useQuery(api.bassPlayers.library, isAuthenticated ? {} : 'skip');
  const createPlayerM = useMutation(api.bassPlayers.createPlayer);
  const updatePlayerM = useMutation(api.bassPlayers.updatePlayer);
  const deletePlayerM = useMutation(api.bassPlayers.deletePlayer);
  const createTranscriptionM = useMutation(api.bassPlayers.createTranscription);
  const deleteTranscriptionM = useMutation(api.bassPlayers.deleteTranscription);
  const convex = useConvex();

  const own: BassPlayerMeta[] = useMemo(() => (isAuthenticated ? (remote?.players ?? []) : store.players), [isAuthenticated, remote, store.players]);
  // Built-in players, unless you already have one by that name.
  const builtIns = useMemo(() => BUILT_IN_PLAYERS.filter((b) => !own.some((p) => p.name.trim().toLowerCase() === b.name.toLowerCase())), [own]);
  const players: BassPlayerMeta[] = useMemo(
    () =>
      sortByText(
        [...own, ...builtIns.map((b) => ({ id: b.id, name: b.name, description: b.description, createdAt: 0, updatedAt: 0, builtIn: true }))],
        (p) => p.name,
      ),
    [own, builtIns],
  );
  const transcriptions: TranscriptionMeta[] = useMemo(() => {
    const list: TranscriptionMeta[] = isAuthenticated
      ? [...(remote?.transcriptions ?? [])]
      : store.transcriptions.map((t) => ({ id: t.id, playerId: t.playerId, title: t.data.title, measureCount: t.data.measures.length, createdAt: t.createdAt, updatedAt: t.updatedAt }));
    for (const b of builtIns)
      for (const t of b.transcriptions) list.push({ id: t.id, playerId: b.id, title: t.data.title, measureCount: t.data.measures.length, createdAt: 0, updatedAt: 0 });
    // Your own player sharing a built-in's name gets its transcriptions too.
    for (const p of own) {
      const titles = list.filter((t) => t.playerId === p.id).map((t) => t.title);
      for (const t of builtInExtrasFor(p.name, titles))
        list.push({ id: t.id, playerId: p.id, title: t.data.title, measureCount: t.data.measures.length, createdAt: 0, updatedAt: 0 });
    }
    return list.sort((a, b) => b.updatedAt - a.updatedAt);
  }, [isAuthenticated, remote, store.transcriptions, builtIns, own]);

  const loading = authLoading || (isAuthenticated ? remote === undefined : !loaded);

  const createPlayer = useCallback(
    async (name: string, description = ''): Promise<string> => {
      if (isAuthenticated) return await createPlayerM({ name, description });
      const now = Date.now();
      const id = newId();
      await local.update((s) => ({ ...s, players: [...s.players, { id, name: name.trim() || 'Bass player', description, createdAt: now, updatedAt: now }] }));
      return id;
    },
    [isAuthenticated, createPlayerM],
  );

  const updatePlayer = useCallback(
    async (id: string, patch: { name?: string; description?: string }) => {
      if (isAuthenticated) return void (await updatePlayerM({ playerId: id as Id<'bassPlayers'>, ...patch }));
      await local.update((s) => ({ ...s, players: s.players.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: Date.now() } : p)) }));
    },
    [isAuthenticated, updatePlayerM],
  );

  const deletePlayer = useCallback(
    async (id: string) => {
      if (isAuthenticated) return void (await deletePlayerM({ playerId: id as Id<'bassPlayers'> }));
      await local.update((s) => ({ players: s.players.filter((p) => p.id !== id), transcriptions: s.transcriptions.filter((t) => t.playerId !== id) }));
    },
    [isAuthenticated, deletePlayerM],
  );

  const createTranscription = useCallback(
    async (playerId: string, data: Transcription): Promise<string> => {
      if (isAuthenticated) return await createTranscriptionM({ playerId: playerId as Id<'bassPlayers'>, data: plain(data) });
      const now = Date.now();
      const id = newId();
      await local.update((s) => ({ ...s, transcriptions: [...s.transcriptions, { id, playerId, data: plain(data), createdAt: now, updatedAt: now }] }));
      return id;
    },
    [isAuthenticated, createTranscriptionM],
  );

  const deleteTranscription = useCallback(
    async (id: string) => {
      if (isAuthenticated) return void (await deleteTranscriptionM({ transcriptionId: id as Id<'bassTranscriptions'> }));
      await local.update((s) => ({ ...s, transcriptions: s.transcriptions.filter((t) => t.id !== id) }));
    },
    [isAuthenticated, deleteTranscriptionM],
  );

  /** One transcription's notes, fetched once. */
  const fetchTranscription = useCallback(
    async (id: string): Promise<unknown> => {
      if (isBuiltInId(id)) return builtInTranscription(id)?.data ?? null;
      if (isAuthenticated) return (await convex.query(api.bassPlayers.getTranscription, { transcriptionId: id }))?.data ?? null;
      return (await local.read()).transcriptions.find((t) => t.id === id)?.data ?? null;
    },
    [isAuthenticated, convex],
  );

  return { signedIn: isAuthenticated, loading, players, transcriptions, fetchTranscription, createPlayer, updatePlayer, deletePlayer, createTranscription, deleteTranscription };
}

/** One transcription's notes, and a way to save them (the editor autosaves through this). */
export function useTranscription(id: string | null) {
  const { isAuthenticated } = useConvexAuth();
  const { value: store, loaded } = local.useStore();
  const builtIn = useMemo(() => (id && isBuiltInId(id) ? builtInTranscription(id) : null), [id]);
  const remote = useQuery(api.bassPlayers.getTranscription, isAuthenticated && id && !builtIn ? { transcriptionId: id } : 'skip');
  const saveM = useMutation(api.bassPlayers.saveTranscription);

  const data: Transcription | null | undefined = useMemo(() => {
    if (!id) return null;
    if (builtIn) return cleanTranscription(builtIn.data);
    if (isAuthenticated) {
      if (remote === undefined) return undefined;
      return remote ? cleanTranscription(remote.data) : null;
    }
    if (!loaded) return undefined;
    const row = store.transcriptions.find((t) => t.id === id);
    return row ? cleanTranscription(row.data) : null;
  }, [id, builtIn, isAuthenticated, remote, loaded, store.transcriptions]);

  const save = useCallback(
    async (next: Transcription) => {
      if (!id || isBuiltInId(id)) return; // built-ins are read-only
      if (isAuthenticated) return void (await saveM({ transcriptionId: id as Id<'bassTranscriptions'>, data: plain(next) }));
      await local.update((s) => ({ ...s, transcriptions: s.transcriptions.map((t) => (t.id === id ? { ...t, data: plain(next), updatedAt: Date.now() } : t)) }));
    },
    [id, isAuthenticated, saveM],
  );

  return { data, save, readOnly: !!builtIn };
}

/** All of one player's transcriptions with their ids, notes and all; undefined while loading,
    [] for none / no such player. */
export function usePlayerTranscriptionRows(playerId: string | null, playerName?: string): { id: string; data: Transcription }[] | undefined {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { value: store, loaded } = local.useStore();
  const builtIn = isBuiltInId(playerId);
  const remote = useQuery(api.bassPlayers.playerTranscriptions, isAuthenticated && playerId && !builtIn ? { playerId } : 'skip');
  return useMemo(() => {
    if (!playerId) return [];
    if (builtIn) return (BUILT_IN_PLAYERS.find((b) => b.id === playerId)?.transcriptions ?? []).map((t) => ({ id: t.id, data: cleanTranscription(t.data) }));
    if (isLoading) return undefined;
    let rows: { id: string; data: Transcription }[];
    if (isAuthenticated) {
      if (remote === undefined) return undefined;
      rows = (remote ?? []).map((r) => ({ id: r.id, data: cleanTranscription(r.data) }));
    } else {
      if (!loaded) return undefined;
      rows = store.transcriptions.filter((t) => t.playerId === playerId).map((t) => ({ id: t.id, data: cleanTranscription(t.data) }));
    }
    // A player of yours named like a built-in also plays from the built-in's transcriptions.
    const extras = playerName ? builtInExtrasFor(playerName, rows.map((r) => r.data.title)) : [];
    return [...rows, ...extras.map((t) => ({ id: t.id, data: cleanTranscription(t.data) }))];
  }, [playerId, playerName, builtIn, isLoading, isAuthenticated, remote, loaded, store.transcriptions]);
}

/** All of one player's transcriptions (what's analysed to play like them). */
export function usePlayerTranscriptions(playerId: string | null, playerName?: string): Transcription[] | undefined {
  const rows = usePlayerTranscriptionRows(playerId, playerName);
  return useMemo(() => rows?.map((r) => r.data), [rows]);
}
