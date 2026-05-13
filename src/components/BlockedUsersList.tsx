"use client";
import { useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { toast } from "@/lib/toast";

// Settings → "Blocked users" section. Lets the viewer see the list of
// accounts they've blocked and unblock with one tap. Required UX once
// blocking exists (App Store reviewers will look for it as part of
// the Guideline 1.2 check — "you must be able to undo a block").
type BlockedUser = {
  id: string;
  username: string;
  displayName: string | null;
  imageUrl: string | null;
};

export function BlockedUsersList({
  initialBlocked,
}: {
  initialBlocked: BlockedUser[];
}) {
  const [list, setList] = useState(initialBlocked);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function unblock(targetId: string) {
    if (busyId) return;
    setBusyId(targetId);
    try {
      const res = await fetch("/api/block", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetId, action: "unblock" }),
      });
      if (!res.ok) {
        await toast.fromResponse(res, "Couldn't unblock");
        return;
      }
      setList((prev) => prev.filter((u) => u.id !== targetId));
      toast.success("Unblocked.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-wide">
        Blocked users
      </h2>
      {list.length === 0 ? (
        <p className="text-xs text-neutral-500">
          You haven&apos;t blocked anyone. Tap &ldquo;Block&rdquo; on a
          profile to hide their content from your feed.
        </p>
      ) : (
        <ul className="space-y-2">
          {list.map((u) => (
            <li
              key={u.id}
              className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-950 p-3"
            >
              <Avatar
                imageUrl={u.imageUrl}
                name={u.displayName || u.username}
                seed={u.id}
                size={36}
                ring={false}
              />
              <div className="flex-1 min-w-0">
                <Link
                  href={`/u/${u.username}`}
                  className="block font-medium truncate hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40"
                >
                  {u.displayName || u.username}
                </Link>
                <div className="text-xs text-neutral-500 truncate">@{u.username}</div>
              </div>
              <button
                onClick={() => unblock(u.id)}
                disabled={busyId === u.id}
                className="rounded-full text-sm font-medium px-4 py-1.5 min-h-9 border border-red-700/50 bg-red-500/10 text-red-300 hover:bg-red-500/20 active:scale-95 transition-all disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40"
              >
                {busyId === u.id ? "…" : "Unblock"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
