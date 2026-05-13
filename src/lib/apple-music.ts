// Resolve an exact Apple Music track URL via the public iTunes Search API.
// No auth required, generous free quota. Returns null if no match.

type ITunesResult = {
  trackId?: number;
  collectionId?: number;
  trackName?: string;
  artistName?: string;
  trackViewUrl?: string;
  collectionViewUrl?: string;
};

async function searchItunes(params: {
  title: string;
  artist: string;
  kind?: "song" | "album";
}): Promise<ITunesResult | null> {
  const term = `${params.title} ${params.artist}`.trim();
  if (!term) return null;
  const entity = params.kind === "album" ? "album" : "song";
  const url = `https://itunes.apple.com/search?media=music&entity=${entity}&limit=1&term=${encodeURIComponent(term)}`;
  try {
    const res = await fetch(url, {
      headers: { "user-agent": "TunedUp/1.0 (https://tuned-up.com)" },
      signal: AbortSignal.timeout(5000),
      // Day-long Next data cache so repeat lookups for the same title +
      // artist (popular tracks getting rated by multiple users) don't
      // hit iTunes more than once a day. Matches /api/preview-url's
      // approach. iTunes rate-limits aggressively; this collapses
      // duplicate requests at the platform level.
      next: { revalidate: 86400 },
    });
    if (!res.ok) return null;
    const data: { results?: ITunesResult[] } = await res.json();
    return data.results?.[0] ?? null;
  } catch {
    return null;
  }
}

export async function resolveAppleMusicUrl(params: {
  title: string;
  artist: string;
  kind?: "song" | "album";
}): Promise<string | null> {
  const r = await searchItunes(params);
  if (!r) return null;
  const link = params.kind === "album" ? r.collectionViewUrl : r.trackViewUrl;
  return link ?? null;
}

// Apple Music catalog ID needed by MusicKit JS to add a song to the user's
// library. Same iTunes Search call returns `trackId` (the catalog ID) and
// `collectionId` (album catalog ID).
export async function resolveAppleMusicTrackId(params: {
  title: string;
  artist: string;
  kind?: "song" | "album";
}): Promise<string | null> {
  const r = await searchItunes(params);
  if (!r) return null;
  const id = params.kind === "album" ? r.collectionId : r.trackId;
  return id ? String(id) : null;
}
