"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";

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
    } else {
      await toast.fromResponse(res, "Couldn't update follow request");
    }
  }

  // Once an action is taken we replace the buttons with a colored,
  // announced confirmation. Previously rendered as a tiny gray italic
  // string that was easy to miss after acting on five requests in a
  // row. role="status" tells screen readers + voice control that the
  // state changed.
  if (done) {
    const isAccept = done === "accepted";
    return (
      <span
        role="status"
        className={`text-xs inline-flex items-center gap-1 ${
          isAccept ? "text-emerald-300" : "text-neutral-400"
        }`}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
          {isAccept ? (
            <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
          ) : (
            <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
          )}
        </svg>
        {isAccept ? "Accepted" : "Declined"}
      </span>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => act("accept")}
        disabled={busy}
        className="rounded-full bg-white text-black px-3 py-1 text-xs font-medium disabled:opacity-50 active:scale-95 transition-transform"
      >
        Accept
      </button>
      <button
        onClick={() => act("reject")}
        disabled={busy}
        className="rounded-full border border-neutral-700 text-neutral-300 hover:bg-neutral-900 px-3 py-1 text-xs font-medium active:scale-95 transition-transform"
      >
        Decline
      </button>
    </div>
  );
}
