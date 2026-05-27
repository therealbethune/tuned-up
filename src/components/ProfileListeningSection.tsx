"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { AppleMusicIcon } from "@/components/icons";

// Profile-page section: pulls the target user's recent Apple Music
// listens (and a heuristic "now playing" if the most recent play is
// within the last 5 minutes) from /api/listening/[username]. Hidden
// entirely if the target user isn't connected, or if visibility +
// privacy gates reject the viewer.
//
// Polling: while the section is on screen, we refetch every 90s so the
// "now playing" pill stays close to live. document.visibilityState gates
// the polling so a backgrounded tab doesn't burn the Apple API quota.

type Track = {
  provider: "apple_music";
  trackId: string;
  playedAt: string;
  title: string;
  artist: string;
  album: string | null;
  thumbnail: string | null;
  appleMusicUrl: string | null;
};

type Response = {
  provider: "apple_music" | null;
  visibility?: "followers" | "public" | "private" | null;
  nowPlaying: (Track & { secondsAgo: number }) | null;
  recent: Track[];
  stale?: boolean;
  error?: string;
};

const POLL_MS = 90_000;

export function ProfileListeningSection({
  username,
  isOwner,
}: {
  username: string;
  isOwner: boolean;
}) {
  const [data, setData] = useState<Response | null>(null);
  const [loaded, setLoaded] = useState(false);
  const reqId = useRef(0);

  // Fetcher — extracted so the polling effect can reuse it.
  const fetchOnce = useCallback(async () => {
    const id = ++reqId.current;
    try {
      const res = await fetch(
        `/api/listening/${encodeURIComponent(username)}`,
        { cache: "no-store" },
      );
      if (!res.ok) {
        // 401/403/404 — treat as "nothing to show". The API also returns
        // 200 with error:"not_connected" for the followers / private /
        // block-edge gates; both paths end up rendering nothing.
        if (id === reqId.current) {
          setData({
            provider: null,
            nowPlaying: null,
            recent: [],
            error: `http_${res.status}`,
          });
          setLoaded(true);
        }
        return;
      }
      const j = (await res.json()) as Response;
      if (id === reqId.current) {
        setData(j);
        setLoaded(true);
      }
    } catch {
      if (id === reqId.current) setLoaded(true);
    }
  }, [username]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    void fetchOnce();
    // Light polling so "Now playing" actually stays live. visibility
    // gating keeps the Apple quota happy when the tab is backgrounded.
    let timer: ReturnType<typeof setInterval> | null = null;
    function start() {
      if (timer) return;
      timer = setInterval(() => {
        if (document.visibilityState === "visible") void fetchOnce();
      }, POLL_MS);
    }
    function stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    }
    function onVis() {
      if (document.visibilityState === "visible") {
        // Refetch immediately when the tab comes back from hidden so
        // the data isn't stale by however long it was backgrounded.
        void fetchOnce();
        start();
      } else {
        stop();
      }
    }
    start();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [fetchOnce]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!loaded) {
    // Skeleton-only state — don't render the heading until we know
    // whether to show anything.
    return null;
  }
  if (!data || data.provider !== "apple_music") {
    // Not connected, blocked, gated, or the viewer can't see — render
    // nothing so the profile doesn't have an empty header section.
    return null;
  }
  if (data.recent.length === 0) {
    // Connected but the user has no synced plays yet. Show a soft
    // placeholder only to the owner so a new connect doesn't look broken.
    if (!isOwner) return null;
    return (
      <section className="card-elevated p-4 sm:p-5 space-y-2">
        <div className="flex items-center gap-2">
          <AppleMusicLogoBubble />
          <h2 className="headline-md">Recent listens</h2>
        </div>
        <p className="text-sm text-neutral-400">
          Your Apple Music plays will show up here within a few minutes of listening.
        </p>
      </section>
    );
  }

  return (
    <section className="card-elevated p-4 sm:p-5 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <AppleMusicLogoBubble />
          <h2 className="headline-md">
            {data.nowPlaying ? "Now playing" : "Recent listens"}
          </h2>
        </div>
        {data.nowPlaying && (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-emerald-300">
            <span className="relative inline-flex">
              <span className="absolute inset-0 rounded-full bg-emerald-400 opacity-75 animate-ping" />
              <span className="relative h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            Live
          </span>
        )}
      </div>

      {/* Hero "Now playing" row — only when the freshest track is < 5min ago. */}
      {data.nowPlaying && (
        <NowPlayingRow track={data.nowPlaying} />
      )}

      {/* Recent listens rail — horizontal scroller, big-ish thumbs. */}
      {data.recent.length > 0 && (
        <div className="space-y-2">
          {data.nowPlaying && (
            <div className="label-eyebrow">Recently played</div>
          )}
          <div className="rail scrollbar-hide">
            {data.recent
              .slice(data.nowPlaying ? 1 : 0, 12)
              .map((t) => (
                <ListenCard key={`${t.trackId}-${t.playedAt}`} track={t} />
              ))}
          </div>
        </div>
      )}
    </section>
  );
}

function NowPlayingRow({
  track,
}: {
  track: Track & { secondsAgo: number };
}) {
  const ago =
    track.secondsAgo < 60
      ? "just now"
      : `${Math.floor(track.secondsAgo / 60)}m ago`;
  return (
    <a
      href={track.appleMusicUrl ?? "#"}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-3.5 p-2 -m-2 rounded-xl hover:bg-white/[0.04] transition-colors"
      title={track.appleMusicUrl ? "Open in Apple Music" : undefined}
    >
      {track.thumbnail ? (
        <Image
          src={track.thumbnail}
          alt=""
          width={64}
          height={64}
          className="rounded-lg h-16 w-16 object-cover ring-1 ring-white/10 shrink-0"
        />
      ) : (
        <div className="h-16 w-16 rounded-lg shimmer shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="font-semibold truncate leading-tight">{track.title}</div>
        <div className="text-sm text-neutral-400 truncate mt-0.5">
          {track.artist}
        </div>
        <div className="text-[11px] text-neutral-500 mt-1">{ago}</div>
      </div>
    </a>
  );
}

function ListenCard({ track }: { track: Track }) {
  // Recompute the "Xm ago" label on every render so the rail ticks up
  // alongside the polling loop. Date.now() is impure but acceptable
  // here — this component runs on the client and we WANT the label to
  // shift over time.
  const minAgo = Math.max(
    1,
    Math.floor(
      // eslint-disable-next-line react-hooks/purity
      (Date.now() - new Date(track.playedAt).getTime()) / 60_000,
    ),
  );
  const ago = minAgo < 60 ? `${minAgo}m` : `${Math.floor(minAgo / 60)}h`;
  return (
    <a
      href={track.appleMusicUrl ?? "#"}
      target="_blank"
      rel="noreferrer"
      className="block w-28 shrink-0"
      title={`${track.title} — ${track.artist} (${ago} ago)`}
    >
      {track.thumbnail ? (
        <Image
          src={track.thumbnail}
          alt=""
          width={112}
          height={112}
          className="rounded-lg h-28 w-28 object-cover ring-1 ring-white/10"
        />
      ) : (
        <div className="h-28 w-28 rounded-lg shimmer" />
      )}
      <div className="mt-2 text-xs font-medium truncate">{track.title}</div>
      <div className="text-[11px] text-neutral-400 truncate">{track.artist}</div>
      <div className="text-[10px] text-neutral-500 mt-0.5">{ago} ago</div>
    </a>
  );
}

// Apple's branding requires a recognizable mark — using their icon
// rather than just "🎵" so the surface reads as authoritatively
// connected to their service.
function AppleMusicLogoBubble() {
  return (
    <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg gradient-sunset text-black shrink-0">
      <AppleMusicIcon size={16} />
    </span>
  );
}
