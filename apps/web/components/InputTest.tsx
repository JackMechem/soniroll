"use client";

import { useEffect, useRef, useState } from "react";
import { AudioInput, startAudioInput } from "@/lib/audioInput";
import { describePitch } from "@/lib/noteGrade";

type Reading = { note: string; cents: number; freq: number };

/** How long the last note stays on screen after the sound stops, so it's readable. */
const HOLD_MS = 700;
const IN_TUNE_CENTS = 15;

/** Maps an RMS level to 0–1 on a decibel scale (-60 dB to -10 dB). */
function levelToMeter(rms: number) {
  if (rms <= 0) return 0;
  return Math.min(1, Math.max(0, (20 * Math.log10(rms) + 60) / 50));
}

/** Opens the chosen input and shows the note being played, like a tuner. */
export default function InputTest({
  deviceId,
  disabled,
  silenceRms,
  refA,
}: {
  deviceId: string;
  disabled?: boolean;
  /** Quietest signal to treat as sound (matches the listen-mode sensitivity). */
  silenceRms?: number;
  refA?: number;
}) {
  const settingsRef = useRef({ silenceRms, refA });
  useEffect(() => {
    settingsRef.current = { silenceRms, refA };
  });
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState<Reading | null>(null);
  const [level, setLevel] = useState(0);
  const active = testing && !disabled;
  const lastSeen = useRef(0);
  const candidate = useRef<{ note: string; frames: number } | null>(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let input: AudioInput | null = null;

    startAudioInput(
      deviceId,
      ({ freq, level: rms }) => {
        setLevel(levelToMeter(rms));
        const now = performance.now();
        if (freq === null) {
          candidate.current = null;
          if (now - lastSeen.current > HOLD_MS) setReading(null);
          return;
        }
        const pitch = describePitch(freq, settingsRef.current.refA);
        // Wait for two agreeing frames so a plucked note's attack doesn't flicker.
        const c = candidate.current;
        candidate.current =
          c && c.note === pitch.note
            ? { note: c.note, frames: c.frames + 1 }
            : { note: pitch.note, frames: 1 };
        if (candidate.current.frames < 2) return;
        lastSeen.current = now;
        setReading({ ...pitch, freq });
      },
      () => settingsRef.current.silenceRms ?? 0.008,
    )
      .then((i) => {
        if (cancelled) i.stop();
        else input = i;
      })
      .catch(() => {
        if (cancelled) return;
        setError("Couldn't open the audio input. Check the browser's microphone permission.");
        setTesting(false);
      });

    return () => {
      cancelled = true;
      input?.stop();
    };
  }, [active, deviceId]);

  function toggle() {
    setError(null);
    setReading(null);
    setLevel(0);
    candidate.current = null;
    setTesting((t) => !t);
  }

  const shown = active ? reading : null;
  const inTune = shown ? Math.abs(shown.cents) <= IN_TUNE_CENTS : false;
  const markerColor = inTune ? "#22c55e" : "#f59e0b";

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={toggle}
        disabled={disabled}
        className={`h-9 rounded-md border px-3 text-sm font-medium transition-colors disabled:opacity-50 ${
          active ? "border-accent bg-accent text-accent-foreground hover:bg-accent-hover" : "border-foreground/15 hover:bg-surface-hover"
        }`}
      >
        {active ? "Stop testing" : "Test input"}
      </button>
      {error && <p className="text-xs text-danger">{error}</p>}

      {active && (
        <div className="flex flex-col items-center gap-3 rounded-lg bg-background p-4 text-center">
          <div className="flex h-16 flex-col items-center justify-center">
            {shown ? (
              <>
                <span
                  className="text-5xl font-semibold tabular-nums"
                  style={{ color: inTune ? markerColor : undefined }}
                >
                  {shown.note}
                </span>
                <span className="text-xs tabular-nums text-muted">
                  {shown.freq.toFixed(1)} Hz · {shown.cents > 0 ? "+" : ""}
                  {shown.cents}¢
                </span>
              </>
            ) : (
              <span className="text-sm text-muted">Play a note…</span>
            )}
          </div>

          <div
            className="relative h-1.5 w-full rounded-full bg-foreground/10"
            role="meter"
            aria-label="Tuning offset"
            aria-valuemin={-50}
            aria-valuemax={50}
            aria-valuenow={shown?.cents ?? 0}
          >
            <div className="absolute left-1/2 top-[-3px] h-[14px] w-px bg-muted/60" />
            {shown && (
              <div
                className="absolute top-1/2 h-4 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full transition-[left] duration-100"
                style={{ left: `${50 + shown.cents}%`, background: markerColor }}
              />
            )}
          </div>
          <div className="-mt-2 flex w-full justify-between text-[0.65rem] text-muted">
            <span>flat</span>
            <span>sharp</span>
          </div>

          <div className="flex w-full items-center gap-2 text-xs text-muted">
            <span>Level</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/10">
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-75"
                style={{ width: `${level * 100}%` }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
