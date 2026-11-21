import { AuthForm } from "@/components/AccountMenu";
import { BackButton } from "@/components/library/shared";
import Logo from "@/components/Logo";
import { navigate } from "../router";

/** `/?auth=login`: the website opens its landing page with the sign-in form on top; the desktop
    app has no landing page, so it's the same form on its own. */
export default function SignIn({ initialFlow = "signIn" }: { initialFlow?: "signIn" | "signUp" }) {
  const done = () => navigate("/dashboard", { replace: true });
  // The window has no browser Back button, so this page needs its own way out.
  const leave = () => (window.history.length > 1 ? window.history.back() : done());
  return (
    <div className="relative flex min-h-dvh items-center justify-center bg-background px-4 py-10 text-foreground">
      <BackButton onClick={leave} label="Not now" className="absolute left-4 top-4" />
      <div className="flex w-full max-w-sm flex-col gap-6">
        <Logo height={36} className="self-center" />
        <div className="flex flex-col gap-4 rounded-xl bg-surface p-6">
          <AuthForm onClose={done} initialFlow={initialFlow} />
        </div>
      </div>
    </div>
  );
}
