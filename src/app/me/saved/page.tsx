import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { desc, eq } from "drizzle-orm";
import { db, savedSongs, songs } from "@/db";
import { safeQuery } from "@/lib/safe-query";
import { RateButton } from "@/components/RateButton";
import { SaveLaterButton } from "@/components/SaveLaterButton";
import { AudioPreviewButton } from "@/components/AudioPreviewButton";
import { isAlbumId, ytUrlForSongId, relativeTime } from "@/lib/songs";
import { PlayIcon } from "@/components/icons";

export const dynamic = "force-dynamic";

// "Save for later" pile. Songs the user bookmarked from search /
// discover / a friend's feed that they want to come back and rate.
// Rating a song automatically clears it from this list (handled in
// /api/ratings POST).
export default async function SavedSongsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/");

  const rows = await safeQuery(
    () =>
      db
        .select({
          songId: songs.id,
          title: songs.title,
          artist: songs.artist,
          album: songs.album,
          thumbnail: songs.thumbnail,
          appleMusicUrl: songs.appleMusicUrl,
          spotifyTrackId: songs.spotifyTrackId,
          durationSeconds: songs.durationSeconds,
          kind: songs.kind,
          savedAt: savedSongs.createdAt,
        })
        .from(savedSongs)
        .innerJoin(songs, eq(songs.id, savedSongs.songId))
        .where(eq(savedSongs.userId, userId))
        .orderBy(desc(savedSongs.createdAt))
        .limit(100),
    [] as Array<{
      songId: string;
      title: string;
      artist: string;
      album: string | null;
      thumbnail: string | null;
      appleMusicUrl: string | null;
      spotifyTrackId: string | null;
      durationSeconds: number | null;
      kind: string;
      savedAt: Date;
    }>,
    "saved-songs-list",
  );

  return (
    <div className="space-y-6">
      <div>
        <Link href="/me" className="text-sm text-neutral-400 hover:text-white">← Profile</Link>
        <h1 className="text-2xl font-bold mt-1">Saved for later</h1>
        <p className="text-sm text-neutral-400 mt-1">
          Songs you bookmarked but haven&apos;t rated yet. Rating one clears it from here automatically.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-8 text-center space-y-3">
          <div className="text-4xl">🔖</div>
          <h2 className="text-lg font-semibold">Nothing saved yet</h2>
          <p className="text-sm text-neutral-400 max-w-sm mx-auto">
            Hit Save on a song from search or your feed to come back to it.
          </p>
          <Link
            href="/search"
            className="inline-block rounded-full bg-white text-black text-sm font-semibold px-4 py-2 mt-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40"
          >
            Find a song
          </Link>
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const url = ytUrlForSongId(r.songId);
            const songLike = {
              id: r.songId,
              kind: (isAlbumId(r.songId) ? "album" : "song") as "song" | "album",
              title: r.title,
              artist: r.artist,
              album: r.album,
              thumbnail: r.thumbnail,
              durationSeconds: r.durationSeconds,
            };
            return (
              <li
                key={r.songId}
                className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-3"
              >
                <div className="flex items-center gap-3">
                  {url ? (
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="relative shrink-0 group focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40 rounded"
                      title="Open in YouTube Music"
                    >
                      {r.thumbnail ? (
                        <Image
                          src={r.thumbnail}
                          alt=""
                          width={56}
                          height={56}
                          loading="lazy"
                          className="rounded h-14 w-14 object-cover"
                        />
                      ) : (
                        <div className="h-14 w-14 rounded bg-neutral-800" />
                      )}
                      <span className="absolute inset-0 rounded flex items-center justify-center bg-black/0 group-hover:bg-black/40 transition-colors text-white">
                        <PlayIcon
                          size={18}
                          className="opacity-0 group-hover:opacity-100 transition-opacity"
                        />
                      </span>
                    </a>
                  ) : (
                    <div className="h-14 w-14 rounded bg-neutral-800 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{r.title}</div>
                    <div className="text-sm text-neutral-400 truncate">{r.artist}</div>
                    <div className="text-[10px] text-neutral-500 mt-0.5">
                      Saved {relativeTime(r.savedAt)}
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    {!isAlbumId(r.songId) && (
                      <AudioPreviewButton
                        songId={r.songId}
                        title={r.title}
                        artist={r.artist}
                        album={r.album}
                        thumbnail={r.thumbnail}
                      />
                    )}
                    <SaveLaterButton songId={r.songId} initialSaved />
                  </div>
                  <RateButton song={songLike} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
