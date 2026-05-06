"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function FollowRequestActions({ followerUsername }: { followerUsername: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<"accepted" | "rejected" | null>(null);

  async function act(action: "accept" | "reject") {
    setBusy(true);
    const res = await fetch("/api/follows", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: followerUsername, action }),
    });
    setBusy(false);
    if (res.ok) {
      setDone(action === "accept" ? "accepted" : "rejected");
      router.refresh();
    }
  }

  if (done) {
    return <span className="text-xs text-neutral-500">{done}</span>;
  }
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => act("accept")}
        disabled={busy}
        className="rounded-full bg-white text-black px-3 py-1 text-xs font-medium disabled:opacity-50"
      >
        Accept
      </button>
      <button
        onClick={() => act("reject")}
        disabled={busy}
        className="rounded-full border border-neutral-700 text-neutral-300 hover:bg-neutral-900 px-3 py-1 text-xs font-medium"
      >
        Decline
      </button>
    </div>
  );
}
