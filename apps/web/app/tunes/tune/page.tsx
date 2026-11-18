import TuneHub from "@/components/TuneHub";

export const metadata = { title: "Tune" };

/** `/tunes/tune?id=…&list=tunes|learn` — one tune's own page (see `components/TuneHub.tsx`). */
export default async function TuneRoute({ searchParams }: { searchParams: Promise<{ id?: string; list?: string }> }) {
  const { id, list } = await searchParams;
  return <TuneHub id={id ?? ""} list={list} />;
}
