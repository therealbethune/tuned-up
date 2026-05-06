// Helpers for song id namespacing — the prefix lets us coexist
// with future Spotify ids (`spotify:<trackId>`) etc.

export function ytUrlForSongId(songId: string): string | null {
  if (songId.startsWith("yt:")) {
    const videoId = songId.slice(3);
    return `https://music.youtube.com/watch?v=${videoId}`;
  }
  return null;
}
