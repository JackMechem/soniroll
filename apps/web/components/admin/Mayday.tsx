"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { type ReactNode, useState } from "react";
import { api } from "@jam-practice/convex/_generated/api";
import LoadingSpinner from "@/components/LoadingSpinner";
import { CloseIcon } from "@/components/tools";

type Flags = {
  maintenance: boolean;
  maintenanceMessage: string;
  banner: string;
  bannerTone: "info" | "warning";
  communityOff: boolean;
  postingPaused: boolean;
  signupsPaused: boolean;
  uploadsPaused: boolean;
  feedbackPaused: boolean;
};
type BoolFlag = "maintenance" | "communityOff" | "postingPaused" | "signupsPaused" | "uploadsPaused" | "feedbackPaused";

const SWITCHES: { key: BoolFlag; title: string; what: string; when: string }[] = [
  {
    key: "communityOff",
    title: "Community off",
    what: "Hides the feed, posts, public profiles, people search and shared setlist / routine links. Nothing is deleted; flip it back and it's all there.",
    when: "Someone's posting something awful and you can't clean it up right now.",
  },
  {
    key: "postingPaused",
    title: "Pause posting",
    what: "Nobody can make new Community posts. Existing posts stay up. (Everyone's already limited to 10 posts a day.)",
    when: "A flood of spam posts, or a bug in posting.",
  },
  {
    key: "signupsPaused",
    title: "Pause sign-ups",
    what: "No new accounts, by email or Google. Existing accounts sign in as usual, and every tool still works without an account.",
    when: "Bots are making accounts, or you've hit the email limit.",
  },
  {
    key: "uploadsPaused",
    title: "Pause uploads",
    what: "No new files: recordings, songs, pictures, banners, lesson files, hand-ins, screenshots. Files already uploaded still play and show.",
    when: "Storage is filling up fast, or someone's uploading things they shouldn't.",
  },
  {
    key: "feedbackPaused",
    title: "Pause feedback",
    what: "Closes the feedback form and hides the bug button. (Signed-out feedback is already capped at 30 an hour site-wide.)",
    when: "The inbox is being spammed.",
  },
];

function BigSwitch({ on, onClick, disabled, danger = false, label }: { on: boolean; onClick: () => void; disabled: boolean; danger?: boolean; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${on ? (danger ? "bg-danger" : "bg-accent") : "bg-foreground/15"}`}
    >
      <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-background shadow-sm transition-transform ${on ? "translate-x-5" : ""}`} />
    </button>
  );
}

/** One bordered setting, Vercel-style: a title and what it does on the left, its control on the
    right, and an optional footer strip with a hint and buttons. */
function Setting({
  title,
  on,
  onLabel = "On",
  description,
  control,
  footer,
  children,
}: {
  title: string;
  on?: boolean;
  onLabel?: string;
  description: ReactNode;
  control?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className={`flex min-w-0 flex-col overflow-hidden rounded-lg border bg-surface ${on ? "border-foreground/30" : "border-foreground/10"}`}>
      <div className="flex flex-col gap-3 p-4 sm:p-5">
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <h3 className="flex items-center gap-2 text-sm font-medium">
              {title}
              {on && <span className="rounded-sm bg-foreground px-1.5 text-[11px] font-medium text-background">{onLabel}</span>}
            </h3>
            <div className="mt-1 text-sm text-muted">{description}</div>
          </div>
          {control}
        </div>
        {children}
      </div>
      {footer && <div className="flex flex-wrap items-center gap-2 border-t border-foreground/10 bg-background/40 px-4 py-2.5 text-xs text-muted sm:px-5">{footer}</div>}
    </section>
  );
}

/**
 * Admin → Mayday: the site's emergency switches (`packages/convex/lib/site.ts`). Only the owner can
 * flip them; other admins can see what's on. Everything is enforced on the server and reversible.
 */
export default function Mayday() {
  const data = useQuery(api.admin.siteSwitches, {});
  const role = useQuery(api.admin.myRole, {});
  const set = useMutation(api.admin.setSiteFlags);
  const reset = useMutation(api.admin.resetSiteFlags);
  const signOutAll = useAction(api.admin.signEveryoneOut);
  const [confirm, setConfirm] = useState<null | { title: string; body: string; word: string; action: () => Promise<unknown> }>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [maintText, setMaintText] = useState<string | null>(null);

  if (!data || role === undefined)
    return (
      <div className="flex justify-center py-16">
        <LoadingSpinner />
      </div>
    );
  const f = data.flags as Flags;
  const owner = role === "owner";
  const anyOn = f.maintenance || SWITCHES.some((s) => f[s.key]) || !!f.banner;
  const flip = (patch: Partial<Flags>) => void set({ patch }).catch((e: Error) => setMsg(e.message));
  const bannerDraft = banner ?? f.banner;
  const maintDraft = maintText ?? f.maintenanceMessage;

  const textarea = "w-full resize-y rounded-md bg-foreground/[0.05] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-60";

  return (
    <div className="flex flex-col gap-4">
      {/* Status strip */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg bg-surface px-4 py-3">
        <span className={`h-2 w-2 shrink-0 rounded-full ${anyOn ? "bg-danger" : "bg-accent"}`} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{anyOn ? "Mayday measures are on" : "All systems normal"}</p>
          <p className="text-xs text-muted">
            {data.updatedAt
              ? `Last changed ${new Date(data.updatedAt).toLocaleString()}${data.updatedBy ? ` by ${data.updatedBy}` : ""}`
              : "Nothing has ever been switched."}
            {!owner && " · Only the owner can flip these."}
          </p>
        </div>
        {anyOn && owner && (
          <button type="button" onClick={() => void reset()} className="h-9 rounded-md bg-accent px-3 text-sm font-medium text-accent-foreground hover:bg-accent-hover">
            Everything back to normal
          </button>
        )}
      </div>
      {msg && (
        <p className="flex items-center justify-between gap-2 rounded-md border border-danger/30 px-3 py-2 text-sm text-danger">
          {msg}
          <button type="button" onClick={() => setMsg(null)} aria-label="Dismiss" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md hover:bg-surface-hover">
            <CloseIcon className="h-4 w-4" />
          </button>
        </p>
      )}

      {/* The big one */}
      <section className={`flex min-w-0 flex-col overflow-hidden rounded-lg border bg-surface ${f.maintenance ? "border-danger" : "border-danger/40"}`}>
        <div className="flex flex-col gap-3 p-4 sm:p-5">
          <div className="flex items-start gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-danger">The big red switch</p>
              <h2 className="mt-0.5 flex items-center gap-2 text-base font-semibold">
                Maintenance mode
                {f.maintenance && <span className="rounded-sm bg-danger px-1.5 text-[11px] font-medium text-background">On</span>}
              </h2>
              <p className="mt-1 max-w-2xl text-sm text-muted">
                The whole site shows a &quot;Back soon&quot; screen to everyone except admins (you can still sign in from it). The tools, Community, everything. Nothing is
                lost; flip it off and people carry on.
              </p>
            </div>
            <BigSwitch
              on={f.maintenance}
              disabled={!owner}
              danger
              label="Maintenance mode"
              onClick={() =>
                f.maintenance
                  ? flip({ maintenance: false })
                  : setConfirm({
                      title: "Take the whole site down?",
                      body: "Everyone who isn't an admin sees the maintenance screen until you switch it off.",
                      word: "maintenance",
                      action: () => set({ patch: { maintenance: true, maintenanceMessage: maintDraft } }),
                    })
              }
            />
          </div>
          <textarea
            value={maintDraft}
            onChange={(e) => setMaintText(e.target.value)}
            disabled={!owner}
            rows={2}
            maxLength={500}
            aria-label="Maintenance message"
            placeholder="soniroll is down for a little maintenance. Your stuff is safe — check back in a bit."
            className={textarea}
          />
        </div>
        {owner && maintText !== null && maintText !== f.maintenanceMessage && (
          <div className="flex items-center justify-end gap-2 border-t border-foreground/10 bg-background/40 px-4 py-2.5 sm:px-5">
            <button
              type="button"
              onClick={() => {
                flip({ maintenanceMessage: maintText });
                setMaintText(null);
              }}
              className="h-8 rounded-md bg-accent px-3 text-xs font-medium text-accent-foreground hover:bg-accent-hover"
            >
              Save message
            </button>
          </div>
        )}
      </section>

      {/* Smaller switches */}
      <div className="grid gap-4 md:grid-cols-2">
        {SWITCHES.map((sw) => {
          const on = f[sw.key];
          return (
            <Setting
              key={sw.key}
              title={sw.title}
              on={on}
              description={sw.what}
              control={<BigSwitch on={on} disabled={!owner} label={sw.title} onClick={() => flip({ [sw.key]: !on })} />}
              footer={
                <span>
                  <span className="font-medium text-foreground">Use it when:</span> {sw.when}
                </span>
              }
            />
          );
        })}

        {/* Banner */}
        <Setting
          title="Announcement banner"
          on={!!f.banner}
          onLabel="Showing"
          description={<>A message across the top of every page, e.g. &quot;Maintenance tonight at 9pm&quot;. People can close it.</>}
          footer={
            owner ? (
              <>
                <div role="radiogroup" aria-label="Banner tone" className="flex gap-0.5 rounded-md bg-surface p-0.5">
                  {(["info", "warning"] as const).map((tone) => (
                    <button
                      key={tone}
                      type="button"
                      role="radio"
                      aria-checked={f.bannerTone === tone}
                      onClick={() => flip({ bannerTone: tone })}
                      className={`rounded-sm px-2.5 py-1 text-xs font-medium transition-colors ${f.bannerTone === tone ? "bg-surface-hover text-foreground shadow-sm" : "text-muted hover:text-foreground"}`}
                    >
                      {tone === "info" ? "Info" : "Warning"}
                    </button>
                  ))}
                </div>
                <div className="ml-auto flex gap-2">
                  {f.banner && (
                    <button
                      type="button"
                      onClick={() => {
                        flip({ banner: "" });
                        setBanner(null);
                      }}
                      className="h-8 rounded-md bg-foreground/[0.05] px-3 text-xs font-medium text-foreground transition-colors hover:bg-surface-hover"
                    >
                      Take it down
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={!bannerDraft.trim() || bannerDraft.trim() === f.banner}
                    onClick={() => {
                      flip({ banner: bannerDraft });
                      setBanner(null);
                    }}
                    className="h-8 rounded-md bg-accent px-3 text-xs font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-40"
                  >
                    {f.banner ? "Update" : "Show it"}
                  </button>
                </div>
              </>
            ) : undefined
          }
        >
          <textarea
            value={bannerDraft}
            onChange={(e) => setBanner(e.target.value)}
            disabled={!owner}
            rows={2}
            maxLength={300}
            aria-label="Banner message"
            placeholder="Heads up: …"
            className={textarea}
          />
        </Setting>
      </div>

      {/* One-shot buttons */}
      <Setting
        title="Sign everyone out"
        description="Ends every session on every device, except yours. For when an account or password might have leaked. People just sign in again; no data is touched."
        control={
          <button
            type="button"
            disabled={!owner}
            onClick={() =>
              setConfirm({
                title: "Sign everyone out?",
                body: "Every account (except yours) is signed out on every device right now.",
                word: "sign out",
                action: async () => setMsg(`Signed out ${await signOutAll()} session(s).`),
              })
            }
            className="h-9 shrink-0 rounded-md border border-danger/40 px-3 text-sm font-medium text-danger transition-colors hover:bg-danger/10 disabled:opacity-40"
          >
            Sign everyone out
          </button>
        }
      />

      {confirm && <TypedConfirm {...confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}

function TypedConfirm({ title, body, word, action, onClose }: { title: string; body: string; word: string; action: () => Promise<unknown>; onClose: () => void }) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-overlay sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-label={title}
        className="flex w-full flex-col gap-4 rounded-t-xl ring-1 ring-foreground/[0.06] bg-surface p-5 shadow-2xl shadow-black/20 sm:max-w-md sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="text-sm text-muted">{body}</p>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Type <code className="self-start rounded-sm bg-background px-1.5">{word}</code> to confirm
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoFocus
            className="h-9 rounded-md bg-foreground/[0.05] px-3 text-sm font-normal outline-none focus:ring-2 focus:ring-accent/40"
          />
        </label>
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-9 rounded-md bg-foreground/[0.05] px-4 text-sm font-medium transition-colors hover:bg-surface-hover">
            Cancel
          </button>
          <button
            type="button"
            disabled={typed.trim().toLowerCase() !== word || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await action();
                onClose();
              } catch (e) {
                setError(e instanceof Error ? e.message.replace(/^[\s\S]*Uncaught Error: /, "").split("\n")[0] : "Something went wrong.");
                setBusy(false);
              }
            }}
            className="h-9 rounded-md bg-danger px-4 text-sm font-medium text-background hover:opacity-90 disabled:opacity-40"
          >
            {busy ? "Working…" : "Do it"}
          </button>
        </div>
      </div>
    </div>
  );
}
