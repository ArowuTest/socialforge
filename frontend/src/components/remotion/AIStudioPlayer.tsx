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

// ─── Prompt words ─────────────────────────────────────────────────────────────
const PROMPT_WORDS = [
  "cinematic",
  "sunset,",
  "golden",
  "hour,",
  "social",
  "media...",
];

// ─── Floating sparkle ─────────────────────────────────────────────────────────
interface SparkleProps {
  x: number;
  y: number;
  size: number;
  phase: number;
  frame: number;
}

function Sparkle({ x, y, size, phase, frame }: SparkleProps) {
  const t = ((frame + phase) / 40) * Math.PI * 2;
  const floatY = Math.sin(t) * 5;
  const rotate = ((frame + phase) * 3) % 360;
  const op = 0.35 + Math.sin(t) * 0.2;

  return (
    <svg
      style={{
        position: "absolute",
        left: x,
        top: y + floatY,
        width: size,
        height: size,
        opacity: op,
        transform: `rotate(${rotate}deg)`,
      }}
      viewBox="0 0 20 20"
    >
      {/* 4-point star */}
      <path
        d="M10 0 L11.5 8.5 L20 10 L11.5 11.5 L10 20 L8.5 11.5 L0 10 L8.5 8.5 Z"
        fill={VIOLET_LIGHT}
      />
    </svg>
  );
}

// ─── Main composition ─────────────────────────────────────────────────────────
function AIStudioComposition() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // ── Prompt bar
  const barOp = ci(frame, 0, 12, 0, 1);
  const barX = ci(frame, 0, 14, -20, 0);

  // ── Progress bar fill (frames 20 → 70)
  const progressPct = ci(frame, 20, 70, 0, 100);
  const progressBarOp = ci(frame, 18, 24, 0, 1) * ci(frame, 68, 76, 1, 0);

  // ── Generated image (frames 70 → 100)
  const imgOp = ci(frame, 70, 100, 0, 1);
  const imgBlur = ci(frame, 70, 96, 12, 0);
  const imgScale = interpolate(
    spring({ frame: frame - 70, fps, config: { damping: 14, stiffness: 90 } }),
    [0, 1],
    [0.88, 1]
  );

  // ── Badge after image
  const badgeOp = ci(frame, 96, 112, 0, 1);
  const badgeScale = interpolate(
    spring({ frame: frame - 96, fps, config: { damping: 16, stiffness: 140 } }),
    [0, 1],
    [0.6, 1]
  );

  // Cursor blink
  const cursorVisible = Math.floor(frame / 18) % 2 === 0;

  // ── Progress stage labels
  const stages = [
    { label: "Interpreting prompt...", start: 20, end: 34 },
    { label: "Generating latents...",  start: 34, end: 52 },
    { label: "Upscaling with FLUX...", start: 52, end: 70 },
  ];
  const activeStage = stages.find((s) => frame >= s.start && frame < s.end);

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
          backgroundSize: "32px 32px",
        }}
      />

      {/* Glow behind image area */}
      <div
        style={{
          position: "absolute",
          right: 20,
          top: "50%",
          transform: "translateY(-50%)",
          width: 240,
          height: 120,
          borderRadius: "50%",
          background: `radial-gradient(circle, rgba(124,58,237,0.2) 0%, transparent 70%)`,
          opacity: imgOp,
          pointerEvents: "none",
        }}
      />

      {/* ── Floating sparkles ── */}
      {[
        { x: 20, y: 8, size: 8, phase: 0 },
        { x: 700, y: 15, size: 6, phase: 18 },
        { x: 380, y: 130, size: 7, phase: 9 },
        { x: 60, y: 110, size: 5, phase: 30 },
        { x: 740, y: 90, size: 9, phase: 6 },
      ].map((s, i) => (
        <Sparkle key={i} {...s} frame={frame} />
      ))}

      {/* ── Prompt input bar ── */}
      <div
        style={{
          position: "absolute",
          top: 12,
          left: 16,
          right: 16,
          opacity: barOp,
          transform: `translateX(${barX}px)`,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        {/* Zap icon */}
        <div
          style={{
            flexShrink: 0,
            background: "rgba(124,58,237,0.2)",
            border: "1px solid rgba(124,58,237,0.4)",
            borderRadius: 7,
            padding: "4px 5px",
            display: "flex",
            alignItems: "center",
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <polygon points="13,2 3,14 12,14 11,22 21,10 12,10" fill={VIOLET} />
          </svg>
        </div>

        {/* Input field */}
        <div
          style={{
            flex: 1,
            background: "rgba(15,23,42,0.85)",
            border: "1px solid rgba(124,58,237,0.28)",
            borderRadius: 8,
            padding: "5px 12px",
            display: "flex",
            alignItems: "center",
            gap: 0,
            minWidth: 0,
          }}
        >
          {PROMPT_WORDS.map((word, i) => {
            const wordStart = 2 + i * 3;
            const wordOp = ci(frame, wordStart, wordStart + 4, 0, 1);
            return (
              <span key={i} style={{ opacity: wordOp, fontSize: 11, color: "#e2e8f0", fontFamily: "monospace" }}>
                {word}&nbsp;
              </span>
            );
          })}
          <span
            style={{
              display: "inline-block",
              width: 1.5,
              height: 13,
              background: VIOLET,
              marginLeft: 1,
              verticalAlign: "middle",
              opacity: cursorVisible && frame < 70 ? 1 : 0,
            }}
          />
        </div>

        {/* Generate button */}
        <div
          style={{
            flexShrink: 0,
            background: `linear-gradient(135deg, ${VIOLET}, #a855f7)`,
            borderRadius: 8,
            padding: "5px 12px",
            fontSize: 11,
            fontWeight: 700,
            color: "white",
          }}
        >
          Generate
        </div>
      </div>

      {/* ── Progress section ── */}
      <div
        style={{
          position: "absolute",
          top: 50,
          left: 16,
          right: 16,
          opacity: progressBarOp,
        }}
      >
        {/* Stage label */}
        <div style={{ marginBottom: 5, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 10, color: SLATE }}>
            {activeStage?.label ?? ""}
          </span>
          <span style={{ fontSize: 10, color: VIOLET, fontWeight: 700 }}>
            {Math.round(progressPct)}%
          </span>
        </div>

        {/* Track */}
        <div
          style={{
            height: 5,
            background: "rgba(30,41,59,0.8)",
            borderRadius: 3,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${progressPct}%`,
              background: `linear-gradient(90deg, ${VIOLET}, #a855f7, ${EMERALD})`,
              borderRadius: 3,
              boxShadow: `0 0 12px ${VIOLET}55`,
              backgroundSize: "200% 100%",
              backgroundPosition: `${100 - progressPct}% 0`,
            }}
          />
        </div>

        {/* Steps row */}
        <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
          {["Prompt", "Diffuse", "Upscale", "Export"].map((label, i) => {
            const done = progressPct > (i + 1) * 25;
            const active = progressPct > i * 25 && !done;
            return (
              <div
                key={label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 9,
                  color: done ? EMERALD : active ? VIOLET_LIGHT : "#334155",
                  fontWeight: done || active ? 700 : 500,
                }}
              >
                <div
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: "50%",
                    background: done ? EMERALD : active ? VIOLET : "#334155",
                    boxShadow: active ? `0 0 6px ${VIOLET}` : "none",
                  }}
                />
                {label}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Generated image placeholder ── */}
      <div
        style={{
          position: "absolute",
          top: 42,
          right: 14,
          width: 200,
          height: 108,
          borderRadius: 12,
          overflow: "hidden",
          opacity: imgOp,
          transform: `scale(${imgScale})`,
          filter: `blur(${imgBlur}px)`,
          boxShadow: `0 0 32px rgba(124,58,237,0.22), 0 8px 32px rgba(0,0,0,0.5)`,
          border: "1px solid rgba(124,58,237,0.35)",
        }}
      >
        {/* Gradient image placeholder */}
        <div
          style={{
            width: "100%",
            height: "100%",
            background: `linear-gradient(135deg,
              #0a0520 0%,
              #1a0050 15%,
              #3b0099 30%,
              #7c3aed 45%,
              #f59e0b 60%,
              #ff6b35 75%,
              #ff9a56 90%,
              #ffcc88 100%)`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "flex-end",
            padding: "0 0 8px 0",
          }}
        >
          {/* Sunset horizon line */}
          <div
            style={{
              position: "absolute",
              bottom: "35%",
              left: 0,
              right: 0,
              height: 1,
              background: "rgba(255,200,100,0.4)",
            }}
          />
          {/* Reflection shimmer */}
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: "35%",
              background: "linear-gradient(180deg, rgba(124,58,237,0.3), rgba(255,150,50,0.2))",
            }}
          />
        </div>
      </div>

      {/* ── FLUX badge ── */}
      <div
        style={{
          position: "absolute",
          bottom: 10,
          right: 14,
          opacity: badgeOp,
          transform: `scale(${badgeScale})`,
          display: "flex",
          alignItems: "center",
          gap: 5,
          background: "rgba(124,58,237,0.18)",
          border: "1px solid rgba(124,58,237,0.4)",
          borderRadius: 999,
          padding: "3px 10px",
        }}
      >
        <span style={{ fontSize: 9 }}>✨</span>
        <span style={{ fontSize: 9, color: VIOLET_LIGHT, fontWeight: 700 }}>Generated with FLUX AI</span>
      </div>

      {/* ── Left panel: style chips (visible from start) ── */}
      <div
        style={{
          position: "absolute",
          top: 50,
          left: 14,
          display: "flex",
          flexDirection: "column",
          gap: 5,
          opacity: ci(frame, 14, 22, 0, 1),
        }}
      >
        <span style={{ fontSize: 9, color: "#475569", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>
          Style
        </span>
        {[
          { label: "Cinematic", color: "#f59e0b", active: true },
          { label: "Minimalist", color: SLATE, active: false },
          { label: "Vibrant",    color: "#ec4899", active: false },
        ].map((chip) => (
          <div
            key={chip.label}
            style={{
              fontSize: 10,
              color: chip.active ? chip.color : "#334155",
              background: chip.active ? `${chip.color}18` : "rgba(15,23,42,0.5)",
              border: `1px solid ${chip.active ? `${chip.color}44` : "rgba(30,41,59,0.6)"}`,
              borderRadius: 7,
              padding: "3px 9px",
              fontWeight: chip.active ? 700 : 500,
            }}
          >
            {chip.label}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
}

// ─── Exported Player ──────────────────────────────────────────────────────────
export default function AIStudioPlayer() {
  return (
    <Player
      component={AIStudioComposition}
      durationInFrames={120}
      fps={30}
      compositionWidth={800}
      compositionHeight={160}
      style={{ width: "100%", borderRadius: 12 }}
      loop
      autoPlay
      controls={false}
      clickToPlay={false}
    />
  );
}
