import { api } from '@jam-practice/convex/_generated/api';
import type { Id } from '@jam-practice/convex/_generated/dataModel';
import { cleanScore, emptyMeasure, emptyTranscription, newId, type Transcription } from '@jam-practice/core/bassTranscription';
import { useConvexAuth } from '@convex-dev/auth/react';
import { useMutation, useQuery } from 'convex/react';
import { useCallback, useMemo } from 'react';

import { createLocalStore } from '@/lib/localStore';

/**
 * Score Writer's scores on the phone — the website's `apps/web/lib/useScores.ts`. Signed in
 * they're in the account (`convex/scores.ts`, the same list/get/create/save/remove), so a score
 * written on the phone opens on the website and in Shed Notes. Signed out they're kept on this
 * device only (the website keeps them in that browser), under the website's key and shape.
 */

export type ScoreMeta = { id: string; title: string; measureCount: number; createdAt: number; updatedAt: number };

type LocalScore = { id: string; data: Transcription; createdAt: number; updatedAt: number };
type LocalStore = { scores: LocalScore[] };

const local = createLocalStore<LocalStore>('jam-practice-scores', { scores: [] }, (raw) => {
  const scores = (raw as Partial<LocalStore> | null)?.scores;
  return { scores: Array.isArray(scores) ? scores : [] };
});

/** A blank score: treble clef, 4/4, eight bars. */
export function newScore(title = 'Untitled score'): Transcription {
  return { ...emptyTranscription(title), clef: 'treble', measures: Array.from({ length: 8 }, () => emptyMeasure()) };
}

/** Deep-copies through JSON and cleans it, so what's saved is always a valid score. */
const plain = (t: Transcription): Transcription => cleanScore(JSON.parse(JSON.stringify(t)));

/** The list of scores (newest first). Undefined while loading. */
export function useScoreList(): ScoreMeta[] | undefined {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { value, loaded } = local.useStore();
  const remote = useQuery(api.scores.list, isAuthenticated ? {} : 'skip');
  const localList = useMemo(
    () =>
      [...value.scores]
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map((s) => ({ id: s.id, title: s.data.title, measureCount: s.data.measures.length, createdAt: s.createdAt, updatedAt: s.updatedAt })),
    [value],
  );
  if (isLoading) return undefined;
  if (isAuthenticated) return remote;
  return loaded ? localList : undefined;
}

/** One score's music. Undefined while loading, null when it's gone. */
export function useScore(id: string | null): Transcription | null | undefined {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { value, loaded } = local.useStore();
  const remote = useQuery(api.scores.get, isAuthenticated && id ? { id } : 'skip');
  const data = remote?.data;
  const fromRemote = useMemo(() => (data ? cleanScore(data) : null), [data]);
  if (!id) return null;
  if (isLoading) return undefined;
  if (isAuthenticated) return remote === undefined ? undefined : fromRemote;
  if (!loaded) return undefined;
  return value.scores.find((s) => s.id === id)?.data ?? null;
}

/** Make, save and delete scores (account or this device, whichever is in use). */
export function useScoreActions() {
  const { isAuthenticated } = useConvexAuth();
  const createRemote = useMutation(api.scores.create);
  const saveRemote = useMutation(api.scores.save);
  const removeRemote = useMutation(api.scores.remove);

  const create = useCallback(
    async (data: Transcription): Promise<string> => {
      if (isAuthenticated) return createRemote({ data: plain(data) });
      const id = newId();
      const now = Date.now();
      await local.update((s) => ({ scores: [...s.scores, { id, data: plain(data), createdAt: now, updatedAt: now }] }));
      return id;
    },
    [isAuthenticated, createRemote],
  );
  const save = useCallback(
    async (id: string, data: Transcription) => {
      if (isAuthenticated) {
        await saveRemote({ id: id as Id<'scores'>, data: plain(data) });
        return;
      }
      await local.update((s) => ({ scores: s.scores.map((x) => (x.id === id ? { ...x, data: plain(data), updatedAt: Date.now() } : x)) }));
    },
    [isAuthenticated, saveRemote],
  );
  const remove = useCallback(
    async (id: string) => {
      if (isAuthenticated) {
        await removeRemote({ id: id as Id<'scores'> });
        return;
      }
      await local.update((s) => ({ scores: s.scores.filter((x) => x.id !== id) }));
    },
    [isAuthenticated, removeRemote],
  );
  return { create, save, remove, signedIn: isAuthenticated };
}
