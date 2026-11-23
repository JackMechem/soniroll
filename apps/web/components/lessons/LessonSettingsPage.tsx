"use client";

import { CapIcon } from "@/components/lessons/parts";
import PageBar from "@/components/PageBar";
import { useConvexAuth } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import { useMemo, useState, type ReactNode } from "react";
import { api } from "@jam-practice/convex/_generated/api";
import LoadingSpinner from "@/components/LoadingSpinner";
import SwitchRow from "@/components/SwitchRow";
import { Hero, LibraryPage } from "@/components/library/ui";
import { btnPrimary, btnSecondary, errorText, field } from "@/components/lessons/parts";
import { SlotGrid, localTz } from "@/components/lessons/schedule";
import { SignInButtons } from "@/components/practicelog/ShedLogGate";
import { CalendarIcon, CloseIcon, PlusIcon } from "@/components/tools";
import { FEATURE_INFO } from "@jam-practice/core/lessonFiles";
import {
  DEFAULT_AVAILABILITY,
  LESSON_LENGTHS,
  WEEKDAYS,
  cleanAvailability,
  hhmmOf,
  minutesOf,
  openSlots,
  zoneName,
  type Availability,
  type WeeklyWindow,
} from "@jam-practice/core/lessonSchedule";

const timeField = field.replace("w-full", "w-36");

/** Monday first, the way most weeks are planned. */
const WEEK = [1, 2, 3, 4, 5, 6, 0];

function allZones(current: string): string[] {
  let zones: string[] = [];
  try {
    zones = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
  } catch {
    zones = [];
  }
  return zones.includes(current) ? zones : [current, ...zones];
}

/**
 * `/lessons/settings` — which parts of Lessons a teacher uses (feature switches), then their usual teaching hours (time ranges per weekday, in their time
 * zone), lesson length, a gap between lessons, how much notice and how far ahead, days off, and
 * whether students can request times. A preview shows the next open times as students see them.
 */
export default function LessonSettingsPage() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const saved = useQuery(api.lessonSchedule.myAvailability, isAuthenticated ? {} : "skip");
  const save = useMutation(api.lessonSchedule.saveAvailability);
  const features = useQuery(api.lessons.myFeatures, isAuthenticated ? {} : "skip");
  const setFeatures = useMutation(api.lessons.setFeatures);
  const [draft, setDraft] = useState<Availability | null>(null);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [dayOff, setDayOff] = useState("");
  const [now] = useState(() => Date.now());

  // Start editing from what's saved (or sensible defaults), once it has loaded.
  if (draft === null && saved !== undefined && isAuthenticated) {
    setDraft(saved ? cleanAvailability(saved, saved.timeZone) : { ...DEFAULT_AVAILABILITY, timeZone: localTz() });
  }

  const preview = useMemo(() => (draft ? openSlots(draft, [], now).slice(0, 60) : []), [draft, now]);
  const zones = useMemo(() => allZones(draft?.timeZone ?? "UTC"), [draft?.timeZone]);

  if (isLoading || (isAuthenticated && (!draft || !features))) {
    return (
      <LibraryPage>
        <PageBar crumbs={[{ label: "Lessons", href: "/lessons" }, { label: "Lesson settings" }]} icon={CapIcon} />
        <div className="flex justify-center py-24">
          <LoadingSpinner />
        </div>
      </LibraryPage>
    );
  }
  if (!isAuthenticated || !draft || !features) {
    return (
      <LibraryPage>
        <Hero title="Lesson settings" icon={CapIcon} crumbs={[{ label: "Lessons", href: "/lessons" }]} subtitle="Sign in to set up your lessons.">
          <SignInButtons />
        </Hero>
      </LibraryPage>
    );
  }

  function patch(p: Partial<Availability>) {
    setDraft((d) => (d ? { ...d, ...p } : d));
    setDirty(true);
    setStatus(null);
  }
  const windows = draft.windows;
  const setWindows = (w: WeeklyWindow[]) => patch({ windows: w });
  const dayWindows = (wd: number) => windows.map((w, i) => ({ w, i })).filter((x) => x.w.weekday === wd);

  function addRange(wd: number) {
    const mine = dayWindows(wd).map((x) => x.w);
    const last = mine.at(-1);
    const start = last ? Math.min(minutesOf(last.end === "24:00" ? "23:59" : last.end) + 60, 22 * 60) : 15 * 60;
    setWindows([...windows, { weekday: wd, start: hhmmOf(start), end: hhmmOf(Math.min(start + 3 * 60, 24 * 60 - 1)) }]);
  }
  function copyToWeekdays(wd: number) {
    const mine = dayWindows(wd).map((x) => x.w);
    const others = [1, 2, 3, 4, 5].filter((d) => d !== wd);
    setWindows([...windows.filter((w) => !others.includes(w.weekday)), ...others.flatMap((d) => mine.map((w) => ({ ...w, weekday: d })))]);
  }

  async function submit() {
    if (!draft) return;
    const bad = draft.windows.find((w) => minutesOf(w.end) <= minutesOf(w.start));
    if (bad) {
      setStatus({ ok: false, text: `On ${WEEKDAYS[bad.weekday]}, a range ends before it starts.` });
      return;
    }
    setBusy(true);
    try {
      await save(draft);
      setDirty(false);
      setStatus({ ok: true, text: "Saved." });
    } catch (e) {
      setStatus({ ok: false, text: errorText(e, "Couldn't save.") });
    } finally {
      setBusy(false);
    }
  }

  const hours = windows.reduce((n, w) => n + (minutesOf(w.end) - minutesOf(w.start)) / 60, 0);

  return (
    <LibraryPage>
      <Hero title="Lesson settings" icon={CapIcon} crumbs={[{ label: "Lessons", href: "/lessons" }]} subtitle="What your students get, and when they can book." />

      <Section
        title="Features"
        description="For all your students. Turning one off hides it for you and them — nothing is deleted, and turning it back on brings it all back. (Routines that are off leave their Shed Logs; the days they logged stay.)"
        flush
      >
        <div className="flex flex-col divide-y divide-foreground/10">
          {FEATURE_INFO.map((f) => (
            <div key={f.id} className="flex items-start gap-3 px-4 py-3 sm:px-5">
              <button
                type="button"
                role="switch"
                aria-checked={features[f.id]}
                aria-label={f.label}
                onClick={() => void setFeatures({ features: { [f.id]: !features[f.id] } })}
                className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors ${features[f.id] ? "bg-accent" : "bg-foreground/15"}`}
              >
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${features[f.id] ? "left-[1.125rem]" : "left-0.5"}`} />
              </button>
              <span className="min-w-0">
                <span className={`block text-sm font-medium ${features[f.id] ? "" : "text-muted"}`}>{f.label}</span>
                <span className="block text-xs text-muted">{f.text}</span>
              </span>
            </div>
          ))}
        </div>
      </Section>

      {!features.scheduling ? (
        <p className="rounded-lg border border-dashed border-foreground/15 p-6 text-sm text-muted">Lesson booking is off — turn it on above to set your teaching hours.</p>
      ) : (
        <>
          <div id="hours" className="flex scroll-mt-6 flex-wrap items-center justify-between gap-3 border-t border-foreground/10 pt-6">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
                <CalendarIcon className="h-4 w-4 text-muted" /> Teaching hours
              </h2>
              <p className="text-sm text-muted">
                {windows.length
                  ? `${Math.round(hours * 10) / 10} hours a week · ${draft.lengthMin}-minute lessons`
                  : "When you usually teach — students request lessons from these times."}
              </p>
            </div>
            {/* Nothing to save: a quiet "Saved" rather than a greyed-out button. */}
            {dirty || busy ? (
              <button type="button" disabled={busy} onClick={() => void submit()} className={btnPrimary}>
                {busy ? "Saving…" : "Save"}
              </button>
            ) : (
              <span className="text-xs text-muted">Saved</span>
            )}
          </div>
          {status && <p className={`-mt-2 text-sm ${status.ok ? "text-emerald-600 dark:text-emerald-400" : "text-danger"}`}>{status.text}</p>}

          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
            <div className="flex flex-col gap-5">
              <Section title="Weekly hours" description={`In ${draft.timeZone.replace(/_/g, " ")} (${zoneName(draft.timeZone)}).`} flush>
                <div className="flex flex-col divide-y divide-foreground/10">
                {WEEK.map((wd) => {
                  const mine = dayWindows(wd);
                  return (
                    // A day off is one line ("Not teaching" beside its name), on phones too.
                    <div key={wd} className={`flex gap-2 px-4 py-3 sm:flex-row sm:items-start sm:px-5 ${mine.length ? "flex-col" : "flex-row"}`}>
                      <div className="flex w-32 shrink-0 items-center gap-2 pt-1.5">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={mine.length > 0}
                          aria-label={`Teach on ${WEEKDAYS[wd]}`}
                          onClick={() => (mine.length ? setWindows(windows.filter((w) => w.weekday !== wd)) : addRange(wd))}
                          className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${mine.length ? "bg-accent" : "bg-foreground/15"}`}
                        >
                          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${mine.length ? "left-[1.125rem]" : "left-0.5"}`} />
                        </button>
                        <span className={`text-sm font-medium ${mine.length ? "" : "text-muted"}`}>{WEEKDAYS[wd]}</span>
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col gap-2">
                        {mine.length === 0 && <p className="pt-1.5 text-sm text-muted">Not teaching</p>}
                        {mine.map(({ w, i }) => (
                          <div key={i} className="flex flex-wrap items-center gap-2">
                            <input
                              type="time"
                              value={w.start}
                              step={900}
                              onChange={(e) => setWindows(windows.map((x, j) => (j === i ? { ...x, start: e.target.value || x.start } : x)))}
                              className={timeField}
                              aria-label={`${WEEKDAYS[wd]} from`}
                            />
                            <span className="text-muted">–</span>
                            <input
                              type="time"
                              value={w.end === "24:00" ? "23:59" : w.end}
                              step={900}
                              onChange={(e) => setWindows(windows.map((x, j) => (j === i ? { ...x, end: e.target.value || x.end } : x)))}
                              className={timeField}
                              aria-label={`${WEEKDAYS[wd]} until`}
                            />
                            <button
                              type="button"
                              onClick={() => setWindows(windows.filter((_, j) => j !== i))}
                              aria-label="Remove these hours"
                              className="flex h-9 w-9 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
                            >
                              <CloseIcon className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                        {mine.length > 0 && (
                          <div className="flex flex-wrap gap-3">
                            <button type="button" onClick={() => addRange(wd)} className="flex items-center gap-1 text-xs font-medium text-muted hover:text-foreground">
                              <PlusIcon className="h-3.5 w-3.5" /> Add hours
                            </button>
                            {wd >= 1 && wd <= 5 && (
                              <button type="button" onClick={() => copyToWeekdays(wd)} className="text-xs font-medium text-muted hover:text-foreground">
                                Copy to Mon–Fri
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                </div>
              </Section>

              <Section title="Booking rules">
                <div className="grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5 text-sm font-medium">
                  Lesson length
                  <select value={draft.lengthMin} onChange={(e) => patch({ lengthMin: Number(e.target.value) })} className={field}>
                    {LESSON_LENGTHS.map((m) => (
                      <option key={m} value={m}>
                        {m} minutes
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-medium">
                  Break after each lesson
                  <select value={draft.bufferMin} onChange={(e) => patch({ bufferMin: Number(e.target.value) })} className={field}>
                    {[0, 5, 10, 15, 30, 45, 60].map((m) => (
                      <option key={m} value={m}>
                        {m ? `${m} minutes` : "None"}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-medium">
                  Minimum notice
                  <select value={draft.noticeHours} onChange={(e) => patch({ noticeHours: Number(e.target.value) })} className={field}>
                    {[0, 2, 6, 12, 24, 48, 72, 168].map((h) => (
                      <option key={h} value={h}>
                        {h === 0 ? "None" : h < 24 ? `${h} hours` : h === 168 ? "1 week" : `${h / 24} day${h === 24 ? "" : "s"}`}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-medium">
                  Book up to
                  <select value={draft.aheadDays} onChange={(e) => patch({ aheadDays: Number(e.target.value) })} className={field}>
                    {[7, 14, 21, 28, 42, 60, 90].map((d) => (
                      <option key={d} value={d}>
                        {d % 7 === 0 ? `${d / 7} week${d === 7 ? "" : "s"}` : `${d} days`} ahead
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-medium sm:col-span-2">
                  Time zone
                  <select value={draft.timeZone} onChange={(e) => patch({ timeZone: e.target.value })} className={field}>
                    {zones.map((z) => (
                      <option key={z} value={z}>
                        {z.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="sm:col-span-2">
                  <SwitchRow label="Let students request lessons from these hours" checked={draft.allowRequests} onChange={(allowRequests) => patch({ allowRequests })} />
                  <p className="mt-1 text-xs text-muted">You accept or decline each request. Off: you can still offer times by email.</p>
                </div>
                </div>
              </Section>

              <Section title="Days off" description="Holidays, gigs, time away — nobody can book these days.">
                <div className="flex flex-wrap items-center gap-2">
                  <input type="date" value={dayOff} onChange={(e) => setDayOff(e.target.value)} className={timeField} />
                  <button
                    type="button"
                    disabled={!dayOff || draft.blockedDates.includes(dayOff)}
                    onClick={() => {
                      patch({ blockedDates: [...draft.blockedDates, dayOff].sort() });
                      setDayOff("");
                    }}
                    className={btnSecondary}
                  >
                    Add day off
                  </button>
                </div>
                {draft.blockedDates.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {draft.blockedDates.map((d) => (
                      <span key={d} className="flex h-7 items-center gap-1 rounded-md bg-background pl-2.5 pr-1 text-xs font-medium">
                        {new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
                        <button
                          type="button"
                          onClick={() => patch({ blockedDates: draft.blockedDates.filter((x) => x !== d) })}
                          aria-label="Remove"
                          className="flex h-5 w-5 items-center justify-center rounded-sm text-muted hover:bg-foreground/10 hover:text-foreground"
                        >
                          <CloseIcon className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                ) : null}
              </Section>
            </div>

            <aside className="xl:sticky xl:top-6">
              <Section
                title="What students see"
                description={`The next open times, before any lessons are booked (shown in this browser's time zone).${draft.allowRequests ? "" : " Requests are off."}`}
              >
                <div className="max-h-[60vh] overflow-y-auto pr-1">
                  <SlotGrid slots={preview} selected={[]} onToggle={() => {}} emptyText="Add some weekly hours to open times." maxDays={6} />
                </div>
              </Section>
            </aside>
          </div>
        </>
      )}
    </LibraryPage>
  );
}

/** A settings section: a header with its title (and a line about it) over its controls. `flush`
    lets rows run edge to edge. */
function Section({ title, description, flush = false, children }: { title: string; description?: string; flush?: boolean; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-lg bg-surface">
      <div className="border-b border-foreground/10 px-4 py-3 sm:px-5">
        <h2 className="text-sm font-medium">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
      </div>
      <div className={flush ? "" : "p-4 sm:p-5"}>{children}</div>
    </section>
  );
}
