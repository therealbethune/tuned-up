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

export function isAlbumId(songId: string): boolean {
  return songId.startsWith("yt-album:");
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
