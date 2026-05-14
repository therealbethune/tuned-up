// Fallback shown by Next during route navigation while the next server
// component is being fetched. Kept minimal — most route segments have
// their own loading.tsx with a skeleton that mirrors the real layout,
// so this generic spinner only flashes for routes that don't.
export default function Loading() {
  return (
    <div
      className="flex justify-center py-12"
      role="status"
      aria-busy="true"
      aria-label="Loading"
    >
      <div className="h-6 w-6 rounded-full border-2 border-neutral-700 border-t-emerald-400 animate-spin" />
    </div>
  );
}
