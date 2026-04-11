/**
 * StatsAnimation — 4-second one-shot stats showcase for ChiselPost.
 *
 * Background: dark with subtle SVG grid pattern
 * 4 stat blocks spring in staggered by 15 frames:
 *   Block 1 (violet):  0 → 500 creators  👥
 *   Block 2 (emerald): 0 → 8 platforms   🌐
 *   Block 3 (blue):    0 → 10M+ posts    📅
 *   Block 4 (pink):    0 → 30 countries  🌍
 * Frame 80-120: horizontal connecting line draws across all 4 blocks
 *
 * All animations driven by useCurrentFrame(). No Math.random(), no CSS transitions.
 */
import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Easing,
} from "remotion";

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  bg: "#020617",
  card: "#0f172a",
  cardBorder: "#1e293b",
  violet: "#7c3aed",
  violetLight: "#a78bfa",
  emerald: "#34d399",
  blue: "#3b82f6",
  pink: "#ec4899",
  text: "#f8fafc",
  muted: "#94a3b8",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function ci(
  frame: number,
  start: number,
  end: number,
  from: number,
  to: number,
  ease?: (t: number) => number
) {
  return interpolate(frame, [start, end], [from, to], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease,
  });
}

// ─── Stats data ───────────────────────────────────────────────────────────────
const STATS = [
  {
    icon: "👥",
    color: C.violet,
    glowColor: "rgba(124,58,237,0.25)",
    from: 0,
    to: 500,
    suffix: "+",
    label: "creators",
    delay: 0,
  },
  {
    icon: "🌐",
    color: C.emerald,
    glowColor: "rgba(52,211,153,0.2)",
    from: 0,
    to: 8,
    suffix: "",
    label: "platforms",
    delay: 15,
  },
  {
    icon: "📅",
    color: C.blue,
    glowColor: "rgba(59,130,246,0.2)",
    from: 0,
    to: 10,
    suffix: "M+",
    label: "posts scheduled",
    delay: 30,
  },
  {
    icon: "🌍",
    color: C.pink,
    glowColor: "rgba(236,72,153,0.2)",
    from: 0,
    to: 30,
    suffix: "",
    label: "countries",
    delay: 45,
  },
];

// ─── Grid background ──────────────────────────────────────────────────────────
function GridBackground() {
  const W = 1200;
  const H = 675;
  const spacing = 50;

  const vLines: React.ReactNode[] = [];
  const hLines: React.ReactNode[] = [];

  for (let x = 0; x <= W; x += spacing) {
    vLines.push(
      <line
        key={`v${x}`}
        x1={x}
        y1={0}
        x2={x}
        y2={H}
        stroke={C.cardBorder}
        strokeWidth={0.5}
        opacity={0.4}
      />
    );
  }
  for (let y = 0; y <= H; y += spacing) {
    hLines.push(
      <line
        key={`h${y}`}
        x1={0}
        y1={y}
        x2={W}
        y2={y}
        stroke={C.cardBorder}
        strokeWidth={0.5}
        opacity={0.4}
      />
    );
  }

  return (
    <svg
      style={{ position: "absolute", inset: 0 }}
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
    >
      {vLines}
      {hLines}
    </svg>
  );
}

// ─── Individual stat block ────────────────────────────────────────────────────
function StatBlock({
  stat,
  frame,
  index,
}: {
  stat: (typeof STATS)[0];
  frame: number;
  index: number;
}) {
  const { fps } = useVideoConfig();
  const startFrame = 8 + stat.delay;

  const spr = spring({
    fps,
    frame: frame - startFrame,
    config: { damping: 65, stiffness: 100 },
    durationInFrames: 30,
  });

  const opacity = ci(frame, startFrame, startFrame + 16, 0, 1, Easing.out(Easing.ease));
  const y = interpolate(spr, [0, 1], [40, 0]);
  const glowScale = 0.85 + 0.15 * spring({
    fps,
    frame: frame - startFrame,
    config: { damping: 120, stiffness: 80 },
    durationInFrames: 40,
  });

  // Count-up: runs from startFrame to frame 80
  const countEnd = Math.min(80, startFrame + 55);
  const countProgress = ci(frame, startFrame, countEnd, 0, 1, Easing.out(Easing.ease));
  const value = Math.round(stat.from + (stat.to - stat.from) * countProgress);

  const iconOpacity = ci(frame, startFrame + 6, startFrame + 18, 0, 1);
  const labelOpacity = ci(frame, startFrame + 10, startFrame + 22, 0, 1);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 0,
        opacity,
        transform: `translateY(${y}px)`,
        position: "relative",
        padding: "32px 24px",
        background: `linear-gradient(135deg, ${C.card}, #080f1e)`,
        border: `1px solid ${stat.color}30`,
        borderRadius: 20,
        boxShadow: `0 0 ${40 * glowScale}px ${stat.glowColor}, 0 20px 50px rgba(0,0,0,0.4)`,
        minWidth: 200,
        flex: 1,
      }}
    >
      {/* Color accent top bar */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: "20%",
          right: "20%",
          height: 2,
          borderRadius: "0 0 2px 2px",
          background: `linear-gradient(90deg, transparent, ${stat.color}, transparent)`,
        }}
      />

      {/* Icon */}
      <div
        style={{
          fontSize: 36,
          marginBottom: 14,
          opacity: iconOpacity,
          filter: `drop-shadow(0 0 12px ${stat.color}80)`,
        }}
      >
        {stat.icon}
      </div>

      {/* Number */}
      <div
        style={{
          fontSize: 80,
          fontWeight: 900,
          color: stat.color,
          lineHeight: 1,
          letterSpacing: -3,
          fontFamily: "system-ui, sans-serif",
          textShadow: `0 0 30px ${stat.color}60`,
        }}
      >
        {value}
        <span style={{ fontSize: 48, letterSpacing: -1 }}>{stat.suffix}</span>
      </div>

      {/* Label */}
      <div
        style={{
          color: C.muted,
          fontSize: 16,
          fontWeight: 600,
          marginTop: 8,
          opacity: labelOpacity,
          letterSpacing: 0.3,
        }}
      >
        {stat.label}
      </div>

      {/* Subtle inner glow */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: 20,
          background: `radial-gradient(ellipse at 50% 0%, ${stat.color}10 0%, transparent 60%)`,
          pointerEvents: "none",
        }}
      />
    </div>
  );
}

// ─── Connecting line ──────────────────────────────────────────────────────────
function ConnectingLine({ frame }: { frame: number }) {
  const progress = ci(frame, 82, 116, 0, 1, Easing.out(Easing.ease));
  const opacity = ci(frame, 82, 92, 0, 1);

  const totalWidth = 1040; // approximate span of 4 cards at their spacing
  const lineWidth = totalWidth * progress;

  return (
    <div
      style={{
        position: "absolute",
        bottom: "calc(50% - 120px)",
        left: "50%",
        transform: "translateX(-50%)",
        width: totalWidth,
        opacity,
      }}
    >
      <div
        style={{
          height: 1,
          width: lineWidth,
          background: `linear-gradient(90deg, ${C.violet}, ${C.emerald}, ${C.blue}, ${C.pink})`,
          boxShadow: `0 0 8px rgba(124,58,237,0.5)`,
          borderRadius: 1,
        }}
      />
    </div>
  );
}

// ─── Main composition ─────────────────────────────────────────────────────────
export const StatsAnimation: React.FC = () => {
  const frame = useCurrentFrame();

  // Fade-in overall
  const globalOpacity = ci(frame, 0, 8, 0, 1, Easing.out(Easing.ease));

  return (
    <AbsoluteFill
      style={{
        backgroundColor: C.bg,
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
        overflow: "hidden",
        opacity: globalOpacity,
      }}
    >
      <GridBackground />

      {/* Subtle radial overlay to darken grid edges */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at 50% 50%, transparent 30%, rgba(2,6,23,0.7) 100%)",
        }}
      />

      {/* Background glows */}
      <div
        style={{
          position: "absolute",
          top: "30%",
          left: "10%",
          width: 300,
          height: 300,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${C.violet}0d 0%, transparent 70%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          top: "20%",
          right: "8%",
          width: 260,
          height: 260,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${C.pink}0a 0%, transparent 70%)`,
        }}
      />

      {/* Stat blocks row */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          display: "flex",
          gap: 20,
          width: 1080,
        }}
      >
        {STATS.map((stat, i) => (
          <StatBlock key={stat.label} stat={stat} frame={frame} index={i} />
        ))}
      </div>

      {/* Horizontal connecting line */}
      <ConnectingLine frame={frame} />
    </AbsoluteFill>
  );
};
