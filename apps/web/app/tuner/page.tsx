import Tuner from "@/components/Tuner";

export const metadata = { title: "Tuner" };

/** `/tuner[?take=…]` — `take` opens one of the Tuner's takes (from "Open in Tuner"). */
export default async function TunerPage({ searchParams }: { searchParams: Promise<{ take?: string }> }) {
  const { take } = await searchParams;
  return <Tuner openTakeId={take} />;
}
