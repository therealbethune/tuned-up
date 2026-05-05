import Image from "next/image";
import { RateButton } from "./RateButton";
import type { SongResult } from "@/lib/ytmusic";

export function SongRow({ song, score, right }: { song: SongResult; score?: number | null; right?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900/50 p-3">
      {song.thumbnail ? (
        <Image src={song.thumbnail} alt="" width={48} height={48} className="rounded h-12 w-12 object-cover" unoptimized />
      ) : (
        <div className="h-12 w-12 rounded bg-neutral-800" />
      )}
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{song.title}</div>
        <div className="text-sm text-neutral-400 truncate">
          {song.artist}
          {song.album ? ` · ${song.album}` : ""}
        </div>
      </div>
      {right ?? <RateButton song={song} initialScore={score ?? null} />}
    </div>
  );
}
