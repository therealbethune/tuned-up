// Vibe / mood tags users can stamp on a rating. Constrained list so we
// can render colored chips + group by mood on the stats page without
// open-text moderation overhead.

export const MOODS = [
  { id: "hype", label: "Hype", emoji: "🔥", className: "bg-orange-500/15 text-orange-300 border-orange-500/40" },
  { id: "chill", label: "Chill", emoji: "🌿", className: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40" },
  { id: "sad", label: "Sad", emoji: "💧", className: "bg-sky-500/15 text-sky-300 border-sky-500/40" },
  { id: "happy", label: "Happy", emoji: "✨", className: "bg-yellow-500/15 text-yellow-300 border-yellow-500/40" },
  { id: "nostalgic", label: "Nostalgic", emoji: "🪴", className: "bg-amber-500/15 text-amber-300 border-amber-500/40" },
  { id: "angry", label: "Angry", emoji: "⚡", className: "bg-red-500/15 text-red-300 border-red-500/40" },
  { id: "focus", label: "Focus", emoji: "🧠", className: "bg-violet-500/15 text-violet-300 border-violet-500/40" },
  { id: "romantic", label: "Romantic", emoji: "💗", className: "bg-rose-500/15 text-rose-300 border-rose-500/40" },
] as const;

export type MoodId = (typeof MOODS)[number]["id"];

const MOOD_BY_ID = new Map(MOODS.map((m) => [m.id, m]));

export function moodFor(id: string | null | undefined): (typeof MOODS)[number] | null {
  if (!id) return null;
  return MOOD_BY_ID.get(id as MoodId) ?? null;
}

export function isValidMood(id: unknown): id is MoodId {
  return typeof id === "string" && MOOD_BY_ID.has(id as MoodId);
}
