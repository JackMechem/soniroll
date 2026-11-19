import Link from "next/link";
import Logo from "@/components/Logo";
import { PageShell } from "@/components/library/shared";

export const metadata = { title: "Page not found" };

/** Any URL the site doesn't know (an old or mistyped link), and `notFound()` calls. */
export default function NotFound() {
  return (
    <PageShell>
      <div className="flex flex-1 flex-col items-center justify-center gap-6 py-16 text-center">
        {/* Phones already show the logo in the top bar. */}
        <span className="flex max-lg:hidden">
          <Logo height={40} />
        </span>
        <div className="flex max-w-md flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">There&apos;s no page here</h1>
          <p className="text-sm text-muted">The link may be old or mistyped.</p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Link href="/dashboard" className="flex h-9 items-center rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover">
            Go to the dashboard
          </Link>
          <Link href="/help" className="flex h-9 items-center rounded-md bg-foreground/[0.05] px-4 text-sm font-medium transition-colors hover:bg-surface-hover">
            Help
          </Link>
        </div>
      </div>
    </PageShell>
  );
}
