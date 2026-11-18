import TuneListPage from "@/components/library/TuneListPage";

export const metadata = { title: "Tune list" };

/** `/tunes/list?list=tunes|learn` — every tune in one list. */
export default async function TunesListRoute({ searchParams }: { searchParams: Promise<{ list?: string }> }) {
  const { list } = await searchParams;
  return <TuneListPage list={list === "learn" ? "learn" : "tunes"} />;
}
