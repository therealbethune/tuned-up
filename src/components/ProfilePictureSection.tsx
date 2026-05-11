"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { Avatar } from "@/components/Avatar";

// Profile-picture editor for /settings. The actual image storage lives
// in Clerk — we just talk to Clerk's client SDK via `useUser`, which
// gives us `setProfileImage(...)` (upload + set) and the user object.
//
// After a successful upload we trigger a server-side router.refresh.
// That re-runs sync-user on the next request, which pulls the new
// imageUrl from Clerk and writes it to our users table — so the
// updated photo shows up across the rest of the app (feed cards,
// comments, etc.) without a hard reload.
//
// We re-use our existing Avatar component for the preview so the
// fallback render here matches every other avatar in the app.
const MAX_BYTES = 10 * 1024 * 1024; // 10MB — Clerk's documented cap.
const ACCEPT = "image/png,image/jpeg,image/webp,image/gif";

export function ProfilePictureSection({
  initialDisplayName,
  initialUsername,
  userId,
}: {
  initialDisplayName: string | null;
  initialUsername: string;
  userId: string;
}) {
  const router = useRouter();
  const { user, isLoaded } = useUser();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState<null | "upload" | "remove">(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Live image: prefer the just-uploaded Clerk URL (hasImage flips true
  // immediately after setProfileImage resolves), else fall back to what
  // the server passed. Keeps the preview in sync without waiting on
  // the router.refresh.
  const liveImageUrl =
    isLoaded && user?.hasImage ? user.imageUrl : null;
  const displayName = initialDisplayName || initialUsername;

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file || !user) return;
    if (file.size > MAX_BYTES) {
      setError(`That image is ${(file.size / 1024 / 1024).toFixed(1)}MB. Pick something under 10MB.`);
      return;
    }
    setError(null);
    setMessage(null);
    setBusy("upload");
    try {
      await user.setProfileImage({ file });
      // Reload Clerk's local cache so user.imageUrl reflects the upload
      // immediately. Without this the next render still shows the old
      // (or no) image until Clerk pushes an update.
      await user.reload();
      setMessage("Profile picture updated.");
      // Tell the server to re-sync — sync-user runs on every page load
      // and writes Clerk's imageUrl to our users table, which fans out
      // to feed cards, comments, etc.
      router.refresh();
    } catch (err) {
      setError(
        (err as Error)?.message ||
          "Couldn't upload. Try a smaller PNG or JPEG.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function onRemove() {
    if (!user) return;
    setError(null);
    setMessage(null);
    setBusy("remove");
    try {
      await user.setProfileImage({ file: null });
      await user.reload();
      setMessage("Photo removed. You'll see a colored initial instead.");
      router.refresh();
    } catch (err) {
      setError((err as Error)?.message || "Couldn't remove. Try again in a moment.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-3 rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
      <h2 className="text-lg font-semibold">Profile picture</h2>
      <div className="flex items-center gap-4">
        <Avatar
          imageUrl={liveImageUrl}
          name={displayName}
          seed={userId}
          size={72}
        />
        <div className="flex-1 min-w-0 space-y-2">
          <p className="text-sm text-neutral-400">
            PNG, JPEG, GIF, or WebP. Max 10MB.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={!isLoaded || busy !== null}
              className="rounded-full bg-white text-black px-4 py-1.5 text-sm font-medium disabled:opacity-50 active:scale-95 transition-transform"
            >
              {busy === "upload" ? "Uploading…" : isLoaded && user?.hasImage ? "Change photo" : "Upload photo"}
            </button>
            {isLoaded && user?.hasImage && (
              <button
                type="button"
                onClick={onRemove}
                disabled={busy !== null}
                className="rounded-full border border-neutral-700 hover:bg-neutral-900 text-sm px-4 py-1.5 disabled:opacity-50"
              >
                {busy === "remove" ? "Removing…" : "Remove"}
              </button>
            )}
          </div>
          {message && <p className="text-xs text-emerald-300">{message}</p>}
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT}
        onChange={onPick}
        className="hidden"
        aria-hidden
      />
    </section>
  );
}
