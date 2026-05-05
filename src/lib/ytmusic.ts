// Minimal YouTube Music search via the public InnerTube API.
// Mirrors what ytmusicapi (Python) does. Swap for Spotify later.

const YT_MUSIC_KEY = "AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX30";
const ENDPOINT = `https://music.youtube.com/youtubei/v1/search?key=${YT_MUSIC_KEY}&prettyPrint=false`;
const SONGS_PARAMS = "EgWKAQIIAWoOEAMQBBAJEA4QChAFEBA%3D";

const CTX = {
  client: {
    clientName: "WEB_REMIX",
    clientVersion: "1.20240101.01.00",
    hl: "en",
    gl: "US",
  },
};

export type SongResult = {
  id: string;
  title: string;
  artist: string;
  album: string | null;
  thumbnail: string | null;
  durationSeconds: number | null;
};

type Run = { text?: string; navigationEndpoint?: { browseEndpoint?: { browseId?: string } } };

function joinRuns(runs: Run[] | undefined): string {
  if (!runs) return "";
  return runs.map((r) => r.text ?? "").join("");
}

function parseDuration(s: string | null | undefined): number | null {
  if (!s) return null;
  const parts = s.split(":").map((p) => parseInt(p, 10));
  if (parts.some(isNaN)) return null;
  let total = 0;
  for (const p of parts) total = total * 60 + p;
  return total;
}

export async function searchSongs(query: string): Promise<SongResult[]> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "Mozilla/5.0",
      origin: "https://music.youtube.com",
    },
    body: JSON.stringify({ context: CTX, query, params: SONGS_PARAMS }),
  });
  if (!res.ok) throw new Error(`yt music search failed: ${res.status}`);
  const data = await res.json();

  const sections =
    data?.contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer?.content
      ?.sectionListRenderer?.contents ?? [];

  const results: SongResult[] = [];
  for (const section of sections) {
    const shelf = section?.musicShelfRenderer;
    if (!shelf) continue;
    const items = shelf.contents ?? [];
    for (const it of items) {
      const r = it?.musicResponsiveListItemRenderer;
      if (!r) continue;

      const flex = r.flexColumns ?? [];
      const title = joinRuns(flex[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs);
      const subRuns: Run[] =
        flex[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs ?? [];

      const separated: Run[][] = [[]];
      for (const run of subRuns) {
        if (run.text === " • ") separated.push([]);
        else separated[separated.length - 1].push(run);
      }
      // Songs filter shape: [Artists] • [Album] • [Duration]
      const artistRuns = separated[0] ?? [];
      const artist = artistRuns.map((x) => x.text ?? "").join("");
      const album = separated.length >= 3 ? separated[separated.length - 2].map((x) => x.text ?? "").join("") : null;
      const durationStr = separated.length >= 2 ? separated[separated.length - 1].map((x) => x.text ?? "").join("") : null;
      const durationSeconds = parseDuration(durationStr);

      const videoId =
        r.playlistItemData?.videoId ??
        r.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer
          ?.playNavigationEndpoint?.watchEndpoint?.videoId ??
        null;
      if (!videoId || !title) continue;

      const thumbs = r.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails ?? [];
      const thumbnail = thumbs.length ? thumbs[thumbs.length - 1].url : null;

      results.push({
        id: `yt:${videoId}`,
        title,
        artist,
        album: album || null,
        thumbnail,
        durationSeconds,
      });
    }
  }
  return results.slice(0, 15);
}
