import Link from "next/link";
import Logo from "@/components/Logo";
import { PageShell } from "@/components/library/shared";
import { useLocation } from "../router";
import { openExternal, SITE_URL } from "../links";

/** A path the app doesn't know (an old or mistyped link). */
export default function NotFound() {
  const { pathname, search } = useLocation();
  return (
    <PageShell>
      <div className="flex flex-1 flex-col items-center justify-center gap-6 py-16 text-center">
        <Logo height={56} />
        <div className="flex max-w-md flex-col gap-2">
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">There&apos;s no page here</h1>
          <p className="text-sm text-muted">The link may be old, or the page may only be on the website.</p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Link href="/dashboard" className="flex h-10 items-center rounded-full bg-accent px-5 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent-hover">
            Go to the dashboard
          </Link>
          <button
            type="button"
            onClick={() => openExternal(`${SITE_URL}${pathname}${search}`)}
            className="h-10 rounded-full bg-surface px-5 text-sm font-semibold transition-colors hover:bg-surface-hover"
          >
            Open on soniroll.com
          </button>
        </div>
      </div>
    </PageShell>
  );
}
