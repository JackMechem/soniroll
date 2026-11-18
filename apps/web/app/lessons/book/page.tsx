import BookPage from "@/components/lessons/BookPage";

export const metadata = { title: "Book a lesson" };

/** `/lessons/book?offer=` — times a teacher emailed a student; picking one books it. */
export default async function BookRoute({ searchParams }: { searchParams: Promise<{ offer?: string }> }) {
  const { offer } = await searchParams;
  return <BookPage token={offer ?? ""} />;
}
