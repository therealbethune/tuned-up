// Minimal toast bus. Module-level pub/sub so any component can fire
// a toast without prop-drilling a context. The <Toaster /> mounted in
// layout.tsx subscribes and renders. ~50 lines, no library dep.
//
// API:
//   toast.success("Saved")
//   toast.error("Couldn't save")
//   toast.info("Already exists")
//   toast.fromResponse(res, "Save failed")   // auto-handles 429 + error JSON

export type Toast = {
  id: string;
  kind: "info" | "success" | "error";
  message: string;
};

const listeners = new Set<(toasts: Toast[]) => void>();
let active: Toast[] = [];
const TTL_MS = 3500;

function emit() {
  // Hand callers a fresh copy so they can use Object.is to detect
  // changes without false negatives from in-place mutation.
  const snapshot = [...active];
  for (const l of listeners) l(snapshot);
}

function push(kind: Toast["kind"], message: string): string {
  const id = Math.random().toString(36).slice(2);
  active = [...active, { id, kind, message }];
  emit();
  // Auto-dismiss. The Toaster also handles manual dismiss via dismiss().
  if (typeof window !== "undefined") {
    window.setTimeout(() => dismiss(id), TTL_MS);
  }
  return id;
}

export function dismiss(id: string) {
  active = active.filter((t) => t.id !== id);
  emit();
}

export const toast = {
  success: (m: string) => push("success", m),
  error: (m: string) => push("error", m),
  info: (m: string) => push("info", m),
  // For fetch responses: surfaces 429 ("rate-limited") and other 4xx
  // with the server-provided `error` field if present, else fallback.
  // Safe to call regardless of status — succeeds silently for 2xx.
  async fromResponse(res: Response, fallback = "Something went wrong") {
    if (res.ok) return;
    let body: { error?: string; retryAfterSec?: number } = {};
    try {
      body = await res.clone().json();
    } catch {
      /* not JSON — that's fine */
    }
    if (res.status === 429) {
      push("error", body.error || "Too many requests — slow down for a sec.");
    } else if (res.status === 401) {
      push("error", "Please sign in again.");
    } else if (res.status === 403) {
      push("error", body.error || "You can't do that.");
    } else {
      push("error", body.error || fallback);
    }
  },
};

export function subscribeToasts(fn: (t: Toast[]) => void): () => void {
  listeners.add(fn);
  fn([...active]);
  return () => {
    listeners.delete(fn);
  };
}
