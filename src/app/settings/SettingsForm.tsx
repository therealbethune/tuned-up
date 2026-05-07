"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useClerk } from "@clerk/nextjs";
import { PushToggle } from "@/components/PushToggle";

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

  async function deleteAccount() {
    const ok = window.confirm(
      "Permanently delete your account, all your ratings, comments, likes, and follows? This cannot be undone.",
    );
    if (!ok) return;
    const sure = window.prompt('Type DELETE to confirm.');
    if (sure?.trim().toUpperCase() !== "DELETE") return;
    const res = await fetch("/api/account/delete", { method: "POST" });
    if (res.ok) {
      try {
        await clerk.signOut({ redirectUrl: "/" });
      } catch {
        window.location.href = "/";
      }
    } else {
      const j = await res.json().catch(() => ({}));
      alert(j.error || "Delete failed");
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
          onClick={deleteAccount}
          className="rounded-full border border-red-700 text-red-300 hover:bg-red-900/20 px-4 py-1.5 text-sm font-medium"
        >
          Delete account
        </button>
      </section>
    </div>
  );
}
