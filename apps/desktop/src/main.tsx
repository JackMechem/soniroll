// First, so every `new AudioContext()` from here on is the native one.
import "./native/webAudio/install";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import { FONT_VARIABLE_CLASSES } from "@/app/fonts";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import { DISPLAY_INIT_SCRIPT } from "@/lib/display";
import SiteSettingsEffects from "@/components/SiteSettingsEffects";
import AppChrome from "@/components/AppChrome";
import BackgroundToolDock from "@/components/BackgroundToolDock";
import CommandPalette from "@/components/CommandPalette";
import PracticeTimerAlert from "@/components/PracticeTimerAlert";
import PracticeTimerWidget from "@/components/PracticeTimerWidget";
import Sidebar from "@/components/Sidebar";
import UsernamePrompt from "@/components/UsernamePrompt";
import GoogleSignIn from "./GoogleSignIn";
import { installExternalLinks } from "./links";
import { installMediaDevices } from "./mediaDevices";
import { Routes } from "./routes";
import "./desktop.css";

// The same start-up the website's root layout does (app/layout.tsx): theme and display settings
// before the first paint, the font variables, and the body classes.
new Function(THEME_INIT_SCRIPT)();
new Function(DISPLAY_INIT_SCRIPT)();
document.documentElement.className += ` ${FONT_VARIABLE_CLASSES} h-full antialiased`;
document.body.className = "flex h-dvh overflow-hidden bg-surface";
installExternalLinks();
installMediaDevices();

const convex = new ConvexReactClient(import.meta.env.NEXT_PUBLIC_CONVEX_URL as string);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* Tokens live in localStorage (the website keeps them in cookies via its server). */}
    <ConvexAuthProvider client={convex} shouldHandleCode={false}>
      <GoogleSignIn />
      <SiteSettingsEffects />
      <PracticeTimerAlert />
      <UsernamePrompt />
      <AppChrome
        chrome={
          <>
            <Sidebar />
            <CommandPalette />
            <PracticeTimerWidget mobile />
            <BackgroundToolDock />
          </>
        }
      >
        <Routes />
      </AppChrome>
    </ConvexAuthProvider>
  </StrictMode>,
);
