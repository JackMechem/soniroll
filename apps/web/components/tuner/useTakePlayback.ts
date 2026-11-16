"use client";

import { useEffect, useRef, useState } from "react";
import { getAudioContext } from "@/lib/metronome";
import { type PitchTrack, analyseTake, isCurrentTrack } from "@/lib/pitchTrack";
import { TimelinePlayer } from "@/lib/recordingPlayback";
import { type TunerTake, getTakeBlob, updateTakeMeta } from "@/lib/tunerTakes";

/** The take open in the Tuner. `track` grows while its pitch is being worked out. */
export type OpenTake = {
  take: TunerTake;
  /** Its length, once decoded. */
  duration: number | null;
  track: PitchTrack | null;
  error: string | null;
};

/**
 * Playing a take through the Tuner: decode it, play it on a `TimelinePlayer` (seekable, like the
 * recording pages' players), and work out its pitch track (or use the one stored with it).
 */
export function useTakePlayback() {
  const [open, setOpen] = useState<OpenTake | null>(null);
  const [pos, setPos] = useState(0);
  const [playing, setPlaying] = useState(false);
  const player = useRef<TimelinePlayer | null>(null);
  /** Bumped by every open and close, so a slower earlier one gives up. */
  const job = useRef(0);
  const duration = open?.duration ?? 0;

  useEffect(
    () => () => {
      job.current++;
      player.current?.dispose();
    },
    [],
  );

  // While playing: follow the playhead, and stop at the end (or if another player took over).
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const p = player.current;
      if (!p) return;
      const at = p.position();
      if (!p.playing || at >= duration) {
        if (at >= duration) {
          p.pause();
          p.seek(duration);
          setPos(duration);
        } else setPos(at);
        setPlaying(false);
        return;
      }
      setPos(at);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, duration]);

  async function openTake(take: TunerTake) {
    const id = ++job.current;
    player.current?.dispose();
    player.current = null;
    setPlaying(false);
    setPos(0);
    setOpen({ take, duration: null, track: null, error: null });
    const fail = (error: string) => {
      if (job.current === id) setOpen((o) => (o ? { ...o, error } : o));
    };
    const blob = await getTakeBlob(take.id);
    if (job.current !== id) return;
    if (!blob) return fail("This take isn't on this device anymore.");
    let buffer: AudioBuffer;
    try {
      buffer = await getAudioContext().decodeAudioData(await blob.arrayBuffer());
    } catch {
      return fail("This file couldn't be read as audio.");
    }
    if (job.current !== id) return;
    player.current = new TimelinePlayer([{ buffer, start: 0 }]);
    const stored = take.meta.track;
    if (isCurrentTrack(stored)) {
      setOpen((o) => (o ? { ...o, duration: buffer.duration, track: stored } : o));
      return;
    }
    setOpen((o) => (o ? { ...o, duration: buffer.duration } : o));
    // The real length (a browser's own recording often doesn't say), for the list.
    if (Math.abs(take.meta.durationSec - buffer.duration) > 0.05) void updateTakeMeta(take, { durationSec: buffer.duration });
    const track = await analyseTake(
      buffer,
      // A fresh object each time, so the views notice it grew.
      (t) => {
        if (job.current === id) setOpen((o) => (o ? { ...o, track: { ...t } } : o));
      },
      () => job.current !== id,
    );
    if (!track || job.current !== id) return;
    void updateTakeMeta(take, { durationSec: buffer.duration, track });
  }

  function close() {
    job.current++;
    player.current?.dispose();
    player.current = null;
    setPlaying(false);
    setPos(0);
    setOpen(null);
  }

  function toggle() {
    const p = player.current;
    if (!p) return;
    if (playing) {
      p.pause();
      setPos(p.position());
      setPlaying(false);
      return;
    }
    // From the playhead, or from the start if it's at the end.
    p.play(pos >= duration - 0.05 ? 0 : pos);
    setPlaying(true);
  }

  function seek(to: number) {
    const t = Math.min(Math.max(0, to), duration);
    setPos(t);
    player.current?.seek(t);
  }

  function pause() {
    const p = player.current;
    if (!p || !playing) return;
    p.pause();
    setPos(p.position());
    setPlaying(false);
  }

  return { open, pos, playing, openTake, close, toggle, seek, pause };
}
