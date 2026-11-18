import ChartEditorPage from "@/components/library/ChartEditorPage";

export const metadata = { title: "Edit chart" };

export default async function EditChartRoute({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  return <ChartEditorPage editId={id ?? ""} />;
}
