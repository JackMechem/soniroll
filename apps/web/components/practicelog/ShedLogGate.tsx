"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { useState } from "react";
import { SignInModal } from "@/components/AccountMenu";
import { DemoProgressCard, RoutineDemo } from "@/components/landing/PracticeLogPreview";
import LoadingSpinner from "@/components/LoadingSpinner";
import { CalendarIcon } from "@/components/tools";

/** Sign in / Sign up buttons that open the app's sign-in form in place. */
export function SignInButtons({ size = "md" }: { size?: "sm" | "md" }) {
  const [flow, setFlow] = useState<"signIn" | "signUp" | null>(null);
  const pad = size === "sm" ? "h-8 px-3 text-xs" : "h-9 px-4 text-sm";
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setFlow("signUp")} className={`rounded-md bg-accent font-medium text-accent-foreground hover:bg-accent-hover ${pad}`}>
          Sign up free
        </button>
        <button type="button" onClick={() => setFlow("signIn")} className={`rounded-md bg-foreground/[0.05] font-medium hover:bg-surface-hover ${pad}`}>
          Sign in
        </button>
      </div>
      {flow && <SignInModal initialFlow={flow} onClose={() => setFlow(null)} />}
    </>
  );
}

/**
 * The Shed Log is for account holders. Signed out, its pages show this instead: what it is, a
 * routine to tick off right here (the landing page's demo) and a sample progress card, and Sign up
 * / Sign in. `children` render once signed in.
 */
export default function ShedLogGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center py-24">
        <LoadingSpinner />
      </div>
    );
  }
  if (isAuthenticated) return <>{children}</>;
  return (
    <main className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 pb-16 pt-[calc(env(safe-area-inset-top)+4.5rem)] sm:px-6 lg:grid-cols-2 lg:pt-16">
      <div className="flex flex-col gap-5">
        <p className="flex items-center gap-2 text-sm font-medium text-muted">
          <CalendarIcon className="h-4 w-4" /> Shed Log
        </p>
        <h1 className="text-balance text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">Your practice, every day, adding up.</h1>
        <p className="leading-relaxed text-muted">
          Plan routines that repeat, check off tasks, run them on a timer, and watch your streak, your daily goal and a year of green squares fill in. Everything you do in soniroll&apos;s tools counts.
        </p>
        <ul className="grid items-start gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {["Routines with tasks, subtasks and times", "A day timer and a daily goal", "Streaks, with confetti for the wins", "Recordings and notes on every day", "Progress cards to share", "Synced to your account, on every device"].map((t) => (
            <li key={t} className="flex items-baseline gap-2">
              <span className="h-1 w-1 shrink-0 translate-y-[-3px] rounded-full bg-muted" />
              {t}
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">The Shed Log is free with an account.</p>
          <SignInButtons />
        </div>
      </div>
      <div className="flex flex-col gap-4">
        <RoutineDemo celebrations={false} />
        <div className="mx-auto w-full max-w-[17rem]">
          <DemoProgressCard />
        </div>
      </div>
    </main>
  );
}
