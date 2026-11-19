import { useCallback, useEffect, useRef, useState } from 'react';

/** Saves a moment after the last change, and on leaving — the website's `useAutosave`
    (`apps/web/components/bassgenius/TranscriptionEditor.tsx`), for Score Writer and transcriptions. */
export function useAutosave<T>(onSave: (value: T) => Promise<void>) {
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'unsaved' | 'error'>('saved');
  const pending = useRef<T | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRef = useRef(onSave);
  useEffect(() => {
    saveRef.current = onSave;
  });
  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const value = pending.current;
    if (value === null) return;
    pending.current = null;
    setSaveState('saving');
    saveRef.current(value)
      .then(() => setSaveState(pending.current === null ? 'saved' : 'unsaved'))
      .catch(() => setSaveState('error'));
  }, []);
  const change = useCallback(
    (value: T) => {
      pending.current = value;
      setSaveState('unsaved');
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, 800);
    },
    [flush],
  );
  useEffect(() => () => flush(), [flush]);
  return { change, flush, saveState };
}

export const SAVE_LABEL = { saving: 'Saving…', unsaved: 'Unsaved', error: "Couldn't save — retrying on next change", saved: 'Saved' } as const;
