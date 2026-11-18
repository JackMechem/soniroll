import { redirect } from "next/navigation";

export const metadata = { title: "Settings" };

/** `/settings[?tab=…]` — the site settings live in the account page's Settings group. */
export default async function SettingsRoute({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  redirect(`/account?tab=${encodeURIComponent(tab || "general")}`);
}
