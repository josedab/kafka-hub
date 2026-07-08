import { ImageResponse } from "next/og";
import { site } from "@/lib/site";

export const runtime = "edge";

export const alt = site.tagline;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%)",
          color: "#fafafa",
          padding: 80,
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            color: "#737373",
            fontSize: 28,
            fontWeight: 500,
            letterSpacing: 2,
            textTransform: "uppercase",
          }}
        >
          <div
            style={{
              width: 12,
              height: 12,
              borderRadius: 999,
              background: "#22c55e",
              boxShadow: "0 0 24px #22c55e",
            }}
          />
          {site.shortName}
        </div>

        <div
          style={{
            display: "flex",
            flex: 1,
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              fontSize: 80,
              fontWeight: 700,
              lineHeight: 1.05,
              letterSpacing: "-0.04em",
              marginBottom: 28,
              maxWidth: 980,
            }}
          >
            {site.name}
          </div>
          <div
            style={{
              fontSize: 34,
              color: "#a3a3a3",
              lineHeight: 1.3,
              maxWidth: 960,
            }}
          >
            {site.tagline}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 32,
            fontSize: 26,
            color: "#d4d4d4",
          }}
        >
          <span style={{ display: "flex", gap: 10 }}>
            <span style={{ color: "#22c55e" }}>/</span>learn
          </span>
          <span style={{ display: "flex", gap: 10 }}>
            <span style={{ color: "#22c55e" }}>/</span>diagnose
          </span>
          <span style={{ display: "flex", gap: 10 }}>
            <span style={{ color: "#22c55e" }}>/</span>simulate
          </span>
        </div>
      </div>
    ),
    { ...size },
  );
}
