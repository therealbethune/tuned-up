import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { and, desc, eq } from "drizzle-orm";
import { db, recommendations, users, songs } from "@/db";
import { ytUrlForSongId, isAlbumId, relativeTime } from "@/lib/songs";
import { StreamingLinks } from "@/components/StreamingLinks";
import { RateButton } from "@/components/RateButton";
import { DismissRec } from "./DismissRec";

export const dynamic = "force-dynamic";

export default async function RecommendationsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/");

  const rows = await db
    .select({
      id: recommendations.id,
      message: recommendations.message,
      createdAt: recommendations.createdAt,
      fromUsername: users.username,
      fromDisplayName: users.displayName,
      fromImageUrl: users.imageUrl,
      songId: songs.id,
      title: songs.title,
      artist: songs.artist,
      album: songs.album,
      thumbnail: songs.thumbnail,
      appleMusicUrl: songs.appleMusicUrl,
      spotifyTrackId: songs.spotifyTrackId,
      kind: songs.kind,
      durationSeconds: songs.durationSeconds,
    })
    .from(recommendations)
    .innerJoin(users, eq(users.id, recommendations.fromUserId))
    .innerJoin(songs, eq(songs.id, recommendations.songId))
    .where(and(eq(recommendations.toUserId, userId), eq(recommendations.status, "pending")))
    .orderBy(desc(recommendations.createdAt))
    .limit(50);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Recommendations</h1>
        <p className="text-neutral-400 text-sm">
          Songs your friends think you should rate. Rating one clears it from this list automatically.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-6 text-center text-neutral-400">
          <p>No recommendations yet.</p>
          <p className="text-sm mt-2">
            <Link href="/people" className="underline text-white">Find people</Link> to follow — once they recommend a song, it&apos;ll show up here.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
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
                key={r.id}
                className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4"
              >
                <div className="flex items-center gap-2 mb-3 text-sm">
                  {r.fromImageUrl ? (
                    <Image src={r.fromImageUrl} alt="" width={28} height={28} className="rounded-full h-7 w-7" />
                  ) : (
                    <div className="h-7 w-7 rounded-full bg-neutral-700" />
                  )}
                  <Link href={`/u/${r.fromUsername}`} className="font-medium hover:underline">
                    {r.fromDisplayName || r.fromUsername}
                  </Link>
                  <span className="text-neutral-400">recommends</span>
                  <span className="text-xs text-neutral-500 ml-auto">{relativeTime(r.createdAt)}</span>
                </div>

                <div className="flex items-center gap-3">
                  {url ? (
                    <a href={url} target="_blank" rel="noreferrer" className="shrink-0">
                      {r.thumbnail ? (
                        <Image src={r.thumbnail} alt="" width={56} height={56} className="rounded h-14 w-14 object-cover" />
                      ) : (
                        <div className="h-14 w-14 rounded bg-neutral-800" />
                      )}
                    </a>
                  ) : r.thumbnail ? (
                    <Image src={r.thumbnail} alt="" width={56} height={56} className="rounded h-14 w-14 object-cover shrink-0" />
                  ) : (
                    <div className="h-14 w-14 rounded bg-neutral-800 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      {url ? (
                        <a href={url} target="_blank" rel="noreferrer" className="font-medium truncate hover:underline">
                          {r.title}
                        </a>
                      ) : (
                        <div className="font-medium truncate">{r.title}</div>
                      )}
                      {isAlbumId(r.songId) && (
                        <span className="shrink-0 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30">
                          Album
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-neutral-400 truncate">
                      {r.artist}
                      {r.album ? ` · ${r.album}` : ""}
                    </div>
                  </div>
                </div>

                {r.message && (
                  <blockquote className="mt-3 border-l-2 border-neutral-700 pl-3 text-sm text-neutral-300 italic whitespace-pre-wrap break-words">
                    {r.message}
                  </blockquote>
                )}

                <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3">
                    <RateButton song={songLike} />
                    <DismissRec id={r.id} />
                  </div>
                  <StreamingLinks
                    songId={r.songId}
                    title={r.title}
                    artist={r.artist}
                    appleMusicUrl={r.appleMusicUrl}
                    spotifyTrackId={r.spotifyTrackId}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
