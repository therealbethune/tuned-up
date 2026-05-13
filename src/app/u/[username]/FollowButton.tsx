"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";

export type FollowState = "none" | "pending" | "accepted";

export function FollowButton({
  username,
  initialState,
  followsViewer = false,
}: {
  username: string;
  initialState: FollowState;
  /** True when the target already follows the viewer — turns the
   *  default "Follow" label into "Follow back" so the mutual-discovery
   *  moment is obvious. Display-only; the underlying action is identical. */
  followsViewer?: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState<FollowState>(initialState);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (busy) return;
    setBusy(true);
    const action = state === "none" ? "follow" : "unfollow";
    // Optimistic flip — the button visibly reacts immediately instead
    // of sitting in its old state for 100-500ms while the request
    // resolves. We don't know yet whether the new state is "pending"
    // (private target) or "accepted" (public target); guess "accepted"
    // and reconcile from the response. The unfollow case is unambiguous.
    const prevState = state;
    setState(action === "unfollow" ? "none" : "accepted");
    try {
      const res = await fetch("/api/follows", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, action }),
      });
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
        // Roll back the optimistic flip; the click did nothing.
        setState(prevState);
        // 429 (rate-limited) and other failures surface via the toast
        // bus so the user knows the click did nothing.
        await toast.fromResponse(res, "Couldn't update follow");
      }
    } catch {
      // Network throw — also roll back, otherwise the button shows the
      // wrong state. Previously the `setBusy(false)` was outside any
      // try/catch so this branch also stranded the button as disabled.
      setState(prevState);
      toast.error("Couldn't reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const label =
    state === "accepted"
      ? "Following"
      : state === "pending"
        ? "Requested"
        : followsViewer
          ? "Follow back"
          : "Follow";

  return (
    <button
      onClick={toggle}
      disabled={busy}
      className={`rounded-full px-4 py-1.5 min-h-9 text-sm font-medium active:scale-95 transition-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60 ${
        state === "none"
          ? "bg-white text-black hover:bg-neutral-200"
          : "border border-neutral-700 text-neutral-200 hover:bg-neutral-900"
      } disabled:opacity-60`}
    >
      {label}
    </button>
  );
}
