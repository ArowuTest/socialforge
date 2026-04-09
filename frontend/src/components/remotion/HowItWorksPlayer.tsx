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
const VIOLET_LIGHT = "#a78bfa";
const EMERALD = "#34d399";
const SLATE = "#94a3b8";

function ci(frame: number, s: number, e: number, from: number, to: number) {
  return interpolate(frame, [s, e], [from, to], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

// ─── Platform icons (SVG paths) ───────────────────────────────────────────────
const PLATFORMS = [
  { label: "Instagram", color: "#e1306c", bg: "rgba(225,48,108,0.15)" },
  { label: "TikTok",    color: "#00f2ea", bg: "rgba(0,242,234,0.1)"   },
  { label: "LinkedIn",  color: "#0077b5", bg: "rgba(0,119,181,0.15)"  },
  { label: "YouTube",   color: "#ff0000", bg: "rgba(255,0,0,0.12)"    },
  { label: "Twitter",   color: "#1da1f2", bg: "rgba(29,161,242,0.13)" },
];

// ─── Step label ───────────────────────────────────────────────────────────────
function StepLabel({
  number,
  label,
  active,
  done,
}: {
  number: number;
  label: string;
  active: boolean;
  done: boolean;
}) {
  const circleColor = done ? EMERALD : active ? VIOLET : "#1e293b";
  const textColor = done || active ? "#f8fafc" : "#334155";

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: "50%",
          background: circleColor,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: `2px solid ${done ? EMERALD : active ? VIOLET_LIGHT : "#1e293b"}`,
          boxShadow: active ? `0 0 20px ${VIOLET}55` : "none",
          transition: "all 0.3s",
          fontFamily: "system-ui,sans-serif",
          fontSize: 14,
          fontWeight: 800,
          color: done || active ? "#fff" : "#475569",
        }}
      >
        {done ? "✓" : number}
      </div>
      <span
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: textColor,
          fontFamily: "system-ui,-apple-system,sans-serif",
          letterSpacing: "0.04em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
    </div>
  );
}

// ─── Step 1: Connect ──────────────────────────────────────────────────────────
function Step1Connect({ frame, fps }: { frame: number; fps: number }) {
  const cardOp = ci(frame, 0, 12, 0, 1);
  const cardY = ci(frame, 0, 12, 20, 0);

  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        transform: `translate(-50%, -50%) translateY(${cardY}px)`,
        opacity: cardOp,
        width: 500,
        background: "rgba(15,10,40,0.82)",
        border: `1px solid rgba(124,58,237,0.32)`,
        borderRadius: 20,
        padding: "28px 32px",
        boxShadow: `0 0 48px rgba(124,58,237,0.14), 0 20px 60px rgba(0,0,0,0.5)`,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color: VIOLET, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 16, fontFamily: "system-ui,sans-serif" }}>
        Connect Your Platforms
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {PLATFORMS.map((p, i) => {
          const sp = spring({ frame: frame - i * 7, fps, config: { damping: 14, stiffness: 120 } });
          const sc = interpolate(sp, [0, 1], [0.3, 1]);
          const op = interpolate(sp, [0, 0.4], [0, 1], { extrapolateRight: "clamp" });
          return (
            <div
              key={p.label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: p.bg,
                border: `1px solid ${p.color}44`,
                borderRadius: 12,
                padding: "8px 14px",
                transform: `scale(${sc})`,
                opacity: op,
              }}
            >
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: p.color, boxShadow: `0 0 8px ${p.color}88` }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0", fontFamily: "system-ui,sans-serif" }}>
                {p.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* "Connected" indicator */}
      {frame > 28 && (
        <div
          style={{
            marginTop: 20,
            display: "flex",
            alignItems: "center",
            gap: 8,
            opacity: ci(frame, 28, 38, 0, 1),
          }}
        >
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: EMERALD, boxShadow: `0 0 12px ${EMERALD}88` }} />
          <span style={{ fontSize: 13, color: EMERALD, fontWeight: 700, fontFamily: "system-ui,sans-serif" }}>
            5 platforms connected
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Step 2: Create (typing effect) ──────────────────────────────────────────
const CAPTION = "Just shipped our new AI feature! 🚀 Game-changing for social media managers.";
const WORDS = CAPTION.split(" ");

function Step2Create({ frame, fps }: { frame: number; fps: number }) {
  const cardOp = ci(frame, 30, 42, 0, 1);
  const cardY = ci(frame, 30, 42, 20, 0);

  // Each word fades in staggered
  const wordsToShow = WORDS.filter((_, i) => {
    const wordFrame = 32 + i * 4;
    return frame >= wordFrame;
  });

  const cursorVisible = Math.floor(frame / 15) % 2 === 0;

  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        transform: `translate(-50%, -50%) translateY(${cardY}px)`,
        opacity: cardOp,
        width: 540,
        background: "rgba(15,10,40,0.82)",
        border: `1px solid rgba(124,58,237,0.32)`,
        borderRadius: 20,
        padding: "28px 32px",
        boxShadow: `0 0 48px rgba(124,58,237,0.14), 0 20px 60px rgba(0,0,0,0.5)`,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: VIOLET, letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: "system-ui,sans-serif" }}>
          AI Caption Studio
        </span>
        <div style={{ display: "flex", gap: 6 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#ff5f57" }} />
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#febc2e" }} />
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#28c840" }} />
        </div>
      </div>

      {/* Typing area */}
      <div
        style={{
          background: "rgba(2,6,23,0.7)",
          border: "1px solid rgba(124,58,237,0.25)",
          borderRadius: 12,
          padding: "16px 18px",
          minHeight: 80,
          fontFamily: "monospace",
          fontSize: 14,
          color: "#e2e8f0",
          lineHeight: 1.65,
        }}
      >
        {WORDS.map((word, i) => {
          const wordStart = 32 + i * 4;
          const op = ci(frame, wordStart, wordStart + 4, 0, 1);
          return (
            <span key={i} style={{ opacity: op }}>
              {word}
              {i < WORDS.length - 1 ? " " : ""}
            </span>
          );
        })}
        <span
          style={{
            display: "inline-block",
            width: 2,
            height: 16,
            background: VIOLET,
            marginLeft: 2,
            verticalAlign: "middle",
            opacity: cursorVisible ? 1 : 0,
          }}
        />
      </div>

      {/* Platform chips */}
      <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
        {PLATFORMS.slice(0, 3).map((p, i) => {
          const op = ci(frame, 60 + i * 5, 70 + i * 5, 0, 1);
          return (
            <div key={p.label} style={{ opacity: op, fontSize: 12, color: p.color, background: p.bg, border: `1px solid ${p.color}33`, borderRadius: 8, padding: "3px 10px", fontFamily: "system-ui,sans-serif", fontWeight: 600 }}>
              {p.label}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Step 3: Schedule & Track ─────────────────────────────────────────────────
const DAYS = ["M", "T", "W", "T", "F", "S", "S"];
const GRID_ROWS = 4;

function Step3Schedule({ frame, fps }: { frame: number; fps: number }) {
  const cardOp = ci(frame, 60, 72, 0, 1);
  const cardY = ci(frame, 60, 72, 20, 0);

  // Cells fill progressively
  const totalCells = DAYS.length * GRID_ROWS;

  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        transform: `translate(-50%, -50%) translateY(${cardY}px)`,
        opacity: cardOp,
        width: 520,
        background: "rgba(15,10,40,0.82)",
        border: `1px solid rgba(124,58,237,0.32)`,
        borderRadius: 20,
        padding: "28px 32px",
        boxShadow: `0 0 48px rgba(124,58,237,0.14), 0 20px 60px rgba(0,0,0,0.5)`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: VIOLET, letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: "system-ui,sans-serif" }}>
          Content Calendar
        </span>
        <span style={{ fontSize: 12, color: EMERALD, fontWeight: 700, fontFamily: "system-ui,sans-serif" }}>
          April 2025
        </span>
      </div>

      {/* Day headers */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 8 }}>
        {DAYS.map((d, i) => (
          <div key={i} style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: "#475569", fontFamily: "system-ui,sans-serif" }}>
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
        {Array.from({ length: totalCells }).map((_, idx) => {
          const row = Math.floor(idx / 7);
          const col = idx % 7;
          const cellFrame = 64 + idx * 2;
          const filled = frame >= cellFrame;
          const filledOp = ci(frame, cellFrame, cellFrame + 8, 0, 1);

          // Some cells have posts
          const hasPost = [0, 2, 4, 7, 9, 11, 14, 16, 20].includes(idx);
          const postColors = ["#7c3aed", "#e1306c", "#0077b5", "#34d399", "#f59e0b"];
          const postColor = postColors[idx % postColors.length];

          return (
            <div
              key={idx}
              style={{
                aspectRatio: "1",
                borderRadius: 6,
                background: filled
                  ? hasPost
                    ? `${postColor}22`
                    : "rgba(30,41,59,0.6)"
                  : "rgba(15,23,42,0.4)",
                border: `1px solid ${filled ? (hasPost ? `${postColor}44` : "rgba(51,65,85,0.5)") : "rgba(30,41,59,0.3)"}`,
                opacity: filled ? filledOp : 0.3,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 9,
                transition: "all 0.2s",
              }}
            >
              {filled && hasPost && (
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: postColor }} />
              )}
            </div>
          );
        })}
      </div>

      {/* Stats row */}
      <div
        style={{
          marginTop: 18,
          display: "flex",
          gap: 24,
          opacity: ci(frame, 100, 112, 0, 1),
        }}
      >
        {[
          { label: "Scheduled", value: "12", color: VIOLET },
          { label: "Published", value: "8", color: EMERALD },
          { label: "Reach", value: "24.8k", color: "#f59e0b" },
        ].map((s) => (
          <div key={s.label} style={{ fontFamily: "system-ui,sans-serif" }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, color: SLATE }}>{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Composition ─────────────────────────────────────────────────────────
function HowItWorksComposition() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Progress bar: 0 → 120 frames
  const progress = frame / 120;
  const progressWidth = Math.min(progress * 100, 100);

  // Step active states
  const step1Active = frame >= 0 && frame < 50;
  const step2Active = frame >= 30 && frame < 80;
  const step3Active = frame >= 60;

  const step1Done = frame >= 50;
  const step2Done = frame >= 90;

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse at 25% 30%, #0c0520 0%, ${BG} 65%)`,
        fontFamily: "system-ui,-apple-system,BlinkMacSystemFont,sans-serif",
        overflow: "hidden",
      }}
    >
      {/* Grid */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `linear-gradient(rgba(124,58,237,0.04) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(124,58,237,0.04) 1px, transparent 1px)`,
          backgroundSize: "60px 60px",
        }}
      />

      {/* Glow */}
      <div style={{ position: "absolute", top: "30%", left: "50%", transform: "translateX(-50%)", width: 500, height: 300, borderRadius: "50%", background: "radial-gradient(circle, rgba(124,58,237,0.12) 0%, transparent 70%)", pointerEvents: "none" }} />

      {/* ── Step indicators at top ── */}
      <div
        style={{
          position: "absolute",
          top: 32,
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          alignItems: "center",
          gap: 0,
        }}
      >
        <StepLabel number={1} label="Connect" active={step1Active} done={step1Done} />
        {/* Connector line */}
        <div style={{ width: 100, height: 2, background: step1Done ? VIOLET : "#1e293b", margin: "0 12px", marginBottom: 24, transition: "background 0.4s" }} />
        <StepLabel number={2} label="Create" active={step2Active} done={step2Done} />
        <div style={{ width: 100, height: 2, background: step2Done ? VIOLET : "#1e293b", margin: "0 12px", marginBottom: 24, transition: "background 0.4s" }} />
        <StepLabel number={3} label="Schedule & Track" active={step3Active} done={false} />
      </div>

      {/* ── Animated Step Panels ── */}
      {/* Step 1 fades out after frame 48 */}
      <div style={{ opacity: ci(frame, 44, 52, 1, 0) }}>
        <Step1Connect frame={frame} fps={fps} />
      </div>

      {/* Step 2 fades out after frame 78 */}
      <div style={{ opacity: ci(frame, 74, 82, 1, 0) }}>
        <Step2Create frame={frame} fps={fps} />
      </div>

      {/* Step 3 stays in */}
      <Step3Schedule frame={frame} fps={fps} />

      {/* ── Progress bar at bottom ── */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 4,
          background: "rgba(30,41,59,0.8)",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${progressWidth}%`,
            background: `linear-gradient(90deg, ${VIOLET}, ${EMERALD})`,
            borderRadius: 2,
            boxShadow: `0 0 12px ${VIOLET}66`,
            transition: "width 0.05s linear",
          }}
        />
      </div>
    </AbsoluteFill>
  );
}

// ─── Exported Player ──────────────────────────────────────────────────────────
export default function HowItWorksPlayer() {
  return (
    <Player
      component={HowItWorksComposition}
      durationInFrames={120}
      fps={30}
      compositionWidth={1200}
      compositionHeight={500}
      style={{ width: "100%", borderRadius: 16 }}
      loop
      autoPlay
      controls={false}
      clickToPlay={false}
    />
  );
}
