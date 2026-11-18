"use client";

import { useId } from "react";
import Hint from "@/components/Hint";
import { usePopKey, useReward } from "@/components/reward/Reward";

export default function SwitchRow({
  label,
  checked,
  onChange,
  disabled,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  hint?: string;
}) {
  const id = useId();
  const reward = useReward();
  const pop = usePopKey(String(checked));
  if (reward) {
    // Reward look: the whole row is a bordered row you tap; on, the switch takes the tool's colour.
    return (
      <div className="flex flex-col gap-1">
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-labelledby={id}
          onClick={() => onChange(!checked)}
          disabled={disabled}
          className="relative flex items-center justify-between gap-3 rounded-md bg-foreground/[0.05] py-2 pl-3 pr-2.5 text-left text-sm transition-colors hover:bg-surface-hover disabled:opacity-50"
        >
          <span id={id} className={`font-medium ${checked ? "text-foreground" : "text-muted"}`}>
            {label}
          </span>
          <span
            className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? "" : "bg-foreground/15"}`}
            style={checked ? { background: reward.color } : undefined}
          >
            <span
              key={pop}
              className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-background shadow-sm transition-transform ${checked ? "translate-x-4" : ""} ${pop ? "reward-pop" : ""}`}
            />
          </span>
          {pop > 0 && checked && (
            <span key={`g${pop}`} aria-hidden className="reward-glow pointer-events-none absolute inset-0 rounded-md" style={{ "--reward": reward.color } as React.CSSProperties} />
          )}
        </button>
        {hint && <Hint>{hint}</Hint>}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span id={id} className="font-medium text-muted">
          {label}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-labelledby={id}
          onClick={() => onChange(!checked)}
          disabled={disabled}
          className={`relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
            checked ? "bg-accent" : "bg-foreground/15"
          }`}
        >
          <span
            className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-background shadow-sm transition-transform ${
              checked ? "translate-x-4" : ""
            }`}
          />
        </button>
      </div>
      {hint && <Hint>{hint}</Hint>}
    </div>
  );
}
