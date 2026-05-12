"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { AppleMusicIcon } from "@/components/icons";
import {
  setupMusicKit,
  isAppleMusicAuthorized,
  markAppleMusicAuthorized,
  musicKitErrorMessage,
} from "@/lib/musickit-client";

// Lives on /me beneath ProfileSpotifyPanel. The Apple Music ecosystem
// doesn't expose a "now playing on your iPhone" endpoint via MusicKit
// JS (it only knows what's playing inside its own browser instance),
// so we surface what we CAN show: heavy-rotation. It's the closest
// "what you've been listening to" signal available.

type Track = {
  id: string;
  name: string;
  artist: string;
  album: string | null;
  image: string | null;
  url: string;
};

type State =
  | { kind: "idle" }
  | { kind: "auth-needed" }
  | { kind: "loading" }
  | { kind: "loaded"; tracks: Track[] }
  | { kind: "empty" }
  | { kind: "error"; message: string };

type HeavyRotationResponse = {
  data?: Array<{
    id: string;
    type: string;
    attributes?: {
      name?: string;
      artistName?: string;
      albumName?: string;
      url?: string;
      artwork?: { url?: string; width?: number; height?: number };
    };
  }>;
};

function artworkUrl(
  art?: { url?: string; width?: number; height?: number },
): string | null {
  if (!art?.url) return null;
  // Apple's artwork URL contains {w}x{h} placeholders.
  return art.url.replace("{w}", "200").replace("{h}", "200");
}

export function ProfileAppleMusicPanel() {
  const [state, setState] = useState<State>({ kind: "idle" });
  const startedRef = useRef(false);

  // Auto-load when we know the user has previously authorized — same
  // heuristic the rest of the app uses (localStorage flag from
  // markAppleMusicAuthorized). Avoids a forced popup on every page
  // visit; users who never connected just see the Connect button.
  // We bounce through an async function so the initial state branch
  // is set inside async code rather than synchronously in the effect.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void (async () => {
      if (!isAppleMusicAuthorized()) {
        setState({ kind: "auth-needed" });
        return;
      }
      await load();
    })();
  }, []);

  async function load(forceAuth = false) {
    setState({ kind: "loading" });
    try {
      const music = await setupMusicKit();
      if (!music.isAuthorized) {
        if (!forceAuth) {
          setState({ kind: "auth-needed" });
          return;
        }
        try {
          await music.authorize();
          markAppleMusicAuthorized(true);
        } catch (e) {
          setState({ kind: "error", message: musicKitErrorMessage(e) });
          return;
        }
      }
      const res = (await music.api.music("v1/me/history/heavy-rotation", {
        limit: 10,
      })) as { data?: HeavyRotationResponse };
      const items = res?.data?.data ?? [];
      // Heavy-rotation can return both songs and albums; we only want
      // songs for the panel (album entries don't have a single track
      // id we can rate).
      const tracks: Track[] = items
        .filter((it) => it.type === "songs" || it.type === "library-songs")
        .map((it) => ({
          id: it.id,
          name: it.attributes?.name ?? "Unknown",
          artist: it.attributes?.artistName ?? "Unknown",
          album: it.attributes?.albumName ?? null,
          image: artworkUrl(it.attributes?.artwork),
          url: it.attributes?.url ?? "https://music.apple.com/",
        }));
      setState(tracks.length === 0 ? { kind: "empty" } : { kind: "loaded", tracks });
    } catch (e) {
      setState({ kind: "error", message: musicKitErrorMessage(e) });
    }
  }

  return (
    <section className="rounded-lg border border-pink-500/40 bg-gradient-to-br from-pink-500/10 to-neutral-900/40 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-pink-400 inline-flex">
          <AppleMusicIcon size={20} />
        </span>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-300">
          Your Apple Music
        </h2>
        <span className="ml-auto text-[10px] uppercase tracking-wider text-neutral-400">
          Heavy rotation
        </span>
      </div>

      {state.kind === "auth-needed" && (
        <div className="space-y-2">
          <p className="text-xs text-neutral-400">
            Connect Apple Music to see what&apos;s been on heavy rotation for you lately.
          </p>
          <button
            onClick={() => load(true)}
            className="inline-flex items-center gap-1.5 rounded-full bg-pink-500 hover:bg-pink-400 text-black text-xs font-semibold px-3 py-1.5 active:scale-95 transition-transform"
          >
            <AppleMusicIcon size={14} />
            Connect Apple Music
          </button>
        </div>
      )}

      {state.kind === "loading" && (
        <ul className="space-y-1.5">
          {Array.from({ length: 3 }).map((_, i) => (
            <li key={i} className="flex items-center gap-2 animate-pulse">
              <div className="h-9 w-9 rounded bg-neutral-800" />
              <div className="flex-1 space-y-1">
                <div className="h-3 w-3/5 rounded bg-neutral-800" />
                <div className="h-2 w-2/5 rounded bg-neutral-800/60" />
              </div>
            </li>
          ))}
        </ul>
      )}

      {state.kind === "empty" && (
        <p className="text-xs text-neutral-400">
          Nothing in heavy rotation yet. Listen to a few songs on Apple Music and check back.
        </p>
      )}

      {state.kind === "error" && (
        <div className="space-y-1.5">
          <p className="text-xs text-red-300">{state.message}</p>
          <button
            onClick={() => load(true)}
            className="text-xs text-neutral-400 hover:text-white underline"
          >
            Try again
          </button>
        </div>
      )}

      {state.kind === "loaded" && (
        <ul className="space-y-1">
          {state.tracks.map((t, i) => (
            <li key={`${t.id}-${i}`}>
              <a
                href={t.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 rounded-md hover:bg-neutral-900/60 px-1.5 py-1 transition-colors"
              >
                <span className="text-[10px] font-mono tabular-nums text-neutral-500 w-4 text-right shrink-0">
                  {i + 1}
                </span>
                {t.image ? (
                  <Image
                    src={t.image}
                    alt=""
                    width={36}
                    height={36}
                    className="h-9 w-9 rounded object-cover shrink-0"
                  />
                ) : (
                  <div className="h-9 w-9 rounded bg-neutral-800 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{t.name}</div>
                  <div className="text-xs text-neutral-400 truncate">{t.artist}</div>
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
