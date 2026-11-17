"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useState, useSyncExternalStore, type ReactNode } from "react";
import { LogoMark } from "@/components/Logo";
import { SignInModal } from "@/components/AccountMenu";
import { CloseIcon } from "@/components/tools";
import { useSiteStatus } from "@/lib/useSiteStatus";
import { useAuthActions, useConvexAuth } from "@convex-dev/auth/react";

/** Pages that show other people's content: hidden while Community is switched off. */
function isCommunityPath(path: string, params: URLSearchParams | null) {
  if (/^\/(community|post|u|setlist|routine)(\/|$)/.test(path)) return true;
  // A tune shared by link (`/tune/<id>`; plain `/tune` is an old redirect).
  if (/^\/tune\/[^/]+/.test(path)) return true;
  // A file shared by link (`/file/<id>`).
  if (/^\/file\/[^/]+/.test(path)) return true;
  if (path === "/setlist-charts" && (params?.get("post") || params?.get("shared"))) return true;
  return false;
}

/**
 * The mayday notices (see `packages/convex/lib/site.ts`): the whole-site maintenance screen, the
 * Community-is-off page and the announcement banner. Admins see the site as normal (with a small
 * reminder bar) so they can check and fix things.
 */
export function SiteGate({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={children}>
      <Gate>{children}</Gate>
    </Suspense>
  );
}

function Gate({ children }: { children: ReactNode }) {
  const s = useSiteStatus();
  const pathname = usePathname();
  const params = useSearchParams();
  if (!s) return <>{children}</>;
  if (s.communityOff && !s.staff && isCommunityPath(pathname, params)) return <CommunityOff />;
  return <>{children}</>;
}

/** The maintenance message when the whole site is down for this visitor, else null. AppChrome renders
    only the maintenance screen then (nothing of the app mounts, split screen included). */
export function useMaintenance(): string | null {
  const s = useSiteStatus();
  const pathname = usePathname();
  if (!s || !s.maintenance || s.staff || pathname === "/reset-password") return null;
  return s.maintenanceMessage;
}

export function MaintenanceScreen({ message }: { message: string }) {
  const [signIn, setSignIn] = useState(false);
  const { isAuthenticated } = useConvexAuth();
  const { signOut } = useAuthActions();
  return (
    <div className="fixed inset-0 z-[80] flex flex-col items-center justify-center gap-5 bg-background px-6 text-center">
      <LogoMark size={56} />
      <h1 className="text-2xl font-semibold tracking-tight">Back soon</h1>
      <p className="max-w-md whitespace-pre-wrap text-muted">{message.trim() || "soniroll is down for a little maintenance. Your stuff is safe — check back in a bit."}</p>
      <div className="mt-6 flex flex-col items-center gap-2">
        {isAuthenticated ? (
          <>
            <p className="text-xs text-muted">You&apos;re signed in, but this account isn&apos;t an admin.</p>
            <button type="button" onClick={() => void signOut()} className="h-9 rounded-md bg-foreground/[0.05] px-4 text-sm font-medium hover:bg-surface-hover">
              Sign out to use another account
            </button>
          </>
        ) : (
          <button type="button" onClick={() => setSignIn(true)} className="h-9 rounded-md bg-foreground/[0.05] px-4 text-sm font-medium hover:bg-surface-hover">
            Admin sign in
          </button>
        )}
      </div>
      {signIn && <SignInModal onClose={() => setSignIn(false)} />}
    </div>
  );
}

function CommunityOff() {
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center gap-3 px-6 py-24 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Community is taking a break</h1>
      <p className="max-w-md text-muted">
        Posts, profiles and shared links are switched off for a bit. Everything&apos;s still there and will be back soon. All the tools work as usual.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- banner

const DISMISS_KEY = "jam-practice-banner-dismissed";
const listeners = new Set<() => void>();
function readDismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY) ?? "";
  } catch {
    return "";
  }
}
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** The announcement banner (floats at the top; closing it hides that message on this device), plus
    a small "mayday is on" bar for admins. */
export function SiteBanner() {
  const s = useSiteStatus();
  const dismissed = useSyncExternalStore(subscribe, readDismissed, () => "");
  if (!s) return null;
  const active = [
    s.maintenance && "maintenance",
    s.communityOff && "Community off",
    s.postingPaused && "posting paused",
    s.signupsPaused && "sign-ups paused",
    s.uploadsPaused && "uploads paused",
    s.feedbackPaused && "feedback paused",
  ].filter(Boolean);
  const banner = s.banner && s.banner.text !== dismissed ? s.banner : null;
  if (!banner && !(s.staff && active.length)) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+0.5rem)] z-[44] flex flex-col items-center gap-1.5 px-16">
      {s.staff && active.length > 0 && (
        <a href="/admin?tab=mayday" className="pointer-events-auto rounded-full bg-rose-600 px-3 py-1 text-[11px] font-bold text-white shadow-lg">
          Mayday on: {active.join(", ")}
        </a>
      )}
      {banner && (
        <div
          role="status"
          className={`pointer-events-auto flex max-w-xl items-start gap-2 rounded-lg px-4 py-2.5 text-sm shadow-lg ring-1 backdrop-blur ${
            banner.tone === "warning" ? "bg-amber-400/90 text-zinc-900 ring-amber-500/30" : "bg-background/90 text-foreground ring-foreground/10"
          }`}
        >
          <span className="whitespace-pre-wrap">{banner.text}</span>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => {
              try {
                localStorage.setItem(DISMISS_KEY, banner.text);
              } catch {}
              listeners.forEach((l) => l());
            }}
            className="-mr-1 mt-0.5 shrink-0 rounded-sm p-0.5 opacity-60 hover:opacity-100"
          >
            <CloseIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
