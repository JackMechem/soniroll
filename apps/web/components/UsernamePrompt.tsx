"use client";

import { FormEvent, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useConvexAuth } from "@convex-dev/auth/react";
import { api } from "@jam-practice/convex/_generated/api";
import { normalizeUsername, usernameError } from "@/lib/username";

/**
 * Usernames are required for every account, but Convex Auth's own sign-up (and Google sign-in,
 * which has no sign-up step of its own at all) has no field for one — so this is how it's
 * actually enforced: mounted once, app-wide, in `app/layout.tsx`, it shows a full-screen,
 * deliberately non-dismissable prompt (no Escape, no backdrop click, same "genuinely sticky"
 * reasoning as `PracticeTimerAlert`) to any signed-in user whose profile doesn't have a username
 * yet — covering both a brand new account and a pre-existing one from before this requirement
 * existed. `api.profiles.getMine` returning `null`, or a row with `username === ""` (the sentinel
 * `setAvatar` already uses for "profile exists, no username set yet"), are the same case here.
 * Submits through `claimUsername` — the minimal-field mutation that only ever touches `username`,
 * so it can't clobber `instruments`/`isPublic` if a profile row already exists.
 */
export default function UsernamePrompt() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const profile = useQuery(api.profiles.getMine, isAuthenticated ? {} : "skip");
  const claimUsername = useMutation(api.profiles.claimUsername);

  const [username, setUsername] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalized = normalizeUsername(username);
  const formatError = usernameError(username);
  const availability = useQuery(
    api.profiles.usernameAvailable,
    !formatError ? { username: normalized } : "skip",
  );
  const taken = availability === false;

  if (isLoading || !isAuthenticated || profile === undefined) return null;
  if (profile && profile.username !== "") return null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (formatError) {
      setError(formatError);
      return;
    }
    if (taken) {
      setError("That username is already taken.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await claimUsername({ username: normalized });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that username.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="alertdialog"
      aria-label="Choose a username"
      className="fixed inset-0 z-[210] flex items-center justify-center bg-overlay p-4"
    >
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-xl ring-1 ring-foreground/[0.06] bg-surface p-5 text-left text-foreground shadow-2xl shadow-black/20">
        <div className="flex flex-col gap-1.5">
          <h2 className="text-base font-semibold">Choose a username</h2>
          <p className="text-sm text-muted">
            Every soniroll account needs a username — it&apos;s how you&apos;ll show up if you ever
            make your profile public, and it&apos;s separate from your email.
          </p>
        </div>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-medium text-muted">Username</span>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. johndoe"
              autoFocus
              autoComplete="off"
              className="h-9 rounded-md bg-foreground/[0.05] px-3 text-base outline-none focus:ring-2 focus:ring-accent/40 sm:text-sm"
            />
            {formatError ? (
              <p className="text-xs text-danger">{formatError}</p>
            ) : taken ? (
              <p className="text-xs text-danger">That username is already taken.</p>
            ) : availability === undefined && username.trim() ? (
              <p className="text-xs text-muted">Checking availability…</p>
            ) : username.trim() ? (
              <p className="text-xs text-accent">Available.</p>
            ) : null}
          </label>
          {error && error !== formatError && <p className="text-sm text-danger">{error}</p>}
          <button
            type="submit"
            disabled={submitting || !username.trim() || !!formatError || taken}
            className="h-9 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-50"
          >
            {submitting ? "Saving…" : "Continue"}
          </button>
        </form>
      </div>
    </div>
  );
}
