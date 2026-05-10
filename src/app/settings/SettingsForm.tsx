"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useClerk } from "@clerk/nextjs";
import { PushToggle } from "@/components/PushToggle";
import { ConfirmDialog } from "@/components/ConfirmDialog";

export function SettingsForm({
  username: initialUsername,
  displayName: initialDisplayName,
  isPrivate: initialPrivate,
}: {
  username: string;
  displayName: string | null;
  isPrivate: boolean;
}) {
  const router = useRouter();
  const clerk = useClerk();

  const [username, setUsername] = useState(initialUsername);
  const [displayName, setDisplayName] = useState(initialDisplayName ?? "");
  const [isPrivate, setIsPrivate] = useState(initialPrivate);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPrivacy, setSavingPrivacy] = useState(false);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [privacyMsg, setPrivacyMsg] = useState<string | null>(null);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    setProfileMsg(null);
    const body: Record<string, string> = {};
    if (username.trim() && username.trim() !== initialUsername) body.username = username.trim().toLowerCase();
    if (displayName.trim() !== (initialDisplayName ?? "")) body.displayName = displayName.trim();
    if (Object.keys(body).length === 0) {
      setProfileMsg("No changes.");
      setSavingProfile(false);
      return;
    }
    const res = await fetch("/api/account/profile", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await res.json();
    setSavingProfile(false);
    if (res.ok) {
      setProfileMsg("Saved.");
      router.refresh();
    } else {
      setProfileMsg(j.error || "Save failed");
    }
  }

  async function togglePrivacy(next: boolean) {
    setSavingPrivacy(true);
    setPrivacyMsg(null);
    const prev = isPrivate;
    setIsPrivate(next);
    const res = await fetch("/api/account/privacy", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isPrivate: next }),
    });
    setSavingPrivacy(false);
    if (!res.ok) {
      setIsPrivate(prev);
      const j = await res.json().catch(() => ({}));
      setPrivacyMsg(j.error || "Save failed");
    } else {
      setPrivacyMsg(next ? "Profile is private." : "Profile is public.");
      router.refresh();
    }
  }

  // Two-stage delete: warn dialog → type-DELETE confirm dialog → call API.
  // Replaces stacked window.confirm + window.prompt which iOS Safari
  // sometimes swallows / styles inconsistently.
  const [deleteStage, setDeleteStage] = useState<"closed" | "warn" | "confirm">("closed");
  const [confirmText, setConfirmText] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function executeDelete() {
    if (confirmText.trim().toUpperCase() !== "DELETE") {
      setDeleteError('Type DELETE to confirm.');
      return;
    }
    setDeletingAccount(true);
    setDeleteError(null);
    const res = await fetch("/api/account/delete", { method: "POST" });
    if (res.ok) {
      try {
        await clerk.signOut({ redirectUrl: "/" });
      } catch {
        window.location.href = "/";
      }
    } else {
      const j = await res.json().catch(() => ({}));
      setDeleteError(j.error || "Delete failed");
      setDeletingAccount(false);
    }
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3 rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
        <h2 className="text-lg font-semibold">Profile</h2>
        <form onSubmit={saveProfile} className="space-y-3">
          <label className="block">
            <span className="text-xs uppercase tracking-wider text-neutral-500">Display name</span>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={60}
              className="mt-1 w-full rounded-md bg-neutral-950 border border-neutral-800 px-3 py-2 placeholder:text-neutral-500 focus:outline-none focus:border-neutral-600"
              placeholder="Your name"
            />
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-wider text-neutral-500">Username</span>
            <div className="mt-1 flex items-center rounded-md bg-neutral-950 border border-neutral-800 focus-within:border-neutral-600 px-3">
              <span className="text-neutral-500">@</span>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                maxLength={24}
                pattern="[a-z0-9_]{3,24}"
                className="flex-1 bg-transparent py-2 placeholder:text-neutral-500 focus:outline-none"
                placeholder="your_handle"
              />
            </div>
            <span className="text-xs text-neutral-500">3–24 chars; lowercase letters, numbers, and underscores.</span>
          </label>
          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-neutral-500">{profileMsg}</span>
            <button
              type="submit"
              disabled={savingProfile}
              className="rounded-full bg-white text-black px-4 py-1.5 text-sm font-medium disabled:opacity-50"
            >
              {savingProfile ? "Saving…" : "Save profile"}
            </button>
          </div>
        </form>
      </section>

      <section className="space-y-3 rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
        <h2 className="text-lg font-semibold">Privacy</h2>
        <label className="flex items-center justify-between gap-4">
          <span>
            <span className="block font-medium">Private profile</span>
            <span className="block text-sm text-neutral-400">
              Only approved followers can see your ratings. New follows must be accepted.
            </span>
          </span>
          <button
            type="button"
            onClick={() => togglePrivacy(!isPrivate)}
            disabled={savingPrivacy}
            className={`relative h-6 w-11 rounded-full transition-colors ${
              isPrivate ? "bg-emerald-500" : "bg-neutral-700"
            } disabled:opacity-50`}
            aria-pressed={isPrivate}
            aria-label="Toggle private profile"
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                isPrivate ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </button>
        </label>
        {privacyMsg && <p className="text-xs text-neutral-500">{privacyMsg}</p>}
      </section>

      <section className="space-y-3 rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
        <h2 className="text-lg font-semibold">Notifications</h2>
        <PushToggle />
      </section>

      <section className="space-y-3 rounded-lg border border-red-900/50 bg-red-950/10 p-4">
        <h2 className="text-lg font-semibold text-red-300">Danger zone</h2>
        <p className="text-sm text-neutral-300">
          Permanently delete your account and all associated data.
        </p>
        <button
          onClick={() => {
            setConfirmText("");
            setDeleteError(null);
            setDeleteStage("warn");
          }}
          className="rounded-full border border-red-700 text-red-300 hover:bg-red-900/20 px-4 py-1.5 text-sm font-medium"
        >
          Delete account
        </button>
      </section>

      {/* Stage 1 — explain the consequences. */}
      <ConfirmDialog
        open={deleteStage === "warn"}
        onClose={() => setDeleteStage("closed")}
        onConfirm={() => setDeleteStage("confirm")}
        title="Delete your account?"
        body="Your ratings, comments, likes, follows, and recommendations will be permanently removed. This cannot be undone."
        confirmLabel="I understand, continue"
        destructive
      />

      {/* Stage 2 — make them type DELETE. We render a custom layout instead
          of using ConfirmDialog so the input fits in the body. */}
      {deleteStage === "confirm" && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-confirm-title"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget && !deletingAccount) setDeleteStage("closed");
          }}
        >
          <div
            className="w-full sm:max-w-sm rounded-t-2xl sm:rounded-xl border border-red-900/50 bg-neutral-950 p-5 space-y-4"
            style={{ paddingBottom: "max(env(safe-area-inset-bottom), 1.25rem)" }}
          >
            <div>
              <h2 id="delete-confirm-title" className="text-base font-semibold">
                Type <span className="font-mono text-red-300">DELETE</span> to confirm
              </h2>
              <p className="text-sm text-neutral-400 mt-1">
                Last chance. Your account will be permanently destroyed.
              </p>
            </div>
            <input
              autoFocus
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE"
              autoCorrect="off"
              autoCapitalize="characters"
              spellCheck={false}
              className="w-full rounded-md bg-neutral-900 border border-neutral-700 focus:border-red-500 focus:outline-none px-3 py-2 font-mono"
            />
            {deleteError && (
              <p className="text-xs text-red-400">{deleteError}</p>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteStage("closed")}
                disabled={deletingAccount}
                className="rounded-full border border-neutral-700 hover:bg-neutral-900 text-sm px-4 py-1.5 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={executeDelete}
                disabled={
                  deletingAccount || confirmText.trim().toUpperCase() !== "DELETE"
                }
                className="rounded-full bg-red-500 hover:bg-red-400 text-white text-sm font-semibold px-4 py-1.5 active:scale-95 transition-transform disabled:opacity-50"
              >
                {deletingAccount ? "Deleting…" : "Delete forever"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
