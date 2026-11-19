import ChartViewPage from "@/components/library/ChartViewPage";

export const metadata = { title: "Chord chart" };

export default async function ChartViewRoute({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  return <ChartViewPage id={id ?? ""} />;
}
