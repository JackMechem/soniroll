import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useAuthActions } from "@convex-dev/auth/react";
import { getLocation, navigate } from "./router";

/** Finishes "Continue with Google": the browser comes back to the app's local listener with a
    one-time code, which (with the verifier saved when sign-in started) gets the session. */
export default function GoogleSignIn() {
  const { signIn } = useAuthActions();
  useEffect(() => {
    const unlisten = listen<string>("oauth-code", async ({ payload: code }) => {
      try {
        await (signIn as unknown as (provider: undefined, params: { code: string }) => Promise<unknown>)(undefined, { code });
        if (getLocation().pathname === "/") navigate("/dashboard", { replace: true });
      } catch (error) {
        console.error("Google sign-in failed", error);
      }
    });
    return () => void unlisten.then((stop) => stop());
  }, [signIn]);
  return null;
}
