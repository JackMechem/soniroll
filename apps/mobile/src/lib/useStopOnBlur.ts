import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';

/**
 * Stops a tool's session when you leave its screen for another one (a screen pushed on top, or
 * going back). For the ear trainers: their rounds only run while their screen is open, and one
 * left running under another screen kept timing out question after question, filing each one as a
 * miss in Struggles (and two trainers could play at once). `stop` must end the session without
 * grading the open question. Opening a sheet or the ? doesn't leave the screen. (The Metronome
 * family and the Slow Downer are meant to keep playing; they don't use this.)
 */
export function useStopOnBlur(running: boolean, stop: () => void) {
  const latest = useRef({ running, stop });
  useEffect(() => {
    latest.current = { running, stop };
  });
  useFocusEffect(
    useCallback(
      () => () => {
        if (latest.current.running) latest.current.stop();
      },
      [],
    ),
  );
}
