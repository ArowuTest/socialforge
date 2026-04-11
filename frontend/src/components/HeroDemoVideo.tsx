"use client";

/**
 * HeroDemoVideo — wraps the Remotion Player for use on the landing page.
 *
 * Uses dynamic import to avoid SSR issues (Remotion Player requires
 * browser APIs). Falls back to a static placeholder during server render
 * and while the bundle loads.
 */
import dynamic from "next/dynamic";
import React from "react";

// Dynamically import the Player wrapper so it only runs client-side.
const PlayerWrapper = dynamic(() => import("./HeroDemoVideoPlayer"), {
  ssr: false,
  loading: () => <DemoPlaceholder />,
});

/** Static placeholder shown during SSR / initial load */
function DemoPlaceholder() {
  return (
    <div
      style={{
        width: "100%",
        aspectRatio: "16/9",
        borderRadius: 16,
        background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)",
        border: "1px solid rgba(124,58,237,0.3)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 0 60px rgba(124,58,237,0.15)",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 12px",
            boxShadow: "0 0 24px rgba(124,58,237,0.5)",
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          </svg>
        </div>
        <p style={{ color: "#a78bfa", fontSize: 14, fontWeight: 600, margin: 0 }}>
          ChiselPost Demo
        </p>
        <p style={{ color: "#475569", fontSize: 12, margin: "4px 0 0" }}>
          Loading animation...
        </p>
      </div>
    </div>
  );
}

export default function HeroDemoVideo() {
  return <PlayerWrapper />;
}
