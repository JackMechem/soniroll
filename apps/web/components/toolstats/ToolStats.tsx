"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { useRef, useState } from "react";
import { SignInModal } from "@/components/AccountMenu";
import { FlameIcon, burstAt, toastNow } from "@/components/practicelog/Celebrations";
import { SettingChip } from "@/components/SettingsBar";
import { CheckIcon, EyeIcon, EyeOffIcon, findToolLink, PlusIcon, StopwatchIcon } from "@/components/tools";
import { useSyncedSettings } from "@/lib/useSyncedSettings";
import { formatMinutesShort, formatShortDate, hourMilestone, weekdayOf } from "@jam-practice/core/practiceLog";
import { logToolToday, unloggedToday, useLiveToolTime } from "@/lib/toolTime";
import { bestStreak, historyOf, todayKey, toolStreak, totalMs, useToolUsage, usedMs, weekOf } from "@/lib/toolUsage";

/** Whether the stats pills are hidden (one switch for every tool, like the Shed Log's). */
const VIEW_KEY = "jam-practice-tool-stats";
const VIEW_DEFAULTS = { hidden: false };

const WEEKDAY_LETTER = ["S", "M", "T", "W", "T", "F", "S"];
const PILL = "flex h-11 shrink-0 snap-start items-center gap-2 rounded-full bg-surface pl-1.5 pr-3.5 transition-colors hover:bg-surface-hover sm:h-12 sm:gap-2.5 sm:pr-4";

/** "38 s" under a minute, then "12 min", "1 h 5 min". */
function formatUse(ms: number) {
  if (ms < 60_000) return `${Math.floor(ms / 1000)} s`;
  return formatMinutesShort(Math.floor(ms / 60_000));
}

/**
 * A tool's own stats, as Shed Log-style pills beside its title: its streak (days in a row you used
 * it), today (ticking while it runs), this week, in total, its history, and the button that puts
 * today's time into the Shed Log. Data from `lib/toolUsage.ts`; nothing renders until it's loaded.
 */
export default function ToolStats({ href }: { href: string }) {
  const { isAuthenticated } = useConvexAuth();
  const [usage, ready] = useToolUsage();
  const { liveMs, running } = useLiveToolTime(href);
  const [signIn, setSignIn] = useState(false);
  const [{ hidden }, setView, viewReady] = useSyncedSettings(VIEW_KEY, VIEW_DEFAULTS);
  const logRef = useRef<HTMLButtonElement>(null);
  if (!ready || !viewReady) return null;

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
    <div className="-mx-4 flex snap-x scroll-px-4 items-center gap-2 overflow-x-auto px-4 py-1 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
      {hidden && (
        <button
          type="button"
          onClick={() => setView({ hidden: false })}
          className="order-1 flex h-11 shrink-0 snap-start items-center gap-2 rounded-full bg-surface px-4 text-sm font-semibold hover:bg-surface-hover sm:h-12"
          title="Show stats"
        >
          <FlameIcon className="h-4 w-4 text-orange-500" /> {s}
          <span className="flex items-center gap-1 text-muted">
            <EyeIcon className="h-4 w-4" /> Show stats
          </span>
        </button>
      )}
      {!hidden && (
      <>
      {/* Streak */}
      <div
        className={`${PILL} order-1 cursor-default hover:bg-surface`}
        title={usedToday ? `${s}-day ${link?.label ?? ""} streak` : s > 0 ? `Use it today to keep your ${s}-day streak` : "Use it for a minute today to start a streak"}
      >
        <span
          className={`flex h-9 w-9 items-center justify-center rounded-full ${usedToday ? "text-white" : s > 0 ? "text-orange-500" : "text-muted"}`}
          style={{ background: usedToday ? "linear-gradient(160deg, #fb923c, #ef4444)" : "color-mix(in srgb, #f97316 14%, transparent)" }}
        >
          <FlameIcon className={`h-5 w-5 ${usedToday ? "log-flame" : ""}`} />
        </span>
        <span className="flex flex-col items-start leading-tight">
          <span key={s} className="log-check text-base font-extrabold tabular-nums">{s}</span>
          <span className={`whitespace-nowrap text-[11px] font-semibold ${!usedToday && s > 0 ? "text-orange-500" : "text-muted"}`}>
            {!usedToday && s > 0 ? "keep it alive" : "day streak"}
          </span>
        </span>
      </div>

      {/* Today */}
      <div className={`${PILL} order-2 cursor-default hover:bg-surface`} title={running ? "Counting while it runs" : "Time the tool actually ran today"}>
        <span className="relative flex h-9 w-9 items-center justify-center rounded-full" style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}>
          <StopwatchIcon className="h-5 w-5" />
          {running && (
            <span className="absolute right-0 top-0 flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" style={{ background: color }} />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ background: color }} />
            </span>
          )}
        </span>
        <span className="flex flex-col items-start leading-tight">
          <span className="whitespace-nowrap text-base font-extrabold tabular-nums">{formatUse(todayMs)}</span>
          <span className="whitespace-nowrap text-[11px] font-semibold text-muted">{running ? "counting…" : "today"}</span>
        </span>
      </div>

      {/* This week */}
      <div className={`${PILL} order-4 cursor-default pl-4 hover:bg-surface`} title="This week">
        <span className="flex h-7 items-end gap-[3px]">
          {week.map((d) => (
            <span
              key={d.key}
              className={`w-1.5 rounded-sm ${d.ms >= 60_000 ? "" : "bg-background"} ${d.key === today ? "ring-1 ring-foreground/30" : ""}`}
              style={{ height: `${Math.max(d.ms > 0 ? 25 : 12, (d.ms / maxDay) * 100)}%`, ...(d.ms >= 60_000 ? { background: color } : {}) }}
            />
          ))}
        </span>
        <span className="flex flex-col items-start leading-tight">
          <span className="whitespace-nowrap text-base font-extrabold tabular-nums">{formatUse(weekMs)}</span>
          <span className="text-[11px] font-semibold text-muted">this week</span>
        </span>
      </div>

      {/* In total, with the ring filling toward the next hour milestone; opens the history. */}
      <div className="order-5 flex shrink-0">
      <SettingChip
        icon={StopwatchIcon}
        label="History"
        title={`${link?.label ?? "Tool"} history`}
        trigger={{
          className: `${PILL} w-full`,
          content: (
            <>
              <span className="flex h-9 w-9 items-center justify-center rounded-full" style={{ background: `conic-gradient(${color} ${Math.min(100, ((hours - ms.from) / (ms.to - ms.from)) * 100)}%, var(--background) 0)` }}>
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface text-[10px] font-extrabold">h</span>
              </span>
              <span className="flex flex-col items-start leading-tight">
                <span className="whitespace-nowrap text-base font-extrabold tabular-nums">{hours < 10 ? (Math.round(hours * 10) / 10).toFixed(1) : Math.floor(hours)} h</span>
                <span className="whitespace-nowrap text-[11px] font-semibold text-muted">in total</span>
              </span>
            </>
          ),
        }}
      >
        <div className="grid grid-cols-3 gap-2">
          <MiniStat value={String(s)} label="streak" />
          <MiniStat value={String(best)} label="best streak" />
          <MiniStat value={String(history.filter((d) => d.ms >= 60_000).length)} label="days used" />
        </div>
        <p className="text-xs text-muted">
          {hours < ms.to ? `${formatMinutesShort(Math.max(1, Math.round((ms.to - hours) * 60)))} to ${ms.to} hours.` : ""} A day counts toward the streak after a
          minute of real use.
        </p>
        {history.length === 0 ? (
          <p className="rounded-2xl bg-background p-4 text-center text-sm text-muted">Nothing yet. Start the tool and your time shows up here.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {history.slice(0, 60).map((d) => {
              const max = Math.max(...history.slice(0, 60).map((x) => x.ms));
              const all = d.logged >= d.ms - 999;
              return (
                <li key={d.key} className="flex items-center gap-3 rounded-xl bg-background px-3 py-2">
                  <span className="w-20 shrink-0 text-sm font-semibold">
                    {d.key === today ? "Today" : formatShortDate(d.key)}
                    <span className="ml-1 text-xs font-normal text-muted">{WEEKDAY_LETTER[weekdayOf(d.key)]}</span>
                  </span>
                  <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface">
                    <span className="block h-full rounded-full" style={{ width: `${Math.max(4, (d.ms / max) * 100)}%`, background: color }} />
                  </span>
                  <span className="w-16 shrink-0 text-right text-sm font-bold tabular-nums">{formatUse(d.ms)}</span>
                  <span className={`flex w-5 shrink-0 justify-center ${all ? "text-emerald-500" : "text-muted/50"}`} title={all ? "In the Shed Log" : d.logged ? `${formatUse(d.logged)} in the Shed Log` : "Not in the Shed Log"}>
                    {all ? <CheckIcon className="h-4 w-4" /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </SettingChip>
      </div>
      <button
        type="button"
        onClick={() => setView({ hidden: true })}
        aria-label="Hide stats"
        title="Hide stats"
        className="order-7 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface hover:text-foreground"
      >
        <EyeOffIcon className="h-4 w-4" />
      </button>
      </>
      )}

      {/* Log today's time into the Shed Log (third, so it's in view even when the row scrolls). */}
      {unlogged >= 1000 ? (
        <button
          ref={logRef}
          type="button"
          onClick={log}
          className="order-3 flex h-11 shrink-0 snap-start items-center gap-2 rounded-full bg-accent pl-1.5 pr-4 text-accent-foreground shadow-sm transition hover:bg-accent-hover active:scale-[0.97] sm:h-12"
          title="Add today's time in this tool to your Shed Log"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-foreground/15 sm:h-9 sm:w-9">
            <PlusIcon className="h-4 w-4" />
          </span>
          <span className="flex flex-col items-start leading-tight">
            <span className="whitespace-nowrap text-sm font-extrabold tabular-nums">Log {formatUse(unlogged)}</span>
            <span className="whitespace-nowrap text-[11px] font-semibold opacity-80">{isAuthenticated ? "to Shed Log" : "sign in to log"}</span>
          </span>
        </button>
      ) : (
        <span
          className={`order-3 flex h-11 shrink-0 snap-start items-center gap-2 rounded-full pl-1.5 pr-4 sm:h-12 ${todayMs >= 1000 ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-surface text-muted"}`}
          title={todayMs >= 1000 ? "Today's time is in your Shed Log" : "Start the tool, then log your time"}
        >
          <span className={`flex h-8 w-8 items-center justify-center rounded-full sm:h-9 sm:w-9 ${todayMs >= 1000 ? "bg-emerald-500 text-white" : "bg-background"}`}>
            <CheckIcon className="h-4 w-4" />
          </span>
          <span className="flex flex-col items-start leading-tight">
            <span className="whitespace-nowrap text-sm font-extrabold">{todayMs >= 1000 ? "Logged" : "Log"}</span>
            <span className="whitespace-nowrap text-[11px] font-semibold opacity-80">{todayMs >= 1000 ? "in Shed Log" : "nothing yet"}</span>
          </span>
        </span>
      )}
      {signIn && <SignInModal initialFlow="signIn" onClose={() => setSignIn(false)} />}
    </div>
  );
}

function MiniStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center rounded-2xl bg-background px-2 py-3">
      <span className="text-xl font-extrabold tabular-nums">{value}</span>
      <span className="text-[11px] font-semibold text-muted">{label}</span>
    </div>
  );
}
