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
