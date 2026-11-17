"use client";

import { FormEvent, ReactNode, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAction, useQuery } from "convex/react";
import { useAuthActions, useConvexAuth } from "@convex-dev/auth/react";
import { api } from "@jam-practice/convex/_generated/api";
import FollowLists from "@/components/FollowLists";
import LoadingSpinner from "@/components/LoadingSpinner";
import MyPostsTab from "@/components/MyPostsTab";
import PublicProfileEditor from "@/components/PublicProfileEditor";
import { SignInButtons } from "@/components/practicelog/ShedLogGate";
import UserAvatar from "@/components/UserAvatar";
import {
  AppearanceSettings,
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  DashboardSettings,
  GeneralSettings,
  INPUT,
  PracticeSettings,
  SettingsCard,
  SidebarSettings,
  ToolSettings,
} from "@/components/settings/SettingsSections";
import Select from "@/components/Select";
import TunesTab from "@/components/TunesTab";
import TunesToLearnTab from "@/components/TunesToLearnTab";
import {
  BookIcon,
  CalendarIcon,
  GearIcon,
  HomeIcon,
  SlidersIcon,
  GoogleIcon,
  ListIcon,
  LogOutIcon,
  NoteIcon,
  ShieldIcon,
  TrashIcon,
  UserIcon,
  UsersIcon,
} from "@/components/tools";

/** `wide` widens the page to fit the Profile/Security/Danger zone sidebar layout (the signed-in
    view below); the loading and not-signed-in states stay at the original narrower width, since
    neither has anything to put a sidebar next to. */
function PageShell({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <main
      className={`mx-auto flex w-full flex-col gap-6 px-4 pb-16 pt-[calc(env(safe-area-inset-top)+4.5rem)] sm:px-6 lg:pt-8 ${
        wide ? "max-w-5xl lg:max-w-none lg:px-8" : "max-w-md"
      }`}
    >
      {children}
    </main>
  );
}

type AccountView =
  | "profile"
  | "tunes"
  | "tunesToLearn"
  | "posts"
  | "following"
  | "general"
  | "appearance"
  | "sidebar"
  | "dashboard"
  | "tools"
  | "practice"
  | "security"
  | "danger";

/** Turns a thrown Error into UI text — Convex actions surface a real message (e.g. our own
    "Enter your password to confirm."), but a wrong password comes back as a long, internal-
    looking Convex/Auth.js error, so anything that doesn't look like a short, deliberate message
    gets replaced with a plain one instead of leaking implementation detail. */
function friendlyError(err: unknown, fallback: string): string {
  return err instanceof Error && err.message && err.message.length < 150 ? err.message : fallback;
}

/** Change password (accounts that already have one) or set one for the first time (a Google-only
    account adding a password so it can also sign in with email+password from then on) — same
    section, different verification underneath depending on `hasPassword`, but both now go
    through an emailed confirmation code before actually taking effect: step 1
    (`requestPasswordConfirmation`) verifies the current password if there is one and emails a
    code; step 2 (`confirmPassword`) takes that code plus the new password — which has been
    sitting in this component's own state the whole time, never sent anywhere in step 1 — and
    actually applies it. */
function PasswordSection({ hasPassword, email }: { hasPassword: boolean; email: string | null }) {
  const requestConfirmation = useAction(api.account.requestPasswordConfirmation);
  const confirmPassword = useAction(api.account.confirmPassword);
  const [step, setStep] = useState<"form" | "code">("form");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setStep("form");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmNewPassword("");
    setCode("");
  }

  async function onSubmitForm(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    if (newPassword !== confirmNewPassword) {
      setError("New passwords don't match.");
      return;
    }
    setSubmitting(true);
    try {
      await requestConfirmation(hasPassword ? { currentPassword } : {});
      setStep("code");
    } catch (err) {
      setError(
        friendlyError(
          err,
          hasPassword ? "Couldn't verify your current password." : "Couldn't send a code.",
        ),
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
      await confirmPassword({ code, newPassword });
      reset();
      setSuccess(true);
    } catch (err) {
      setError(friendlyError(err, "Couldn't confirm that code."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SettingsCard
      hints={false}
      title={hasPassword ? "Change password" : "Set a password"}
      description={
        step === "code"
          ? `Enter the code we emailed to ${email ?? "your email"} to finish.`
          : hasPassword
            ? "Changing your password signs you out on every other device. We'll email a code to confirm it's really you."
            : `Lets you also sign in with ${email ?? "your email"} and a password, not just Google. We'll email a code to confirm.`
      }
    >
      {step === "form" ? (
        <form onSubmit={onSubmitForm} className="flex max-w-sm flex-col gap-3">
          {hasPassword && (
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs font-medium text-muted">Current password</span>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className={INPUT}
              />
            </label>
          )}
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-medium text-muted">New password</span>
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={INPUT}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-medium text-muted">Confirm new password</span>
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
              className={INPUT}
            />
          </label>
          {error && <p className="text-sm text-danger">{error}</p>}
          {success && (
            <p className="text-sm text-accent">
              {hasPassword ? "Password changed." : "Password set — you can now sign in with it too."}
            </p>
          )}
          <button
            type="submit"
            disabled={submitting}
            className={`self-start ${BUTTON_PRIMARY}`}
          >
            {hasPassword ? "Send confirmation code" : "Send code to set password"}
          </button>
        </form>
      ) : (
        <form onSubmit={onSubmitCode} className="flex max-w-sm flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-medium text-muted">Confirmation code</span>
            <input
              type="text"
              inputMode="numeric"
              autoFocus
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className={INPUT}
            />
          </label>
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={reset}
              className={BUTTON_SECONDARY}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !code}
              className={BUTTON_PRIMARY}
            >
              {hasPassword ? "Confirm password change" : "Confirm and set password"}
            </button>
          </div>
        </form>
      )}
    </SettingsCard>
  );
}

/** Session-storage marker key for the "did Connect Google actually land on the same account"
    check — see the comment on `useGoogleLinkWarning` for why this needs a best-effort check at
    all instead of just trusting the redirect. */
const LINK_CHECK_KEY = "jam-practice-google-link-check";

/** After "Connect Google" redirects out to Google and back, this reports whether the Google
    account that came back actually landed on the *same* account (Convex Auth links by matching
    verified email — see `convex/account.ts`'s `setPassword` for the same mechanism from the other
    direction). If someone connects a Google account with a different email, Convex Auth doesn't
    error — it just signs into (or creates) a *different* account instead, which would otherwise
    be a silently confusing account switch. Records the email right before redirecting to Google;
    the *next* mount (a fresh page load once Google redirects back) reads it once via this lazy
    `useState` initializer, then derives the warning as a plain value compared against whoever's
    actually signed in — the effect below only clears the marker (a real side effect against
    sessionStorage), it never calls setState itself, so there's no render-cascading setState-in-
    effect for the same reason the "derive state during render, don't setState from an effect"
    rule exists. */
function useGoogleLinkWarning(userEmail: string | null | undefined) {
  const [pendingCheck] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(LINK_CHECK_KEY);
    } catch {
      return null;
    }
  });
  const [dismissed, setDismissed] = useState(false);
  const clearedRef = useRef(false);

  useEffect(() => {
    if (!pendingCheck || clearedRef.current || userEmail === undefined) return;
    clearedRef.current = true;
    try {
      sessionStorage.removeItem(LINK_CHECK_KEY);
    } catch {
      // ignore
    }
  }, [pendingCheck, userEmail]);

  const warning =
    !dismissed && pendingCheck && userEmail !== undefined && userEmail !== pendingCheck
      ? `That Google account uses a different email (${userEmail ?? "none"}) than this account (${pendingCheck}), so it signed in as a separate account instead of connecting to this one. To link Google here, use a Google account with the same email address as this account.`
      : null;

  function markPending() {
    if (!userEmail) return;
    try {
      sessionStorage.setItem(LINK_CHECK_KEY, userEmail);
    } catch {
      // ignore
    }
  }

  return { warning, dismissWarning: () => setDismissed(true), markPending };
}

function SignInMethodsSection({
  hasPassword,
  hasGoogle,
  userEmail,
}: {
  hasPassword: boolean;
  hasGoogle: boolean;
  userEmail: string | null | undefined;
}) {
  const { signIn } = useAuthActions();
  const disconnectGoogle = useAction(api.account.disconnectGoogle);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { warning, dismissWarning, markPending } = useGoogleLinkWarning(userEmail);

  async function onConnect() {
    setError(null);
    markPending();
    try {
      // Redirects the page; only resolves-without-navigating on a real failure.
      await signIn("google");
    } catch {
      setError("Couldn't start connecting Google.");
    }
  }

  async function onDisconnect() {
    setError(null);
    setSubmitting(true);
    try {
      await disconnectGoogle();
    } catch (err) {
      setError(friendlyError(err, "Couldn't disconnect Google."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SettingsCard
      hints={false}
      title="Sign-in methods"
      description={hasGoogle ? "Google is connected to this account." : "Connect a Google account so you can also sign in with it."}
    >

      {warning && (
        <div className="flex flex-col gap-1 rounded-md bg-background p-3 text-xs text-muted">
          <p>{warning}</p>
          <button
            type="button"
            onClick={dismissWarning}
            className="self-start font-medium text-foreground hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}

      {hasGoogle ? (
        <>
          {!hasPassword && (
            <p className="text-xs text-muted">
              Set a password above before disconnecting Google, so you don&apos;t lose access to
              your account.
            </p>
          )}
          <button
            type="button"
            onClick={() => void onDisconnect()}
            disabled={!hasPassword || submitting}
            className={`self-start ${BUTTON_SECONDARY}`}
          >
            <GoogleIcon className="h-4 w-4" />
            Disconnect Google
          </button>
        </>
      ) : (
        <>
          <p className="text-xs text-muted">
            Only links automatically if the Google account uses the same email address as this
            account{userEmail ? ` (${userEmail})` : ""} — a different Google account signs into a
            separate account instead.
          </p>
          <button
            type="button"
            onClick={() => void onConnect()}
            className={`self-start ${BUTTON_SECONDARY}`}
          >
            <GoogleIcon className="h-4 w-4" />
            Connect Google
          </button>
        </>
      )}
    </SettingsCard>
  );
}

/** Password accounts go through an emailed confirmation code (`requestDeleteConfirmation` then
    `confirmDelete`) before anything is actually deleted; a Google-only account skips straight to
    deleting once "DELETE" is typed — the explicitly requested exception, since there's no
    password to gate a confirmation email behind and the typed confirmation is considered enough
    friction on its own for that case (`deleteAccount`, unchanged from before). */
function DeleteAccountModal({
  requiresPassword,
  email,
  onClose,
}: {
  requiresPassword: boolean;
  email: string | null;
  onClose: () => void;
}) {
  const requestConfirmation = useAction(api.account.requestDeleteConfirmation);
  const confirmDelete = useAction(api.account.confirmDelete);
  const deleteAccount = useAction(api.account.deleteAccount);
  const { signOut } = useAuthActions();
  const router = useRouter();
  const [step, setStep] = useState<"form" | "code">("form");
  const [password, setPassword] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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

  async function finish() {
    // The account's rows are already gone server-side at this point; sign out just clears this
    // device's cached token so the UI actually reflects that.
    await signOut();
    router.push("/");
  }

  async function onConfirmForm() {
    setError(null);
    setSubmitting(true);
    try {
      if (requiresPassword) {
        await requestConfirmation({ password });
        setStep("code");
      } else {
        await deleteAccount({});
        await finish();
      }
    } catch (err) {
      setError(
        friendlyError(
          err,
          requiresPassword
            ? "Couldn't verify your password."
            : "Couldn't delete your account.",
        ),
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function onConfirmCode() {
    setError(null);
    setSubmitting(true);
    try {
      await confirmDelete({ code });
      await finish();
    } catch (err) {
      setError(friendlyError(err, "Couldn't confirm that code."));
      setSubmitting(false);
    }
  }

  const canSubmitForm = requiresPassword
    ? password.length > 0
    : confirmText.trim().toUpperCase() === "DELETE";

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-overlay p-4"
      onClick={onClose}
    >
      <div
        role="alertdialog"
        aria-label="Delete account"
        className="flex w-full max-w-sm flex-col gap-4 rounded-xl ring-1 ring-foreground/[0.06] bg-surface p-5 text-left text-foreground shadow-2xl shadow-black/20"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col gap-1.5">
          <h2 className="text-base font-semibold">Delete your account</h2>
          <p className="text-sm text-muted">
            {step === "code"
              ? `Enter the code we emailed to ${email ?? "your email"} to finish.`
              : "This permanently deletes your account and signs you out everywhere. It doesn't touch anything already saved on this device."}
          </p>
        </div>

        {step === "form" ? (
          requiresPassword ? (
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs font-medium text-muted">Enter your password to confirm</span>
              <input
                type="password"
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={INPUT}
              />
            </label>
          ) : (
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs font-medium text-muted">
                Type <span className="font-semibold text-foreground">DELETE</span> to confirm
              </span>
              <input
                type="text"
                autoFocus
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                className={INPUT}
              />
            </label>
          )
        ) : (
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-medium text-muted">Confirmation code</span>
            <input
              type="text"
              inputMode="numeric"
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className={INPUT}
            />
          </label>
        )}
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className={BUTTON_SECONDARY}
          >
            Cancel
          </button>
          {step === "form" ? (
            <button
              type="button"
              onClick={() => void onConfirmForm()}
              disabled={!canSubmitForm || submitting}
              className="h-9 rounded-md bg-danger px-4 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
            >
              {requiresPassword ? "Send confirmation code" : "Delete my account"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void onConfirmCode()}
              disabled={!code || submitting}
              className="h-9 rounded-md bg-danger px-4 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
            >
              Delete my account
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function PaletteIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M12 3a9 9 0 000 18c1.1 0 1.8-.9 1.8-1.8 0-.5-.2-.9-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1 .8-1.8 1.8-1.8H17a4 4 0 004-4c0-4.4-4-7.8-9-7.8z" />
      <circle cx="7.5" cy="11" r="1" />
      <circle cx="10.5" cy="7" r="1" />
      <circle cx="15.5" cy="7.5" r="1" />
    </svg>
  );
}

function SidebarIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <path d="M9 4v16" />
    </svg>
  );
}

type NavItem = { id: AccountView; label: string; icon: React.ComponentType<{ className?: string }>; danger?: boolean };
const NAV: { group: string; items: NavItem[] }[] = [
  { group: "You", items: [{ id: "profile", label: "Profile", icon: UserIcon }] },
  {
    group: "Library",
    items: [
      { id: "tunes", label: "Tunes I Know", icon: ListIcon },
      { id: "tunesToLearn", label: "Tunes to Learn", icon: BookIcon },
    ],
  },
  {
    group: "Community",
    items: [
      { id: "posts", label: "Posts", icon: NoteIcon },
      { id: "following", label: "Following", icon: UsersIcon },
    ],
  },
  {
    group: "Settings",
    items: [
      { id: "general", label: "General", icon: GearIcon },
      { id: "appearance", label: "Appearance", icon: PaletteIcon },
      { id: "sidebar", label: "Sidebar", icon: SidebarIcon },
      { id: "dashboard", label: "Dashboard", icon: HomeIcon },
      { id: "tools", label: "Tools", icon: SlidersIcon },
      { id: "practice", label: "Shed Log", icon: CalendarIcon },
    ],
  },
  {
    group: "Account",
    items: [
      { id: "security", label: "Sign-in & security", icon: ShieldIcon },
      { id: "danger", label: "Delete account", icon: TrashIcon, danger: true },
    ],
  },
];
const ALL_VIEWS = NAV.flatMap((g) => g.items.map((i) => i.id));
const isView = (v: string | null | undefined): v is AccountView => !!v && (ALL_VIEWS as string[]).includes(v);

/** The account settings page (`/account[?tab=…]`). A header (picture, @username, email,
    public/private, sign-in methods, View profile, Sign out), then settings grouped in a left nav —
    You (profile), Library (Tunes I Know / to Learn), Community (posts, following), Settings
    (site-wide: features, theme, sidebar, dashboard, tools, the Shed Log — `components/settings/`;
    `/settings` redirects here), Account (password and Google, delete). On a
    phone the nav is a dropdown above the section. The section is kept in the address
    bar (`?tab=`), so other pages can link straight to one. Signed out it says so (no redirect). */
export default function AccountPage({ initialTab }: { initialTab?: string }) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const user = useQuery(api.users.current);
  const profile = useQuery(api.profiles.getMine, isAuthenticated ? {} : "skip");
  const providers = useQuery(api.account.linkedProviders);
  const { signOut } = useAuthActions();
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [view, setView] = useState<AccountView>(isView(initialTab) ? initialTab : "profile");
  // A link to another section while you're here (the sidebar's Settings row and its palette
  // button) only changes `?tab=`, so follow the address. (Picking a section below writes the same
  // `?tab=` back, so that never fights it.)
  const urlTab = useSearchParams()?.get("tab") ?? null;
  const [seenTab, setSeenTab] = useState(urlTab);
  if (urlTab !== seenTab) {
    setSeenTab(urlTab);
    if (isView(urlTab) && urlTab !== view) setView(urlTab);
  }

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.pathname !== "/account") return;
    url.searchParams.set("tab", view);
    window.history.replaceState(window.history.state, "", url);
  }, [view]);

  if (isLoading) {
    return (
      <PageShell>
        <LoadingSpinner />
      </PageShell>
    );
  }

  if (!isAuthenticated) {
    return (
      <PageShell>
        <div className="flex flex-col items-start gap-3 rounded-lg bg-surface p-5 text-left">
          <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
          <p className="text-sm text-muted">You&apos;re not signed in. Sign in to manage your profile, library and settings.</p>
          <SignInButtons />
        </div>
        {/* Theme, text size and the rest work on this device without an account. */}
        <AppearanceSettings />
      </PageShell>
    );
  }

  const hasPassword = providers?.includes("password") ?? false;
  const hasGoogle = providers?.includes("google") ?? false;
  const username = profile?.username || null;
  const current = NAV.flatMap((g) => g.items).find((i) => i.id === view)!;

  function handleSignOut() {
    void signOut();
    router.push("/");
  }

  function pick(id: AccountView) {
    setView(id);
    window.scrollTo({ top: 0 });
  }

  const methods = [hasPassword ? "Password" : null, hasGoogle ? "Google" : null].filter(Boolean).join(" and ");

  return (
    <PageShell wide>
      {/* Who you are, like the dashboard's header: name and email on the left, actions on the right. */}
      <header className="flex flex-col gap-4 border-b border-foreground/10 pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <UserAvatar url={profile?.avatarUrl ?? null} />
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{username ? `@${username}` : user?.name || "Account"}</h1>
            <p className="truncate text-sm text-muted">
              {[user?.email, profile?.isPublic ? "Public profile" : "Private profile", methods ? `Signs in with ${methods}` : null].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          {username && profile?.isPublic && (
            <Link href={`/u/${username}`} className={BUTTON_SECONDARY}>
              View profile
            </Link>
          )}
          <button type="button" onClick={handleSignOut} className={BUTTON_SECONDARY}>
            <LogOutIcon className="h-4 w-4" /> Sign out
          </button>
        </div>
      </header>

      <div className="flex flex-col gap-6 md:flex-row md:items-start md:gap-10">
        {/* Phones: one dropdown for the section. */}
        <div className="md:hidden">
          <Select
            value={view}
            onChange={pick}
            className="w-full"
            options={NAV.flatMap((g) => g.items).map((item) => ({ value: item.id, label: item.label, icon: <item.icon className="h-4 w-4 text-muted" /> }))}
          />
        </div>
        <nav aria-label="Account sections" className="hidden w-52 shrink-0 flex-col gap-5 md:sticky md:top-6 md:flex">
          {NAV.map((g) => (
            <div key={g.group}>
              <h2 className="mb-1 px-3 text-xs font-medium text-muted">{g.group}</h2>
              <div className="flex flex-col gap-0.5">
                {g.items.map((item) => {
                  const on = view === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => pick(item.id)}
                      aria-current={on ? "page" : undefined}
                      className={`flex h-9 items-center rounded-md px-3 text-left text-sm transition-colors ${
                        on ? "bg-surface-hover font-medium text-foreground" : item.danger ? "text-danger hover:bg-surface-hover" : "text-muted hover:bg-surface-hover hover:text-foreground"
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <h2 className="hidden text-xl font-semibold tracking-tight md:block">{current.label}</h2>

          {view === "profile" && <PublicProfileEditor />}

          {view === "tunes" && <TunesTab />}

          {view === "tunesToLearn" && <TunesToLearnTab />}

          {view === "posts" && <MyPostsTab />}

          {view === "following" && <FollowLists />}

          {view === "general" && <GeneralSettings />}

          {view === "appearance" && <AppearanceSettings />}

          {view === "sidebar" && <SidebarSettings />}

          {view === "dashboard" && <DashboardSettings />}

          {view === "tools" && <ToolSettings />}

          {view === "practice" && <PracticeSettings />}

          {view === "security" && (
            <>
              <PasswordSection hasPassword={hasPassword} email={user?.email ?? null} />
              <SignInMethodsSection hasPassword={hasPassword} hasGoogle={hasGoogle} userEmail={user === undefined ? undefined : (user?.email ?? null)} />
            </>
          )}

          {view === "danger" && (
            <SettingsCard
              danger
              hints={false}
              title="Delete your account"
              description="Permanently deletes your account, your profile and posts, your Shed Log, recordings and everything synced. This can't be undone."
              footer={
                <button type="button" onClick={() => setDeleteOpen(true)} className="ml-auto h-9 rounded-md bg-danger px-4 text-sm font-medium text-background hover:opacity-90">
                  Delete my account
                </button>
              }
            />
          )}
        </div>
      </div>

      {deleteOpen && <DeleteAccountModal requiresPassword={hasPassword} email={user?.email ?? null} onClose={() => setDeleteOpen(false)} />}
    </PageShell>
  );
}
