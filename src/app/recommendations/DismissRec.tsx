"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function DismissRec({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function dismiss() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/recommendations", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) router.refresh();
    } catch {
      // Network throw — silently fail. Without try/finally the button
      // would stay stuck at "…" forever on a network blip.
    } finally {
      setBusy(false);
    }
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
