// Re-export shim: the display rule for practice minutes lives in the shared core package.
export * from "@jam-practice/core/practiceMinutes";
import { formatMinutesShort } from "@jam-practice/core/practiceLog";
import { formatPracticed, practicedMinutes } from "@jam-practice/core/practiceMinutes";

/** Today's time against the goal, in the same "1 h 35 min" form as everywhere else: "15 of 30
    min", "1 h 35 min of 30 min", "45 min of 1 h 30 min" (it used to say "95 of 30 min"). */
export function practicedOfGoal(minutes: number, goal: number): string {
  if (Math.round(minutes) < 60 && goal < 60) return `${practicedMinutes(minutes)} of ${goal} min`;
  return `${formatPracticed(minutes)} of ${formatMinutesShort(goal)}`;
}
