"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { SpotifyIcon } from "@/components/icons";

type TopTrack = {
  id: string;
  name: string;
  artists: string[];
  album: string;
  image: string | null;
  previewUrl: string | null;
  externalUrl: string;
  durationMs: number;
};

type NowPlaying = {
  isPlaying: boolean;
  trackId: string;
  name: string;
  artists: string[];
  album: string;
  image: string | null;
  externalUrl: string;
  progressMs: number;
  durationMs: number;
};

type Range = "short_term" | "medium_term" | "long_term";

const RANGE_LABEL: Record<Range, string> = {
  short_term: "Last 4 weeks",
  medium_term: "Last 6 months",
  long_term: "All time",
};

// Lives on /me. Pulls live Spotify data — top tracks and (when playing)
// current track. Only renders when the viewer has linked their Spotify
// account. Otherwise the existing SpotifyAccountCard / ConnectSpotifyBanner
// handles the "go link your account" nudge.
export function ProfileSpotifyPanel({ connected }: { connected: boolean }) {
  const [topTracks, setTopTracks] = useState<TopTrack[] | null>(null);
  const [loadingTop, setLoadingTop] = useState(false);
  const [range, setRange] = useState<Range>("short_term");
  const [now, setNow] = useState<NowPlaying | null>(null);
  const [nowChecked, setNowChecked] = useState(false);

  // Fetch top tracks whenever range changes (or on first mount when connected).
  useEffect(() => {
    if (!connected) return;
    let cancelled = false;
    setLoadingTop(true);
    (async () => {
      try {
        const res = await fetch(
          `/api/spotify/top-tracks?range=${range}`,
          { cache: "no-store" },
        );
        if (!res.ok) throw new Error("fetch failed");
        const j = await res.json();
        if (cancelled) return;
        setTopTracks(j.tracks ?? []);
      } catch {
        if (!cancelled) setTopTracks([]);
      } finally {
        if (!cancelled) setLoadingTop(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connected, range]);

  // Now-playing — fetch once on mount, then every 20s while the page is open.
  useEffect(() => {
    if (!connected) return;
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/spotify/now-playing", { cache: "no-store" });
        if (!res.ok) return;
        const j = await res.json();
        if (cancelled) return;
        setNow(j.playing ?? null);
        setNowChecked(true);
      } catch {
        if (!cancelled) setNowChecked(true);
      }
    }
    load();
    const t = setInterval(load, 20_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [connected]);

  if (!connected) return null;

  return (
    <section className="rounded-lg border border-emerald-700/40 bg-gradient-to-br from-emerald-700/10 to-neutral-900/40 p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="text-emerald-400 inline-flex">
          <SpotifyIcon size={20} />
        </span>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-300">
          Your Spotify
        </h2>
      </div>

      {/* Now playing */}
      {now && (
        <NowPlayingBlock now={now} />
      )}
      {nowChecked && !now && (
        <p className="text-xs text-neutral-500">
          Not playing anything on Spotify right now.
        </p>
      )}

      {/* Top tracks */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wide">
            Top tracks
          </h3>
          <div className="inline-flex rounded-full border border-neutral-800 text-[10px] ml-auto">
            {(Object.keys(RANGE_LABEL) as Range[]).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-2 py-1 rounded-full transition-colors ${
                  range === r
                    ? "bg-emerald-500 text-black font-semibold"
                    : "text-neutral-400 hover:text-white"
                }`}
              >
                {RANGE_LABEL[r]}
              </button>
            ))}
          </div>
        </div>

        {loadingTop && topTracks == null ? (
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
        ) : topTracks && topTracks.length > 0 ? (
          <ul className="space-y-1">
            {topTracks.map((t, i) => (
              <TopTrackRow key={t.id} track={t} rank={i + 1} />
            ))}
          </ul>
        ) : (
          <p className="text-xs text-neutral-500">
            No top tracks yet. Listen to a few songs on Spotify and check back.
          </p>
        )}
      </div>
    </section>
  );
}

function NowPlayingBlock({ now }: { now: NowPlaying }) {
  // Animated equalizer bars only when actively playing.
  return (
    <a
      href={now.externalUrl}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-3 rounded-lg bg-black/40 border border-emerald-500/40 p-2.5 hover:border-emerald-400/60 transition-colors"
    >
      {now.image ? (
        <Image
          src={now.image}
          alt=""
          width={48}
          height={48}
          unoptimized
          className="h-12 w-12 rounded object-cover shrink-0"
        />
      ) : (
        <div className="h-12 w-12 rounded bg-neutral-800 shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {now.isPlaying ? (
            <div className="inline-flex gap-0.5 items-end h-3 shrink-0" aria-label="Playing">
              <span className="w-0.5 bg-emerald-400 animate-[eq_0.9s_ease-in-out_infinite] h-3" />
              <span className="w-0.5 bg-emerald-400 animate-[eq_0.7s_ease-in-out_infinite] h-2" />
              <span className="w-0.5 bg-emerald-400 animate-[eq_1.1s_ease-in-out_infinite] h-2.5" />
            </div>
          ) : (
            <span className="text-[10px] text-neutral-500 uppercase tracking-wider">Paused</span>
          )}
          <span className="text-[10px] text-emerald-400 uppercase tracking-wider">
            {now.isPlaying ? "Now playing" : "Recently"}
          </span>
        </div>
        <div className="font-medium text-sm truncate">{now.name}</div>
        <div className="text-xs text-neutral-400 truncate">{now.artists.join(", ")}</div>
      </div>
    </a>
  );
}

function TopTrackRow({ track, rank }: { track: TopTrack; rank: number }) {
  const [previewing, setPreviewing] = useState(false);
  // useRef, not useState — we don't want a re-render when the audio
  // element is created, and we don't want the value to be captured by
  // stale closures. The previous code mis-used useState as a ref,
  // which (a) caused an extra render on first play and (b) leaked one
  // audio element + one `ended` listener per play because cleanup
  // never fired.
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Stop + tear down the audio element on unmount so scrolling past
  // a track in the list doesn't leave a hanging preview.
  useEffect(() => {
    return () => {
      const a = audioRef.current;
      if (a) {
        a.pause();
        a.src = "";
        audioRef.current = null;
      }
    };
  }, []);

  function togglePreview(e: React.MouseEvent) {
    e.preventDefault();
    if (!track.previewUrl) return;
    let a = audioRef.current;
    if (!a) {
      a = new Audio(track.previewUrl);
      a.addEventListener("ended", () => setPreviewing(false));
      audioRef.current = a;
    }
    if (previewing) {
      a.pause();
      a.currentTime = 0;
      setPreviewing(false);
    } else {
      a.play().then(() => setPreviewing(true)).catch(() => setPreviewing(false));
    }
  }

  return (
    <li>
      <a
        href={track.externalUrl}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-2 rounded-md hover:bg-neutral-900/60 px-1.5 py-1 transition-colors"
      >
        <span className="text-[10px] font-mono tabular-nums text-neutral-500 w-4 text-right shrink-0">
          {rank}
        </span>
        {track.image ? (
          <Image
            src={track.image}
            alt=""
            width={36}
            height={36}
            unoptimized
            className="h-9 w-9 rounded object-cover shrink-0"
          />
        ) : (
          <div className="h-9 w-9 rounded bg-neutral-800 shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-sm truncate">{track.name}</div>
          <div className="text-xs text-neutral-400 truncate">{track.artists.join(", ")}</div>
        </div>
        {track.previewUrl && (
          <button
            onClick={togglePreview}
            aria-label={previewing ? "Stop preview" : "Play 30-second preview"}
            className="h-7 w-7 inline-flex items-center justify-center rounded-full bg-neutral-800/80 hover:bg-emerald-500 hover:text-black text-neutral-300 transition-colors shrink-0"
          >
            {previewing ? (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <rect x="6" y="5" width="4" height="14" />
                <rect x="14" y="5" width="4" height="14" />
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>
        )}
      </a>
    </li>
  );
}
