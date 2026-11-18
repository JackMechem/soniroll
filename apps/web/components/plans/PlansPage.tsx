"use client";

import { api } from "@jam-practice/convex/_generated/api";
import { useConvexAuth } from "@convex-dev/auth/react";
import { useAction, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState, useSyncExternalStore } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import LoadingSpinner from "@/components/LoadingSpinner";
import { Segmented } from "@/components/metronome/MetronomeOptions";
import { CheckIcon, CloseIcon, CloudIcon, DeviceIcon, DownloadIcon } from "@/components/tools";
import { askToKeepFiles, filesKept, inDesktopApp, useDeviceUrls } from "@/lib/deviceFiles";
import { useBackup } from "@/lib/storageMove";
import { errorText, formatBytes } from "@/lib/files";
import { SIGN_IN_PATH } from "@/lib/landing";
import { PLAN_HREF, useStoragePlan } from "@/lib/storagePlan";
import { useSiteSettings } from "@/lib/siteSettings";

/**
 * Storage plans. Every tool and feature is free; a plan only keeps files, recordings and songs
 * online, on all your devices (free accounts keep them on the device that saved them).
 *
 * `StoragePlans` is the Account page's "Storage plan" section (`/account?tab=storage`): your plan
 * (usage, renews/ends, switch, cancel or resume, payment details), or the plans for sale (checkout
 * opens in an overlay on the page — Polar's embedded checkout), plus how the website, the desktop
 * app and a plan compare. `/plans` (`PlansPage`) shows the same signed out, and sends you to the
 * Account section once you're signed in.
 */

type Interval = "month" | "year";
type Plan = { productId: string; name: string; storageGb: number; interval: Interval; priceCents: number; currency: string };

function price(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase(), minimumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
}

function longDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

const noSubscribe = () => () => {};

/** `/plans`: signed in, the Account page's section; signed out, the plans and the comparison. */
export default function PlansPage() {
  return (
    <Suspense>
      <PlansRoute />
    </Suspense>
  );
}

function PlansRoute() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const router = useRouter();
  const params = useSearchParams();
  useEffect(() => {
    if (isAuthenticated) router.replace(`${PLAN_HREF}${params.get("welcome") === "1" ? "&welcome=1" : ""}`);
  }, [isAuthenticated, params, router]);
  if (isLoading || isAuthenticated) {
    return (
      <div className="flex justify-center py-24">
        <LoadingSpinner />
      </div>
    );
  }
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 pb-16 pt-[calc(env(safe-area-inset-top)+4.5rem)] sm:px-6 lg:pt-8">
      <header className="flex flex-col gap-1.5 border-b border-foreground/10 pb-5">
        <h1 className="flex items-center gap-2 text-2xl font-extrabold sm:text-3xl">
          <CloudIcon className="h-6 w-6 shrink-0 text-accent" />
          Storage plans
        </h1>
        <Intro />
      </header>
      <StoragePlans />
    </main>
  );
}

function Intro() {
  return (
    <p className="max-w-2xl text-sm text-muted sm:text-base">
      Every tool and feature in soniroll is free, and your tunes, charts, notes, Shed Log and settings sync to all your devices for free too. A plan keeps
      your files, recordings and songs online as well, so they&apos;re on all your devices and safe if one is lost.
    </p>
  );
}

/** The Account page's Storage plan section (and `/plans`' body). */
export function StoragePlans({ inAccount = false }: { inAccount?: boolean }) {
  return (
    <Suspense>
      <PlansBody inAccount={inAccount} />
    </Suspense>
  );
}

function PlansBody({ inAccount }: { inAccount: boolean }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const storage = useStoragePlan();
  const plans = useQuery(api.billing.plans, {}) as Plan[] | undefined;
  const checkout = useAction(api.billing.checkout);
  const portal = useAction(api.billing.portal);
  const changePlan = useAction(api.billing.changePlan);
  const cancelPlan = useAction(api.billing.cancelPlan);
  const resumePlan = useAction(api.billing.resumePlan);
  const params = useSearchParams();
  const desktop = useSyncExternalStore(noSubscribe, inDesktopApp, () => false);
  // The Monthly/Yearly switch starts on your plan's period (yearly without one).
  const [picked, setBilling] = useState<Interval | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [welcome, setWelcome] = useState(params.get("welcome") === "1");
  const [confirm, setConfirm] = useState<{ kind: "switch"; plan: Plan } | { kind: "cancel" } | null>(null);
  const embedRef = useRef<{ close: () => void } | null>(null);

  // Polar adds a customer session token to the address it sends people back to; keep it out of
  // the address bar (and history, and anything copied from it).
  useEffect(() => {
    if (!params.get("customer_session_token")) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("customer_session_token");
    window.history.replaceState(window.history.state, "", url.pathname + url.search);
  }, [params]);
  useEffect(() => () => embedRef.current?.close(), []);

  const current = storage?.plan ?? null;
  const interval: Interval = picked ?? current?.interval ?? "year";
  const hasYearly = (plans ?? []).some((p) => p.interval === "year");
  const hasMonthly = (plans ?? []).some((p) => p.interval === "month");
  const shown = (plans ?? []).filter((p) => p.interval === interval);

  /** Polar's pages open in the browser (the desktop app hands them to the system browser). */
  function go(url: string) {
    if (desktop) window.open(url, "_blank", "noopener,noreferrer");
    else window.location.assign(url);
  }

  async function run(key: string, what: () => Promise<unknown>, fallback: string) {
    setBusy(key);
    setError(null);
    try {
      await what();
    } catch (e) {
      setError(errorText(e, fallback));
    } finally {
      setBusy(null);
    }
  }

  /** The checkout in an overlay on this page when the site's address matches what Polar was told;
      otherwise (desktop app, preview builds) Polar's own page. */
  const buy = (productId: string) =>
    run(
      productId,
      async () => {
        const { url, embedOrigin } = await checkout({ productId });
        if (desktop || window.location.origin !== embedOrigin) return go(url);
        const { PolarEmbedCheckout } = await import("@/lib/vendor/polarEmbed");
        const dark = document.documentElement.classList.contains("dark");
        const embed = await PolarEmbedCheckout.create(url, { theme: dark ? "dark" : "light" });
        embedRef.current = embed;
        embed.addEventListener("success", (e) => {
          // Stay here (no redirect): the plan shows as soon as Polar's webhook arrives.
          e.preventDefault();
          embed.close();
          embedRef.current = null;
          setWelcome(true);
        });
        embed.addEventListener("close", () => {
          embedRef.current = null;
        });
      },
      "Couldn't open the checkout.",
    );

  const manageCard = () => run("portal", async () => go((await portal({})).url), "Couldn't open the payment page.");

  return (
    <div className="flex flex-col gap-6">
      {inAccount && <Intro />}

      {welcome && (
        <p className="flex items-center gap-2 rounded-lg bg-accent/10 px-4 py-3 text-sm">
          <CheckIcon className="h-4 w-4 shrink-0 text-accent" />
          {current
            ? "Thanks for subscribing! New files are now kept online, on all your devices."
            : "Thanks for subscribing! Your plan shows here as soon as the payment is confirmed (usually a few seconds)."}
        </p>
      )}

      {current && storage && (
        <section className="flex flex-col gap-4 rounded-xl bg-surface p-5">
          <div>
            <h3 className="text-lg font-bold">Your plan: {current.storageGb} GB</h3>
            <p className="text-sm text-muted">
              {price(current.priceCents, current.currency)} a {current.interval}
              {current.renewsAt && ` · ${current.cancelAtPeriodEnd ? "ends" : "renews"} ${longDate(current.renewsAt)}`}
            </p>
            {current.status === "past_due" && <p className="mt-1 text-sm text-danger">The last payment didn&apos;t go through. Update your card below.</p>}
          </div>
          <UsageBar used={storage.used} quota={storage.quota} />
          <NewFilesDefault />
          {current.cancelAtPeriodEnd && (
            <div className="flex flex-col gap-3 rounded-lg bg-foreground/[0.05] p-3 text-sm sm:flex-row sm:items-center">
              <p className="min-w-0 flex-1 text-muted">
                Your plan ends{current.renewsAt ? ` on ${longDate(current.renewsAt)}` : " at the end of this period"}. Until then nothing changes. After
                that, new files are kept on the device that saved them, and files already online stay there.
              </p>
              <button
                type="button"
                onClick={() => void run("resume", () => resumePlan({}), "Couldn't resume your plan.")}
                disabled={busy !== null}
                className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md bg-accent px-3 text-sm font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-50"
              >
                {busy === "resume" && <LoadingSpinner size="sm" inline label="Resuming" />}
                Keep my plan
              </button>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2 border-t border-foreground/10 pt-4">
            <button
              type="button"
              onClick={() => void manageCard()}
              disabled={busy !== null}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-foreground/[0.05] px-3 text-sm font-medium hover:bg-surface-hover disabled:opacity-50"
            >
              {busy === "portal" && <LoadingSpinner size="sm" inline label="Opening" />}
              Payment details and receipts
            </button>
            {!current.cancelAtPeriodEnd && (
              <button
                type="button"
                onClick={() => setConfirm({ kind: "cancel" })}
                disabled={busy !== null}
                className="ml-auto inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium text-danger hover:bg-surface-hover disabled:opacity-50"
              >
                {busy === "cancel" && <LoadingSpinner size="sm" inline label="Cancelling" />}
                Cancel plan
              </button>
            )}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-bold">{current ? "Switch plan" : "Plans"}</h3>
          {hasMonthly && hasYearly && (
            <Segmented
              label="Billing"
              value={interval}
              onChange={setBilling}
              options={[
                { value: "month", label: "Monthly" },
                { value: "year", label: "Yearly" },
              ]}
              onPage
            />
          )}
        </div>
        {plans === undefined ? (
          <div className="flex justify-center py-8">
            <LoadingSpinner />
          </div>
        ) : plans.length === 0 ? (
          <p className="rounded-xl border border-dashed border-foreground/15 p-6 text-center text-sm text-muted">Plans aren&apos;t on sale yet. Check back soon.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            {(shown.length ? shown : plans).map((p) => {
              const monthly = plans.find((m) => m.storageGb === p.storageGb && m.interval === "month");
              const saved = p.interval === "year" && monthly ? Math.round(monthly.priceCents * 12 - p.priceCents) : 0;
              const mine = current?.productId === p.productId;
              const tooSmall = !!current && !!storage && storage.used > p.storageGb * 1024 ** 3;
              return (
                <div key={p.productId} className={`flex flex-col gap-3 rounded-xl bg-surface p-5 ${mine ? "ring-2 ring-accent" : ""}`}>
                  <div>
                    <p className="text-2xl font-extrabold">{p.storageGb} GB</p>
                    <p className="text-sm text-muted">
                      <span className="text-base font-semibold text-foreground">{price(p.priceCents, p.currency)}</span> a {p.interval}
                    </p>
                    {saved > 0 && <p className="text-xs text-accent">Saves {price(saved, p.currency)} on paying monthly</p>}
                  </div>
                  {mine ? (
                    <span className="mt-auto inline-flex h-10 items-center justify-center gap-1.5 rounded-full text-sm font-semibold text-accent">
                      <CheckIcon className="h-4 w-4" /> Your plan
                    </span>
                  ) : current ? (
                    <button
                      type="button"
                      onClick={() => setConfirm({ kind: "switch", plan: p })}
                      disabled={busy !== null || tooSmall}
                      title={tooSmall ? "You keep more than this online" : undefined}
                      className="mt-auto inline-flex h-10 items-center justify-center gap-2 rounded-full bg-foreground/[0.05] px-4 text-sm font-semibold hover:bg-surface-hover disabled:opacity-50"
                    >
                      {busy === p.productId && <LoadingSpinner size="sm" inline label="Switching" />}
                      {current.storageGb === p.storageGb ? `Switch to ${p.interval === "year" ? "yearly" : "monthly"}` : `Switch to ${p.storageGb} GB`}
                    </button>
                  ) : isAuthenticated ? (
                    <button
                      type="button"
                      onClick={() => void buy(p.productId)}
                      disabled={busy !== null || storage === undefined}
                      className="mt-auto inline-flex h-10 items-center justify-center gap-2 rounded-full bg-accent px-4 text-sm font-semibold text-accent-foreground hover:bg-accent-hover disabled:opacity-50"
                    >
                      {busy === p.productId && <LoadingSpinner size="sm" inline label="Opening the checkout" />}
                      Get {p.storageGb} GB
                    </button>
                  ) : (
                    <Link
                      href={SIGN_IN_PATH}
                      className="mt-auto inline-flex h-10 items-center justify-center rounded-full bg-foreground/[0.05] px-4 text-sm font-semibold hover:bg-surface-hover"
                    >
                      {isLoading ? "…" : "Sign in to subscribe"}
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <p className="text-xs text-muted">
          {current ? "Switching takes effect straight away; Polar charges or credits the difference. " : "Payments, sales tax and receipts are handled by Polar. "}
          Cancel any time: your plan runs to the end of what you paid for, and files already online stay there — you can move them to a device or
          download them whenever you like.
        </p>
      </section>
      {error && <p className="text-sm text-danger">{error}</p>}

      {storage && <BackupFiles />}

      <Comparison desktop={desktop} freeOnline={storage?.freeQuota} />

      {!desktop && <KeepFiles />}

      {confirm?.kind === "cancel" && current && (
        <ConfirmDialog
          title="Cancel your storage plan?"
          message={`It keeps working until ${current.renewsAt ? longDate(current.renewsAt) : "the end of this period"}, and you won't be charged again. After that, new files are kept on the device that saved them; files already online stay there. You can change your mind until then.`}
          confirmLabel="Cancel plan"
          cancelLabel="Keep plan"
          onConfirm={() => {
            setConfirm(null);
            void run("cancel", () => cancelPlan({}), "Couldn't cancel your plan.");
          }}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm?.kind === "switch" && (
        <ConfirmDialog
          title={current?.storageGb === confirm.plan.storageGb ? `Switch to paying ${confirm.plan.interval === "year" ? "yearly" : "monthly"}?` : `Switch to ${confirm.plan.storageGb} GB?`}
          message={`${price(confirm.plan.priceCents, confirm.plan.currency)} a ${confirm.plan.interval}, starting now. Polar charges or credits the difference for the rest of this period.`}
          confirmLabel="Switch plan"
          onConfirm={() => {
            const productId = confirm.plan.productId;
            setConfirm(null);
            void run(productId, () => changePlan({ productId }), "Couldn't switch your plan.");
          }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

function UsageBar({ used, quota }: { used: number; quota: number }) {
  const frac = Math.min(1, used / Math.max(1, quota));
  return (
    <div className="flex flex-col gap-1">
      <span className="h-1.5 overflow-hidden rounded-full bg-foreground/10">
        <span className="block h-full rounded-full" style={{ width: `${Math.max(frac, used ? 0.01 : 0) * 100}%`, background: frac > 0.9 ? "var(--danger)" : "var(--accent)" }} />
      </span>
      <span className="text-xs tabular-nums text-muted">
        {formatBytes(used)} of {formatBytes(quota)} used
      </span>
    </div>
  );
}

type Cell = { yes: boolean; text?: string };

/** How the website and desktop app (both free) compare with a plan. */
function Comparison({ desktop, freeOnline }: { desktop: boolean; freeOnline?: number }) {
  const free = formatBytes(freeOnline ?? 50 * 1024 * 1024);
  const rows: { label: string; web: Cell; app: Cell; plan: Cell }[] = [
    { label: "Every tool and feature", web: { yes: true }, app: { yes: true }, plan: { yes: true } },
    { label: "Tunes, charts, notes, Shed Log and settings on all your devices", web: { yes: true }, app: { yes: true }, plan: { yes: true } },
    {
      label: "Where files, recordings and songs are kept",
      web: { yes: true, text: "In this browser" },
      app: { yes: true, text: "On your computer" },
      plan: { yes: true, text: "Online" },
    },
    { label: "Files on all your devices", web: { yes: false }, app: { yes: false }, plan: { yes: true } },
    {
      label: "Safe if you clear the browser's data",
      web: { yes: false, text: "Clearing site data deletes them; Safari can clear them after 7 days away" },
      app: { yes: true },
      plan: { yes: true },
    },
    {
      label: "How much you can keep",
      web: { yes: true, text: "What the browser allows" },
      app: { yes: true, text: "As much as your disk holds" },
      plan: { yes: true, text: "Your plan's size" },
    },
    {
      label: "Share files by link, Lessons and your profile picture",
      web: { yes: true, text: `Up to ${free} online` },
      app: { yes: true, text: `Up to ${free} online` },
      plan: { yes: true, text: "Your plan's size" },
    },
  ];
  const cols = [
    { key: "web" as const, title: "Website", sub: "Free", icon: <DeviceIcon className="h-4 w-4" /> },
    { key: "app" as const, title: "Desktop app", sub: "Free", icon: <DownloadIcon className="h-4 w-4" /> },
    { key: "plan" as const, title: "Storage plan", sub: "Website or desktop app", icon: <CloudIcon className="h-4 w-4" /> },
  ];
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-lg font-bold">Website, desktop app or a plan</h3>
      {/* Phones: one card per option. */}
      <div className="grid gap-3 sm:hidden">
        {cols.map((c) => (
          <div key={c.key} className="flex flex-col gap-2 rounded-xl bg-surface p-4">
            <p className="flex items-center gap-2 font-semibold">
              <span className="text-accent">{c.icon}</span>
              {c.title} <span className="text-xs font-normal text-muted">· {c.sub}</span>
            </p>
            <ul className="flex flex-col gap-1.5">
              {rows.map((r) => (
                <li key={r.label} className="flex gap-2 text-sm">
                  <Mark yes={r[c.key].yes} />
                  <span className={r[c.key].yes ? "" : "text-muted"}>
                    {r.label}
                    {r[c.key].text && <span className="block text-xs text-muted">{r[c.key].text}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {/* Wider: a table. */}
      <div className="hidden overflow-hidden rounded-xl bg-surface sm:block">
        <div role="table" className="divide-y divide-foreground/10 text-sm">
          <div role="row" className="grid grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]">
            <span role="columnheader" />
            {cols.map((c) => (
              <span key={c.key} role="columnheader" className="flex flex-col px-4 py-3">
                <span className="flex items-center gap-2 font-semibold">
                  <span className="text-accent">{c.icon}</span>
                  {c.title}
                </span>
                <span className="text-xs text-muted">{c.sub}</span>
              </span>
            ))}
          </div>
          {rows.map((r) => (
            <div key={r.label} role="row" className="grid grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]">
              <span role="rowheader" className="px-4 py-3 text-muted">
                {r.label}
              </span>
              {cols.map((c) => (
                <span key={c.key} role="cell" className="flex gap-2 px-4 py-3">
                  <Mark yes={r[c.key].yes} />
                  {r[c.key].text && <span className={r[c.key].yes ? "" : "text-muted"}>{r[c.key].text}</span>}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
      {!desktop && (
        <p className="text-sm text-muted">
          The desktop app is free for Linux, macOS and Windows.{" "}
          <Link href="/download" className="font-medium text-accent hover:underline">
            Get the desktop app
          </Link>
        </p>
      )}
    </section>
  );
}

function Mark({ yes }: { yes: boolean }) {
  return yes ? (
    <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-label="Yes" />
  ) : (
    <CloseIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-label="No" />
  );
}

/** With a plan: where new files go unless you pick otherwise when adding one. */
function NewFilesDefault() {
  const [settings, update] = useSiteSettings();
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
      <span className="min-w-0 flex-1">
        <span className="font-medium">New files go</span>
        <span className="block text-xs text-muted">You can still pick each time you add a file or save a recording.</span>
      </span>
      <Segmented
        label="New files go"
        value={settings.newFilesOnline ? "online" : "device"}
        onChange={(v) => update({ newFilesOnline: v === "online" })}
        options={[
          { value: "online", label: "Online" },
          { value: "device", label: "This device" },
        ]}
        onPage
      />
    </div>
  );
}

/** Download every file this device can reach (online, or kept here) as one .zip. */
function BackupFiles() {
  const stored = useQuery(api.files.storage, {});
  const items = useDeviceUrls(stored?.items);
  const backup = useBackup();
  const onDevice = (items ?? []).filter((i) => i.device && i.url).length;
  const online = (items ?? []).filter((i) => !i.device).length;
  return (
    <section className="flex flex-col gap-3 rounded-xl bg-surface p-4 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <DownloadIcon className="h-5 w-5 shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Back up your files</p>
          <p className="text-muted">
            {items === undefined
              ? "Every file you can open here, in one .zip."
              : `Every file you can open here in one .zip: ${online} online${onDevice ? ` and ${onDevice} on this device` : ""}.`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => items && void backup.backUp(items)}
          disabled={!items || backup.busy}
          className="inline-flex h-9 items-center gap-2 rounded-md bg-foreground/[0.05] px-3 text-sm font-medium hover:bg-surface-hover disabled:opacity-50"
        >
          {backup.busy && <LoadingSpinner size="sm" inline label="Backing up" />}
          Download .zip
        </button>
      </div>
      {(backup.status || backup.message) && (
        <p className={backup.message?.error ? "text-danger" : "text-muted"}>{backup.status ?? backup.message?.text}</p>
      )}
    </section>
  );
}

/** Whether this browser has agreed to keep soniroll's files, and a button to ask. */
function KeepFiles() {
  const [kept, setKept] = useState<boolean | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    void filesKept().then((k) => live && setKept(k));
    return () => {
      live = false;
    };
  }, []);
  if (kept === undefined || kept === null) return null;
  return (
    <section className="flex flex-wrap items-center gap-3 rounded-xl bg-surface p-4 text-sm">
      <DeviceIcon className="h-5 w-5 shrink-0 text-accent" />
      <p className="min-w-0 flex-1 text-muted">
        {kept
          ? "This browser has agreed to keep soniroll's files, even when the disk gets full. Clearing the site's data still deletes them, so download a backup now and then."
          : "This browser hasn't agreed to keep soniroll's files yet, so it may delete them if the disk gets full."}
      </p>
      {!kept && (
        <button type="button" onClick={() => void askToKeepFiles().then(setKept)} className="inline-flex h-9 items-center rounded-md bg-foreground/[0.05] px-3 text-sm font-medium hover:bg-surface-hover">
          Ask to keep them
        </button>
      )}
    </section>
  );
}
