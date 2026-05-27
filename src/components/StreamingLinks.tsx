import { ytUrlForSongId, spotifyDirectUrlForSongId, streamingSearchLinks } from "@/lib/songs";
import { SpotifyIcon, YtMusicIcon, AppleMusicIcon, SoundCloudIcon } from "@/components/icons";

export function StreamingLinks({
  songId,
  title,
  artist,
  appleMusicUrl,
  spotifyTrackId,
  className = "",
}: {
  songId: string;
  title: string;
  artist: string;
  /** Direct Apple Music track URL (populated server-side via iTunes Search). */
  appleMusicUrl?: string | null;
  /** Resolved Spotify track id (populated server-side via Spotify Search). */
  spotifyTrackId?: string | null;
  className?: string;
}) {
  const yt = ytUrlForSongId(songId);
  const spotifyDirect = spotifyDirectUrlForSongId(songId);
  const spotifyResolved = spotifyTrackId
    ? `https://open.spotify.com/track/${spotifyTrackId}`
    : null;
  const { spotify: spotifySearch, appleMusic: appleMusicSearch, soundcloud } =
    streamingSearchLinks({ title, artist });
  const spotify = spotifyDirect ?? spotifyResolved ?? spotifySearch;
  const appleMusic = appleMusicUrl ?? appleMusicSearch;

  // Tooltip honesty — when we have a direct deep-link, the chip
  // actually OPENS the track on the service. The fallback search URL
  // just searches by title+artist. Previously every Spotify/Apple
  // chip said "Search on …" regardless, which lied half the time.
  const spotifyDirectLink = Boolean(spotifyDirect || spotifyResolved);
  const appleDirectLink = Boolean(appleMusicUrl);

  // Apple's HIG requires 44pt minimum tap targets. Previously these
  // chips were 28px (h-7 w-7) — well under the threshold and the kind
  // of thing the App Store review team flags during testing on a real
  // iPhone. Bumped to h-11 w-11 (44pt) with the icon centered inside.
  //
  // We also drop `target="_blank"` so iOS Universal Links can route
  // music.apple.com / open.spotify.com / music.youtube.com URLs into
  // their native apps when those apps are installed. In the browser
  // these still open in a new tab (default behavior of these domains'
  // own pages). In the Capacitor wrapper, iOS picks the native app.
  const linkClass =
    "inline-flex items-center justify-center h-11 w-11 rounded-full transition-colors active:scale-95";

  return (
    <div className={`flex items-center gap-0.5 ${className}`} aria-label="Open on streaming services">
      {yt && (
        <a
          href={yt}
          rel="noreferrer"
          title="Open in YouTube Music"
          aria-label="Open in YouTube Music"
          className={`${linkClass} text-red-500 hover:bg-red-500/10`}
        >
          <YtMusicIcon />
        </a>
      )}
      <a
        href={spotify}
        rel="noreferrer"
        title={spotifyDirectLink ? "Open in Spotify" : "Search on Spotify"}
        aria-label={spotifyDirectLink ? "Open in Spotify" : "Search on Spotify"}
        className={`${linkClass} text-emerald-500 hover:bg-emerald-500/10`}
      >
        <SpotifyIcon />
      </a>
      <a
        href={appleMusic}
        rel="noreferrer"
        title={appleDirectLink ? "Open in Apple Music" : "Search on Apple Music"}
        aria-label={appleDirectLink ? "Open in Apple Music" : "Search on Apple Music"}
        className={`${linkClass} text-pink-500 hover:bg-pink-500/10`}
      >
        <AppleMusicIcon />
      </a>
      <a
        href={soundcloud}
        rel="noreferrer"
        title="Search on SoundCloud"
        aria-label="Search on SoundCloud"
        className={`${linkClass} text-orange-500 hover:bg-orange-500/10`}
      >
        <SoundCloudIcon />
      </a>
    </div>
  );
}
