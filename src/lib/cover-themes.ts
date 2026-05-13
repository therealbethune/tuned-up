// Curated gradient palettes the user can pick as their profile-cover
// banner. Constrained list so we can implement this without an upload
// pipeline (S3 + image moderation + signed URLs is wildly out of scope
// for the value-add). Each theme renders as a 14rem-tall banner above
// the profile avatar; the avatar floats off the bottom edge.

export const COVER_THEMES = [
  {
    id: "emerald",
    label: "Emerald",
    css: "bg-[radial-gradient(circle_at_top_left,theme(colors.emerald.500/0.5),theme(colors.neutral.950)_70%)]",
  },
  {
    id: "sunset",
    label: "Sunset",
    css: "bg-[linear-gradient(135deg,theme(colors.rose.500/0.55),theme(colors.amber.500/0.4)_45%,theme(colors.neutral.950)_80%)]",
  },
  {
    id: "ocean",
    label: "Ocean",
    css: "bg-[linear-gradient(135deg,theme(colors.sky.500/0.55),theme(colors.indigo.500/0.4)_55%,theme(colors.neutral.950)_85%)]",
  },
  {
    id: "forest",
    label: "Forest",
    css: "bg-[linear-gradient(135deg,theme(colors.emerald.700/0.55),theme(colors.lime.500/0.35)_55%,theme(colors.neutral.950)_85%)]",
  },
  {
    id: "midnight",
    label: "Midnight",
    css: "bg-[linear-gradient(135deg,theme(colors.indigo.700/0.6),theme(colors.fuchsia.500/0.35)_55%,theme(colors.neutral.950)_85%)]",
  },
  {
    id: "rose",
    label: "Rose",
    css: "bg-[linear-gradient(135deg,theme(colors.rose.500/0.55),theme(colors.pink.400/0.35)_55%,theme(colors.neutral.950)_85%)]",
  },
  {
    id: "aurora",
    label: "Aurora",
    css: "bg-[linear-gradient(135deg,theme(colors.fuchsia.500/0.45),theme(colors.cyan.400/0.4)_45%,theme(colors.emerald.500/0.35)_75%,theme(colors.neutral.950)_95%)]",
  },
  {
    id: "ember",
    label: "Ember",
    css: "bg-[linear-gradient(135deg,theme(colors.orange.500/0.55),theme(colors.red.500/0.35)_55%,theme(colors.neutral.950)_85%)]",
  },
] as const;

export type CoverThemeId = (typeof COVER_THEMES)[number]["id"];

const BY_ID = new Map(COVER_THEMES.map((t) => [t.id, t]));

export function coverThemeFor(id: string | null | undefined) {
  if (!id) return COVER_THEMES[0]; // default emerald
  return BY_ID.get(id as CoverThemeId) ?? COVER_THEMES[0];
}

export function isValidCoverTheme(id: unknown): id is CoverThemeId {
  return typeof id === "string" && BY_ID.has(id as CoverThemeId);
}
