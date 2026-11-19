import { CommunitySubPage } from "@/components/Community";
import FollowLists from "@/components/FollowLists";

export const metadata = { title: "Following · Community" };

export default function FollowingRoute() {
  return (
    <CommunitySubPage title="Following">
      <FollowLists />
    </CommunitySubPage>
  );
}
