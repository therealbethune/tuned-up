import Image from "next/image";
import Link from "next/link";
import type { FriendRec } from "@/lib/recs";
import { encodeBase64Url } from "@/lib/encoding";
import { isAlbumId } from "@/lib/songs";
import { scoreLabel } from "@/lib/score-labels";
import { RateButton } from "@/components/RateButton";
import { AudioPreviewButton } from "@/components/AudioPreviewButton";
import { Avatar } from "@/components/Avatar";

// Horizontal carousel of "Friends loved" recommendations at the top of
// /feed. Each card shows artwork (tap → /album), a friend-avg score
// chip, a 3-stack of top friend avatars, a 30-sec preview button, and
// a one-tap Rate button. Hidden silently when the rec query returns
// no rows — never an empty section.
export function FriendRecsRail({ recs }: { recs: FriendRec[] }) {
  if (recs.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between">
        <div>
          <span className="section-eyebrow">From your network</span>
          <h2 className="section-title">Friends loved</h2>
        </div>
      </div>
      <div className="rail scrollbar-hide cv-auto">
        {recs.map((r) => {
          const isAlbum = isAlbumId(r.songId);
          const songLike = {
            id: r.songId,
            kind: (isAlbum ? "album" : "song") as "song" | "album",
            title: r.title,
            artist: r.artist,
            album: r.album,
            thumbnail: r.thumbnail,
            durationSeconds: r.durationSeconds,
          };
          return (
            <div
              key={r.songId}
              className="card-elevated card-hover w-44 sm:w-52 flex flex-col overflow-hidden group"
            >
              {/* Artwork area. The Link wraps only the image + score
                  chip so the AudioPreviewButton (positioned absolutely)
                  isn't trapped inside the anchor — it's a sibling under
                  the same `relative` container. */}
              <div className="relative">
                <Link href={`/album/${encodeBase64Url(r.songId)}`} className="block">
                  {r.thumbnail ? (
                    <Image
                      src={r.thumbnail}
                      alt=""
                      width={208}
                      height={208}
                      sizes="208px"
                      className="w-full aspect-square object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
                    />
                  ) : (
                    <div className="w-full aspect-square bg-neutral-800" />
                  )}
                  <div className="absolute inset-0 gradient-scrim opacity-80 pointer-events-none" />
                  {/* Tier-color the friend-avg chip so the rail's
                      quality spread reads at a glance — matches the
                      /discover grid chip pattern. */}
                  <span
                    className={`absolute top-2.5 right-2.5 rounded-lg px-2 py-1 text-base font-extrabold tabular-nums leading-none bg-black/70 backdrop-blur-md shadow-lg ${scoreLabel(r.friendAvg).color}`}
                  >
                    {r.friendAvg}
                  </span>
                </Link>
                {!isAlbum && (
                  <div className="absolute bottom-2 right-2 z-10">
                    <AudioPreviewButton
                      songId={r.songId}
                      title={r.title}
                      artist={r.artist}
                      album={r.album}
                      thumbnail={r.thumbnail}
                      previewUrl={r.previewChecked ? r.previewUrl : undefined}
                    />
                  </div>
                )}
              </div>

              <div className="p-3 flex flex-col gap-2 flex-1">
                <div className="min-h-[40px]">
                  <Link
                    href={`/album/${encodeBase64Url(r.songId)}`}
                    className="font-semibold text-[13px] leading-tight line-clamp-1 hover:underline"
                    title={r.title}
                  >
                    {r.title}
                  </Link>
                  <div
                    className="text-[12px] text-neutral-400 truncate mt-0.5"
                    title={r.artist}
                  >
                    {r.artist}
                  </div>
                </div>

                {/* Avatar stack + friend-count label, single row. */}
                <div className="flex items-center gap-1.5 min-h-[18px]">
                  <span className="inline-flex -space-x-1.5">
                    {r.topRaters.slice(0, 3).map((u) => (
                      <Avatar
                        key={u.userId}
                        imageUrl={u.imageUrl}
                        name={u.displayName || u.username}
                        seed={u.userId}
                        size={18}
                      />
                    ))}
                  </span>
                  <span className="text-[11px] text-neutral-400 truncate">
                    {/* Always show a short, bounded label rather than
                        truncating a potentially-very-long username. */}
                    {r.friendCount === 1
                      ? "1 friend"
                      : `${r.friendCount} friends`}
                  </span>
                </div>

                <RateButton song={songLike} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
