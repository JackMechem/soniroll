"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { api } from "@jam-practice/convex/_generated/api";
import type { Id } from "@jam-practice/convex/_generated/dataModel";
import LoadingSpinner from "@/components/LoadingSpinner";
import { CalendarIcon, CheckIcon, CloseIcon, DownloadIcon, LinkIcon, PlusIcon } from "@/components/tools";
import { Dialog, errorText, field } from "@/components/lessons/parts";
import { shareLink } from "@/lib/shareLink";
import { durationLabel, googleCalendarUrl, lessonIcs, LESSON_LENGTHS, zoneName, type LessonEvent, type Slot } from "@jam-practice/core/lessonSchedule";
import { siteOrigin } from "@/lib/siteOrigin";

/** The browser's time zone. */
export function localTz(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" });
const shortDayFmt = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" });
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

/** "Tue, Oct 21 · 4:00 – 5:00 PM", in the viewer's time zone. */
export function slotLabel(s: Slot) {
  return `${shortDayFmt.format(s.start)} · ${timeFmt.format(s.start)} – ${timeFmt.format(s.end)}`;
}

function dayKey(ms: number) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** "in 3 days", "tomorrow", "today". */
function relDay(ms: number, now: number) {
  const a = new Date(now);
  a.setHours(0, 0, 0, 0);
  const b = new Date(ms);
  b.setHours(0, 0, 0, 0);
  const d = Math.round((b.getTime() - a.getTime()) / 86_400_000);
  return d === 0 ? "Today" : d === 1 ? "Tomorrow" : d === -1 ? "Yesterday" : d > 1 && d < 7 ? `In ${d} days` : null;
}

/** Times grouped by day as tappable chips. `selected` holds slot starts. */
export function SlotGrid({
  slots,
  selected,
  onToggle,
  taken,
  emptyText = "No open times.",
  maxDays,
}: {
  slots: (Slot & { taken?: boolean })[];
  selected: number[];
  onToggle: (s: Slot) => void;
  taken?: (s: Slot) => boolean;
  emptyText?: string;
  maxDays?: number;
}) {
  const [showAll, setShowAll] = useState(false);
  const days = useMemo(() => {
    const out: { key: string; label: string; slots: (Slot & { taken?: boolean })[] }[] = [];
    for (const s of slots) {
      const k = dayKey(s.start);
      if (out.at(-1)?.key !== k) out.push({ key: k, label: dayFmt.format(s.start), slots: [] });
      out.at(-1)!.slots.push(s);
    }
    return out;
  }, [slots]);
  if (days.length === 0) return <p className="rounded-2xl bg-background p-4 text-center text-sm text-muted">{emptyText}</p>;
  const shown = maxDays && !showAll ? days.slice(0, maxDays) : days;
  return (
    <div className="flex flex-col gap-3">
      {shown.map((d) => (
        <div key={d.key} className="flex flex-col gap-1.5">
          <p className="text-xs font-bold text-muted">{d.label}</p>
          <div className="flex flex-wrap gap-1.5">
            {d.slots.map((s) => {
              const on = selected.includes(s.start);
              const off = s.taken || taken?.(s);
              return (
                <button
                  key={s.start}
                  type="button"
                  disabled={off}
                  onClick={() => onToggle(s)}
                  aria-pressed={on}
                  className={`rounded-full px-3.5 py-2 text-sm font-semibold tabular-nums transition-colors ${
                    on
                      ? "bg-accent text-accent-foreground"
                      : off
                        ? "bg-background text-muted line-through opacity-50"
                        : "bg-background ring-1 ring-foreground/10 hover:bg-surface-hover hover:ring-accent"
                  }`}
                >
                  {timeFmt.format(s.start)}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {maxDays && days.length > maxDays && (
        <button type="button" onClick={() => setShowAll((v) => !v)} className="self-start text-xs font-semibold text-accent hover:underline">
          {showAll ? "Show fewer days" : `Show ${days.length - maxDays} more days`}
        </button>
      )}
    </div>
  );
}

function downloadIcs(ev: LessonEvent) {
  const blob = new Blob([lessonIcs(ev)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "lesson.ics";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Google Calendar + a downloadable .ics (Apple Calendar, Outlook). */
export function AddToCalendar({ ev, compact = false }: { ev: LessonEvent; compact?: boolean }) {
  const cls = compact
    ? "flex items-center gap-1 rounded-full bg-background px-2.5 py-1 text-xs font-semibold hover:bg-surface-hover"
    : "flex items-center gap-1.5 rounded-full bg-background px-3.5 py-2 text-sm font-semibold ring-1 ring-foreground/10 hover:bg-surface-hover";
  return (
    <div className="flex flex-wrap gap-1.5">
      <a href={googleCalendarUrl(ev)} target="_blank" rel="noopener noreferrer" className={cls}>
        <CalendarIcon className="h-3.5 w-3.5" /> Google Calendar
      </a>
      <button type="button" onClick={() => downloadIcs(ev)} className={cls}>
        <DownloadIcon className="h-3.5 w-3.5" /> .ics file
      </button>
    </div>
  );
}

export function lessonEvent(b: { id: string; start: number; end: number }, other: string, url?: string): LessonEvent {
  return { uid: `${b.id}@sheddex.com`, slot: { start: b.start, end: b.end }, title: `Lesson with ${other}`, description: `Lesson with ${other} (soniroll).`, url };
}

/** The date tile at the start of a lesson row. */
export function DateTile({ ms, muted = false }: { ms: number; muted?: boolean }) {
  const d = new Date(ms);
  return (
    <span
      className={`flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl leading-none ${muted ? "bg-background text-muted" : "bg-accent/12 text-accent"}`}
    >
      <span className="text-[10px] font-bold">{d.toLocaleDateString(undefined, { month: "short" })}</span>
      <span className="text-lg font-extrabold tabular-nums">{d.getDate()}</span>
    </span>
  );
}

const btn = "rounded-full px-3.5 py-1.5 text-xs font-bold disabled:opacity-40";
const btnPrimary = `${btn} bg-accent text-accent-foreground hover:bg-accent-hover`;
const btnPlain = `${btn} bg-background hover:bg-surface-hover`;

type Booking = {
  id: Id<"lessonBookings">;
  lessonId: Id<"lessonStudents">;
  start: number;
  end: number;
  status: "requested" | "confirmed" | "declined" | "cancelled";
  source: "request" | "offer";
  note: string | null;
  reply: string | null;
  cancelledBy: "teacher" | "student" | null;
};

/** One lesson (or request) as a row: date tile, time, who, and what you can do with it. */
export function BookingRow({ b, role, other, now, href }: { b: Booking; role: "teacher" | "student"; other: string; now: number; href?: string }) {
  const [dialog, setDialog] = useState<null | "accept" | "decline" | "cancel">(null);
  const [calOpen, setCalOpen] = useState(false);
  const rel = relDay(b.start, now);
  const live = b.start <= now && b.end > now;
  return (
    <li className="flex flex-col gap-2 rounded-2xl bg-background p-3">
      <div className="flex items-center gap-3">
        <DateTile ms={b.start} muted={b.status !== "confirmed"} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">
            {timeFmt.format(b.start)} – {timeFmt.format(b.end)} <span className="font-semibold text-muted">· {durationLabel(b)}</span>
          </p>
          <p className="truncate text-xs text-muted">
            {href ? (
              <Link href={href} className="font-semibold text-foreground hover:underline">
                {other}
              </Link>
            ) : (
              other
            )}
            {" · "}
            {live ? <span className="font-bold text-emerald-600 dark:text-emerald-400">Now</span> : (rel ?? shortDayFmt.format(b.start))}
          </p>
        </div>
        {b.status === "requested" && (
          <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold text-amber-700 dark:text-amber-400">
            {role === "teacher" ? "Requested" : "Waiting"}
          </span>
        )}
      </div>
      {b.note && <p className="rounded-xl bg-surface px-3 py-2 text-xs italic text-muted">“{b.note}”</p>}
      <div className="flex flex-wrap items-center gap-1.5">
        {b.status === "requested" && role === "teacher" && (
          <>
            <button type="button" onClick={() => setDialog("accept")} className={`${btnPrimary} flex items-center gap-1`}>
              <CheckIcon className="h-3.5 w-3.5" /> Accept
            </button>
            <button type="button" onClick={() => setDialog("decline")} className={btnPlain}>
              Decline
            </button>
          </>
        )}
        {b.status === "requested" && role === "student" && (
          <button type="button" onClick={() => setDialog("cancel")} className={btnPlain}>
            Withdraw request
          </button>
        )}
        {b.status === "confirmed" && (
          <>
            <button type="button" onClick={() => setCalOpen((o) => !o)} className={`${btnPlain} flex items-center gap-1`}>
              <CalendarIcon className="h-3.5 w-3.5" /> Add to calendar
            </button>
            {b.start > now && (
              <button type="button" onClick={() => setDialog("cancel")} className={`${btnPlain} text-danger`}>
                Cancel
              </button>
            )}
          </>
        )}
      </div>
      {calOpen && <AddToCalendar compact ev={lessonEvent(b, other)} />}
      {dialog && <BookingDialog b={b} kind={dialog} other={other} onClose={() => setDialog(null)} />}
    </li>
  );
}

/** Accept / decline / cancel, with an optional message that goes in the email. */
function BookingDialog({ b, kind, other, onClose }: { b: Booking; kind: "accept" | "decline" | "cancel"; other: string; onClose: () => void }) {
  const respond = useAction(api.lessonSchedule.respond);
  const cancel = useAction(api.lessonSchedule.cancel);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const title =
    kind === "accept"
      ? `Accept ${other}'s request?`
      : kind === "decline"
        ? `Decline ${other}'s request?`
        : b.status === "requested"
          ? "Withdraw your request?"
          : `Cancel the lesson with ${other}?`;
  const label = kind === "accept" ? "Accept and email them" : kind === "decline" ? "Decline" : b.status === "requested" ? "Withdraw" : "Cancel lesson";
  async function go() {
    setBusy(true);
    setError(null);
    try {
      if (kind === "cancel") await cancel({ bookingId: b.id, reason: msg.trim() || undefined });
      else await respond({ bookingId: b.id, accept: kind === "accept", reply: msg.trim() || undefined });
      onClose();
    } catch (e) {
      setError(errorText(e, "Something went wrong."));
      setBusy(false);
    }
  }
  return (
    <Dialog title={title} onClose={onClose}>
      <p className="rounded-xl bg-background px-3.5 py-3 text-sm font-bold">{slotLabel(b)}</p>
      <p className="text-sm text-muted">
        {kind === "accept"
          ? `${other} gets an email with a calendar invite, and so do you.`
          : kind === "decline"
            ? `${other} gets an email and can pick another time.`
            : `${other} gets an email${b.status === "confirmed" ? " (and a calendar update that removes it)" : ""}.`}
      </p>
      <label className="flex flex-col gap-1 text-sm font-semibold">
        A message <span className="font-normal text-muted">(optional, goes in the email)</span>
        <textarea
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          rows={3}
          maxLength={1000}
          className={`${field} resize-y`}
          placeholder={
            kind === "accept"
              ? "See you then! Bring your metronome."
              : kind === "decline"
                ? "Sorry, I'm away that week — how about Thursday?"
                : "Something came up, sorry!"
          }
        />
      </label>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-sm font-semibold hover:bg-background">
          Back
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void go()}
          className={`rounded-full px-5 py-2 text-sm font-bold disabled:opacity-40 ${kind === "accept" ? "bg-accent text-accent-foreground hover:bg-accent-hover" : "bg-danger text-white hover:opacity-90"}`}
        >
          {busy ? "Sending…" : label}
        </button>
      </div>
    </Dialog>
  );
}

/**
 * A lesson's schedule card, on the teacher's student page and the student's teacher page: what's
 * booked, requests, open offers, and the button to offer times (teacher) or request one (student).
 */
export function ScheduleCard({ lessonId }: { lessonId: Id<"lessonStudents"> }) {
  const data = useQuery(api.lessonSchedule.forLesson, { lessonId });
  const withdraw = useMutation(api.lessonSchedule.withdrawOffer);
  const [now] = useState(() => Date.now());
  const [dialog, setDialog] = useState<null | "offer" | "request">(null);
  const [copied, setCopied] = useState<string | null>(null);

  if (data === undefined)
    return (
      <section className="flex justify-center rounded-2xl bg-surface p-6">
        <LoadingSpinner size="sm" />
      </section>
    );
  if (!data) return null;
  const teacher = data.role === "teacher";
  const other = teacher ? data.studentName : data.teacher.name;
  const requests = data.upcoming.filter((b) => b.status === "requested");
  const booked = data.upcoming.filter((b) => b.status === "confirmed");

  async function copy(token: string) {
    const res = await shareLink("Pick a lesson time", `${siteOrigin()}/lessons/book?offer=${token}`);
    setCopied(res === "copied" ? token : null);
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-bold">
          <CalendarIcon className="h-4 w-4 text-accent" /> Booking
        </h2>
        {teacher ? (
          <button type="button" onClick={() => setDialog("offer")} className={`${btnPrimary} flex items-center gap-1`}>
            <PlusIcon className="h-3.5 w-3.5" /> Offer times
          </button>
        ) : (
          data.canRequest && (
            <button type="button" onClick={() => setDialog("request")} className={`${btnPrimary} flex items-center gap-1`}>
              <PlusIcon className="h-3.5 w-3.5" /> Request a lesson
            </button>
          )
        )}
      </div>

      {requests.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-bold text-muted">{teacher ? "Asked for" : "Your requests"}</p>
          <ul className="flex flex-col gap-1.5">
            {requests.map((b) => (
              <BookingRow key={b.id} b={b} role={data.role} other={other} now={now} />
            ))}
          </ul>
        </div>
      )}

      {booked.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-bold text-muted">Booked times</p>
          <ul className="flex flex-col gap-1.5">
            {booked.map((b) => (
              <BookingRow key={b.id} b={b} role={data.role} other={other} now={now} />
            ))}
          </ul>
        </div>
      ) : (
        requests.length === 0 &&
        data.offers.length === 0 && (
          <p className="text-sm text-muted">
            {teacher
              ? `Nothing booked. Offer ${other} a few times — they pick one from an email, and it's booked.`
              : data.canRequest
                ? `Nothing booked. Request one of ${other}'s open times.`
                : `Nothing booked yet. When ${other} offers you times, they show up here.`}
          </p>
        )
      )}

      {data.offers.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-bold text-muted">{teacher ? "Times you offered" : "Times offered to you"}</p>
          {data.offers.map((o) => (
            <div key={o.id} className="flex flex-col gap-2 rounded-2xl bg-background p-3">
              <p className="text-sm font-semibold">
                {o.slots.length} time{o.slots.length === 1 ? "" : "s"}
                <span className="font-normal text-muted"> · first {slotLabel(o.slots[0])}</span>
              </p>
              {teacher && <p className="text-xs text-muted">{o.sentAt && o.email ? `Emailed to ${o.email}` : "Not emailed — send them the link"}</p>}
              <div className="flex flex-wrap gap-1.5">
                {teacher ? (
                  <>
                    <button type="button" onClick={() => void copy(o.token)} className={`${btnPlain} flex items-center gap-1`}>
                      <LinkIcon className="h-3.5 w-3.5" /> {copied === o.token ? "Link copied" : "Copy link"}
                    </button>
                    <button type="button" onClick={() => void withdraw({ offerId: o.id })} className={btnPlain}>
                      Take back
                    </button>
                  </>
                ) : (
                  <Link href={`/lessons/book?offer=${o.token}`} className={btnPrimary}>
                    Pick a time
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {data.recent.length > 0 && (
        <ul className="flex flex-col gap-1 text-xs text-muted">
          {data.recent.map((b) => (
            <li key={b.id} className="line-through decoration-foreground/30">
              {slotLabel(b)} — {b.status === "declined" ? "declined" : `cancelled${b.cancelledBy ? ` by ${b.cancelledBy === data.role ? "you" : other}` : ""}`}
            </li>
          ))}
        </ul>
      )}

      {data.past.length > 0 && (
        <details className="text-xs text-muted">
          <summary className="cursor-pointer font-semibold">Past lessons</summary>
          <ul className="mt-1 flex flex-col gap-0.5">
            {data.past.map((b) => (
              <li key={b.id}>{slotLabel(b)}</li>
            ))}
          </ul>
        </details>
      )}

      {teacher && !data.hasAvailability && (
        <Link href="/lessons/settings#hours" className="text-xs font-semibold text-accent hover:underline">
          Set your teaching hours so students can request lessons →
        </Link>
      )}

      {dialog === "offer" && <OfferTimesDialog lessonId={lessonId} name={data.studentName} defaultEmail={data.studentEmail ?? ""} onClose={() => setDialog(null)} />}
      {dialog === "request" && <RequestLessonDialog lessonId={lessonId} teacherName={data.teacher.name} onClose={() => setDialog(null)} />}
    </section>
  );
}

/** Offer a student some times: tap them from your hours or add your own, then email the link. */
function OfferTimesDialog({ lessonId, name, defaultEmail, onClose }: { lessonId: Id<"lessonStudents">; name: string; defaultEmail: string; onClose: () => void }) {
  const [lengthMin, setLengthMin] = useState<number | null>(null);
  const free = useQuery(api.lessonSchedule.freeSlots, { lessonId, ...(lengthMin ? { lengthMin } : {}) });
  const offer = useAction(api.lessonSchedule.offerTimes);
  const [picked, setPicked] = useState<Slot[]>([]);
  const [email, setEmail] = useState(defaultEmail);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ token: string; sentTo: string | null; emailFailed: boolean } | null>(null);
  const [customDate, setCustomDate] = useState("");
  const [customTime, setCustomTime] = useState("");
  const len = lengthMin ?? free?.lengthMin ?? 60;

  function toggle(s: Slot) {
    setPicked((p) => (p.some((x) => x.start === s.start) ? p.filter((x) => x.start !== s.start) : [...p, s].sort((a, b) => a.start - b.start)));
  }
  function addCustom() {
    if (!customDate || !customTime) return;
    const start = new Date(`${customDate}T${customTime}`).getTime();
    if (!Number.isFinite(start)) return;
    if (!picked.some((x) => x.start === start)) setPicked((p) => [...p, { start, end: start + len * 60_000 }].sort((a, b) => a.start - b.start));
    setCustomTime("");
  }
  async function send() {
    setBusy(true);
    setError(null);
    try {
      setDone(await offer({ lessonId, slots: picked, message, email: email.trim() || undefined, tz: localTz() }));
    } catch (e) {
      setError(errorText(e, "Couldn't offer those times."));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    const link = `${siteOrigin()}/lessons/book?offer=${done.token}`;
    return (
      <Dialog title="Times offered" onClose={onClose}>
        <p className="text-sm">
          {done.sentTo && !done.emailFailed ? (
            <>
              Emailed to <b>{done.sentTo}</b>. {name} picks one and it&apos;s booked — you&apos;ll both get a calendar invite.
            </>
          ) : done.emailFailed ? (
            <span className="text-danger">The email didn&apos;t go out — send them the link instead.</span>
          ) : (
            <>Send {name} this link — they pick a time and it&apos;s booked.</>
          )}
        </p>
        <div className="flex items-center gap-2 rounded-xl bg-background p-2 pl-3">
          <code className="min-w-0 flex-1 truncate text-xs">{link}</code>
          <button type="button" onClick={() => void shareLink("Pick a lesson time", link)} className={btnPrimary}>
            Copy
          </button>
        </div>
        <div className="flex justify-end">
          <button type="button" onClick={onClose} className="rounded-full bg-accent px-5 py-2 text-sm font-bold text-accent-foreground">
            Done
          </button>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog title={`Offer ${name} lesson times`} onClose={onClose} wide>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">Pick a few times — {name} chooses one.</p>
        <label className="flex items-center gap-2 text-sm font-semibold">
          Length
          <select value={len} onChange={(e) => setLengthMin(Number(e.target.value))} className="rounded-lg bg-background px-2 py-1.5 text-sm ring-1 ring-foreground/10">
            {LESSON_LENGTHS.map((m) => (
              <option key={m} value={m}>
                {m} min
              </option>
            ))}
          </select>
        </label>
      </div>
      {free === undefined ? (
        <LoadingSpinner size="sm" />
      ) : free && free.slots.length > 0 ? (
        <div className="max-h-72 overflow-y-auto rounded-2xl pr-1">
          <SlotGrid slots={free.slots} selected={picked.map((p) => p.start)} onToggle={toggle} maxDays={7} />
        </div>
      ) : (
        <p className="rounded-2xl bg-background p-3 text-sm text-muted">
          No open times from your hours.{" "}
          <Link href="/lessons/settings#hours" className="font-semibold text-accent hover:underline">
            Set your teaching hours
          </Link>{" "}
          or add times below.
        </p>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
          Another day
          <input type="date" value={customDate} onChange={(e) => setCustomDate(e.target.value)} className={field.replace("w-full", "w-auto")} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
          At
          <input type="time" value={customTime} onChange={(e) => setCustomTime(e.target.value)} className={field.replace("w-full", "w-auto")} />
        </label>
        <button
          type="button"
          onClick={addCustom}
          disabled={!customDate || !customTime}
          className="rounded-full bg-background px-4 py-2.5 text-sm font-semibold ring-1 ring-foreground/10 hover:bg-surface-hover disabled:opacity-40"
        >
          Add time
        </button>
      </div>
      {picked.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-bold text-muted">
            Offering {picked.length} time{picked.length === 1 ? "" : "s"} ({zoneName(localTz())})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {picked.map((s) => (
              <span key={s.start} className="flex items-center gap-1 rounded-full bg-accent/12 py-1 pl-3 pr-1 text-xs font-semibold text-accent">
                {slotLabel(s)}
                <button type="button" onClick={() => toggle(s)} aria-label="Remove" className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-accent/20">
                  <CloseIcon className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
      <label className="flex flex-col gap-1 text-sm font-semibold">
        Email it to <span className="font-normal text-muted">(leave empty to just get a link)</span>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={`${name}'s email`} className={field} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold">
        A note <span className="font-normal text-muted">(optional)</span>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={2}
          maxLength={1000}
          placeholder="Here are a few times for next week."
          className={`${field} resize-y`}
        />
      </label>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-sm font-semibold hover:bg-background">
          Cancel
        </button>
        <button
          type="button"
          disabled={picked.length === 0 || busy}
          onClick={() => void send()}
          className="rounded-full bg-accent px-5 py-2 text-sm font-bold text-accent-foreground hover:bg-accent-hover disabled:opacity-40"
        >
          {busy ? "Sending…" : email.trim() ? "Email these times" : "Make the link"}
        </button>
      </div>
    </Dialog>
  );
}

/** A student asks for one of the teacher's open times. */
function RequestLessonDialog({ lessonId, teacherName, onClose }: { lessonId: Id<"lessonStudents">; teacherName: string; onClose: () => void }) {
  const free = useQuery(api.lessonSchedule.freeSlots, { lessonId });
  const request = useAction(api.lessonSchedule.requestLesson);
  const [picked, setPicked] = useState<Slot | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function send() {
    if (!picked) return;
    setBusy(true);
    setError(null);
    try {
      await request({ lessonId, slot: { start: picked.start, end: picked.end }, note, tz: localTz() });
      setSent(true);
    } catch (e) {
      setError(errorText(e, "Couldn't send the request."));
    } finally {
      setBusy(false);
    }
  }

  if (sent && picked)
    return (
      <Dialog title="Request sent" onClose={onClose}>
        <p className="rounded-xl bg-background px-3.5 py-3 text-sm font-bold">{slotLabel(picked)}</p>
        <p className="text-sm text-muted">{teacherName} gets an email to accept it. When they do, you&apos;ll get a confirmation with a calendar invite.</p>
        <div className="flex justify-end">
          <button type="button" onClick={onClose} className="rounded-full bg-accent px-5 py-2 text-sm font-bold text-accent-foreground">
            Done
          </button>
        </div>
      </Dialog>
    );

  return (
    <Dialog title={`Request a lesson with ${teacherName}`} onClose={onClose} wide>
      <p className="text-sm text-muted">
        {free ? `${free.lengthMin}-minute lessons · ` : ""}times in your time zone ({zoneName(localTz())})
      </p>
      {free === undefined ? (
        <LoadingSpinner size="sm" />
      ) : (
        <div className="max-h-80 overflow-y-auto pr-1">
          <SlotGrid
            slots={free?.slots ?? []}
            selected={picked ? [picked.start] : []}
            onToggle={(s) => setPicked((p) => (p?.start === s.start ? null : s))}
            emptyText={`${teacherName} has no open times right now.`}
            maxDays={10}
          />
        </div>
      )}
      <label className="flex flex-col gap-1 text-sm font-semibold">
        A note <span className="font-normal text-muted">(optional)</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          maxLength={1000}
          placeholder="I'd like to work on the bridge of Stella."
          className={`${field} resize-y`}
        />
      </label>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex items-center justify-end gap-2">
        {picked && <span className="mr-auto text-sm font-semibold">{slotLabel(picked)}</span>}
        <button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-sm font-semibold hover:bg-background">
          Cancel
        </button>
        <button
          type="button"
          disabled={!picked || busy}
          onClick={() => void send()}
          className="rounded-full bg-accent px-5 py-2 text-sm font-bold text-accent-foreground hover:bg-accent-hover disabled:opacity-40"
        >
          {busy ? "Sending…" : "Send request"}
        </button>
      </div>
    </Dialog>
  );
}

/** The Lessons page's "Needs you": requests to answer (teaching) and times you've been offered
    (learning). Renders nothing when there's nothing to do. */
export function ScheduleOverview() {
  const data = useQuery(api.lessonSchedule.overview, {});
  const [now] = useState(() => Date.now());
  if (!data) return null;
  const requests = data.asTeacher.filter((b) => b.status === "requested");
  if (requests.length === 0 && data.offers.length === 0) return null;
  return (
    <section className="flex flex-col gap-2 rounded-2xl bg-surface p-4 ring-1 ring-accent/30">
      <h2 className="font-bold">Needs you</h2>
      <ul className="flex flex-col gap-1.5">
        {requests.map((b) => (
          <BookingRow key={b.id} b={b} role="teacher" other={b.studentName} now={now} href={`/lessons/student?id=${b.lessonId}`} />
        ))}
        {data.offers.map((o) => (
          <li key={o.id} className="flex items-center gap-3 rounded-2xl bg-background p-3">
            <CalendarIcon className="h-5 w-5 shrink-0 text-accent" />
            <span className="min-w-0 flex-1 text-sm">
              <b>{o.teacher.name}</b> offered you {o.count} lesson time{o.count === 1 ? "" : "s"}
            </span>
            <Link href={`/lessons/book?offer=${o.token}`} className={btnPrimary}>
              Pick a time
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
