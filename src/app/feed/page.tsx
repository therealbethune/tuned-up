import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { desc, eq, inArray } from "drizzle-orm";
import { db, ratings, songs, users, follows } from "@/db";
import { syncCurrentUser } from "@/lib/sync-user";
import { ytUrlForSongId } from "@/lib/songs";

export const dynamic = "force-dynamic";

export default async function FeedPage() {
  const { userId } = await auth();
  if (!userId) redirect("/");
  await syncCurrentUser();

  const followedRows = await db
    .select({ id: follows.followeeId })
    .from(follows)
    .where(eq(follows.followerId, userId));
  const followedIds = followedRows.map((r) => r.id);
  // Include self.
  followedIds.push(userId);

  const items = followedIds.length
    ? await db
        .select({
          score: ratings.score,
          review: ratings.review,
          createdAt: ratings.createdAt,
          songId: ratings.songId,
          title: songs.title,
          artist: songs.artist,
          album: songs.album,
          thumbnail: songs.thumbnail,
          username: users.username,
          displayName: users.displayName,
          imageUrl: users.imageUrl,
        })
        .from(ratings)
        .innerJoin(songs, eq(ratings.songId, songs.id))
        .innerJoin(users, eq(ratings.userId, users.id))
        .where(inArray(ratings.userId, followedIds))
        .orderBy(desc(ratings.createdAt))
        .limit(50)
    : [];

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">Feed</h1>
        <Link href="/search" className="text-sm text-neutral-400 hover:text-white">+ Rate a song</Link>
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-6 text-center text-neutral-400">
          <p>No ratings yet.</p>
          <p className="text-sm mt-2">
            <Link href="/search" className="underline">Rate a song</Link> or follow someone (visit <code className="text-neutral-300">/u/their-username</code>).
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((it) => {
            const url = ytUrlForSongId(it.songId);
            return (
              <li key={`${it.username}-${it.songId}-${it.createdAt}`} className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
                <div className="flex items-center gap-3 mb-3">
                  {it.imageUrl ? (
                    <Image src={it.imageUrl} alt="" width={28} height={28} className="rounded-full h-7 w-7" unoptimized />
                  ) : (
                    <div className="h-7 w-7 rounded-full bg-neutral-700" />
                  )}
                  <Link href={`/u/${it.username}`} className="text-sm font-medium hover:underline">
                    {it.displayName || it.username}
                  </Link>
                  <span className="text-xs text-neutral-500">
                    {new Date(it.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  {url ? (
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="relative shrink-0 group"
                      title="Open in YouTube Music"
                    >
                      {it.thumbnail ? (
                        <Image src={it.thumbnail} alt="" width={56} height={56} className="rounded h-14 w-14 object-cover" unoptimized />
                      ) : (
                        <div className="h-14 w-14 rounded bg-neutral-800" />
                      )}
                      <div className="absolute inset-0 rounded bg-black/0 group-hover:bg-black/40 flex items-center justify-center transition-colors">
                        <svg
                          className="opacity-0 group-hover:opacity-100 transition-opacity"
                          width="20" height="20" viewBox="0 0 24 24" fill="white" aria-hidden
                        >
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </div>
                    </a>
                  ) : it.thumbnail ? (
                    <Image src={it.thumbnail} alt="" width={56} height={56} className="rounded h-14 w-14 object-cover shrink-0" unoptimized />
                  ) : (
                    <div className="h-14 w-14 rounded bg-neutral-800 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    {url ? (
                      <a href={url} target="_blank" rel="noreferrer" className="font-medium truncate block hover:underline">
                        {it.title}
                      </a>
                    ) : (
                      <div className="font-medium truncate">{it.title}</div>
                    )}
                    <div className="text-sm text-neutral-400 truncate">{it.artist}{it.album ? ` · ${it.album}` : ""}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-bold tabular-nums">{it.score}</div>
                    <div className="text-xs text-neutral-500">/ 100</div>
                  </div>
                </div>
                {it.review && <p className="mt-3 text-sm text-neutral-300">{it.review}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
