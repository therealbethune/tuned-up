// Minimal YouTube Music search via the public InnerTube API.
// Mirrors what ytmusicapi (Python) does. Swap for Spotify later.

// The InnerTube web client key is publicly published in music.youtube.com's
// HTML, but we still keep it in an env var so source-code secret scanners
// don't flag it. Set YT_MUSIC_KEY in your Netlify project env vars
// (server-only — never exposed to the browser).
const YT_MUSIC_KEY = process.env.YT_MUSIC_KEY ?? "";
const ENDPOINT = `https://music.youtube.com/youtubei/v1/search?key=${YT_MUSIC_KEY}&prettyPrint=false`;
const SONGS_PARAMS = "EgWKAQIIAWoOEAMQBBAJEA4QChAFEBA%3D";
const ALBUMS_PARAMS = "EgWKAQIYAWoOEAMQBBAJEA4QChAFEBA%3D";

const CTX = {
  client: {
    clientName: "WEB_REMIX",
    clientVersion: "1.20240101.01.00",
    hl: "en",
    gl: "US",
  },
};

export type ItemKind = "song" | "album";

export type SongResult = {
  id: string; // yt:<videoId> for songs, yt-album:<browseId> for albums
  kind: ItemKind;
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

async function rawSearch(query: string, params: string): Promise<unknown> {
  if (!YT_MUSIC_KEY) {
    throw new Error(
      "YT_MUSIC_KEY env var is not set. Add it to your Netlify project env vars.",
    );
  }
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "Mozilla/5.0",
      origin: "https://music.youtube.com",
    },
    body: JSON.stringify({ context: CTX, query, params }),
  });
  if (!res.ok) throw new Error(`yt music search failed: ${res.status}`);
  return res.json();
}

function shelfContents(data: unknown): unknown[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sections: any[] =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (data as any)?.contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer?.content
      ?.sectionListRenderer?.contents ?? [];
  const out: unknown[] = [];
  for (const section of sections) {
    const items = section?.musicShelfRenderer?.contents ?? [];
    for (const it of items) out.push(it);
  }
  return out;
}

export async function searchSongs(query: string): Promise<SongResult[]> {
  const data = await rawSearch(query, SONGS_PARAMS);
  const results: SongResult[] = [];
  for (const it of shelfContents(data)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = (it as any)?.musicResponsiveListItemRenderer;
    if (!r) continue;
    const flex = r.flexColumns ?? [];
    const title = joinRuns(flex[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs);
    const subRuns: Run[] = flex[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs ?? [];

    const separated: Run[][] = [[]];
    for (const run of subRuns) {
      if (run.text === " • ") separated.push([]);
      else separated[separated.length - 1].push(run);
    }
    const artist = (separated[0] ?? []).map((x) => x.text ?? "").join("");
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
      kind: "song",
      title,
      artist,
      album: album || null,
      thumbnail,
      durationSeconds,
    });
  }
  return results.slice(0, 15);
}

export async function searchAlbums(query: string): Promise<SongResult[]> {
  const data = await rawSearch(query, ALBUMS_PARAMS);
  const results: SongResult[] = [];
  for (const it of shelfContents(data)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = (it as any)?.musicResponsiveListItemRenderer;
    if (!r) continue;
    const flex = r.flexColumns ?? [];
    const title = joinRuns(flex[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs);
    const subRuns: Run[] = flex[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs ?? [];

    // Albums shape: [Album] • [Artists] • [Year]
    const separated: Run[][] = [[]];
    for (const run of subRuns) {
      if (run.text === " • ") separated.push([]);
      else separated[separated.length - 1].push(run);
    }
    // separated[0] is "Album"/"EP"/"Single" type label; artists is [1]; year is [2]
    const artist = (separated[1] ?? []).map((x) => x.text ?? "").join("");

    // browseId for albums comes from the navigationEndpoint of the overall row.
    const browseId: string | null =
      r.navigationEndpoint?.browseEndpoint?.browseId ??
      r.menu?.menuRenderer?.items?.find((i: { menuNavigationItemRenderer?: { navigationEndpoint?: { browseEndpoint?: { browseId?: string } } } }) =>
        i?.menuNavigationItemRenderer?.navigationEndpoint?.browseEndpoint?.browseId,
      )?.menuNavigationItemRenderer?.navigationEndpoint?.browseEndpoint?.browseId ??
      null;
    if (!browseId || !title) continue;

    const thumbs = r.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails ?? [];
    const thumbnail = thumbs.length ? thumbs[thumbs.length - 1].url : null;

    results.push({
      id: `yt-album:${browseId}`,
      kind: "album",
      title,
      artist,
      album: null,
      thumbnail,
      durationSeconds: null,
    });
  }
  return results.slice(0, 15);
}

export async function search(query: string, kind: ItemKind = "song"): Promise<SongResult[]> {
  return kind === "album" ? searchAlbums(query) : searchSongs(query);
}
