import Recorder from "@/components/Recorder";

export const metadata = { title: "Recorder" };

/** `/recorder[?tuneId=…]` — from a tune's page, the take is for that tune. */
export default async function RecorderPage({ searchParams }: { searchParams: Promise<{ tuneId?: string }> }) {
  const { tuneId } = await searchParams;
  return <Recorder tuneId={tuneId} />;
}
