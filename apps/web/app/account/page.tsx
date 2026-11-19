import AccountPage from "@/components/AccountPage";

export const metadata = { title: "Account" };

/** `/account[?tab=…]` — account settings. */
export default async function AccountRoute({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  return <AccountPage initialTab={tab} />;
}
