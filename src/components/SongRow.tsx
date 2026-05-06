import Image from "next/image";
import { RateButton } from "./RateButton";
import type { SongResult } from "@/lib/ytmusic";
import { ytUrlForSongId } from "@/lib/songs";

function durationLabel(seconds: number | null | undefined): string | null {
  if (seconds == null) return null;
  const m = Math.floor(seconds / 60);
  const s = String(seconds % 60).padStart(2, "0");
  return `${m}:${s}`;
}

export function SongRow({
  song,
  score,
  right,
  highlight,
}: {
  song: SongResult;
  score?: number | null;
  right?: React.ReactNode;
  highlight?: boolean;
}) {
  const url = ytUrlForSongId(song.id);
  const dur = durationLabel(song.durationSeconds);

  return (
    <div
      className={`flex items-center gap-3 rounded-lg border p-3 transition-colors ${
        highlight
          ? "border-neutral-700 bg-neutral-900"
          : "border-neutral-800 bg-neutral-900/50 hover:bg-neutral-900"
      }`}
    >
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="relative shrink-0 group"
          title="Open in YouTube Music"
        >
          {song.thumbnail ? (
            <Image
              src={song.thumbnail}
              alt=""
              width={56}
              height={56}
              className="rounded h-14 w-14 object-cover"
              unoptimized
            />
          ) : (
            <div className="h-14 w-14 rounded bg-neutral-800" />
          )}
          <div className="absolute inset-0 rounded bg-black/0 group-hover:bg-black/40 flex items-center justify-center transition-colors">
            <svg
              className="opacity-0 group-hover:opacity-100 transition-opacity"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="white"
              aria-hidden
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </a>
      ) : song.thumbnail ? (
        <Image src={song.thumbnail} alt="" width={56} height={56} className="rounded h-14 w-14 object-cover shrink-0" unoptimized />
      ) : (
        <div className="h-14 w-14 rounded bg-neutral-800 shrink-0" />
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          {url ? (
            <a href={url} target="_blank" rel="noreferrer" className="font-medium truncate hover:underline">
              {song.title}
            </a>
          ) : (
            <div className="font-medium truncate">{song.title}</div>
          )}
          {song.kind === "album" && (
            <span className="shrink-0 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30">
              Album
            </span>
          )}
        </div>
        <div className="text-sm text-neutral-400 truncate">
          {song.artist}
          {song.album ? ` · ${song.album}` : ""}
          {dur ? ` · ${dur}` : ""}
        </div>
      </div>

      {right ?? <RateButton song={song} initialScore={score ?? null} />}
    </div>
  );
}
