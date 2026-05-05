"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function FollowButton({ username, initiallyFollowing }: { username: string; initiallyFollowing: boolean }) {
  const router = useRouter();
  const [following, setFollowing] = useState(initiallyFollowing);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    const res = await fetch("/api/follows", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, action: following ? "unfollow" : "follow" }),
    });
    setBusy(false);
    if (res.ok) {
      setFollowing(!following);
      router.refresh();
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      className={`rounded-full px-4 py-1.5 text-sm font-medium ${
        following ? "border border-neutral-700 text-neutral-200 hover:bg-neutral-900" : "bg-white text-black hover:bg-neutral-200"
      }`}
    >
      {following ? "Following" : "Follow"}
    </button>
  );
}
