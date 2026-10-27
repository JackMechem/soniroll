import { useMemo } from "react";
import { useAuthActions as useOriginalAuthActions } from "convex-auth-react-original";
import { invoke } from "@tauri-apps/api/core";

/** Desktop version of `@convex-dev/auth/react`. Everything is the real package, except that
    "Continue with Google" sends Google back to a one-off local address the app listens on
    (`src-tauri/src/oauth.rs`) instead of to soniroll.com. The sign-in page itself opens in the
    system browser (the window refuses to navigate away; see `lib.rs`), and `GoogleSignIn`
    finishes the sign-in when the code comes back. */

export * from "convex-auth-react-original";

type AuthActions = ReturnType<typeof useOriginalAuthActions>;

export function useAuthActions(): AuthActions {
  const actions = useOriginalAuthActions();
  return useMemo(
    () => ({
      ...actions,
      signIn: (async (provider: string, params?: FormData | Record<string, unknown>) => {
        if (provider !== "google") return actions.signIn(provider, params as never);
        const port = await invoke<number>("oauth_listen");
        const base = params instanceof FormData ? Object.fromEntries(params) : (params ?? {});
        return actions.signIn("google", { ...base, redirectTo: `http://127.0.0.1:${port}/` } as never);
      }) as AuthActions["signIn"],
    }),
    [actions],
  );
}
