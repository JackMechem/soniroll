import Community from "@/components/Community";

export const metadata = { title: "Community" };

/** `/community[?tab=following|popular|liked]` — the feed tab is kept in the address. */
export default async function CommunityPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  return <Community initialTab={tab} />;
}
