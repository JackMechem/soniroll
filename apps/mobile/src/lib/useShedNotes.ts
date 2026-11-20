import { api } from '@jam-practice/convex/_generated/api';
import type { Id } from '@jam-practice/convex/_generated/dataModel';
import { DEFAULT_CONFIG, DEFAULT_CONFIG_TEXT, parseConfig, setConfigValue, type ShedNotesConfig } from '@jam-practice/core/shedNotesConfig';
import { useConvexAuth } from '@convex-dev/auth/react';
import { useMutation, useQuery } from 'convex/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useSyncedSettings } from '@/lib/useSyncedSettings';

/**
 * Shed Notes on the phone — the website's `apps/web/lib/useShedNotes.ts`: the same Convex
 * functions (`packages/convex/shedNotes.ts`), so a note written on the phone is the same note on
 * the website. Notes live in the account only (signed out, Shed Notes asks you to sign in, as the
 * website does).
 */

export type NoteMeta = {
  id: string;
  title: string;
  folder: string;
  links: string[];
  tags: string[];
  snippet: string;
  createdAt: number;
  updatedAt: number;
};

/** Every note's title, folder, links and snippet. Undefined while loading. */
export function useNoteList(): NoteMeta[] | undefined {
  const { isAuthenticated } = useConvexAuth();
  return useQuery(api.shedNotes.list, isAuthenticated ? {} : 'skip');
}

const SETTINGS_KEY = 'jam-practice-shed-notes';
const SETTINGS_DEFAULTS = { configText: DEFAULT_CONFIG_TEXT, goodText: DEFAULT_CONFIG_TEXT };

/** The settings file (the website's): its text as typed, the settings in use (the last version
    that parsed), what's wrong with it, and a way to change one setting. */
export function useNotesConfig() {
  const [settings, update, ready] = useSyncedSettings(SETTINGS_KEY, SETTINGS_DEFAULTS);
  const text = settings.configText;
  const current = useMemo(() => parseConfig(text), [text]);
  const good = useMemo(() => parseConfig(settings.goodText).config ?? DEFAULT_CONFIG, [settings.goodText]);
  const setText = useCallback(
    (configText: string) => update(parseConfig(configText).config ? { configText, goodText: configText } : { configText }),
    [update],
  );
  /** False when the file doesn't parse (nothing is changed then). */
  const setValue = useCallback(
    (key: keyof ShedNotesConfig, value: unknown) => {
      const next = setConfigValue(text, key, value);
      if (next === null) return false;
      update({ configText: next, goodText: next });
      return true;
    },
    [text, update],
  );
  return { text, setText, setValue, ready, config: current.config ?? good, errors: current.errors, broken: !current.config };
}

export type SaveState = 'saved' | 'saving' | 'unsaved' | 'error';
export const SAVE_LABEL: Record<SaveState, string> = { saved: 'Saved', saving: 'Saving…', unsaved: 'Editing', error: 'Not saved' };

/** One note, with an autosaving `setBody` (a moment after typing stops, when the app goes to the
    background, and on leaving). */
export function useNote(id: string | null) {
  const { isAuthenticated } = useConvexAuth();
  const note = useQuery(api.shedNotes.get, isAuthenticated && id ? { id } : 'skip');
  const saveMut = useMutation(api.shedNotes.save);
  const [state, setState] = useState<SaveState>('saved');
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<{ id: string; body: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    setState('saving');
    saveMut({ id: p.id as Id<'shedNotes'>, body: p.body })
      .then(() => {
        setState(pending.current ? 'unsaved' : 'saved');
        setError(null);
      })
      .catch((e: Error) => {
        setState('error');
        setError(errorText(e));
      });
  }, [saveMut]);

  const setBody = useCallback(
    (body: string) => {
      if (!id) return;
      pending.current = { id, body };
      setState('unsaved');
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, 800);
    },
    [id, flush],
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') flush();
    });
    return () => {
      sub.remove();
      flush();
    };
  }, [id, flush]);

  return { note, setBody, flush, saveState: state, saveError: error };
}

/** Pulls a friendly message out of a Convex error. */
export function errorText(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.replace(/^[\s\S]*?Uncaught Error:\s*/, '').split('\n')[0].trim() || 'Something went wrong.';
}

export type NoteTemplate = { id: string; name: string; title: string; body: string; updatedAt: number };

/** Your templates, A–Z. Undefined while loading. */
export function useTemplates(): NoteTemplate[] | undefined {
  const { isAuthenticated } = useConvexAuth();
  return useQuery(api.shedNoteTemplates.list, isAuthenticated ? {} : 'skip');
}

export type SharedNote = {
  id: string;
  title: string;
  snippet: string;
  updatedAt: number;
  role: 'read' | 'write';
  owner: string | null;
  ownerName: string;
  ownerId: string;
  via: string | null;
};

/** Notes other people shared with you (directly, or through a note that shares its links). */
export function useSharedWithMe(): SharedNote[] | undefined {
  const { isAuthenticated } = useConvexAuth();
  return useQuery(api.shedNoteShares.sharedWithMe, isAuthenticated ? {} : 'skip');
}

/** The address a note's link opens on the website. */
export const noteLinkUrl = (token: string) => `https://www.soniroll.com/note/${token}`;
