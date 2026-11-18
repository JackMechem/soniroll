"use client";

import { api } from "@jam-practice/convex/_generated/api";
import type { Id } from "@jam-practice/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import LoadingSpinner from "@/components/LoadingSpinner";
import Select from "@/components/Select";
import { CloseIcon } from "@/components/tools";
import { errorText, formatBytes } from "@/lib/files";

/**
 * Admin → Users → Storage: one account's storage, for troubleshooting — what it keeps online and on
 * devices, its paid plan (from Polar, with a link to the customer there), and plans given for free.
 * The owner can give a plan for some months (`admin.giftPlan`; it replaces a running gift), add
 * months to the running one, or end it; other admins only see.
 */

type Size = "5" | "25" | "100" | "custom";

const day = (ms: number) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export default function UserStorageDialog({ userId, label, onClose }: { userId: Id<"users">; label: string; onClose: () => void }) {
  const data = useQuery(api.admin.userStorage, { userId });
  const give = useMutation(api.admin.giftPlan);
  const extend = useMutation(api.admin.extendGift);
  const end = useMutation(api.admin.endGift);
  const [size, setSize] = useState<Size>("5");
  const [customGb, setCustomGb] = useState("10");
  const [months, setMonths] = useState("3");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function run(what: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      await what();
      setDone(message);
    } catch (e) {
      setError(errorText(e, "That didn't work."));
    } finally {
      setBusy(false);
    }
  }

  const gb = size === "custom" ? Number(customGb) : Number(size);
  const n = Number(months);
  const active = data?.gifts.find((g) => g.id === data.activeGiftId) ?? null;
  const field = "h-9 rounded-md bg-foreground/[0.05] px-3 text-sm outline-none focus:ring-2 focus:ring-accent/40";

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-overlay sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-label={`Storage for ${label}`}
        className="flex max-h-[90dvh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-t-xl bg-surface p-5 shadow-xl ring-1 ring-foreground/[0.06] sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold">Storage</h2>
            <p className="truncate text-sm text-muted">{label}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface-hover hover:text-foreground">
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        {data === undefined ? (
          <LoadingSpinner />
        ) : (
          <>
            <section className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-lg bg-foreground/[0.05] p-3">
                <p className="text-xs text-muted">Online</p>
                <p className="font-semibold tabular-nums">
                  {formatBytes(data.online)} <span className="font-normal text-muted">of {formatBytes(data.quota)}</span>
                </p>
                <p className="text-xs text-muted">{data.onlineCount} files</p>
              </div>
              <div className="rounded-lg bg-foreground/[0.05] p-3">
                <p className="text-xs text-muted">On their devices</p>
                <p className="font-semibold tabular-nums">{formatBytes(data.onDevices)}</p>
                <p className="text-xs text-muted">{data.deviceCount} files</p>
              </div>
            </section>

            <section className="flex flex-col gap-1.5 text-sm">
              <h3 className="text-xs font-semibold text-muted">Paid plan</h3>
              {data.subscription ? (
                <p>
                  {data.subscription.productName} · <span className="font-medium">{data.subscription.status}</span>
                  {data.subscription.currentPeriodEnd &&
                    ` · ${data.subscription.cancelAtPeriodEnd ? "ends" : "renews"} ${day(new Date(data.subscription.currentPeriodEnd).getTime())}`}
                </p>
              ) : (
                <p className="text-muted">None</p>
              )}
              {data.polarCustomerUrl && (
                <a href={data.polarCustomerUrl} target="_blank" rel="noopener noreferrer" className="w-fit text-sm font-medium text-accent hover:underline">
                  Open in Polar (payments, refunds, cancel)
                </a>
              )}
            </section>

            <section className="flex flex-col gap-2 text-sm">
              <h3 className="text-xs font-semibold text-muted">Given plan</h3>
              {active ? (
                <div className="flex flex-col gap-2 rounded-lg bg-accent/10 p-3">
                  <p>
                    <span className="font-semibold">{active.storageGb} GB</span> until {day(active.endsAt)}
                    {active.grantedBy && ` · from @${active.grantedBy}`}
                    {active.note && <span className="block text-xs text-muted">{active.note}</span>}
                  </p>
                  {data.canEdit && (
                    <div className="flex flex-wrap gap-1.5">
                      {[1, 3, 12].map((m) => (
                        <button
                          key={m}
                          type="button"
                          disabled={busy}
                          onClick={() => void run(() => extend({ giftId: active.id, months: m }), `Added ${m} month${m === 1 ? "" : "s"}.`)}
                          className="inline-flex h-8 items-center rounded-md bg-foreground/[0.05] px-2.5 text-xs font-medium hover:bg-surface-hover disabled:opacity-50"
                        >
                          +{m} month{m === 1 ? "" : "s"}
                        </button>
                      ))}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void run(() => end({ giftId: active.id }), "Ended.")}
                        className="ml-auto inline-flex h-8 items-center rounded-md px-2.5 text-xs font-medium text-danger hover:bg-danger/10 disabled:opacity-50"
                      >
                        End now
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-muted">None running</p>
              )}
            </section>

            {data.canEdit && (
              <section className="flex flex-col gap-3 rounded-lg bg-foreground/[0.05] p-3 text-sm">
                <h3 className="font-semibold">Give a plan</h3>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-semibold text-muted">Size</span>
                    <Select
                      value={size}
                      onChange={(v) => setSize(v as Size)}
                      options={[
                        { value: "5", label: "5 GB" },
                        { value: "25", label: "25 GB" },
                        { value: "100", label: "100 GB" },
                        { value: "custom", label: "Other…" },
                      ]}
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-semibold text-muted">Months</span>
                    <input type="number" min={1} max={36} value={months} onChange={(e) => setMonths(e.target.value)} className={field} />
                  </label>
                  {size === "custom" && (
                    <label className="col-span-2 flex flex-col gap-1">
                      <span className="text-xs font-semibold text-muted">GB</span>
                      <input type="number" min={0.1} max={1000} step={0.5} value={customGb} onChange={(e) => setCustomGb(e.target.value)} className={field} />
                    </label>
                  )}
                  <label className="col-span-2 flex flex-col gap-1">
                    <span className="text-xs font-semibold text-muted">Note (only admins see it)</span>
                    <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Sorry for the upload bug" maxLength={200} className={field} />
                  </label>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={busy || !(gb > 0) || !(n >= 1)}
                    onClick={() => void run(() => give({ userId, storageGb: gb, months: n, ...(note.trim() ? { note: note.trim() } : {}) }), `Gave ${gb} GB for ${n} month${n === 1 ? "" : "s"}.`)}
                    className="inline-flex h-9 items-center gap-2 rounded-md bg-accent px-3 text-sm font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-50"
                  >
                    {busy && <LoadingSpinner size="sm" inline label="Saving" />}
                    Give {gb > 0 ? `${gb} GB` : ""} for {n >= 1 ? n : "?"} month{n === 1 ? "" : "s"}
                  </button>
                  {active && <span className="text-xs text-muted">Replaces the one running now.</span>}
                </div>
                <p className="text-xs text-muted">Nothing is charged. It counts like a paid plan; with both, the bigger one wins. When it ends, their files online stay there.</p>
              </section>
            )}

            {error && <p className="text-sm text-danger">{error}</p>}
            {done && <p className="text-sm text-accent">{done}</p>}

            {data.gifts.some((g) => g.ended) && (
              <section className="flex flex-col gap-1 text-xs text-muted">
                <h3 className="font-semibold">Earlier gifts</h3>
                {data.gifts
                  .filter((g) => g.ended)
                  .map((g) => (
                    <p key={g.id}>
                      {g.storageGb} GB · {day(g.startsAt)} – {day(g.endsAt)}
                      {g.grantedBy && ` · @${g.grantedBy}`}
                      {g.note && ` · ${g.note}`}
                    </p>
                  ))}
              </section>
            )}
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
