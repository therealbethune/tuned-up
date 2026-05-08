// Map a 1-100 score to a short, opinionated tier label.
// Bands are sized to roughly match how people actually use the scale —
// most ratings cluster 60-90, so the upper half has finer-grained bands
// while the bottom is broader.

export type ScoreLabel = {
  /** One-word headline label. */
  label: string;
  /** Tailwind text-color class for the label. */
  color: string;
};

export function scoreLabel(score: number): ScoreLabel {
  if (score >= 95) return { label: "Classic", color: "text-emerald-300" };
  if (score >= 90) return { label: "Excellent", color: "text-emerald-400" };
  if (score >= 80) return { label: "Great", color: "text-emerald-400" };
  if (score >= 70) return { label: "Good", color: "text-lime-400" };
  if (score >= 60) return { label: "Decent", color: "text-yellow-400" };
  if (score >= 50) return { label: "Mid", color: "text-amber-400" };
  if (score >= 40) return { label: "Weak", color: "text-orange-400" };
  if (score >= 30) return { label: "Bad", color: "text-red-400" };
  if (score >= 20) return { label: "Trash", color: "text-red-400" };
  return { label: "Skip", color: "text-red-500" };
}
