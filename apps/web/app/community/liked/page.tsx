import { CommunitySubPage } from "@/components/Community";
import LikedPosts from "@/components/LikedPosts";

export const metadata = { title: "Liked · Community" };

export default function LikedPostsRoute() {
  return (
    <CommunitySubPage title="Liked posts">
      <LikedPosts />
    </CommunitySubPage>
  );
}
