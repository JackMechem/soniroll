import TeacherPage from "@/components/lessons/TeacherPage";

export const metadata = { title: "Teacher · Lessons" };

/** `/lessons/teacher?id=` — what one of your teachers has given you. */
export default async function TeacherRoute({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  return <TeacherPage id={id ?? ""} />;
}
