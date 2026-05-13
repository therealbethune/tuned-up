// Fallback shown by Next during route navigation while the next server
// component is being fetched. Kept minimal so it feels like a flash, not
// a real load screen. aria-busy + role status announce it to AT users.
export default function Loading() {
  return (
    <div
      className="flex justify-center py-12"
      role="status"
      aria-busy="true"
      aria-label="Loading"
    >
      <div className="h-6 w-6 rounded-full border-2 border-neutral-700 border-t-white animate-spin" />
    </div>
  );
}
