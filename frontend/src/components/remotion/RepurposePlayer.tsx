"use client";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Player } from "@remotion/player";

// ─── Tokens ───────────────────────────────────────────────────────────────────
const BG = "#020617";
const VIOLET = "#7c3aed";
const EMERALD = "#34d399";
const SLATE = "#94a3b8";

function ci(frame: number, s: number, e: number, from: number, to: number) {
  return interpolate(frame, [s, e], [from, to], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

// ─── Output cards ─────────────────────────────────────────────────────────────
const OUTPUT_CARDS = [
  {
    label: "Twitter Thread",
    color: "#1da1f2",
    bg: "rgba(29,161,242,0.12)",
    border: "rgba(29,161,242,0.3)",
    preview: "1/ We just launched something wild...",
    emoji: "🐦",
  },
  {
    label: "LinkedIn Post",
    color: "#0077b5",
    bg: "rgba(0,119,181,0.12)",
    border: "rgba(0,119,181,0.3)",
    preview: "Excited to share our latest...",
    emoji: "💼",
  },
  {
    label: "Instagram Caption",
    color: "#e1306c",
    bg: "rgba(225,48,108,0.12)",
    border: "rgba(225,48,108,0.3)",
    preview: "✨ Big news! Tap the link in bio...",
    emoji: "📸",
  },
  {
    label: "TikTok Script",
    color: "#00f2ea",
    bg: "rgba(0,242,234,0.1)",
    border: "rgba(0,242,234,0.25)",
    preview: "[Hook] POV: Your content writes itself...",
    emoji: "🎵",
  },
];

// ─── Loading spinner ──────────────────────────────────────────────────────────
function Spinner({ frame }: { frame: number }) {
  const rot = ((frame * 12) % 360);
  const op = ci(frame, 5, 10, 0, 1) * ci(frame, 22, 27, 1, 0);
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 18 18"
      style={{ opacity: op }}
    >
      <circle cx="9" cy="9" r="7" fill="none" stroke="rgba(124,58,237,0.25)" strokeWidth="2.5" />
      <path
        d="M9 2 A7 7 0 0 1 16 9"
        fill="none"
        stroke={VIOLET}
        strokeWidth="2.5"
        strokeLinecap="round"
        transform={`rotate(${rot} 9 9)`}
      />
    </svg>
  );
}

// ─── Main composition ─────────────────────────────────────────────────────────
function RepurposeComposition() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // URL bar
  const urlOp = ci(frame, 0, 10, 0, 1);
  const urlX = ci(frame, 0, 12, -30, 0);

  // Processing text
  const processingOp = ci(frame, 5, 12, 0, 1) * ci(frame, 22, 28, 1, 0);

  // Success badge
  const successOp = ci(frame, 65, 78, 0, 1);
  const successScale = interpolate(
    spring({ frame: frame - 65, fps, config: { damping: 14, stiffness: 130 } }),
    [0, 1],
    [0.6, 1]
  );

  return (
    <AbsoluteFill
      style={{
        background: BG,
        fontFamily: "system-ui,-apple-system,BlinkMacSystemFont,sans-serif",
        overflow: "hidden",
      }}
    >
      {/* Subtle grid */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `linear-gradient(rgba(124,58,237,0.04) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(124,58,237,0.04) 1px, transparent 1px)`,
          backgroundSize: "40px 40px",
        }}
      />

      {/* Left glow */}
      <div style={{ position: "absolute", top: "50%", left: -60, transform: "translateY(-50%)", width: 200, height: 200, borderRadius: "50%", background: "radial-gradient(circle, rgba(124,58,237,0.16) 0%, transparent 70%)", pointerEvents: "none" }} />

      {/* ── URL Input bar at top ── */}
      <div
        style={{
          position: "absolute",
          top: 14,
          left: 20,
          right: 20,
          display: "flex",
          alignItems: "center",
          gap: 10,
          opacity: urlOp,
          transform: `translateX(${urlX}px)`,
        }}
      >
        {/* Icon placeholder for YouTube */}
        <div style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 6, background: "rgba(255,0,0,0.2)", border: "1px solid rgba(255,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ width: 0, height: 0, borderTop: "5px solid transparent", borderBottom: "5px solid transparent", borderLeft: "8px solid #ff4444", marginLeft: 2 }} />
        </div>

        <div
          style={{
            flex: 1,
            background: "rgba(15,23,42,0.8)",
            border: "1px solid rgba(124,58,237,0.3)",
            borderRadius: 8,
            padding: "5px 12px",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span style={{ fontSize: 10, color: "#475569", fontFamily: "monospace" }}>🔗</span>
          <span style={{ fontSize: 11, color: SLATE, fontFamily: "monospace", letterSpacing: "0.01em" }}>
            youtube.com/watch?v=abc123
          </span>
        </div>

        <div
          style={{
            flexShrink: 0,
            background: `linear-gradient(135deg, ${VIOLET}, #a855f7)`,
            borderRadius: 8,
            padding: "5px 14px",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Spinner frame={frame} />
          <span style={{ fontSize: 11, color: "white", fontWeight: 700 }}>
            {frame < 25 ? "Repurpose" : "Done"}
          </span>
        </div>
      </div>

      {/* ── Processing label ── */}
      <div
        style={{
          position: "absolute",
          top: 52,
          left: 20,
          opacity: processingOp,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: VIOLET, boxShadow: `0 0 8px ${VIOLET}` }} />
        <span style={{ fontSize: 10, color: VIOLET, fontWeight: 600 }}>
          Analyzing content with AI...
        </span>
      </div>

      {/* ── Output cards ── */}
      <div
        style={{
          position: "absolute",
          top: 66,
          left: 0,
          right: 0,
          bottom: 32,
          display: "flex",
          flexDirection: "column",
          gap: 6,
          padding: "0 14px",
          justifyContent: "center",
        }}
      >
        {OUTPUT_CARDS.map((card, i) => {
          const startF = 25 + i * 8;
          const sp = spring({ frame: frame - startF, fps, config: { damping: 14, stiffness: 110 } });
          const tx = interpolate(sp, [0, 1], [200, 0]);
          const op = interpolate(sp, [0, 0.35], [0, 1], { extrapolateRight: "clamp" });

          return (
            <div
              key={card.label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                background: card.bg,
                border: `1px solid ${card.border}`,
                borderRadius: 10,
                padding: "7px 12px",
                transform: `translateX(${tx}px)`,
                opacity: op,
              }}
            >
              <span style={{ fontSize: 13, flexShrink: 0 }}>{card.emoji}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: card.color, marginBottom: 1 }}>
                  {card.label}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: "#94a3b8",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {card.preview}
                </div>
              </div>
              {/* Word count pill */}
              <div
                style={{
                  flexShrink: 0,
                  background: "rgba(255,255,255,0.06)",
                  borderRadius: 6,
                  padding: "2px 7px",
                  fontSize: 9,
                  color: "#64748b",
                  fontWeight: 600,
                }}
              >
                {[140, 280, 150, 60][i]}w
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Success badge ── */}
      <div
        style={{
          position: "absolute",
          bottom: 8,
          right: 14,
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: "rgba(16,185,129,0.14)",
          border: "1px solid rgba(52,211,153,0.45)",
          borderRadius: 999,
          padding: "4px 12px",
          opacity: successOp,
          transform: `scale(${successScale})`,
          boxShadow: "0 0 20px rgba(52,211,153,0.12)",
        }}
      >
        <span style={{ fontSize: 11 }}>⚡</span>
        <span style={{ fontSize: 11, color: EMERALD, fontWeight: 800 }}>Ready in 2.3s</span>
      </div>
    </AbsoluteFill>
  );
}

// ─── Exported Player ──────────────────────────────────────────────────────────
export default function RepurposePlayer() {
  return (
    <Player
      component={RepurposeComposition}
      durationInFrames={90}
      fps={30}
      compositionWidth={800}
      compositionHeight={200}
      style={{ width: "100%", borderRadius: 12 }}
      loop
      autoPlay
      controls={false}
      clickToPlay={false}
    />
  );
}
