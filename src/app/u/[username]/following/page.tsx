import FollowList from "../FollowList";

export const dynamic = "force-dynamic";

export default async function FollowingPage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  return <FollowList username={username} direction="following" />;
}
