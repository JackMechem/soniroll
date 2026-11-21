import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useAuthActions } from "@convex-dev/auth/react";
import { CloseIcon, GoogleIcon } from "@/components/tools";
import { getLocation, navigate } from "./router";

/** Finishes "Continue with Google": the browser comes back to the app's local listener with a
    one-time code, which (with the verifier saved when sign-in started) gets the session. If that
    fails, a small note says so (the sign-in form is usually closed by then). */
export default function GoogleSignIn() {
  const { signIn } = useAuthActions();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const unlisten = listen<string>("oauth-code", async ({ payload: code }) => {
      setFailed(false);
      try {
        await (signIn as unknown as (provider: undefined, params: { code: string }) => Promise<unknown>)(undefined, { code });
        if (getLocation().pathname === "/") navigate("/dashboard", { replace: true });
      } catch (error) {
        console.error("Google sign-in failed", error);
        setFailed(true);
      }
    });
    return () => void unlisten.then((stop) => stop());
  }, [signIn]);
  if (!failed) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+1rem)] z-[45] flex justify-center px-4 lg:justify-end lg:pr-20">
      <div role="alert" className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl bg-background/95 p-4 text-sm shadow-lg ring-1 ring-foreground/10 backdrop-blur">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-danger/15 text-danger">
          <GoogleIcon className="h-4 w-4" />
        </span>
        <p className="min-w-0 flex-1">
          <span className="font-semibold">Couldn&apos;t finish Google sign-in.</span> Try again from Sign in.
        </p>
        <button type="button" onClick={() => setFailed(false)} aria-label="Close" className="-mr-1 -mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface-hover hover:text-foreground">
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
