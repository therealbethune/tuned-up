import { ImageResponse } from "next/og";

export const runtime = "edge";

// Renders an Apple touch startup image at the requested resolution.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ w: string; h: string }> },
) {
  const { w, h } = await params;
  const width = clamp(Number(w) || 1170, 320, 2796);
  const height = clamp(Number(h) || 2532, 320, 2796);
  const noteSize = Math.round(Math.min(width, height) * 0.4);
  const titleSize = Math.round(Math.min(width, height) * 0.07);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #10b981 0%, #0ea5e9 100%)",
          color: "white",
          fontWeight: 900,
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div style={{ fontSize: noteSize, lineHeight: 1, display: "flex" }}>♫</div>
        <div style={{ fontSize: titleSize, marginTop: 24, letterSpacing: -1, display: "flex" }}>
          Tuned Up
        </div>
      </div>
    ),
    {
      width,
      height,
      headers: {
        // Splash content never changes for a given (w, h) — cache hard.
        // 7 days at the edge, immutable per URL.
        "cache-control": "public, max-age=604800, s-maxage=604800, immutable",
      },
    },
  );
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
