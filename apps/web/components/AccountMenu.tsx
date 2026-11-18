"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { useAuthActions, useConvexAuth } from "@convex-dev/auth/react";
import { api } from "@jam-practice/convex/_generated/api";
import LoadingSpinner from "@/components/LoadingSpinner";
import UserAvatar from "@/components/UserAvatar";
import StreakBadge from "@/components/practicelog/StreakBadge";
import { GoogleIcon, UserIcon } from "@/components/tools";
import { useSiteStatus } from "@/lib/useSiteStatus";



/** Same button shape as Sidebar's ThemeButton (collapsed/large props, identical styling) so this
    drops into either sidebar footer without special-casing. */
function buttonClass(collapsed?: boolean, large?: boolean) {
  return `flex w-full items-center gap-2.5 rounded-md px-2 text-foreground/75 transition-colors hover:bg-surface-hover/60 hover:text-foreground ${
    large ? "h-11 text-base" : "h-9 text-sm"
  } ${collapsed ? "justify-center" : ""}`;
}

/** The sign-in / sign-up form. `onClose` is Cancel (and success, unless `onSuccess` is given —
    the landing page uses that to go into the app once signed in). */
export function AuthForm({
  onClose,
  onSuccess = onClose,
  initialFlow = "signIn",
  googleRedirectTo,
}: {
  onClose: () => void;
  onSuccess?: () => void;
  initialFlow?: "signIn" | "signUp";
  /** Where Google sends you back to after signing in (default: this page). */
  googleRedirectTo?: string;
}) {
  const { signIn } = useAuthActions();
  const site = useSiteStatus();
  const [flow, setFlow] = useState<"signIn" | "signUp">(initialFlow);
  // "code" means Convex Auth's Password provider (configured with `verify: ResendOTP` in
  // convex/auth.ts) emailed a confirmation code instead of completing sign-in/sign-up directly —
  // covers both a fresh sign-up and any pre-existing account that's never verified its email.
  const [step, setStep] = useState<"credentials" | "code">("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);

  async function onSubmitCredentials(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await signIn("password", { email, password, flow });
      if (result.signingIn) {
        onSuccess();
      } else {
        // Didn't throw, but no tokens came back either — a confirmation code was emailed
        // instead.
        setStep("code");
      }
    } catch {
      // Convex Auth's own error isn't consistently user-facing across failure modes (wrong
      // password, unknown email, password too short, email already registered on sign-up, ...),
      // so this stays a single honest, generic message per flow rather than guessing at a
      // wrong-but-specific one.
      setError(
        flow === "signUp"
          ? "Couldn't create that account — the email may already be in use, or the password may be too short."
          : "Couldn't sign in — check the email and password.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function onSubmitCode(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await signIn("password", { email, code, flow: "email-verification" });
      if (result.signingIn) {
        onSuccess();
      } else {
        setError("That code didn't work — try again.");
      }
    } catch {
      setError("That code is invalid or has expired.");
    } finally {
      setSubmitting(false);
    }
  }

  async function onGoogle() {
    setError(null);
    setGoogleSubmitting(true);
    try {
      // Redirects the page on success, so this only ever resolves-without-navigating on a real
      // failure (e.g. Google sign-in isn't configured yet on this deployment).
      await signIn("google", googleRedirectTo ? { redirectTo: googleRedirectTo } : undefined);
    } catch {
      setError("Couldn't start Google sign-in.");
      setGoogleSubmitting(false);
    }
  }

  if (step === "code") {
    return (
      <>
        <div className="flex flex-col gap-1.5">
          <h2 className="text-base font-semibold">Check your email</h2>
          <p className="text-sm text-muted">
            Enter the code we sent to {email} to finish{" "}
            {flow === "signUp" ? "creating your account" : "signing in"}.
          </p>
        </div>
        <form onSubmit={onSubmitCode} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-muted">Confirmation code</span>
            <input
              type="text"
              inputMode="numeric"
              autoFocus
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="h-9 rounded-md bg-foreground/[0.05] px-3 text-sm outline-none focus:ring-2 focus:ring-accent/40"
            />
          </label>
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setStep("credentials");
                setError(null);
              }}
              className="h-9 rounded-md bg-foreground/[0.05] px-4 text-sm font-medium hover:bg-surface-hover"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={submitting || !code}
              className="h-9 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-50"
            >
              Confirm
            </button>
          </div>
        </form>
      </>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <h2 className="text-base font-semibold">
          {flow === "signIn" ? "Sign in" : "Create an account"}
        </h2>
        {flow === "signUp" && site?.signupsPaused && (
          <p className="rounded-md bg-amber-500/15 px-3 py-2 text-sm font-medium text-amber-700 dark:text-amber-300">
            New sign-ups are paused for a bit. Every tool still works without an account — try again later.
          </p>
        )}
        <p className="text-sm text-muted">
          Sign in to sync your tune list, chord charts and practice stats across devices. Every
          tool still works fine without an account.
        </p>
      </div>

      <form onSubmit={onSubmitCredentials} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-muted">Email</span>
          <input
            type="email"
            required
            autoFocus
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-9 rounded-md bg-foreground/[0.05] px-3 text-sm outline-none focus:ring-2 focus:ring-accent/40"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-muted">Password</span>
          <input
            type="password"
            required
            minLength={8}
            autoComplete={flow === "signIn" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-9 rounded-md bg-foreground/[0.05] px-3 text-sm outline-none focus:ring-2 focus:ring-accent/40"
          />
        </label>

        {error && <p className="text-sm text-danger">{error}</p>}

        {flow === "signIn" && (
          <Link
            href={`/reset-password${email ? `?${new URLSearchParams({ email })}` : ""}`}
            onClick={onClose}
            className="-mt-1 self-start text-sm font-medium text-muted hover:text-foreground"
          >
            Forgot your password?
          </Link>
        )}

        {flow === "signUp" && (
          <p className="text-xs text-muted">
            By creating an account, you agree to soniroll&apos;s{" "}
            <Link href="/terms" className="underline hover:text-foreground">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="underline hover:text-foreground">
              Privacy Policy
            </Link>
            .
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => {
              setFlow(flow === "signIn" ? "signUp" : "signIn");
              setError(null);
            }}
            className="text-sm font-medium text-muted hover:text-foreground"
          >
            {flow === "signIn" ? "Need an account? Sign up" : "Have an account? Sign in"}
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-9 rounded-md bg-foreground/[0.05] px-4 text-sm font-medium hover:bg-surface-hover"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !email || password.length < 8}
              className="h-9 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-50"
            >
              {flow === "signIn" ? "Sign in" : "Sign up"}
            </button>
          </div>
        </div>
      </form>

      <div className="flex items-center gap-3 text-xs text-muted">
        <div className="h-px flex-1 bg-foreground/10" />
        or
        <div className="h-px flex-1 bg-foreground/10" />
      </div>

      <button
        type="button"
        onClick={() => void onGoogle()}
        disabled={googleSubmitting}
        className="flex h-9 items-center justify-center gap-2 rounded-md bg-foreground/[0.05] px-4 text-sm font-medium hover:bg-surface-hover disabled:opacity-50"
      >
        <GoogleIcon className="h-4 w-4" />
        Continue with Google
      </button>
    </>
  );
}

export function SignInModal({ onClose, initialFlow = "signIn" }: { onClose: () => void; initialFlow?: "signIn" | "signUp" }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-overlay p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Sign in"
        className="flex w-full max-w-sm flex-col gap-4 rounded-xl ring-1 ring-foreground/[0.06] bg-surface p-5 text-left text-foreground shadow-2xl shadow-black/20"
        onClick={(e) => e.stopPropagation()}
      >
        <AuthForm onClose={onClose} initialFlow={initialFlow} />
      </div>
    </div>
  );
}

/** The sign-in / account button, mounted in both of Sidebar's footers (desktop and mobile) next
    to ThemeButton. Signed out, it opens a fully custom sign-in modal (email+password with a
    sign-in/sign-up toggle, plus "Continue with Google" — no premade auth widget). Signed in, it's
    just a link to the full `/account` page (password change, delete account, ...). */
export default function AccountMenu({
  collapsed,
  large,
  onNavigate,
}: {
  collapsed?: boolean;
  large?: boolean;
  /** Called when the signed-in link is actually navigated — Sidebar's mobile overlay uses this
      to close itself, same as every other nav link there. */
  onNavigate?: () => void;
}) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const user = useQuery(api.users.current);
  const profile = useQuery(api.profiles.getMine, isAuthenticated ? {} : "skip");
  const [signInOpen, setSignInOpen] = useState(false);

  if (isLoading) {
    // Same size/shape either way, so nothing shifts once the real auth state resolves a moment
    // later — just not clickable yet.
    return (
      <span className={buttonClass(collapsed, large)}>
        <UserIcon className={large ? "h-5 w-5 shrink-0" : "h-4 w-4 shrink-0"} />
        {!collapsed && <LoadingSpinner size="sm" inline label="Signing in" />}
      </span>
    );
  }

  if (isAuthenticated) {
    // Until a username is actually set (a brief window — `UsernamePrompt` forces one right after
    // sign-up/sign-in), fall back to email/name, the same label this button always showed.
    const username = profile?.username ? `@${profile.username}` : null;
    const label = username ?? (user?.email ?? user?.name ?? "Account");

    if (collapsed) {
      // Not `buttonClass` — no horizontal padding at all (the row's own width comes from the
      // parent flex-col stretching it), and deliberately no `hover:bg-*`/rounded background at
      // all either, per a direct request for the picture itself to be the only thing visible here,
      // with no container showing even on hover — the avatar's own ring (`UserAvatar`'s own
      // `ring-foreground/10`) is the only visual framing it gets.
      return (
        <div className="relative mx-auto flex w-fit items-center justify-center py-1.5">
          <Link href="/account" onClick={onNavigate} title={label} className="flex items-center justify-center rounded-full">
            <UserAvatar url={profile?.avatarUrl ?? null} size="sm" />
          </Link>
          {/* The streak, on the picture's corner. */}
          <span className="absolute -bottom-1 -right-3">
            <StreakBadge compact onNavigate={onNavigate} />
          </span>
        </div>
      );
    }

    // The avatar/label row is a plain link to `/account` (Sign out is there). The streak badge is a
    // sibling, not nested inside it, absolutely positioned over padding the row reserves for it.
    return (
      <div className="group relative flex items-center">
        <Link
          href="/account"
          onClick={onNavigate}
          className={`${buttonClass(false, large)} ${large ? "pr-24" : "pr-20"}`}
        >
          <UserAvatar url={profile?.avatarUrl ?? null} size="sm" />
          <span className="flex min-w-0 flex-col items-start">
            <span className="truncate">{label}</span>

          </span>
        </Link>
        <span className={`absolute top-1/2 -translate-y-1/2 ${large ? "right-3" : "right-2"}`}>
          <StreakBadge onNavigate={onNavigate} />
        </span>
      </div>
    );
  }

  return (
    <>
      <div className={`relative flex ${collapsed ? "flex-col items-center gap-1" : "items-center"}`}>
        <button
          type="button"
          onClick={() => setSignInOpen(true)}
          title={collapsed ? "Sign in" : undefined}
          className={`${buttonClass(collapsed, large)} ${collapsed ? "" : large ? "pr-24" : "pr-20"}`}
        >
          <UserIcon className={large ? "h-5 w-5 shrink-0" : "h-4 w-4 shrink-0"} />
          {!collapsed && <span className="truncate">Sign in</span>}
        </button>
        {collapsed ? (
          <StreakBadge compact onNavigate={onNavigate} />
        ) : (
          <span className="absolute right-1 top-1/2 -translate-y-1/2">
            <StreakBadge onNavigate={onNavigate} />
          </span>
        )}
      </div>
      {signInOpen && <SignInModal onClose={() => setSignInOpen(false)} />}
    </>
  );
}
