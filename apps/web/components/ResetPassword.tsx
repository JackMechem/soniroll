"use client";

import Link from "next/link";
import { useState, type FormEvent, type ReactNode } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import Logo from "@/components/Logo";
import { DASHBOARD_PATH, LANDING_PATH } from "@/lib/landing";

const INPUT = "h-10 rounded-md bg-foreground/[0.05] px-3 text-base outline-none transition-colors focus:ring-2 focus:ring-accent/40 sm:text-sm";
const PRIMARY = "flex h-10 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-50";

/** The forgot-password page: request a link (no token), or set a new password (with one). A
    standalone page without the app's sidebar, like the landing page (`AppChrome`). */
export default function ResetPassword({ email, token }: { email: string; token: string }) {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-4 py-10 text-foreground">
      <Link href={LANDING_PATH} aria-label="soniroll" className="mb-8">
        <Logo height={46} />
      </Link>
      <div className="flex w-full max-w-sm flex-col gap-5 rounded-xl bg-surface p-6">
        {token && email ? <NewPassword email={email} token={token} /> : <RequestLink initialEmail={email} />}
      </div>
      <Link href={DASHBOARD_PATH} className="mt-6 text-sm font-medium text-muted hover:text-foreground">
        Back to soniroll
      </Link>
    </div>
  );
}

function Heading({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="text-sm leading-relaxed text-muted">{children}</p>
    </div>
  );
}

function RequestLink({ initialEmail }: { initialEmail: string }) {
  const { signIn } = useAuthActions();
  const [email, setEmail] = useState(initialEmail);
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await signIn("password", { email: email.trim(), flow: "reset" });
    } catch {
      // Deliberately the same outcome either way: telling someone "no account with that email"
      // would let anyone check which emails have soniroll accounts. (It also fails for an account
      // that only signs in with Google, which has no password to reset.)
    } finally {
      setSubmitting(false);
      setSent(true);
    }
  }

  if (sent) {
    return (
      <>
        <Heading title="Check your email">
          If there&apos;s a soniroll account with a password for <span className="font-medium text-foreground">{email.trim()}</span>, we&apos;ve sent it a link to reset the password. It expires in an hour.
        </Heading>
        <p className="text-sm text-muted">
          Signed up with Google? Use “Continue with Google” instead; there&apos;s no password to reset.
        </p>
        <button type="button" onClick={() => setSent(false)} className="self-start text-sm font-medium text-accent hover:underline">
          Use a different email
        </button>
      </>
    );
  }

  return (
    <>
      <Heading title="Forgot your password?">Enter your account&apos;s email and we&apos;ll send you a link to choose a new one.</Heading>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-xs font-medium text-muted">Email</span>
          <input type="email" required autoFocus autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={INPUT} />
        </label>
        <button type="submit" disabled={submitting || !email.trim()} className={PRIMARY}>
          {submitting ? "Sending…" : "Send reset link"}
        </button>
      </form>
    </>
  );
}

function NewPassword({ email, token }: { email: string; token: string }) {
  const { signIn } = useAuthActions();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [expired, setExpired] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Those passwords don't match.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      // Checks the token, sets the new password, signs out every other session, and signs in here.
      await signIn("password", { email, code: token, newPassword: password, flow: "reset-verification" });
      setDone(true);
    } catch {
      setExpired(true);
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <>
        <Heading title="Password updated">You&apos;re signed in with your new password. Any other devices that were signed in have been signed out.</Heading>
        <Link href={DASHBOARD_PATH} className={`${PRIMARY} text-center`}>
          Go to your dashboard
        </Link>
      </>
    );
  }

  if (expired) {
    return (
      <>
        <Heading title="This link doesn't work anymore">Reset links work once and expire after an hour. Ask for a new one and use the latest email.</Heading>
        <Link href={`/reset-password?${new URLSearchParams({ email })}`} onClick={() => setExpired(false)} className={`${PRIMARY} text-center`}>
          Send a new link
        </Link>
      </>
    );
  }

  return (
    <>
      <Heading title="Choose a new password">
        For <span className="font-medium text-foreground">{email}</span>. At least 8 characters.
      </Heading>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-xs font-medium text-muted">New password</span>
          <input type="password" required minLength={8} autoFocus autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={INPUT} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-xs font-medium text-muted">Confirm new password</span>
          <input type="password" required minLength={8} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={INPUT} />
        </label>
        {error && <p className="text-sm text-danger">{error}</p>}
        <button type="submit" disabled={submitting || password.length < 8 || !confirm} className={PRIMARY}>
          {submitting ? "Saving…" : "Set new password"}
        </button>
      </form>
    </>
  );
}
