// Score taxonomy. Two views of the same 1-100 scale:
//
//   scoreLabel(n)  – the fine-grained 10-band label used everywhere a
//                    specific rating appears (feed cards, profile rows,
//                    rate modal). Bands are sized to match how people
//                    actually use the scale: most ratings cluster 60-90,
//                    so the upper half has finer-grained bands.
//
//   SCORE_TIERS    – the coarse 5-band teaching strip used in the
//                    welcome flow. Bins the same labels into the
//                    smallest set a new user needs to grok the system
//                    in one glance: trash / meh / ok / great / banger.
//                    Keep these in sync — if you re-tune scoreLabel
//                    bands, walk the SCORE_TIERS ranges too.

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

// CSS-class for the tier-matched score glow (defined in globals.css).
// Used on hero score numbers (feed cards, /album, /me/stats) to make
// the score lift off the card. Returns an empty string for scores
// that should stay flat (mid/low — no glow on bad ratings).
export function scoreTierGlow(score: number): string {
  if (score >= 90) return "tier-glow-emerald";
  if (score >= 80) return "tier-glow-emerald";
  if (score >= 70) return "tier-glow-lime";
  if (score >= 60) return "tier-glow-yellow";
  if (score >= 50) return "tier-glow-amber";
  if (score >= 40) return "tier-glow-orange";
  return "tier-glow-red";
}

/** Coarse 5-band view of the score scale, for onboarding teaching. */
export const SCORE_TIERS = [
  { range: "1–19",   label: "Trash",  bg: "bg-red-500/15 text-red-300" },
  { range: "20–49",  label: "Meh",    bg: "bg-orange-500/15 text-orange-300" },
  { range: "50–69",  label: "OK",     bg: "bg-yellow-500/15 text-yellow-300" },
  { range: "70–84",  label: "Great",  bg: "bg-lime-500/15 text-lime-300" },
  { range: "85–100", label: "Banger", bg: "bg-emerald-500/15 text-emerald-300" },
] as const;
