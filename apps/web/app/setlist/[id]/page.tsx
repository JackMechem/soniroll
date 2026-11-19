import SharedSetlistPage from "@/components/SharedSetlistPage";

export const metadata = { title: "Shared setlist" };

/** `/setlist/<id>` — a setlist shared by link (what the "Share link" button sends out). */
export default async function SharedSetlistRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SharedSetlistPage id={id} />;
}
