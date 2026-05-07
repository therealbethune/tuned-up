"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function DismissRec({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function dismiss() {
    setBusy(true);
    const res = await fetch("/api/recommendations", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setBusy(false);
    if (res.ok) router.refresh();
  }

  return (
    <button
      onClick={dismiss}
      disabled={busy}
      className="text-xs text-neutral-500 hover:text-white disabled:opacity-50"
    >
      {busy ? "…" : "Dismiss"}
    </button>
  );
}
