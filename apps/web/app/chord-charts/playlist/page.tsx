import PlaylistPage from "@/components/library/PlaylistPage";

export const metadata = { title: "Chord chart folder" };

export default async function PlaylistRoute({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  return <PlaylistPage id={id ?? ""} />;
}
