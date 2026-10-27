"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "@jam-practice/convex/_generated/api";
import LoadingSpinner from "@/components/LoadingSpinner";
import { Segmented } from "@/components/metronome/MetronomeOptions";
import { ProgressCardView, cardHeadline, progressCardFile } from "@/components/practicelog/ProgressCard";
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, CloseIcon, DownloadIcon, LinkIcon, ShareIcon, UsersIcon } from "@/components/tools";
import { type PracticeLogData, type ProgressCardKind, type ProgressCardRange, type Routine, MONTH_NAMES, WEEKDAY_NAMES, addDays, dayReportCard, fromDateKey, progressCard, toPublicRoutine, todayKey } from "@/lib/practiceLog";
import { shareLink } from "@/lib/shareLink";
import { SIGN_IN_PATH } from "@/lib/landing";
import { siteOrigin } from "@/lib/siteOrigin";

function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
}

function Dialog({ label, onClose, wide = false, children }: { label: string; onClose: () => void; wide?: boolean; children: React.ReactNode }) {
  useEscape(onClose);
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-[6vh]" onClick={onClose}>
      <div role="dialog" aria-label={label} className={`flex w-full ${wide ? "max-w-2xl" : "max-w-md"} flex-col gap-4 rounded-2xl bg-surface p-5 shadow-xl`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{label}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1.5 text-muted hover:bg-background hover:text-foreground">
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** Posting needs an account and a public profile — the same rule as every Community post. */
function usePostGate() {
  const { isAuthenticated } = useConvexAuth();
  const profile = useQuery(api.profiles.getMine, isAuthenticated ? {} : "skip");
  return {
    isAuthenticated,
    username: profile?.username || null,
    canPost: isAuthenticated && !!profile?.isPublic && !!profile.username,
    loading: isAuthenticated && profile === undefined,
  };
}

function PostGateNote({ isAuthenticated }: { isAuthenticated: boolean }) {
  return (
    <p className="rounded-xl bg-background p-3 text-sm text-muted">
      {isAuthenticated ? (
        <>
          To post to Community, make your profile public in{" "}
          <Link href="/account" className="font-semibold text-foreground underline">
            your account
          </Link>
          .
        </>
      ) : (
        <>
          <Link href={SIGN_IN_PATH} className="font-semibold text-foreground underline">
            Sign in
          </Link>{" "}
          to post to Community.
        </>
      )}
    </p>
  );
}

const KIND_OPTIONS: { value: ProgressCardKind; label: string }[] = [
  { value: "streak", label: "Streak" },
  { value: "hours", label: "Hours" },
  { value: "year", label: "Days" },
  { value: "day", label: "Day" },
];

const RANGE_OPTIONS: { value: ProgressCardRange; label: string }[] = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
];

/** "Share your progress": a progress card (streak, hours, or the year) to download, share as an
    image, or post to Community with a caption. */
export function ProgressShareDialog({
  data,
  initialKind = "streak",
  initialDate,
  celebrate = false,
  onClose,
}: {
  data: PracticeLogData;
  initialKind?: ProgressCardKind;
  /** The day a "Day report" card is for (default today). */
  initialDate?: string;
  /** Opened by finishing everything today: say so at the top. */
  celebrate?: boolean;
  onClose: () => void;
}) {
  const gate = usePostGate();
  const create = useMutation(api.communityTunes.create);
  const [kind, setKind] = useState<ProgressCardKind>(initialKind);
  const [range, setRange] = useState<ProgressCardRange>("year");
  const today = todayKey();
  const [date, setDate] = useState(initialDate && initialDate <= today ? initialDate : today);
  const card = useMemo(() => (kind === "day" ? dayReportCard(data, date) : progressCard(data, today, kind, range)), [data, kind, range, date, today]);
  const head = cardHeadline(card);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState<"post" | "share" | null>(null);
  const [posted, setPosted] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function download() {
    const file = await progressCardFile(card, gate.username);
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function shareImage() {
    setBusy("share");
    setNote(null);
    try {
      const file = await progressCardFile(card, gate.username);
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: head.title, text: `${head.title} on soniroll` });
      } else if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": file })]);
        setNote("Image copied — paste it anywhere.");
      } else {
        await download();
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) setNote("Couldn't share the image — try Download.");
    } finally {
      setBusy(null);
    }
  }

  async function post() {
    setBusy("post");
    setNote(null);
    try {
      const id = await create({ title: head.title, description: caption.trim(), tunes: [], kind: "milestone", payload: card });
      setPosted(id);
    } catch (e) {
      setNote(e instanceof Error ? e.message.replace(/^.*Uncaught Error: /, "").split("\n")[0] : "Couldn't post.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog label={celebrate ? "Day complete!" : "Share your progress"} onClose={onClose} wide>
      {celebrate && <p className="-mt-2 text-sm text-muted">Every task done today. Here&apos;s your report to save or share.</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        <Segmented label="Card" value={kind} onChange={(k) => { setKind(k); setPosted(null); }} options={KIND_OPTIONS} />
        {kind === "day" ? (
          <div className="flex items-center justify-between gap-1 rounded-full bg-background p-1">
            <button type="button" onClick={() => { setDate(addDays(date, -1)); setPosted(null); }} aria-label="Day before" className="rounded-full p-1.5 hover:bg-surface-hover">
              <ChevronLeftIcon className="h-4 w-4" />
            </button>
            <span className="truncate text-sm font-semibold">
              {date === today ? "Today" : (() => { const d = fromDateKey(date); return `${WEEKDAY_NAMES[d.getDay()].slice(0, 3)}, ${MONTH_NAMES[d.getMonth()].slice(0, 3)} ${d.getDate()}`; })()}
            </span>
            <button type="button" onClick={() => { setDate(addDays(date, 1)); setPosted(null); }} disabled={date >= today} aria-label="Day after" className="rounded-full p-1.5 hover:bg-surface-hover disabled:opacity-30">
              <ChevronRightIcon className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <Segmented label="Range" value={range} onChange={(r) => { setRange(r); setPosted(null); }} options={RANGE_OPTIONS} />
        )}
      </div>
      <ProgressCardView card={card} username={gate.username} />
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void shareImage()} disabled={busy !== null} className="flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground hover:bg-accent-hover disabled:opacity-60">
          {busy === "share" ? <LoadingSpinner size="sm" inline /> : <ShareIcon className="h-4 w-4" />} Share image
        </button>
        <button type="button" onClick={() => void download()} className="flex items-center gap-1.5 rounded-full bg-background px-4 py-2 text-sm font-semibold hover:bg-surface-hover">
          <DownloadIcon className="h-4 w-4" /> Download
        </button>
      </div>
      <div className="flex flex-col gap-2 border-t border-surface-hover pt-4">
        <h3 className="flex items-center gap-1.5 text-sm font-bold">
          <UsersIcon className="h-4 w-4 text-accent" /> Post to Community
        </h3>
        {gate.loading ? (
          <LoadingSpinner size="sm" />
        ) : !gate.canPost ? (
          <PostGateNote isAuthenticated={gate.isAuthenticated} />
        ) : posted ? (
          <p className="flex items-center gap-2 rounded-xl bg-background p-3 text-sm">
            <CheckIcon className="h-4 w-4 text-accent" /> Posted!{" "}
            <Link href={`/post/${posted}`} className="font-semibold underline">
              View post
            </Link>
          </p>
        ) : (
          <>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={2}
              placeholder="Say something (optional) — what's been working, what's next"
              className="resize-y rounded-xl bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-accent"
            />
            <button type="button" onClick={() => void post()} disabled={busy !== null} className="flex items-center justify-center gap-1.5 self-start rounded-full bg-background px-4 py-2 text-sm font-semibold hover:bg-surface-hover disabled:opacity-60">
              {busy === "post" && <LoadingSpinner size="sm" inline />} Post &ldquo;{head.title}&rdquo;
            </button>
          </>
        )}
        {note && <p className="text-sm text-muted">{note}</p>}
      </div>
    </Dialog>
  );
}

/** A routine's Share: a link anyone can open (and save into their own Shed Log), and posting
    it to Community. Both show the routine as it is now — edits reach them without re-sharing. */
export function RoutineShareDialog({ routine, onClose }: { routine: Routine; onClose: () => void }) {
  const gate = usePostGate();
  const shareId = useQuery(api.routines.shareFor, gate.isAuthenticated ? { routineId: routine.id } : "skip");
  const postId = useQuery(api.communityTunes.postForRoutine, gate.isAuthenticated ? { routineId: routine.id } : "skip");
  const share = useMutation(api.routines.share);
  const unshare = useMutation(api.routines.unshare);
  const create = useMutation(api.communityTunes.create);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState<"link" | "post" | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const url = shareId ? `${typeof window === "undefined" ? "https://www.soniroll.com" : siteOrigin()}/routine/${shareId}` : null;

  async function makeLink() {
    setBusy("link");
    setNote(null);
    try {
      const id = await share({ routineId: routine.id, routine: toPublicRoutine(routine) });
      const result = await shareLink(routine.name || "Routine", `${siteOrigin()}/routine/${id}`);
      if (result === "copied") setNote("Link copied.");
    } catch (e) {
      setNote(e instanceof Error ? e.message.split("\n")[0] : "Couldn't make a link.");
    } finally {
      setBusy(null);
    }
  }

  async function post() {
    setBusy("post");
    setNote(null);
    try {
      await create({
        title: routine.name || "Routine",
        description: caption.trim(),
        tunes: [],
        kind: "routine",
        routineId: routine.id,
        payload: toPublicRoutine(routine),
      });
    } catch (e) {
      setNote(e instanceof Error ? e.message.replace(/^.*Uncaught Error: /, "").split("\n")[0] : "Couldn't post.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog label={`Share ${routine.name || "this routine"}`} onClose={onClose}>
      {!gate.isAuthenticated ? (
        <p className="rounded-xl bg-background p-3 text-sm text-muted">
          <Link href={SIGN_IN_PATH} className="font-semibold text-foreground underline">
            Sign in
          </Link>{" "}
          to share routines — the link and posts live on your account.
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <h3 className="flex items-center gap-1.5 text-sm font-bold">
              <LinkIcon className="h-4 w-4 text-accent" /> Share a link
            </h3>
            <p className="text-sm text-muted">Anyone with the link can see the routine and add it to their own Shed Log. It always shows your latest version.</p>
            {url && (
              <div className="flex items-center gap-2 rounded-xl bg-background px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{url}</span>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void makeLink()} disabled={busy !== null || shareId === undefined} className="flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground hover:bg-accent-hover disabled:opacity-60">
                {busy === "link" ? <LoadingSpinner size="sm" inline /> : <ShareIcon className="h-4 w-4" />} {shareId ? "Share the link" : "Make a link"}
              </button>
              {shareId && (
                <button type="button" onClick={() => void unshare({ routineId: routine.id })} className="rounded-full px-4 py-2 text-sm font-semibold text-danger hover:bg-background">
                  Stop sharing
                </button>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-2 border-t border-surface-hover pt-4">
            <h3 className="flex items-center gap-1.5 text-sm font-bold">
              <UsersIcon className="h-4 w-4 text-accent" /> Post to Community
            </h3>
            {gate.loading || postId === undefined ? (
              <LoadingSpinner size="sm" />
            ) : postId ? (
              <p className="flex items-center gap-2 rounded-xl bg-background p-3 text-sm">
                <CheckIcon className="h-4 w-4 text-accent" /> Posted —{" "}
                <Link href={`/post/${postId}`} className="font-semibold underline">
                  View post
                </Link>
              </p>
            ) : !gate.canPost ? (
              <PostGateNote isAuthenticated />
            ) : (
              <>
                <textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  rows={2}
                  placeholder="What it's for, how it's helped (optional)"
                  className="resize-y rounded-xl bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-accent"
                />
                <button type="button" onClick={() => void post()} disabled={busy !== null} className="flex items-center gap-1.5 self-start rounded-full bg-background px-4 py-2 text-sm font-semibold hover:bg-surface-hover disabled:opacity-60">
                  {busy === "post" && <LoadingSpinner size="sm" inline />} Post routine
                </button>
              </>
            )}
          </div>
          {note && <p className="text-sm text-muted">{note}</p>}
        </>
      )}
    </Dialog>
  );
}
