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

export async function resolveAppleMusicUrl(params: {
  title: string;
  artist: string;
  kind?: "song" | "album";
}): Promise<string | null> {
  const term = `${params.title} ${params.artist}`.trim();
  if (!term) return null;

  const entity = params.kind === "album" ? "album" : "song";
  const url = `https://itunes.apple.com/search?media=music&entity=${entity}&limit=1&term=${encodeURIComponent(
    term,
  )}`;

  try {
    const res = await fetch(url, {
      // iTunes Search has rate limits; be a polite UA.
      headers: { "user-agent": "TunedUp/1.0 (https://tuned-up.com)" },
      // 5s should be plenty; abort if iTunes is slow so we don't block ratings.
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data: { results?: ITunesResult[] } = await res.json();
    const r = data.results?.[0];
    if (!r) return null;
    const link = entity === "album" ? r.collectionViewUrl : r.trackViewUrl;
    return link ?? null;
  } catch {
    return null;
  }
}
