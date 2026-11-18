import ScoreWriter from "@/components/scorewriter/ScoreWriter";

export const metadata = { title: "Score Writer" };

/** `/score-writer[?id=<score id>]` — Score Writer. */
export default async function ScoreWriterRoute({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  return <ScoreWriter initialId={id} />;
}
