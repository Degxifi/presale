import { ImageResponse } from "next/og";

export const alt = "$DEGX Presale — Degxifi Token on Solana";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#0d1117",
          color: "#e6edf3",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 999,
              background: "#00ff88",
            }}
          />
          <div style={{ display: "flex", fontSize: 76, fontWeight: 700 }}>
            <span style={{ color: "#00ff88" }}>$</span>
            <span>DEGX Presale</span>
          </div>
        </div>
        <div
          style={{
            marginTop: 28,
            fontSize: 30,
            color: "#9aa4b2",
            maxWidth: 860,
            textAlign: "center",
          }}
        >
          3-tier USDC presale on Solana · graduates to Jupiter Studio at a $600K
          market cap
        </div>
      </div>
    ),
    { ...size },
  );
}
