import { CommunitySubPage } from "@/components/Community";
import MyPostsTab from "@/components/MyPostsTab";

export const metadata = { title: "Posts · Community" };

export default function MyPostsRoute() {
  return (
    <CommunitySubPage title="My posts">
      <MyPostsTab />
    </CommunitySubPage>
  );
}
