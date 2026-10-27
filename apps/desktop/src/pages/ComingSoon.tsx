import Link from "next/link";
import { PageShell } from "@/components/library/shared";
import { MetronomeIcon, NAV_LINKS, TunerIcon } from "@/components/tools";
import Logo from "@/components/Logo";
import { useLocation } from "../router";
import { openExternal, SITE_URL } from "../links";

const OTHER_TITLES: Record<string, string> = {
  "/dashboard": "The dashboard",
  "/account": "Your account",
  "/settings": "Settings",
  "/help": "Help",
  "/changelog": "What's new",
  "/support": "Support",
  "/feedback": "Feedback",
  "/admin": "Admin",
  "/files": "Files",
  "/recordings": "Recordings",
  "/setlist-charts": "Setlists",
  "/post": "New post",
  "/privacy": "The privacy page",
  "/terms": "The terms",
  "/credits": "Credits",
};

function titleFor(pathname: string): string {
  const link = NAV_LINKS.find((l) => pathname === l.href || pathname.startsWith(`${l.href}/`));
  if (link) return link.label;
  const other = Object.keys(OTHER_TITLES).find((p) => pathname === p || pathname.startsWith(`${p}/`));
  return other ? OTHER_TITLES[other] : "This page";
}

/** Every page the desktop app doesn't have yet: says so, and offers the website instead. */
export default function ComingSoon() {
  const { pathname, search } = useLocation();
  const title = titleFor(pathname);
  const link = NAV_LINKS.find((l) => pathname === l.href || pathname.startsWith(`${l.href}/`));
  const Icon = link?.icon;
  return (
    <PageShell>
      <div className="flex flex-1 flex-col items-center justify-center gap-6 py-16 text-center">
        {Icon ? (
          <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-surface text-accent">
            <Icon className="h-8 w-8" />
          </span>
        ) : (
          <Logo height={56} />
        )}
        <div className="flex max-w-md flex-col gap-2">
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{title} isn&apos;t in the desktop app yet</h1>
          <p className="text-sm text-muted">
            This early version has the Metronome and the Tuner. Everything else is on the website for now.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => openExternal(`${SITE_URL}${pathname}${search}`)}
            className="h-10 rounded-full bg-accent px-5 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent-hover"
          >
            Open on soniroll.com
          </button>
          <Link href="/metronome" className="flex h-10 items-center gap-2 rounded-full bg-surface px-4 text-sm font-semibold transition-colors hover:bg-surface-hover">
            <MetronomeIcon className="h-4 w-4 text-accent" />
            Metronome
          </Link>
          <Link href="/tuner" className="flex h-10 items-center gap-2 rounded-full bg-surface px-4 text-sm font-semibold transition-colors hover:bg-surface-hover">
            <TunerIcon className="h-4 w-4 text-accent" />
            Tuner
          </Link>
        </div>
      </div>
    </PageShell>
  );
}
