"use client";
import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { TasteComparisonRow } from "@/lib/taste";
import { encodeBase64Url } from "@/lib/encoding";

// Two-column taste breakdown that lives just below the aggregate
// agreement score on /u/<username>. Collapsed by default on mobile
// (saves vertical space when the user isn't curious); tap to expand.
// Server passes top-3 agree + top-3 disagree pre-computed; we don't
// fetch anything on mount.
export function TasteComparePanel({
  agreement,
  shared,
  agree,
  disagree,
  viewerName,
  targetName,
}: {
  agreement: number;
  shared: number;
  agree: TasteComparisonRow[];
  disagree: TasteComparisonRow[];
  viewerName: string;
  targetName: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-emerald-700/40 bg-emerald-500/5 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-4 p-4 text-left hover:bg-emerald-500/10 transition-colors"
        aria-expanded={open}
      >
        <div className="text-3xl font-bold tabular-nums text-emerald-400 shrink-0">
          {agreement}%
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium">Taste agreement</div>
          <div className="text-sm text-neutral-400">
            Across {shared} {shared === 1 ? "song" : "songs"} you&apos;ve both rated.{" "}
            <span className="text-emerald-300">{open ? "Hide" : "See"} breakdown</span>
          </div>
        </div>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`text-neutral-400 transition-transform shrink-0 ${open ? "rotate-180" : ""}`}
          aria-hidden
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="border-t border-emerald-700/30 grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-emerald-700/30">
          <Bucket
            title="🤝 Agree most on"
            empty="No close matches yet."
            rows={agree}
            viewerName={viewerName}
            targetName={targetName}
          />
          <Bucket
            title="⚔️ Disagree most on"
            empty="No big splits yet."
            rows={disagree}
            viewerName={viewerName}
            targetName={targetName}
          />
        </div>
      )}
    </div>
  );
}

function Bucket({
  title,
  rows,
  empty,
  viewerName,
  targetName,
}: {
  title: string;
  rows: TasteComparisonRow[];
  empty: string;
  viewerName: string;
  targetName: string;
}) {
  return (
    <div className="p-3 space-y-2.5">
      <div className="flex items-center justify-between text-xs font-medium text-neutral-300">
        <span>{title}</span>
        <span className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-neutral-500">
          <span>{viewerName}</span>
          <span>·</span>
          <span>{targetName}</span>
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-neutral-500">{empty}</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r) => (
            <li key={r.songId}>
              <Link
                href={`/album/${encodeBase64Url(r.songId)}`}
                className="flex items-center gap-2.5 rounded hover:bg-neutral-900/80 p-1 -m-1 transition-colors"
              >
                {r.thumbnail ? (
                  <Image
                    src={r.thumbnail}
                    alt=""
                    width={36}
                    height={36}
                    className="rounded h-9 w-9 object-cover shrink-0"
                  />
                ) : (
                  <div className="h-9 w-9 rounded bg-neutral-800 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium truncate leading-tight">{r.title}</div>
                  <div className="text-[11px] text-neutral-500 truncate leading-tight">{r.artist}</div>
                </div>
                <div className="flex items-center gap-1 tabular-nums shrink-0 text-[13px] font-bold">
                  <span className="text-emerald-400">{r.viewerScore}</span>
                  <span className="text-neutral-600">·</span>
                  <span className="text-sky-400">{r.targetScore}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
