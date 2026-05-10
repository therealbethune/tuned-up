"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { SpotifyIconOnGreen } from "@/components/icons";
import {
  exchangeCodeForToken,
  fetchTopTracks,
  getStoredToken,
  isSpotifyConfigured,
  startSpotifyAuth,
  clearStoredToken,
} from "@/lib/spotify";
import type { SongResult } from "@/lib/ytmusic";
import { SongRow } from "@/components/SongRow";

type Range = "short_term" | "medium_term" | "long_term";

const RANGE_LABEL: Record<Range, string> = {
  short_term: "Last 4 weeks",
  medium_term: "Last 6 months",
  long_term: "All time",
};

export function ImportFlow({ configured }: { configured: boolean }) {
  const [token, setToken] = useState<string | null>(null);
  const [range, setRange] = useState<Range>("medium_term");
  const [tracks, setTracks] = useState<SongResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ratedCount, setRatedCount] = useState(0);
  const handledCode = useRef(false);

  // On mount, complete the OAuth callback if we landed here with ?code=...,
  // otherwise reuse a stored token if still valid.
  useEffect(() => {
    if (!isSpotifyConfigured()) return;
    if (handledCode.current) return;
    handledCode.current = true;

    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    if (code) {
      const redirectUri = `${window.location.origin}/import/spotify`;
      // Strip the query so a refresh doesn't try to reuse the code.
      window.history.replaceState({}, "", "/import/spotify");
      exchangeCodeForToken(code, redirectUri)
        .then((t) => setToken(t))
        .catch((e) => setError(e.message));
      return;
    }
    setToken(getStoredToken());
  }, []);

  // Whenever we have a token (or change time range), fetch top tracks.
  useEffect(() => {
    if (!token) return;
    setLoading(true);
    setError(null);
    fetchTopTracks(token, range, 50)
      .then((items) => setTracks(items))
      .catch((e) => {
        setError(e.message);
        if (/401|403/.test(e.message)) {
          clearStoredToken();
          setToken(null);
        }
      })
      .finally(() => setLoading(false));
  }, [token, range]);

  // Listen for "song-rated" events fired by RateButton so we can show progress.
  useEffect(() => {
    function onSaved() {
      setRatedCount((n) => n + 1);
    }
    window.addEventListener("song-rated", onSaved);
    return () => window.removeEventListener("song-rated", onSaved);
  }, []);

  function connect() {
    setError(null);
    const redirectUri = `${window.location.origin}/import/spotify`;
    startSpotifyAuth(redirectUri).catch((e) => setError(e.message));
  }

  function disconnect() {
    clearStoredToken();
    setToken(null);
    setTracks([]);
    setRatedCount(0);
  }

  if (!configured) {
    return (
      <div className="space-y-6">
        <Link href="/" className="text-sm text-neutral-400 hover:text-white">← Home</Link>
        <h1 className="text-2xl font-bold">Import from Spotify</h1>
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-6 space-y-3 text-sm text-neutral-300">
          <p className="font-medium text-neutral-100">Spotify import isn&apos;t configured.</p>
          <p>
            To enable: register a free Spotify Developer app at{" "}
            <a
              href="https://developer.spotify.com/dashboard"
              target="_blank"
              rel="noreferrer"
              className="underline text-emerald-400"
            >
              developer.spotify.com/dashboard
            </a>
            , add{" "}
            <code className="text-neutral-100">
              https://tuned-up.com/import/spotify
            </code>{" "}
            as a redirect URI (and{" "}
            <code className="text-neutral-100">
              https://tuned-up.netlify.app/import/spotify
            </code>{" "}
            for the legacy URL), and set the env var{" "}
            <code className="text-neutral-100">NEXT_PUBLIC_SPOTIFY_CLIENT_ID</code> on Netlify.
          </p>
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="space-y-6">
        <Link href="/welcome" className="text-sm text-neutral-400 hover:text-white">← Welcome</Link>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Import from Spotify</h1>
          <p className="text-neutral-400">
            Connect your Spotify account to pull your top tracks and rate them in seconds.
          </p>
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          onClick={connect}
          className="inline-flex items-center gap-2 rounded-full bg-emerald-500 hover:bg-emerald-400 text-black font-semibold px-5 py-2.5"
        >
          <SpotifyIconOnGreen size={18} />
          Connect Spotify
        </button>
        <p className="text-xs text-neutral-500">
          We only request read access to your top tracks. We never post on your behalf, and you can disconnect anytime.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/feed" className="text-sm text-neutral-400 hover:text-white">← Feed</Link>
          <h1 className="text-2xl font-bold mt-1">Your Spotify top tracks</h1>
        </div>
        <button
          onClick={disconnect}
          className="text-xs text-neutral-400 hover:text-white"
          title="Disconnect Spotify"
        >
          Disconnect
        </button>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="inline-flex rounded-full border border-neutral-800 p-1 text-sm">
          {(["short_term", "medium_term", "long_term"] as Range[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1 rounded-full transition-colors ${
                r === range ? "bg-white text-black" : "text-neutral-400 hover:text-white"
              }`}
            >
              {RANGE_LABEL[r]}
            </button>
          ))}
        </div>
        <p className="text-sm text-neutral-500 tabular-nums">{ratedCount} rated</p>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {loading ? (
        <p className="text-neutral-400 text-sm">Loading…</p>
      ) : (
        <ul className="space-y-2">
          {tracks.map((t) => (
            <li key={t.id}>
              <SongRow song={t} />
            </li>
          ))}
        </ul>
      )}

      {ratedCount > 0 && (
        <div className="sticky bottom-4 flex justify-end">
          <Link
            href="/feed"
            className="rounded-full bg-white text-black px-5 py-2 font-medium shadow-lg"
          >
            Done · go to feed →
          </Link>
        </div>
      )}
    </div>
  );
}
