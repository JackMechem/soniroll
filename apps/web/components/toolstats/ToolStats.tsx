"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { useRef, useState } from "react";
import { SignInModal } from "@/components/AccountMenu";
import { FlameIcon, burstAt, toastNow } from "@/components/practicelog/Celebrations";
import { SettingChip } from "@/components/SettingsBar";
import { CheckIcon, findToolLink, PlusIcon, StopwatchIcon } from "@/components/tools";
import { formatMinutesShort, formatShortDate, hourMilestone, weekdayOf } from "@jam-practice/core/practiceLog";
import { logToolToday, unloggedToday, useLiveToolTime } from "@/lib/toolTime";
import { bestStreak, historyOf, todayKey, toolStreak, totalMs, useToolUsage, usedMs, weekOf } from "@/lib/toolUsage";

const WEEKDAY_LETTER = ["S", "M", "T", "W", "T", "F", "S"];
const CHIP = "flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-foreground/[0.05] px-3 text-sm transition-colors hover:bg-surface-hover";

/** "38 s" under a minute, then "12 min", "1 h 5 min". */
function formatUse(ms: number) {
  if (ms < 60_000) return `${Math.floor(ms / 1000)} s`;
  return formatMinutesShort(Math.floor(ms / 60_000));
}

/**
 * A tool's own stats beside its title, kept small: one button with today's time (ticking while it
 * runs) and the streak, which opens the rest (best streak, this week, in total, the history), and
 * the button that puts today's time into the Shed Log. Data from `lib/toolUsage.ts`; nothing
 * renders until it's loaded.
 */
export default function ToolStats({ href }: { href: string }) {
  const { isAuthenticated } = useConvexAuth();
  const [usage, ready] = useToolUsage();
  const { liveMs, running } = useLiveToolTime(href);
  const [signIn, setSignIn] = useState(false);
  const logRef = useRef<HTMLButtonElement>(null);
  if (!ready) return null;

  const link = findToolLink(href);
  const color = "var(--accent)";
  const today = todayKey();
  const todayMs = usedMs(usage, href, today) + liveMs;
  const usedToday = todayMs >= 60_000;
  const s = toolStreak(usage, href, today, liveMs);
  const week = weekOf(usage, href, today, liveMs);
  const weekMs = week.reduce((a, d) => a + d.ms, 0);
  const maxDay = Math.max(...week.map((d) => d.ms), 60_000);
  const hours = (totalMs(usage, href) + liveMs) / 3_600_000;
  const ms = hourMilestone(hours);
  const unlogged = unloggedToday(usage, href, liveMs);
  const history = historyOf(usage, href);
  const best = Math.max(bestStreak(usage, href), s);

  function log() {
    if (!isAuthenticated) {
      setSignIn(true);
      return;
    }
    const amount = logToolToday(usage, href);
    if (!amount) return;
    if (logRef.current) burstAt(logRef.current, color);
    toastNow(`${formatUse(amount)} logged`, `Your ${link?.label ?? "tool"} time is in today's Shed Log.`);
  }

  return (
    <div className="flex items-center gap-2">
      {/* One small button: today's time (a dot while it counts). It opens the streak, the week
          and the history. */}
      <SettingChip
        icon={StopwatchIcon}
        label="History"
        title={`${link?.label ?? "Tool"} history`}
        trigger={{
          className: CHIP,
          content: (
            <>
              <StopwatchIcon className="h-4 w-4 shrink-0 text-muted" />
              <span className="whitespace-nowrap tabular-nums">{formatUse(todayMs)}</span>
              <span className="whitespace-nowrap text-muted">{running ? "counting" : "today"}</span>
              {running && <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-accent" />}
              {s > 0 && (
                <span className={`flex items-center gap-0.5 tabular-nums ${usedToday ? "text-orange-500" : "text-muted"}`} title={`${s}-day streak`}>
                  <FlameIcon className="h-3.5 w-3.5" />
                  {s}
                </span>
              )}
            </>
          ),
        }}
      >
        <div className="grid grid-cols-4 gap-2">
          <MiniStat value={String(s)} label="streak" />
          <MiniStat value={String(best)} label="best" />
          <MiniStat value={formatUse(weekMs)} label="this week" />
          <MiniStat value={`${hours < 10 ? (Math.round(hours * 10) / 10).toFixed(1) : Math.floor(hours)} h`} label="in total" />
        </div>
        <div className="flex h-10 items-end gap-1" title="This week">
          {week.map((d) => (
            <span
              key={d.key}
              className={`flex-1 rounded-sm ${d.ms >= 60_000 ? "" : "bg-foreground/10"} ${d.key === today ? "ring-1 ring-foreground/30" : ""}`}
              style={{ height: `${Math.max(d.ms > 0 ? 25 : 12, (d.ms / maxDay) * 100)}%`, ...(d.ms >= 60_000 ? { background: color } : {}) }}
            />
          ))}
        </div>
        <p className="text-xs text-muted">
          {hours < ms.to ? `${formatMinutesShort(Math.max(1, Math.round((ms.to - hours) * 60)))} to ${ms.to} hours.` : ""} A day counts toward the streak after a
          minute of real use.
        </p>
        {history.length === 0 ? (
          <p className="rounded-md border border-dashed border-foreground/15 p-4 text-center text-sm text-muted">Nothing yet. Start the tool and your time shows up here.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-foreground/10 rounded-md bg-foreground/[0.05]">
            {history.slice(0, 60).map((d) => {
              const max = Math.max(...history.slice(0, 60).map((x) => x.ms));
              const all = d.logged >= d.ms - 999;
              return (
                <li key={d.key} className="flex items-center gap-3 px-3 py-2">
                  <span className="w-20 shrink-0 text-sm font-medium">
                    {d.key === today ? "Today" : formatShortDate(d.key)}
                    <span className="ml-1 text-xs font-normal text-muted">{WEEKDAY_LETTER[weekdayOf(d.key)]}</span>
                  </span>
                  <span className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-foreground/10">
                    <span className="block h-full rounded-full" style={{ width: `${Math.max(4, (d.ms / max) * 100)}%`, background: color }} />
                  </span>
                  <span className="w-16 shrink-0 text-right text-sm tabular-nums">{formatUse(d.ms)}</span>
                  <span className={`flex w-5 shrink-0 justify-center ${all ? "text-emerald-500" : "text-muted/50"}`} title={all ? "In the Shed Log" : d.logged ? `${formatUse(d.logged)} in the Shed Log` : "Not in the Shed Log"}>
                    {all ? <CheckIcon className="h-4 w-4" /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </SettingChip>

      {/* Log today's time into the Shed Log; "Logged" once it's all in. */}
      {unlogged >= 1000 ? (
        <button
          ref={logRef}
          type="button"
          onClick={log}
          className="flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-accent px-3 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover"
          title={isAuthenticated ? "Add today's time in this tool to your Shed Log" : "Sign in to log your time"}
        >
          <PlusIcon className="h-4 w-4" />
          <span className="whitespace-nowrap tabular-nums">Log {formatUse(unlogged)}</span>
        </button>
      ) : (
        todayMs >= 1000 && (
          <span className="flex h-8 shrink-0 items-center gap-1 px-1 text-sm text-muted" title="Today's time is in your Shed Log">
            <CheckIcon className="h-4 w-4 text-emerald-500" /> Logged
          </span>
        )
      )}
      {signIn && <SignInModal initialFlow="signIn" onClose={() => setSignIn(false)} />}
    </div>
  );
}

function MiniStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center rounded-md bg-foreground/[0.05] px-2 py-2">
      <span className="text-base font-semibold tabular-nums">{value}</span>
      <span className="text-[11px] text-muted">{label}</span>
    </div>
  );
}
