import { useEffect, type ReactNode } from "react";
import AccountPage from "@/components/AccountPage";
import Metronome from "@/components/Metronome";
import ResetPassword from "@/components/ResetPassword";
import Tuner from "@/components/Tuner";
import NativeAudioChip from "./NativeAudioChip";
import ComingSoon from "./pages/ComingSoon";
import SignIn from "./pages/SignIn";
import { navigate, useLocation } from "./router";

function Redirect({ to }: { to: string }) {
  useEffect(() => navigate(to, { replace: true }), [to]);
  return null;
}

/** A native-audio tool: the website's page plus the desktop's audio chip. */
function NativeTool({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-full flex-1 flex-col">
      <NativeAudioChip />
      {children}
    </div>
  );
}

export function Routes() {
  const { pathname, search } = useLocation();
  const params = new URLSearchParams(search);
  switch (pathname) {
    case "/":
      return params.get("auth") ? <SignIn /> : <Redirect to="/metronome" />;
    case "/metronome":
      return (
        <NativeTool>
          <Metronome />
        </NativeTool>
      );
    case "/tuner":
      return (
        <NativeTool>
          <Tuner />
        </NativeTool>
      );
    case "/account":
      return <AccountPage />;
    case "/reset-password":
      return <ResetPassword email={params.get("email") ?? ""} token={params.get("token") ?? ""} />;
    default:
      return <ComingSoon />;
  }
}
