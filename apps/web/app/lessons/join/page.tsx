import JoinPage from "@/components/lessons/JoinPage";

export const metadata = { title: "Join lessons" };

/** `/lessons/join?invite=` — a teacher's invite link. (Not `?code=`: Convex Auth's middleware
    takes any `code` parameter for an OAuth sign-in and fails on it.) */
export default async function JoinRoute({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  const { invite } = await searchParams;
  return <JoinPage code={invite ?? ""} />;
}
