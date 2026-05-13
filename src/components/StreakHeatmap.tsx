// GitHub-style 90-day rating heatmap. Each cell is one UTC day,
// shaded by how many ratings the user logged that day. The data is
// pre-computed server-side (single GROUP BY query) so this is a
// pure-render component with no client work.
//
// Why 90 days? Long enough to show seasonality + streak depth, short
// enough that 7 × 13 cells stay readable on a mobile width without
// horizontal scroll.

export type HeatmapDay = {
  date: string; // YYYY-MM-DD UTC
  n: number;
};

const DAYS = 91; // 13 weeks
const WEEKS = 13;

function fillerForRange(rows: HeatmapDay[]): HeatmapDay[] {
  const byDate = new Map(rows.map((r) => [r.date, r.n]));
  const out: HeatmapDay[] = [];
  // End at "today" (UTC) and walk backward.
  const todayUtc = new Date(
    Date.UTC(
      new Date().getUTCFullYear(),
      new Date().getUTCMonth(),
      new Date().getUTCDate(),
    ),
  );
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date(todayUtc.getTime() - i * 86_400_000);
    const key = d.toISOString().slice(0, 10);
    out.push({ date: key, n: byDate.get(key) ?? 0 });
  }
  return out;
}

function levelClass(n: number): string {
  // 5-tier scale tuned for "rate a few songs feels rewarded, but
  // 10-a-day shows visibly hotter". Matches the bg-neutral / emerald
  // palette used elsewhere in the app for visual consistency.
  if (n === 0) return "bg-neutral-800/60";
  if (n === 1) return "bg-emerald-500/30";
  if (n <= 2) return "bg-emerald-500/55";
  if (n <= 4) return "bg-emerald-500/80";
  return "bg-emerald-400";
}

export function StreakHeatmap({ days }: { days: HeatmapDay[] }) {
  const filled = fillerForRange(days);
  // Bucket the linear list into 13 weeks of 7 days each. Last column
  // is "this week" so the eye lands on the most recent activity.
  const weeks: HeatmapDay[][] = [];
  for (let w = 0; w < WEEKS; w++) {
    weeks.push(filled.slice(w * 7, (w + 1) * 7));
  }
  const totalRated = filled.reduce((acc, d) => acc + d.n, 0);
  const activeDays = filled.filter((d) => d.n > 0).length;

  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">Last 90 days</h2>
        <div className="text-xs text-neutral-500 tabular-nums">
          {totalRated} ratings · {activeDays} active days
        </div>
      </div>
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${WEEKS}, minmax(0, 1fr))` }}
        role="img"
        aria-label={`Daily rating activity. ${totalRated} ratings across ${activeDays} active days in the last 90 days.`}
      >
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-rows-7 gap-1">
            {week.map((d) => (
              <div
                key={d.date}
                title={`${d.date} — ${d.n} ${d.n === 1 ? "rating" : "ratings"}`}
                className={`aspect-square rounded-sm ${levelClass(d.n)}`}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 text-[10px] text-neutral-500">
        <span>Less</span>
        <span className="inline-block h-2.5 w-2.5 rounded-sm bg-neutral-800/60" />
        <span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500/30" />
        <span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500/55" />
        <span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500/80" />
        <span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-400" />
        <span>More</span>
      </div>
    </section>
  );
}
