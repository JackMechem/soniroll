"use client";

import { useEffect, useRef, useState } from "react";
import LoadingSpinner from "@/components/LoadingSpinner";
import { PauseIcon, PlayIcon } from "@/components/tools";
import { type LoadedAudio, TimelinePlayer, loadAudio } from "@/lib/recordingPlayback";
import { formatDuration } from "@/lib/recordings";

/**
 * One take on its own: Play/Pause, a scrubber and the times. The file is downloaded and decoded on
 * the first Play and played with Web Audio, because a take recorded in the browser (WebM) has no
 * duration or seek index — the browser's own `<audio>` player can't scrub it (Firefox shows the
 * playhead stuck at the end). `durationSec` (stored with the take) shows the length before then.
 */
export default function TakePlayer({ url, durationSec, compact = false }: { url: string; durationSec?: number; compact?: boolean }) {
  const [audio, setAudio] = useState<LoadedAudio | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pos, setPos] = useState(0);
  const [playing, setPlaying] = useState(false);
  const player = useRef<TimelinePlayer | null>(null);
  const dur = audio?.buffer.duration ?? durationSec ?? 0;

  useEffect(() => () => player.current?.dispose(), []);

  // While playing: follow the playhead, and stop at the end (or if another player took over).
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const p = player.current;
      if (!p) return;
      const at = p.position();
      if (!p.playing || at >= dur) {
        if (at >= dur) {
          p.pause();
          p.seek(0);
          setPos(0);
        } else setPos(at);
        setPlaying(false);
        return;
      }
      setPos(at);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, dur]);

  async function ready(): Promise<TimelinePlayer | null> {
    if (player.current) return player.current;
    setLoading(true);
    setError(null);
    try {
      const loaded = await loadAudio(url);
      setAudio(loaded);
      player.current = new TimelinePlayer([{ buffer: loaded.buffer, start: 0 }]);
      return player.current;
    } catch (e) {
      setError((e as Error).message || "Couldn't load the recording.");
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function toggle() {
    if (playing) {
      player.current?.pause();
      setPos(player.current?.position() ?? pos);
      setPlaying(false);
      return;
    }
    const p = await ready();
    if (!p) return;
    // From where the scrubber is — or from the start if it's at the end.
    const total = (await loadAudio(url)).buffer.duration;
    p.play(pos >= total - 0.05 ? 0 : pos);
    setPlaying(true);
  }

  function seek(to: number) {
    setPos(to);
    player.current?.seek(to);
  }

  const progress = dur > 0 ? Math.min(100, (pos / dur) * 100) : 0;
  return (
    <div className={`flex flex-col gap-1 ${compact ? "" : "rounded-lg bg-surface p-2"}`}>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void toggle()}
          aria-label={playing ? "Pause" : "Play"}
          className={`flex shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground hover:bg-accent-hover ${compact ? "h-9 w-9" : "h-11 w-11"}`}
        >
          {loading ? <LoadingSpinner size="sm" inline label="Loading" /> : playing ? <PauseIcon className="h-4 w-4" /> : <PlayIcon className="ml-0.5 h-4 w-4" />}
        </button>
        <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted">{formatDuration(pos)}</span>
        <input
          type="range"
          className="slider min-w-0 flex-1"
          min={0}
          max={Math.max(0.01, dur)}
          step={0.01}
          value={Math.min(pos, dur)}
          onChange={(e) => seek(Number(e.target.value))}
          aria-label="Position"
          style={{ "--progress": `${progress}%` } as React.CSSProperties}
        />
        <span className="w-10 shrink-0 text-xs tabular-nums text-muted">{dur > 0 ? formatDuration(dur) : "–:––"}</span>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
