import { ytUrlForSongId, spotifyDirectUrlForSongId, streamingSearchLinks } from "@/lib/songs";
import { SpotifyIcon, YtMusicIcon, AppleMusicIcon } from "@/components/icons";

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
  const { spotify: spotifySearch, appleMusic: appleMusicSearch } = streamingSearchLinks({ title, artist });
  const spotify = spotifyDirect ?? spotifyResolved ?? spotifySearch;
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
