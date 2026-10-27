import { forwardRef, type AnchorHTMLAttributes, type MouseEvent } from "react";
import { navigate } from "../router";

/** Stand-in for `next/link`: a plain <a> that navigates inside the app. */

type Href = string | { pathname?: string; query?: Record<string, string | number | boolean | undefined>; hash?: string };

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: Href;
  replace?: boolean;
  scroll?: boolean;
  prefetch?: boolean | null;
};

export function hrefToString(href: Href): string {
  if (typeof href === "string") return href;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(href.query ?? {})) {
    if (value !== undefined) query.set(key, String(value));
  }
  const search = query.toString();
  return `${href.pathname ?? ""}${search ? `?${search}` : ""}${href.hash ? `#${href.hash.replace(/^#/, "")}` : ""}`;
}

const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  { href, replace, scroll, onClick, target, ...props },
  ref,
) {
  const { prefetch, ...rest } = props;
  void prefetch; // Nothing to prefetch: every page is already in the app.
  const url = hrefToString(href);
  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (target && target !== "_self") return;
    if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return; // external: the global link handler opens it
    e.preventDefault();
    navigate(url, { replace, scroll });
  }
  return <a ref={ref} href={url} target={target} onClick={handleClick} {...rest} />;
});

export default Link;
