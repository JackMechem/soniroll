import StudentPage from "@/components/lessons/StudentPage";

export const metadata = { title: "Student · Lessons" };

/** `/lessons/student?id=` — one of your students (as their teacher). */
export default async function StudentRoute({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  return <StudentPage id={id ?? ""} />;
}
