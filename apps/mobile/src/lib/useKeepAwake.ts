import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useEffect, useId } from 'react';

/**
 * Keeps the phone's screen on while `active` — a tool running (the Metronome playing, a trainer's
 * round going, the Tuner listening, a take recording, the Practice Timer counting) — and lets it
 * sleep again once it stops or the screen closes. Each caller holds its own tag, so two tools
 * running at once (a timer under a metronome) each keep it on until both stop.
 */
export function useKeepAwakeWhile(active: boolean) {
  const tag = `tool-${useId()}`;
  useEffect(() => {
    if (!active) return;
    activateKeepAwakeAsync(tag).catch(() => {});
    return () => {
      deactivateKeepAwake(tag).catch(() => {});
    };
  }, [active, tag]);
}
