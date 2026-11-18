"use client";

import Hint from "@/components/Hint";
import { Sparkle, usePopKey, useReward } from "@/components/reward/Reward";

/** A labeled range slider with a live numeric readout. Shared by the drill-style trainers. */
export default function AdvancedSlider({
  label,
  value,
  unit,
  min,
  max,
  step,
  hint,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  step: number;
  hint?: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  const reward = useReward();
  const pop = usePopKey(String(value));
  // A ✦ when it lands on a round number (or all the way up).
  const round = value === max || (max - min >= 20 && value % 10 === 0) || (max - min < 20 && max - min >= 5 && value % 5 === 0);
  return (
    <label className="flex flex-col gap-2 text-sm">
      <span className="flex items-center justify-between text-xs font-medium text-muted">
        {label}
        {reward ? (
          <span className="flex items-center gap-1.5">
            <Sparkle show={round && !disabled} at={value} color={reward.color} />
            <span key={pop} className={`rounded-md bg-foreground/[0.05] px-2 py-0.5 text-sm font-semibold tabular-nums ${pop ? "reward-pop" : ""}`}>
              {value}
              {unit}
            </span>
          </span>
        ) : (
          <span className="tabular-nums text-foreground">
            {value}
            {unit}
          </span>
        )}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        style={
          {
            "--progress": `${((value - min) / (max - min)) * 100}%`,
          } as React.CSSProperties
        }
        className="slider h-6 w-full cursor-pointer disabled:cursor-default disabled:opacity-60"
      />
      {hint && <Hint>{hint}</Hint>}
    </label>
  );
}
