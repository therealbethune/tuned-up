import Image from "next/image";
import Link from "next/link";
import type { FriendRec } from "@/lib/recs";
import { encodeBase64Url } from "@/lib/encoding";
import { isAlbumId, ytUrlForSongId } from "@/lib/songs";
import { RateButton } from "@/components/RateButton";

// Horizontal carousel of "Friends loved" recommendations rendered at
// the top of /feed for signed-in users with at least one friend. Each
// card shows a friend avatar stack (top 3 raters) + the friend-average
// score, plus a one-tap Rate button so the viewer can clear the rec
// directly from the rail. Hidden silently when the rec query returns
// no rows — never an empty section.
export function FriendRecsRail({ recs }: { recs: FriendRec[] }) {
  if (recs.length === 0) return null;

  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-emerald-300 uppercase tracking-wide">
          🎯 Friends loved
        </h2>
        <span className="text-[11px] text-neutral-500">
          Highly rated by people you follow
        </span>
      </div>
      <div className="flex gap-3 overflow-x-auto -mx-4 px-4 pb-2 snap-x snap-mandatory scroll-pl-4">
        {recs.map((r) => {
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
            <div
              key={r.songId}
              className="shrink-0 w-44 rounded-lg border border-neutral-800 bg-neutral-900/60 p-3 snap-start flex flex-col"
            >
              <Link href={`/album/${encodeBase64Url(r.songId)}`} className="relative block">
                {r.thumbnail ? (
                  <Image
                    src={r.thumbnail}
                    alt=""
                    width={160}
                    height={160}
                    className="rounded w-full aspect-square object-cover"
                    unoptimized
                  />
                ) : (
                  <div className="rounded w-full aspect-square bg-neutral-800" />
                )}
                {/* Friend-average score, top-right corner. Bigger than
                    the discover card's bottom-bar reason for thumbs-up
                    glanceability. */}
                <div className="absolute top-1.5 right-1.5 rounded-full bg-black/70 backdrop-blur-sm px-2 py-0.5 text-xs font-bold tabular-nums text-emerald-400">
                  {r.friendAvg}
                </div>
              </Link>
              <div className="mt-2 min-h-[40px]">
                <Link
                  href={`/album/${encodeBase64Url(r.songId)}`}
                  className="font-medium text-sm truncate block hover:underline"
                  title={r.title}
                >
                  {r.title}
                </Link>
                <div className="text-xs text-neutral-400 truncate" title={r.artist}>
                  {r.artist}
                </div>
              </div>
              <div className="mt-1.5 flex items-center gap-1.5 min-h-[20px]">
                <span className="inline-flex -space-x-1.5">
                  {r.topRaters.slice(0, 3).map((u) =>
                    u.imageUrl ? (
                      <Image
                        key={u.userId}
                        src={u.imageUrl}
                        alt=""
                        width={18}
                        height={18}
                        loading="lazy"
                        className="h-[18px] w-[18px] rounded-full ring-2 ring-neutral-900 object-cover"
                      />
                    ) : (
                      <span
                        key={u.userId}
                        className="h-[18px] w-[18px] rounded-full bg-neutral-700 ring-2 ring-neutral-900 inline-flex items-center justify-center text-[9px] font-medium text-neutral-300"
                      >
                        {(u.displayName || u.username).charAt(0).toUpperCase()}
                      </span>
                    ),
                  )}
                </span>
                <span className="text-[10px] text-neutral-500 truncate">
                  {r.friendCount === 1
                    ? r.topRaters[0]?.displayName ||
                      r.topRaters[0]?.username ||
                      "1 friend"
                    : `${r.friendCount} friends`}
                </span>
              </div>
              <div className="mt-2 self-stretch">
                <RateButton song={songLike} />
              </div>
              {url && (
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 text-[10px] text-neutral-500 hover:text-neutral-300 text-center"
                >
                  Listen ↗
                </a>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
