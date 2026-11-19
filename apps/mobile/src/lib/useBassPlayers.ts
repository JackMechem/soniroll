import { api } from '@jam-practice/convex/_generated/api';
import { BUILT_IN_PLAYERS, builtInExtrasFor, isBuiltInId } from '@jam-practice/core/bassBuiltIns';
import { cleanTranscription, type Transcription } from '@jam-practice/core/bassTranscription';
import { sortByText } from '@jam-practice/core/sortText';
import { useConvexAuth } from '@convex-dev/auth/react';
import { useQuery } from 'convex/react';
import { useMemo } from 'react';

/**
 * Rhythm Section's bass players on the phone — the reading half of the website's
 * `apps/web/lib/useBassPlayers.ts`. The built-in players (Ray Brown, transcribed by Rob Moreno) are
 * there for everyone; signed in, your own players and their transcriptions come from your account
 * (`convex/bassPlayers.ts`, the same queries the website uses). Making and editing players and
 * transcriptions is the website's Bass players tab for now (it needs the notation editor). Signed
 * out, the website keeps players in that browser only, so the phone has just the built-ins.
 */

export type BassPlayerMeta = { id: string; name: string; description: string; builtIn?: boolean };

export function useBassPlayers(): { players: BassPlayerMeta[]; loading: boolean } {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const remote = useQuery(api.bassPlayers.library, isAuthenticated ? {} : 'skip');
  const players = useMemo(() => {
    const own: BassPlayerMeta[] = isAuthenticated ? (remote?.players ?? []).map((p) => ({ id: p.id, name: p.name, description: p.description })) : [];
    // Built-in players, unless you already have one by that name.
    const builtIns = BUILT_IN_PLAYERS.filter((b) => !own.some((p) => p.name.trim().toLowerCase() === b.name.toLowerCase()));
    return sortByText([...own, ...builtIns.map((b) => ({ id: b.id, name: b.name, description: b.description, builtIn: true }))], (p) => p.name);
  }, [isAuthenticated, remote]);
  return { players, loading: isLoading || (isAuthenticated && remote === undefined) };
}

/** All of one player's transcriptions (what's analysed to play like them); undefined while
    loading, [] for none / no such player. */
export function usePlayerTranscriptions(playerId: string | null, playerName?: string): Transcription[] | undefined {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const builtIn = isBuiltInId(playerId);
  const remote = useQuery(api.bassPlayers.playerTranscriptions, isAuthenticated && playerId && !builtIn ? { playerId } : 'skip');
  return useMemo(() => {
    if (!playerId) return [];
    if (builtIn) return (BUILT_IN_PLAYERS.find((b) => b.id === playerId)?.transcriptions ?? []).map((t) => cleanTranscription(t.data));
    if (isLoading) return undefined;
    if (!isAuthenticated) return [];
    if (remote === undefined) return undefined;
    const rows = (remote ?? []).map((r) => cleanTranscription(r.data));
    // A player of yours named like a built-in also plays from the built-in's transcriptions.
    const extras = playerName ? builtInExtrasFor(playerName, rows.map((r) => r.title)) : [];
    return [...rows, ...extras.map((t) => cleanTranscription(t.data))];
  }, [playerId, playerName, builtIn, isLoading, isAuthenticated, remote]);
}
