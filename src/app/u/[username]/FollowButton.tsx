"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";

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
      if (action === "unfollow") {
        setState("none");
      } else {
        setState(j.status === "pending" ? "pending" : "accepted");
        // Success feedback — for private accounts it's "request sent"
        // not "now following", so disambiguate.
        toast.success(
          j.status === "pending"
            ? `Follow request sent to @${username}`
            : `Now following @${username}`,
        );
      }
      router.refresh();
    } else {
      // 429 (rate-limited) and other failures surface via the toast
      // bus so the user knows the click did nothing.
      await toast.fromResponse(res, "Couldn't update follow");
    }
  }

  const label =
    state === "accepted" ? "Following" : state === "pending" ? "Requested" : "Follow";

  return (
    <button
      onClick={toggle}
      disabled={busy}
      className={`rounded-full px-4 py-1.5 text-sm font-medium active:scale-95 transition-transform ${
        state === "none"
          ? "bg-white text-black hover:bg-neutral-200"
          : "border border-neutral-700 text-neutral-200 hover:bg-neutral-900"
      } disabled:opacity-60`}
    >
      {label}
    </button>
  );
}
