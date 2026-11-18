import SetlistPage from "@/components/library/SetlistPage";

export const metadata = { title: "Setlist" };

/** `/tunes/setlist?id=` — one of your setlists. */
export default async function SetlistRoute({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  return <SetlistPage id={id ?? ""} />;
}
