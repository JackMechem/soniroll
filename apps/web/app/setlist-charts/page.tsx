import { redirect } from "next/navigation";
import SetlistChartsPage from "@/components/library/SetlistChartsPage";

export const metadata = { title: "Setlist charts" };

/** `/setlist-charts?mine=|post=|shared=<id>[&start=]` — a setlist's charts, one per page. With no
    setlist given there's nothing to read, so it goes to the Library's setlists. */
export default async function SetlistChartsRoute({
  searchParams,
}: {
  searchParams: Promise<{ mine?: string; post?: string; shared?: string; start?: string }>;
}) {
  const p = await searchParams;
  if (!p.mine && !p.post && !p.shared) redirect("/tunes?tab=setlists");
  return <SetlistChartsPage mine={p.mine} post={p.post} shared={p.shared} start={Math.max(0, Number(p.start) || 0)} />;
}
