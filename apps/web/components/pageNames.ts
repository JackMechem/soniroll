import { SUPPORT_PATH } from "@/components/support/SupportParts";
import {
  CATEGORY_COLORS,
  CloudIcon,
  DocumentIcon,
  DownloadIcon,
  FeedbackIcon,
  GearIcon,
  HeartIcon,
  HelpIcon,
  HomeIcon,
  MegaphoneIcon,
  NAV_LINKS,
  PhoneIcon,
  ShareIcon,
  ShieldIcon,
  UserIcon,
  findToolLink,
} from "@/components/tools";
import { MOBILE_PATH } from "@/lib/androidRelease";
import { DOWNLOAD_PATH } from "@/lib/desktopRelease";
import { DASHBOARD_PATH } from "@/lib/landing";

type Icon = React.ComponentType<{ className?: string }>;

/** The library's other pages (chord charts, the setlist chart reader, files; old recordings
    links), which the sidebar files under Library (`/tunes`). */
export function isLibraryPath(path: string) {
  return path === "/chord-charts" || path.startsWith("/chord-charts/") || path === "/setlist-charts" || path === "/files" || path === "/recordings" || path.startsWith("/recordings/");
}

/** Names for pages that aren't a tool or a Library/Community/Lessons page. */
const PAGE_TITLES: { match: (path: string) => boolean; label: string; href?: string; icon: Icon }[] = [
  { match: (p) => p === "/account" || p === "/settings", label: "Account", href: "/account", icon: GearIcon },
  { match: (p) => p.startsWith("/u/"), label: "Profile", icon: UserIcon },
  { match: (p) => p === "/help" || p.startsWith("/help/"), label: "Help", href: "/help", icon: HelpIcon },
  { match: (p) => p === "/changelog", label: "What's new", href: "/changelog", icon: MegaphoneIcon },
  { match: (p) => p === "/feedback", label: "Feedback", href: "/feedback", icon: FeedbackIcon },
  { match: (p) => p === SUPPORT_PATH, label: "Support", href: SUPPORT_PATH, icon: HeartIcon },
  { match: (p) => p === "/plans", label: "Storage plans", href: "/plans", icon: CloudIcon },
  { match: (p) => p === DOWNLOAD_PATH, label: "Desktop app", href: DOWNLOAD_PATH, icon: DownloadIcon },
  { match: (p) => p === MOBILE_PATH, label: "Phone app", href: MOBILE_PATH, icon: PhoneIcon },
  { match: (p) => p === "/credits", label: "Credits", href: "/credits", icon: HeartIcon },
  { match: (p) => p === "/privacy", label: "Privacy", href: "/privacy", icon: ShieldIcon },
  { match: (p) => p === "/terms", label: "Terms", href: "/terms", icon: DocumentIcon },
  { match: (p) => p === "/admin" || p.startsWith("/admin/"), label: "Admin", href: "/admin", icon: ShieldIcon },
  { match: (p) => p === "/reset-password", label: "Reset password", icon: ShieldIcon },
  { match: (p) => /^\/(setlist|routine|tune|file|note)\//.test(p), label: "Shared", icon: ShareIcon },
];

/** `color`: a tool's category colour (`--cat-n`), as the sidebar shows its icon. */
export type PageName = { href?: string; label: string; short?: string; icon: Icon; color?: string };

/** A page's name and icon from its path (the phone top bar, tab names): the tool or section it
    belongs to (Library pages all count as Library), or one of the pages above. Null for the
    dashboard and anything else. */
export function pageNameFor(path: string): PageName | null {
  const link =
    findToolLink(isLibraryPath(path) || path.startsWith("/tunes/") ? "/tunes" : path) ??
    NAV_LINKS.find((l) => l.href !== "/" && (path.startsWith(`${l.href}/`) || (l.href === "/community" && path.startsWith("/post"))));
  if (link) return { href: link.href, label: link.label, short: link.short, icon: link.icon, color: CATEGORY_COLORS[link.category] };
  const page = PAGE_TITLES.find((t) => t.match(path));
  return page ? { href: page.href, label: page.label, icon: page.icon } : null;
}

/** A tab's name and icon: what it was renamed to, else its main page's name. */
export function tabTitle(name: string | null, mainHref: string): { label: string; icon: Icon | null; color?: string } {
  const path = mainHref.split(/[?#]/)[0];
  const page: PageName | null = path === DASHBOARD_PATH ? { label: "Dashboard", icon: HomeIcon } : pageNameFor(path);
  return { label: name ?? page?.label ?? "Page", icon: page?.icon ?? null, color: page?.color };
}
