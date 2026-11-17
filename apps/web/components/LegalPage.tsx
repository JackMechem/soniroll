import type { ReactNode } from "react";

/** Shared shell for /privacy and /terms — plain prose pages, not a "tool" (no ToolLayout, no
    options column), styled to match the rest of the site's typography/color tokens. Both pages
    are static content with no interactivity, so this (and they) stay plain Server Components —
    no "use client" needed anywhere in either page. */
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pb-16 pt-[calc(env(safe-area-inset-top)+4.5rem)] sm:px-6 lg:pt-12">
      <div className="flex flex-col gap-1 border-b border-foreground/10 pb-6 text-left">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted">Last updated {updated}</p>
      </div>
      <div className="flex flex-col gap-6 text-left">{children}</div>
    </main>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <div className="flex flex-col gap-2 text-sm leading-relaxed text-foreground/90">
        {children}
      </div>
    </section>
  );
}

/** A link to another page or an external resource (a third-party service's own privacy
    policy/terms, GitHub issues, ...), styled consistently with Home.tsx's footer links. */
export function LegalLink({ href, children }: { href: string; children: ReactNode }) {
  const external = href.startsWith("http");
  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className="font-medium text-accent underline-offset-4 outline-none hover:underline focus-visible:underline"
    >
      {children}
    </a>
  );
}
