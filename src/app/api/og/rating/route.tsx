import { ImageResponse } from "next/og";
import { and, eq } from "drizzle-orm";
import { db, ratings, songs, users } from "@/db";
import { scoreLabel } from "@/lib/score-labels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// /api/og/rating?u=<username>&s=<encoded songId>
// Renders a 1200x630 social card image for sharing.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const username = url.searchParams.get("u") ?? "";
  const songId = url.searchParams.get("s") ?? "";

  if (!username || !songId) {
    return new ImageResponse(<Card title="Tuned Up" />, { width: 1200, height: 630 });
  }

  const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1);
  if (!user) {
    return new ImageResponse(<Card title="Tuned Up" />, { width: 1200, height: 630 });
  }
  // Privacy gate: never render a real OG card for a private user.
  // Public bots fetching this URL have no userId to gate on, so we
  // unconditionally fall through to the generic brand card for any
  // private account.
  if (user.isPrivate) {
    return new ImageResponse(<Card title="Tuned Up" />, { width: 1200, height: 630 });
  }
  const [row] = await db
    .select({
      score: ratings.score,
      review: ratings.review,
      title: songs.title,
      artist: songs.artist,
      thumbnail: songs.thumbnail,
      kind: songs.kind,
    })
    .from(ratings)
    .innerJoin(songs, eq(ratings.songId, songs.id))
    .where(and(eq(ratings.userId, user.id), eq(ratings.songId, songId)))
    .limit(1);

  if (!row) {
    return new ImageResponse(<Card title="Tuned Up" />, { width: 1200, height: 630 });
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%)",
          color: "white",
          padding: 60,
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", fontSize: 28, fontWeight: 700 }}>
          <span style={{ marginRight: 14, fontSize: 36 }}>♫</span>
          Tuned Up
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 40,
            marginTop: 56,
            flex: 1,
          }}
        >
          {row.thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={row.thumbnail}
              width={320}
              height={320}
              style={{ borderRadius: 16, objectFit: "cover" }}
              alt=""
            />
          ) : (
            <div
              style={{
                width: 320,
                height: 320,
                borderRadius: 16,
                background: "#262626",
              }}
            />
          )}
          <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
            {row.kind === "album" && (
              <div
                style={{
                  display: "flex",
                  fontSize: 18,
                  letterSpacing: 2,
                  color: "#7dd3fc",
                  marginBottom: 8,
                  fontWeight: 700,
                }}
              >
                ALBUM
              </div>
            )}
            <div style={{ fontSize: 56, fontWeight: 800, lineHeight: 1.05, marginBottom: 16 }}>
              {truncate(row.title, 60)}
            </div>
            <div style={{ fontSize: 32, color: "#a3a3a3" }}>{truncate(row.artist, 50)}</div>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 16,
                marginTop: 32,
              }}
            >
              <span style={{ fontSize: 140, fontWeight: 900, lineHeight: 1, color: "#10b981" }}>
                {row.score}
              </span>
              <span style={{ fontSize: 36, color: "#a3e635", fontWeight: 700 }}>
                {scoreLabel(row.score).label}
              </span>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", marginTop: 24, fontSize: 26, color: "#d4d4d4" }}>
          rated by <span style={{ marginLeft: 8, fontWeight: 700, color: "white" }}>@{user.username}</span>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}

function Card({ title }: { title: string }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #10b981 0%, #0ea5e9 100%)",
        color: "white",
        fontSize: 96,
        fontWeight: 900,
        fontFamily: "system-ui, sans-serif",
      }}
    >
      ♫ {title}
    </div>
  );
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}
