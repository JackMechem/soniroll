import ChartEditorPage from "@/components/library/ChartEditorPage";

export const metadata = { title: "New chart" };

export default async function NewChartRoute({ searchParams }: { searchParams: Promise<{ playlist?: string }> }) {
  const { playlist } = await searchParams;
  return <ChartEditorPage playlist={playlist} />;
}
