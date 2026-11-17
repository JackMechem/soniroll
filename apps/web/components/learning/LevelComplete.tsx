"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { playNote } from "@/lib/tones";
import { PASS_SCORE } from "@/lib/learningPath";

export type LevelResult = {
  levelNumber: number;
  levelTitle: string;
  correct: number;
  total: number;
  score: number;
  stars: number;
  passed: boolean;
  /** First time this level was passed (vs. replaying an already-passed one). */
  firstPass: boolean;
  /** What passing opened up next, if anything. */
  unlocked: { number: number; title: string } | null;
  /** Passing this level finished the whole path. */
  pathDone: boolean;
};

const CONFETTI_COLORS = ["var(--accent)", "#f59e0b", "#22c55e", "#ec4899", "#38bdf8", "#a78bfa"];

/** Fixed pseudo-random confetti (deterministic, so it's the same every render). */
const CONFETTI = Array.from({ length: 48 }, (_, i) => {
  const r = (n: number) => ((Math.sin(i * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1;
  return {
    left: `${r(1) * 100}%`,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    width: 6 + r(2) * 6,
    height: 8 + r(3) * 10,
    delay: `${r(4) * 0.6}s`,
    fall: `${2.2 + r(5) * 1.8}s`,
    drift: `${(r(6) - 0.5) * 30}vw`,
    spin: `${(r(7) - 0.5) * 1440}deg`,
    round: r(8) > 0.7,
  };
});

const PRAISE = ["Nailed it!", "Brilliant ears!", "Level up!", "Superb!", "You're on fire!"];

/** A little rising major arpeggio — the "you did it" sound — in the tool's own tone. */
function playFanfare(toneId: string, stars: number) {
  const notes = ["C5", "E5", "G5", "C6"].concat(stars === 3 ? ["E6"] : []);
  notes.forEach((n, i) => {
    setTimeout(() => playNote(n, i === notes.length - 1 ? 1.6 : 0.5, toneId), i * 110);
  });
}

/**
 * The end-of-level screen. Passing gets the full celebration — confetti, the stars popping in one
 * by one, a fanfare and what just unlocked; falling short gets an encouraging "so close" with
 * exactly how many more were needed, and a retry.
 */
export default function LevelComplete({
  result,
  toneId,
  onNext,
  onRetry,
  onClose,
}: {
  result: LevelResult;
  toneId: string;
  onNext: () => void;
  onRetry: () => void;
  onClose: () => void;
}) {
  const { passed } = result;
  const needed = Math.ceil(PASS_SCORE * result.total);

  useEffect(() => {
    if (passed) playFanfare(toneId, result.stars);
    // Plays once when the screen opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const praise = PRAISE[Math.floor(result.levelNumber + result.correct) % PRAISE.length];

  return createPortal(
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-overlay p-4" role="dialog" aria-modal aria-label={passed ? "Level passed" : "Level result"}>
      {passed && (
        <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
          {CONFETTI.map((c, i) => (
            <span
              key={i}
              className="confetti-piece absolute top-0 block"
              style={
                {
                  left: c.left,
                  width: c.width,
                  height: c.height,
                  background: c.color,
                  borderRadius: c.round ? "9999px" : "2px",
                  "--delay": c.delay,
                  "--fall": c.fall,
                  "--drift": c.drift,
                  "--spin": c.spin,
                  opacity: 0,
                } as React.CSSProperties
              }
            />
          ))}
        </div>
      )}

      <div className="level-rise relative flex w-full max-w-sm flex-col items-center gap-4 rounded-xl bg-surface p-6 text-center shadow-[0_16px_40px_-12px_rgba(0,0,0,0.35)]">
        <p className="text-xs font-medium text-muted">
          Level {result.levelNumber} · {result.levelTitle}
        </p>

        {passed ? (
          <>
            <div className="flex gap-2 text-4xl leading-none">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className={`star-pop ${i < result.stars ? "text-amber-400" : "text-foreground/15"}`}
                  style={{ "--delay": `${0.25 + i * 0.25}s` } as React.CSSProperties}
                >
                  ★
                </span>
              ))}
            </div>
            <h2 className="text-2xl font-semibold tracking-tight">
              {result.pathDone && result.firstPass ? "Path complete!" : praise}
            </h2>
            <p className="text-base">
              <span className="font-medium tabular-nums">
                {result.correct % 1 === 0 ? result.correct : result.correct.toFixed(1)} / {result.total}
              </span>{" "}
              {result.stars === 3 ? "— a perfect run." : "correct."}
            </p>
            {result.firstPass && result.unlocked && (
              <div className="w-full rounded-md bg-foreground/[0.05] px-4 py-3">
                <p className="text-xs font-medium text-muted">Unlocked</p>
                <p className="text-base font-medium">
                  Level {result.unlocked.number}: {result.unlocked.title}
                </p>
              </div>
            )}
            {result.pathDone && result.firstPass && (
              <p className="text-sm text-muted">You&apos;ve passed every level. Seriously impressive ears.</p>
            )}
            {!result.firstPass && result.stars < 3 && (
              <p className="text-sm text-muted">Already passed — go for {result.stars + 1} stars next time.</p>
            )}
          </>
        ) : (
          <>
            <div className="text-4xl" aria-hidden>
              {result.score >= PASS_SCORE - 0.25 ? "🔥" : "💪"}
            </div>
            <h2 className="text-2xl font-semibold tracking-tight">
              {result.score >= PASS_SCORE - 0.25 ? "So close!" : "Keep at it!"}
            </h2>
            <p className="text-base">
              <span className="font-medium tabular-nums">
                {result.correct % 1 === 0 ? result.correct : result.correct.toFixed(1)} / {result.total}
              </span>{" "}
              — you need {needed} to pass.
            </p>
            <p className="text-sm text-muted">Every attempt trains your ear. Give it another go.</p>
          </>
        )}

        <div className="flex w-full flex-col gap-2 pt-1">
          {passed ? (
            // Any pass — 1, 2 or 3 stars — can go straight on or replay the level for a better score.
            <div className="flex w-full gap-2">
              <button type="button" onClick={onRetry} autoFocus={!result.unlocked} className="h-10 flex-1 rounded-md bg-foreground/[0.05] px-4 text-sm font-medium transition-colors hover:bg-surface-hover">
                Restart level
              </button>
              {result.unlocked && (
                <button type="button" onClick={onNext} autoFocus className="h-10 flex-1 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover">
                  Next level
                </button>
              )}
            </div>
          ) : (
            <button type="button" onClick={onRetry} autoFocus className="h-10 rounded-md bg-accent px-6 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover">
              Try again
            </button>
          )}
          <button type="button" onClick={onClose} className="h-9 rounded-md px-6 text-sm font-medium text-muted transition-colors hover:bg-surface-hover hover:text-foreground">
            Back to the path
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
