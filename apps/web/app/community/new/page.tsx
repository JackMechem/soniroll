import NewPostPage from "@/components/NewPostPage";

export const metadata = { title: "New post" };

/** `/community/new[?setlist=<id>]` — posting to Community. */
export default async function NewPostRoute({ searchParams }: { searchParams: Promise<{ setlist?: string }> }) {
  const { setlist } = await searchParams;
  return <NewPostPage setlistId={setlist} />;
}
