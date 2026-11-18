"use client";

import { api } from "@jam-practice/convex/_generated/api";
import { useConvexAuth } from "@convex-dev/auth/react";
import { useAction, useQuery } from "convex/react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, useSyncExternalStore } from "react";
import LoadingSpinner from "@/components/LoadingSpinner";
import { Segmented } from "@/components/metronome/MetronomeOptions";
import { CheckIcon, CloseIcon, CloudIcon, DeviceIcon, DownloadIcon } from "@/components/tools";
import { askToKeepFiles, filesKept, inDesktopApp } from "@/lib/deviceFiles";
import { errorText, formatBytes } from "@/lib/files";
import { SIGN_IN_PATH } from "@/lib/landing";
import { useStoragePlan } from "@/lib/storagePlan";

/**
 * `/plans` — storage plans. Every tool and feature is free; a plan only keeps files, recordings and
 * songs online, on all your devices (free accounts keep them on the device that saved them). Shows
 * how the website, the desktop app and a plan compare, the plans for sale (from Polar, via
 * `billing.plans`), and for someone with a plan, how much they use and a link to manage it.
 */

const DESKTOP_URL = "https://github.com/JackMechem/soniroll/releases";

type Interval = "month" | "year";

function price(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase(), minimumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
}

const noSubscribe = () => () => {};

export default function PlansPage() {
  return (
    <Suspense>
      <Plans />
    </Suspense>
  );
}

function Plans() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const storage = useStoragePlan();
  const plans = useQuery(api.billing.plans, {});
  const checkout = useAction(api.billing.checkout);
  const portal = useAction(api.billing.portal);
  const welcome = useSearchParams().get("welcome") === "1";
  const desktop = useSyncExternalStore(noSubscribe, inDesktopApp, () => false);
  const [interval, setBilling] = useState<Interval>("year");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const shown = (plans ?? []).filter((p) => p.interval === interval);
  const hasYearly = (plans ?? []).some((p) => p.interval === "year");
  const hasMonthly = (plans ?? []).some((p) => p.interval === "month");
  const current = storage?.plan ?? null;

  /** Polar's pages open in the browser (the desktop app hands them to the system browser). */
  function go(url: string) {
    if (desktop) window.open(url, "_blank", "noopener,noreferrer");
    else window.location.assign(url);
  }

  async function buy(productId: string) {
    setBusy(productId);
    setError(null);
    try {
      go((await checkout({ productId })).url);
    } catch (e) {
      setError(errorText(e, "Couldn't open the checkout."));
    } finally {
      setBusy(null);
    }
  }

  async function manage() {
    setBusy("portal");
    setError(null);
    try {
      go((await portal({})).url);
    } catch (e) {
      setError(errorText(e, "Couldn't open your plan's page."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 pb-16 pt-[calc(env(safe-area-inset-top)+4.5rem)] sm:px-6 lg:pt-8">
      <header className="flex flex-col gap-1.5 border-b border-foreground/10 pb-5">
        <h1 className="flex items-center gap-2 text-2xl font-extrabold sm:text-3xl">
          <CloudIcon className="h-6 w-6 shrink-0 text-accent" />
          Storage plans
        </h1>
        <p className="max-w-2xl text-sm text-muted sm:text-base">
          Every tool and feature in soniroll is free. Your tunes, charts, notes, Shed Log and settings sync to all your devices for free too. A plan keeps
          your files, recordings and songs online as well, so they&apos;re on all your devices and safe if one is lost.
        </p>
      </header>

      {welcome && (
        <p className="flex items-center gap-2 rounded-lg bg-accent/10 px-4 py-3 text-sm">
          <CheckIcon className="h-4 w-4 shrink-0 text-accent" />
          Thanks for subscribing! Your plan shows here as soon as the payment is confirmed (usually a few seconds).
        </p>
      )}

      {current && storage && (
        <section className="flex flex-col gap-3 rounded-xl bg-surface p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">Your plan: {current.storageGb} GB</h2>
              <p className="text-sm text-muted">
                {price(current.priceCents, current.currency)} a {current.interval}
                {current.renewsAt &&
                  ` · ${current.cancelAtPeriodEnd ? "ends" : "renews"} ${new Date(current.renewsAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`}
                {current.status === "past_due" && " · the last payment didn't go through"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void manage()}
              disabled={busy !== null}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-foreground/[0.05] px-3 text-sm font-medium hover:bg-surface-hover disabled:opacity-50 sm:h-9"
            >
              {busy === "portal" && <LoadingSpinner size="sm" inline label="Opening" />}
              Manage plan
            </button>
          </div>
          <UsageBar used={storage.used} quota={storage.quota} />
          <p className="text-xs text-muted">Change plan, update your card, see receipts or cancel on the plan&apos;s page.</p>
        </section>
      )}

      {!current && (
        <section className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold">Plans</h2>
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
                const monthly = (plans ?? []).find((m) => m.storageGb === p.storageGb && m.interval === "month");
                const saved = p.interval === "year" && monthly ? Math.round(monthly.priceCents * 12 - p.priceCents) : 0;
                return (
                  <div key={p.productId} className="flex flex-col gap-3 rounded-xl bg-surface p-5">
                    <div>
                      <p className="text-2xl font-extrabold">{p.storageGb} GB</p>
                      <p className="text-sm text-muted">
                        <span className="text-base font-semibold text-foreground">{price(p.priceCents, p.currency)}</span> a {p.interval}
                      </p>
                      {saved > 0 && <p className="text-xs text-accent">Saves {price(saved, p.currency)} on paying monthly</p>}
                    </div>
                    {isAuthenticated ? (
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
            Payments, sales tax and receipts are handled by Polar. Cancel any time: your plan runs to the end of what you paid for, and files already online
            stay there — you can move them to a device or download them whenever you like.
          </p>
        </section>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}

      <Comparison desktop={desktop} freeOnline={storage?.freeQuota} />

      {!desktop && <KeepFiles />}
    </main>
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
      <h2 className="text-lg font-bold">Website, desktop app or a plan</h2>
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
          <a href={DESKTOP_URL} target="_blank" rel="noopener noreferrer" className="font-medium text-accent hover:underline">
            Get the desktop app
          </a>
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
