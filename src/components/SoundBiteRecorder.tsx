"use client";
import { useEffect, useRef, useState } from "react";

const MAX_SECONDS = 15;

type Status = "idle" | "recording" | "preview" | "uploading" | "saved" | "error";

// Records a 15-second voice snippet via MediaRecorder, posts it to
// /api/sound-bites with the songId. After a save, swaps to a "saved" pill
// with a re-record affordance.
export function SoundBiteRecorder({
  songId,
  hasExisting,
}: {
  songId: string;
  hasExisting: boolean;
}) {
  const [status, setStatus] = useState<Status>(hasExisting ? "saved" : "idle");
  const [seconds, setSeconds] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const blobRef = useRef<Blob | null>(null);
  const durationMsRef = useRef<number>(0);
  const startedAtRef = useRef<number>(0);

  // Tear down stream + intervals on unmount or status change away from recording.
  useEffect(() => {
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        durationMsRef.current = Date.now() - startedAtRef.current;
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        blobRef.current = blob;
        setPreviewUrl(URL.createObjectURL(blob));
        setStatus("preview");
        streamRef.current?.getTracks().forEach((t) => t.stop());
        if (tickRef.current) clearInterval(tickRef.current);
      };
      startedAtRef.current = Date.now();
      recorder.start();
      setStatus("recording");
      setSeconds(0);
      tickRef.current = setInterval(() => {
        setSeconds((s) => {
          const next = s + 1;
          if (next >= MAX_SECONDS) stop();
          return next;
        });
      }, 1000);
    } catch (e) {
      setError((e as Error).message || "Microphone access denied");
      setStatus("error");
    }
  }

  function stop() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
  }

  function discard() {
    blobRef.current = null;
    setPreviewUrl(null);
    setSeconds(0);
    setStatus(hasExisting ? "saved" : "idle");
  }

  async function upload() {
    if (!blobRef.current) return;
    setStatus("uploading");
    try {
      const fd = new FormData();
      fd.append("audio", blobRef.current, "bite.webm");
      fd.append("songId", songId);
      fd.append("durationMs", String(Math.round(durationMsRef.current)));
      const res = await fetch("/api/sound-bites", { method: "POST", body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.error || "Upload failed");
        setStatus("error");
        return;
      }
      setStatus("saved");
      setPreviewUrl(null);
      blobRef.current = null;
    } catch (e) {
      setError((e as Error).message || "Network error");
      setStatus("error");
    }
  }

  async function deleteExisting() {
    if (!confirm("Delete your sound bite?")) return;
    setStatus("uploading");
    const res = await fetch(`/api/sound-bites?songId=${encodeURIComponent(songId)}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setStatus("idle");
    } else {
      setStatus("saved");
      setError("Couldn't delete");
    }
  }

  // ---- UI ----
  if (status === "saved") {
    return (
      <div className="inline-flex items-center gap-2 text-xs">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-fuchsia-500/10 border border-fuchsia-500/40 text-fuchsia-300 px-2 py-1">
          🎙️ Sound bite saved
        </span>
        <button onClick={() => setStatus("idle")} className="text-neutral-400 hover:text-white">Re-record</button>
        <button onClick={deleteExisting} className="text-neutral-500 hover:text-red-400">Delete</button>
      </div>
    );
  }

  if (status === "recording") {
    return (
      <div className="inline-flex items-center gap-2">
        <button
          onClick={stop}
          className="inline-flex items-center gap-1.5 rounded-full bg-red-500 hover:bg-red-400 text-white text-xs font-semibold px-3 py-1.5 active:scale-95 transition-transform"
        >
          <span className="w-2 h-2 rounded-sm bg-white animate-pulse" />
          Stop · {seconds}s / {MAX_SECONDS}s
        </button>
      </div>
    );
  }

  if (status === "preview") {
    return (
      <div className="inline-flex items-center gap-2">
        {previewUrl && <audio src={previewUrl} controls className="h-7" />}
        <button
          onClick={upload}
          className="rounded-full bg-fuchsia-500 hover:bg-fuchsia-400 text-white text-xs font-semibold px-3 py-1.5"
        >
          Save bite
        </button>
        <button onClick={discard} className="text-xs text-neutral-400 hover:text-white">Discard</button>
      </div>
    );
  }

  if (status === "uploading") {
    return <span className="text-xs text-neutral-400">Saving…</span>;
  }

  if (status === "error") {
    return (
      <div className="inline-flex items-center gap-2 text-xs">
        <span className="text-red-400">{error || "Error"}</span>
        <button onClick={() => setStatus("idle")} className="text-neutral-400 hover:text-white">Retry</button>
      </div>
    );
  }

  // idle
  return (
    <button
      onClick={start}
      className="inline-flex items-center gap-1.5 rounded-full border border-fuchsia-500/40 hover:bg-fuchsia-500/10 text-fuchsia-300 text-xs font-medium px-2.5 py-1.5 active:scale-95 transition-transform"
      title="Record a 15-second voice note"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <rect x="9" y="2" width="6" height="12" rx="3" />
        <path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3" />
      </svg>
      Record sound bite
    </button>
  );
}
