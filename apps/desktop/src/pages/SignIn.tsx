import { AuthForm } from "@/components/AccountMenu";
import Logo from "@/components/Logo";
import { navigate } from "../router";

/** `/?auth=login`: the website opens its landing page with the sign-in form on top; the desktop
    app has no landing page, so it's the same form on its own. */
export default function SignIn({ initialFlow = "signIn" }: { initialFlow?: "signIn" | "signUp" }) {
  const done = () => navigate("/dashboard", { replace: true });
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-10 text-foreground">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <Logo height={44} className="self-center" />
        <div className="flex flex-col gap-4 rounded-3xl bg-surface p-6 shadow-sm">
          <AuthForm onClose={done} initialFlow={initialFlow} />
        </div>
      </div>
    </div>
  );
}
