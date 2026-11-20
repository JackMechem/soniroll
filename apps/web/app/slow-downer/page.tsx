import SlowDowner from "@/components/SlowDowner";

export const metadata = { title: "Slow Downer" };

/** `/slow-downer[?open=<kind>:<id>]` — `open` opens one of your stored files (Files' "Open in"). */
export default async function SlowDownerPage({ searchParams }: { searchParams: Promise<{ open?: string }> }) {
  const { open } = await searchParams;
  return <SlowDowner openStored={open} />;
}
