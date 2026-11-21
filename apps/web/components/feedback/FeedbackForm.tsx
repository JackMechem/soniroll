"use client";

import { APP_VERSION, CHANNEL, DESKTOP_VERSION } from "@/lib/version";
import { useConvexAuth } from "@convex-dev/auth/react";
import { useMutation } from "convex/react";
import { useEffect, useMemo, useState } from "react";
import { api } from "@jam-practice/convex/_generated/api";
import type { Id } from "@jam-practice/convex/_generated/dataModel";
import { BugIcon, CheckIcon, CloseIcon, FeedbackIcon, FlagIcon, SparkIcon } from "@/components/tools";
import { useSiteStatus } from "@/lib/useSiteStatus";

export type FeedbackKind = "bug" | "feature" | "other" | "report";
export type FeedbackTarget = { type: "post" | "profile"; id: string; label: string };

/** Open the feedback dialog from anywhere: `openFeedback()` or `openFeedback({ kind: "report", target })`. */
export const OPEN_FEEDBACK_EVENT = "soniroll:open-feedback";
export function openFeedback(detail?: { kind?: FeedbackKind; target?: FeedbackTarget }) {
  window.dispatchEvent(new CustomEvent(OPEN_FEEDBACK_EVENT, { detail }));
}

const KINDS: { id: Exclude<FeedbackKind, "report">; label: string; hint: string; Icon: (p: { className?: string }) => React.ReactNode; placeholder: string }[] = [
  { id: "bug", label: "Something's broken", hint: "A bug or something not working", Icon: BugIcon, placeholder: "What happened, and what did you expect? Which tool, and on what device?" },
  { id: "feature", label: "An idea", hint: "A feature or tool you'd like", Icon: SparkIcon, placeholder: "What would you like soniroll to do?" },
  { id: "other", label: "Something else", hint: "A question, a complaint, a thank-you", Icon: FeedbackIcon, placeholder: "What's on your mind?" },
];

const MAX_SHOT_MB = 10;

/**
 * The feedback form: what kind (a bug, an idea, something else — or a report of a post/profile),
 * the message, a screenshot (signed in), and a reply-to email when signed out. Sends the page
 * you're on and your browser with it.
 */
export default function FeedbackForm({
  initialKind = "bug",
  target,
  onDone,
  onCancel,
  compact = false,
}: {
  initialKind?: FeedbackKind;
  target?: FeedbackTarget;
  onDone?: () => void;
  onCancel?: () => void;
  compact?: boolean;
}) {
  const { isAuthenticated } = useConvexAuth();
  const site = useSiteStatus();
  const submit = useMutation(api.feedback.submit);
  const uploadUrl = useMutation(api.feedback.generateUploadUrl);
  const [kind, setKind] = useState<FeedbackKind>(target ? "report" : initialKind);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [shot, setShot] = useState<File | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [sentNumber, setSentNumber] = useState<number | null>(null);

  const shotUrl = useMemo(() => (shot ? URL.createObjectURL(shot) : null), [shot]);
  useEffect(() => () => (shotUrl ? URL.revokeObjectURL(shotUrl) : undefined), [shotUrl]);

  const report = kind === "report";
  const current = KINDS.find((k) => k.id === kind);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (busy || (!message.trim() && !report)) return;
    setBusy(true);
    setError(null);
    try {
      let screenshotId: Id<"_storage"> | undefined;
      if (shot && isAuthenticated) {
        const url = await uploadUrl();
        const res = await fetch(url, { method: "POST", headers: { "Content-Type": shot.type || "image/png" }, body: shot });
        if (!res.ok) throw new Error("The screenshot didn't upload — try again, or send without it.");
        screenshotId = ((await res.json()) as { storageId: Id<"_storage"> }).storageId;
      }
      const result = await submit({
        kind,
        message,
        ...(email.trim() ? { email } : {}),
        page: window.location.pathname + window.location.search,
        userAgent: navigator.userAgent,
        // From the desktop app, its own version too (it bundles this website version).
        version: `${APP_VERSION}${CHANNEL === "stable" ? "" : ` ${CHANNEL}`}${DESKTOP_VERSION ? ` · desktop ${DESKTOP_VERSION}` : ""}`,
        ...(screenshotId ? { screenshotId } : {}),
        ...(target ? { target } : {}),
      });
      setSentNumber(result?.number ?? null);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/^[\s\S]*Uncaught Error: /, "").split("\n")[0] : "Couldn't send that.");
    } finally {
      setBusy(false);
    }
  }

  if (sent)
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
          <CheckIcon className="h-7 w-7" />
        </span>
        <p className="text-base font-semibold">{report ? "Thanks — we'll take a look" : "Thanks for telling us!"}</p>
        {sentNumber !== null && <p className="rounded-md bg-foreground/[0.05] px-2 py-0.5 font-mono text-xs font-medium">FB-{sentNumber}</p>}
        <p className="max-w-sm text-sm text-muted">
          {report
            ? "Reports go straight to the person who runs soniroll."
            : isAuthenticated
              ? "It went straight to the person who builds soniroll. You can see where it's at on the Feedback page."
              : "It went straight to the person who builds soniroll."}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setSent(false);
              setMessage("");
              setShot(null);
            }}
            className="h-9 rounded-md px-4 text-sm font-medium hover:bg-surface-hover"
          >
            Send another
          </button>
          {onDone && (
            <button type="button" onClick={onDone} className="h-9 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground hover:bg-accent-hover">
              Done
            </button>
          )}
        </div>
      </div>
    );

  if (site?.feedbackPaused)
    return <p className="rounded-lg bg-amber-500/15 px-4 py-6 text-center text-sm font-medium text-amber-700 dark:text-amber-300">Feedback is paused for a bit. Try again later — thanks for wanting to help!</p>;

  return (
    <form onSubmit={send} className="flex flex-col gap-4">
      {report ? (
        <div className="flex items-center gap-3 rounded-md bg-danger/10 p-3 text-sm">
          <FlagIcon className="h-5 w-5 shrink-0 text-danger" />
          <span>
            Reporting {target?.type === "profile" ? "the profile" : "the post"} <b>{target?.label}</b>. Tell us what&apos;s wrong (optional).
          </span>
        </div>
      ) : (
        <div className={`grid gap-2 ${compact ? "grid-cols-3" : "sm:grid-cols-3"}`}>
          {KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              aria-pressed={kind === k.id}
              onClick={() => setKind(k.id)}
              className={`flex flex-col items-start gap-1.5 rounded-md p-3 text-left transition-colors ${
                kind === k.id ? "bg-accent/10 ring-2 ring-inset ring-accent" : "bg-foreground/[0.05] hover:bg-surface-hover"
              }`}
            >
              <k.Icon className={`h-4 w-4 ${kind === k.id ? "text-accent" : ""}`} />
              <span className="text-sm font-medium leading-tight">{k.label}</span>
              {!compact && <span className="text-xs text-muted">{k.hint}</span>}
            </button>
          ))}
        </div>
      )}
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={compact ? 5 : 7}
        maxLength={5000}
        autoFocus
        placeholder={report ? "Spam, something offensive, someone else's work…" : current?.placeholder}
        aria-label="Your message"
        className="w-full resize-y rounded-md bg-foreground/[0.05] px-3 py-2.5 text-sm leading-relaxed outline-none focus:ring-2 focus:ring-accent/40"
      />
      {!report && (
        <div className="flex flex-wrap items-center gap-3">
          {isAuthenticated ? (
            shot && shotUrl ? (
              <span className="flex items-center gap-2 rounded-md bg-foreground/[0.05] p-1.5 pr-2">
                {/* eslint-disable-next-line @next/next/no-img-element -- a local preview */}
                <img src={shotUrl} alt="" className="h-10 w-14 rounded-lg object-cover" />
                <span className="max-w-40 truncate text-xs font-semibold">{shot.name}</span>
                <button type="button" aria-label="Remove screenshot" onClick={() => setShot(null)} className="flex h-6 w-6 items-center justify-center rounded-sm text-muted hover:bg-surface-hover">
                  <CloseIcon className="h-3.5 w-3.5" />
                </button>
              </span>
            ) : (
              <label className="flex h-8 cursor-pointer items-center rounded-md bg-foreground/[0.05] px-3 text-xs font-medium hover:bg-surface-hover">
                Attach a screenshot
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f && f.size > MAX_SHOT_MB * 1024 * 1024) setError(`Screenshots up to ${MAX_SHOT_MB} MB.`);
                    else setShot(f ?? null);
                  }}
                />
              </label>
            )
          ) : (
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email, if you'd like a reply"
              aria-label="Your email (optional)"
              className={`h-9 min-w-0 flex-1 basis-full ${compact ? "" : "sm:basis-auto"} rounded-md bg-foreground/[0.05] px-3 text-sm outline-none focus:ring-2 focus:ring-accent/40`}
            />
          )}
          <span className="text-xs text-muted">The page you&apos;re on is included.</span>
        </div>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex justify-end gap-2">
        {onCancel && (
          <button type="button" onClick={onCancel} className="h-9 rounded-md px-4 text-sm font-medium hover:bg-surface-hover">
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={busy || (!message.trim() && !report)}
          className={`h-9 rounded-md px-4 text-sm font-medium disabled:opacity-40 ${report ? "bg-danger text-white hover:opacity-90" : "bg-accent text-accent-foreground hover:bg-accent-hover"}`}
        >
          {busy ? "Sending…" : report ? "Send report" : "Send"}
        </button>
      </div>
    </form>
  );
}
