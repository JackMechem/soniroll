import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";
import { FONT_VARIABLE_CLASSES } from "@/app/fonts";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import { DISPLAY_INIT_SCRIPT } from "@/lib/display";
import SiteSettingsEffects from "@/components/SiteSettingsEffects";
import AppChrome from "@/components/AppChrome";
import BackgroundToolDock from "@/components/BackgroundToolDock";
import CommandPalette from "@/components/CommandPalette";
import ConvexClientProvider from "@/components/ConvexClientProvider";
import PracticeTimerAlert from "@/components/PracticeTimerAlert";
import PracticeTimerWidget from "@/components/PracticeTimerWidget";
import Sidebar from "@/components/Sidebar";
import UsernamePrompt from "@/components/UsernamePrompt";
import "./globals.css";

const DESCRIPTION =
  "Free practice tools for musicians: metronome, tuner, ear training, chord charts, jam practice, a practice log and more. No ads, no paywalls.";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.soniroll.com"),
  title: { default: "soniroll", template: "%s · soniroll" },
  description: DESCRIPTION,
  applicationName: "soniroll",
  openGraph: { type: "website", siteName: "soniroll", title: "soniroll — practice tools for musicians", description: DESCRIPTION, url: "/" },
  twitter: { card: "summary_large_image", title: "soniroll — practice tools for musicians", description: DESCRIPTION },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#e8ecf1",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${FONT_VARIABLE_CLASSES} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex h-dvh overflow-hidden bg-surface" suppressHydrationWarning>
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
        />
        <Script id="display-init" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: DISPLAY_INIT_SCRIPT }} />
        {/* Server (reads the auth cookie during SSR) wraps client (holds the live Convex
            connection) — the app's first-ever context providers. Purely additive: no visual/DOM
            change, everything below is unchanged.

            Tried dropping ConvexAuthNextjsServerProvider to keep every route statically
            prerendered (it forces dynamic rendering app-wide by reading cookies() in the root
            layout — confirmed via `pnpm build`'s route summary going from every route ○ Static to
            every route ƒ Dynamic). That's not just a missed optimization: without it, `pnpm build`
            fails outright — "Cannot destructure property 'isLoading' of 'c(...)' as it is
            undefined" while prerendering /chord-charts — Convex Auth's client-side context isn't
            safely renderable during Next's build-time static pass on its own. So this is the
            required setup, not a preference; every route being server-rendered-on-demand is the
            real, unavoidable cost of adding Convex Auth here. */}
        <ConvexAuthNextjsServerProvider>
          <ConvexClientProvider>
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
              {children}
            </AppChrome>
          </ConvexClientProvider>
        </ConvexAuthNextjsServerProvider>
      </body>
    </html>
  );
}
