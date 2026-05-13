"use client";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { toast } from "@/lib/toast";
import { useRouter } from "next/navigation";

// One-tap block / unblock for a profile. Lives on /u/<username> next
// to FollowButton (or near the header overflow). Required by App
// Store Guideline 1.2 — every user must be able to block another
// user. Blocking is destructive enough (drops follows in both
// directions, hides their content from your feed) that we confirm.
export function BlockButton({
  targetId,
  initialBlocked,
}: {
  targetId: string;
  initialBlocked: boolean;
}) {
  const router = useRouter();
  const [blocked, setBlocked] = useState(initialBlocked);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function call(action: "block" | "unblock") {
    setBusy(true);
    try {
      const res = await fetch("/api/block", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetId, action }),
      });
      if (!res.ok) {
        await toast.fromResponse(res, "Couldn't update block");
        return;
      }
      const j = await res.json();
      setBlocked(Boolean(j.blocked));
      toast.success(j.blocked ? "Blocked. You won't see them anymore." : "Unblocked.");
      // Refresh so the profile + feed reflect the new block state.
      router.refresh();
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  if (blocked) {
    return (
      <button
        onClick={() => call("unblock")}
        disabled={busy}
        className="rounded-full text-sm font-medium px-4 py-1.5 min-h-9 border border-red-700/50 bg-red-500/10 text-red-300 hover:bg-red-500/20 active:scale-95 transition-all disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40"
      >
        {busy ? "…" : "Unblock"}
      </button>
    );
  }

  return (
    <>
      <button
        onClick={() => setConfirming(true)}
        disabled={busy}
        className="text-sm text-neutral-500 hover:text-red-400 px-2 py-1 rounded-md transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40"
      >
        Block
      </button>
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => call("block")}
        title="Block this user?"
        body="You won't see their ratings, comments, or profile, and they won't see yours. Any follow between you will be removed."
        confirmLabel="Block"
        destructive
        busy={busy}
      />
    </>
  );
}
