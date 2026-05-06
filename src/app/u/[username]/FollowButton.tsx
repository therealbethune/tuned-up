"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export type FollowState = "none" | "pending" | "accepted";

export function FollowButton({
  username,
  initialState,
}: {
  username: string;
  initialState: FollowState;
}) {
  const router = useRouter();
  const [state, setState] = useState<FollowState>(initialState);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    const action = state === "none" ? "follow" : "unfollow";
    const res = await fetch("/api/follows", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, action }),
    });
    setBusy(false);
    if (res.ok) {
      const j = await res.json().catch(() => ({}));
      if (action === "unfollow") setState("none");
      else setState(j.status === "pending" ? "pending" : "accepted");
      router.refresh();
    }
  }

  const label =
    state === "accepted" ? "Following" : state === "pending" ? "Requested" : "Follow";

  return (
    <button
      onClick={toggle}
      disabled={busy}
      className={`rounded-full px-4 py-1.5 text-sm font-medium ${
        state === "none"
          ? "bg-white text-black hover:bg-neutral-200"
          : "border border-neutral-700 text-neutral-200 hover:bg-neutral-900"
      }`}
    >
      {label}
    </button>
  );
}
