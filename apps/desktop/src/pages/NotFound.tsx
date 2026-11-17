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
        <Logo height={40} />
        <div className="flex max-w-md flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">There&apos;s no page here</h1>
          <p className="text-sm text-muted">The link may be old, or the page may only be on the website.</p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Link href="/dashboard" className="flex h-9 items-center rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover">
            Go to the dashboard
          </Link>
          <button
            type="button"
            onClick={() => openExternal(`${SITE_URL}${pathname}${search}`)}
            className="h-9 rounded-md bg-foreground/[0.05] px-4 text-sm font-medium transition-colors hover:bg-surface-hover"
          >
            Open on soniroll.com
          </button>
        </div>
      </div>
    </PageShell>
  );
}
