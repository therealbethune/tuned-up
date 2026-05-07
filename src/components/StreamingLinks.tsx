import { ytUrlForSongId, spotifyDirectUrlForSongId, streamingSearchLinks } from "@/lib/songs";

// Branded one-color icons. Keeps things small and avoids logo licensing concerns.
function YtMusicIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <path d="M10 8.5v7l6-3.5z" fill="white" />
    </svg>
  );
}
function SpotifyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <path
        d="M7.5 14.4c2.4-1.4 5.7-1.7 9-.8m-9-3.6c2.9-1.6 7-2 10.5-.8m-10.5-3c3.4-1.6 8.5-1.8 12.5-.4"
        stroke="white"
        strokeWidth="1.6"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}
function AppleMusicIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <path
        d="M14 7v8.2a2.3 2.3 0 1 1-1-1.9V9.5l-4 1V16a2.3 2.3 0 1 1-1-1.9V8l6-1.5z"
        fill="white"
      />
    </svg>
  );
}

export function StreamingLinks({
  songId,
  title,
  artist,
  appleMusicUrl,
  className = "",
}: {
  songId: string;
  title: string;
  artist: string;
  /** Direct Apple Music track URL (populated server-side via iTunes Search). */
  appleMusicUrl?: string | null;
  className?: string;
}) {
  const yt = ytUrlForSongId(songId);
  const spotifyDirect = spotifyDirectUrlForSongId(songId);
  const { spotify: spotifySearch, appleMusic: appleMusicSearch } = streamingSearchLinks({ title, artist });
  const spotify = spotifyDirect ?? spotifySearch;
  const appleMusic = appleMusicUrl ?? appleMusicSearch;

  const linkClass =
    "inline-flex items-center justify-center h-7 w-7 rounded-full transition-colors";

  return (
    <div className={`flex items-center gap-1 ${className}`} aria-label="Open on streaming services">
      {yt && (
        <a
          href={yt}
          target="_blank"
          rel="noreferrer"
          title="Open in YouTube Music"
          className={`${linkClass} text-red-500 hover:bg-red-500/10`}
        >
          <YtMusicIcon />
        </a>
      )}
      <a
        href={spotify}
        target="_blank"
        rel="noreferrer"
        title="Search on Spotify"
        className={`${linkClass} text-emerald-500 hover:bg-emerald-500/10`}
      >
        <SpotifyIcon />
      </a>
      <a
        href={appleMusic}
        target="_blank"
        rel="noreferrer"
        title="Search on Apple Music"
        className={`${linkClass} text-pink-500 hover:bg-pink-500/10`}
      >
        <AppleMusicIcon />
      </a>
    </div>
  );
}
