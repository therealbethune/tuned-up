// Helpers for song/album id namespacing.
// `yt:<videoId>` for songs, `yt-album:<browseId>` for albums.
// The prefix lets future Spotify ids (`spotify:<id>`) coexist.

export function ytUrlForSongId(songId: string): string | null {
  if (songId.startsWith("yt:")) {
    const videoId = songId.slice(3);
    return `https://music.youtube.com/watch?v=${videoId}`;
  }
  if (songId.startsWith("yt-album:")) {
    const browseId = songId.slice("yt-album:".length);
    return `https://music.youtube.com/browse/${browseId}`;
  }
  return null;
}

// Direct Spotify track / album URL for ids we created from a Spotify import.
export function spotifyDirectUrlForSongId(songId: string): string | null {
  if (songId.startsWith("spotify:")) {
    return `https://open.spotify.com/track/${songId.slice("spotify:".length)}`;
  }
  if (songId.startsWith("spotify-album:")) {
    return `https://open.spotify.com/album/${songId.slice("spotify-album:".length)}`;
  }
  return null;
}

export function isAlbumId(songId: string): boolean {
  return songId.startsWith("yt-album:") || songId.startsWith("spotify-album:");
}

export function itemKindForId(songId: string): "song" | "album" {
  return isAlbumId(songId) ? "album" : "song";
}

// Generate Spotify / Apple Music outbound search URLs. We don't have those
// services' APIs, so we just deep-link to their search pages — clicking lands
// the user on the matching track or album with one tap.
export function streamingSearchLinks(params: { title: string; artist: string }): {
  spotify: string;
  appleMusic: string;
} {
  const q = `${params.title} ${params.artist}`.trim();
  return {
    spotify: `https://open.spotify.com/search/${encodeURIComponent(q)}`,
    appleMusic: `https://music.apple.com/us/search?term=${encodeURIComponent(q)}`,
  };
}

// Render a date as a friendly relative phrase: "Today", "Yesterday",
// "3 days ago", "Last week", "Mar 5". Handles past + future cases.
export function relativeTime(d: Date | string | number): string {
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return "";
  const now = new Date();

  // Day-precision diff using local time so "today" matches the calendar day.
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
  const dayDiff = Math.round((startOfDay(now).getTime() - startOfDay(date).getTime()) / 86400000);

  if (dayDiff === 0) {
    // Within today — also distinguish "just now" / "Xm ago" for very recent events.
    const minutes = Math.floor((now.getTime() - date.getTime()) / 60000);
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  }
  if (dayDiff === 1) return "Yesterday";
  if (dayDiff < 7) return `${dayDiff} days ago`;
  if (dayDiff < 30) {
    const w = Math.floor(dayDiff / 7);
    return w === 1 ? "Last week" : `${w} weeks ago`;
  }
  if (dayDiff < 365 && date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
