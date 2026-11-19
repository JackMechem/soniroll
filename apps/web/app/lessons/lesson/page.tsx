import LessonPage from "@/components/lessons/LessonPage";

export const metadata = { title: "Lesson" };

/** `/lessons/lesson?pair=&id=` — one lesson with a student (or `id=earlier`). */
export default async function LessonRoute({ searchParams }: { searchParams: Promise<{ pair?: string; id?: string }> }) {
  const { pair, id } = await searchParams;
  return <LessonPage pair={pair ?? ""} id={id ?? ""} />;
}
