import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { ImportFlow } from "./ImportFlow";

export const dynamic = "force-dynamic";

export default async function SpotifyImportPage() {
  const { userId } = await auth();
  if (!userId) redirect("/");
  // Surface client-id presence to the client component (it would have access
  // anyway via the public env, but this lets us render an unconfigured state
  // without a flash).
  const configured = Boolean(process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID);
  return <ImportFlow configured={configured} />;
}
