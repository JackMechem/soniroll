import { api } from '@jam-practice/convex/_generated/api';
import type { Id } from '@jam-practice/convex/_generated/dataModel';
import type { PomodoroConfig, PracticeSession, Segment } from '@jam-practice/core/practiceTimer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useConvexAuth } from '@convex-dev/auth/react';
import { useMutation, useQuery } from 'convex/react';
import { useEffect, useState } from 'react';

export type SessionInput =
  | { name: string; type: 'custom'; segments: Segment[] }
  | { name: string; type: 'pomodoro'; pomodoro: PomodoroConfig };

const STORAGE_KEY = 'jam-practice-timer-sessions';

/**
 * Saved Practice Timer sessions — reads/writes the *same* shared `practiceSessions` Convex table
 * `apps/web/lib/usePracticeSessions.ts` already uses (not a mobile-only copy under a generic
 * `syncedSettings` blob key), so a session saved on web shows up on mobile and vice versa, same as
 * every other account-backed feature in this app. Signed in, this is Convex-only with **no
 * merge** — matching web's own explicit "simpler than even a one-time merge prompt" design —
 * whatever's cached locally on this device is never imported or offered as a choice.
 *
 * Where this *does* deliberately diverge from the web hook, per this app's own established
 * "tools should work offline" principle: signed **out**, sessions persist to this device's own
 * `AsyncStorage` (web's signed-out fallback is a plain in-memory store with no native storage
 * concept at all). That copy is only ever the phone's own: signed-in sessions are never copied into
 * it (they once were, so signing out showed the last account's sessions as the phone's).
 */
export function usePracticeSessions() {
  const { isAuthenticated } = useConvexAuth();
  const convexSessions = useQuery(api.practiceSessions.list, isAuthenticated ? {} : 'skip');
  const [localSessions, setLocalSessions] = useState<PracticeSession[]>([]);
  const [localLoaded, setLocalLoaded] = useState(false);
  const createMutation = useMutation(api.practiceSessions.create);
  const updateMutation = useMutation(api.practiceSessions.update);
  const removeMutation = useMutation(api.practiceSessions.remove);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (cancelled) return;
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) setLocalSessions(parsed);
          } catch {
            // corrupt local data — start with an empty list
          }
        }
        setLocalLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLocalLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function persistLocal(next: PracticeSession[]) {
    setLocalSessions(next);
    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  const sessions = isAuthenticated ? (convexSessions ?? []) : localSessions;
  // Convex's useQuery returns undefined until the first result lands — distinct from "signed in,
  // zero saved sessions" ([]). Signed-out local storage has no such loading gap once hydrated.
  const loading = isAuthenticated ? convexSessions === undefined : !localLoaded;

  async function createSession(input: SessionInput): Promise<PracticeSession> {
    if (isAuthenticated) {
      const id = await createMutation(input);
      return { id, updatedAt: Date.now(), ...input } as PracticeSession;
    }
    const session = {
      id: `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
      updatedAt: Date.now(),
      ...input,
    } as PracticeSession;
    persistLocal([...localSessions, session]);
    return session;
  }

  /** `session.id` must already be a real, previously-saved id (from `createSession` or the
      `sessions` list) — never a fresh client-side draft id that hasn't been created yet. */
  async function updateSession(session: PracticeSession): Promise<void> {
    if (isAuthenticated) {
      const { id, updatedAt: _updatedAt, ...fields } = session;
      void _updatedAt; // server sets its own updatedAt on write, this one's discarded
      await updateMutation({ id: id as Id<'practiceSessions'>, ...fields });
      return;
    }
    persistLocal(localSessions.map((s) => (s.id === session.id ? { ...session, updatedAt: Date.now() } : s)));
  }

  async function deleteSession(id: string): Promise<void> {
    if (isAuthenticated) {
      await removeMutation({ id: id as Id<'practiceSessions'> });
      return;
    }
    persistLocal(localSessions.filter((s) => s.id !== id));
  }

  return { sessions, loading, createSession, updateSession, deleteSession };
}
