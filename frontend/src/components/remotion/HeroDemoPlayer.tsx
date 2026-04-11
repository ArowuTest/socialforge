"use client";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Player } from "@remotion/player";

// ─── Design tokens ────────────────────────────────────────────────────────────
const BG = "#020617";
const VIOLET = "#7c3aed";
const VIOLET_LIGHT = "#a78bfa";
const EMERALD = "#34d399";
const SLATE = "#94a3b8";
const CARD_BG = "rgba(15,10,40,0.88)";
const CARD_BORDER = "rgba(124,58,237,0.35)";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

function ci(
  frame: number,
  inStart: number,
  inEnd: number,
  from: number,
  to: number
) {
  return interpolate(frame, [inStart, inEnd], [from, to], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

// ─── Zap SVG ──────────────────────────────────────────────────────────────────
const ZapSVG = ({ size = 24, color = VIOLET }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <polygon
      points="13,2 3,14 12,14 11,22 21,10 12,10"
      fill={color}
      stroke={color}
      strokeWidth="1.2"
      strokeLinejoin="round"
    />
  </svg>
);

// ─── Platform Pill ────────────────────────────────────────────────────────────
interface PillProps {
  label: string;
  bgColor: string;
  dotColor: string;
  frame: number;
  startFrame: number;
  fps: number;
  top: number;
}

function PlatformPill({ label, bgColor, dotColor, frame, startFrame, fps, top }: PillProps) {
  const p = spring({ frame: frame - startFrame, fps, config: { damping: 15, stiffness: 110, mass: 0.9 } });
  const x = interpolate(p, [0, 1], [-220, 0]);
  const op = clamp(p * 3, 0, 1);

  return (
    <div
      style={{
        position: "absolute",
        left: 64,
        top,
        display: "flex",
        alignItems: "center",
        gap: 9,
        background: bgColor,
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 999,
        padding: "9px 20px",
        transform: `translateX(${x}px)`,
        opacity: op,
        backdropFilter: "blur(8px)",
      }}
    >
      <div
        style={{
          width: 10,
          height: 10,
          borderRadius: "50%",
          background: dotColor,
          boxShadow: `0 0 10px ${dotColor}88`,
        }}
      />
      <span
        style={{
          color: "#f1f5f9",
          fontSize: 14,
          fontWeight: 700,
          fontFamily: "system-ui,-apple-system,sans-serif",
          letterSpacing: "0.01em",
        }}
      >
        {label}
      </span>
    </div>
  );
}

// ─── Arrow SVG (draw-on) ──────────────────────────────────────────────────────
interface ArrowProps {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  frame: number;
  startFrame: number;
  endFrame: number;
  color: string;
  id: string;
}

function DrawArrow({ x1, y1, x2, y2, frame, startFrame, endFrame, color, id }: ArrowProps) {
  const progress = ci(frame, startFrame, endFrame, 0, 1);
  const opacity = ci(frame, startFrame, startFrame + 6, 0, 0.75);
  const cx = x1 + (x2 - x1) * progress;
  const cy = y1 + (y2 - y1) * progress;

  return (
    <svg
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}
      viewBox="0 0 1200 675"
    >
      <defs>
        <marker id={`ah-${id}`} markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
          <path d="M0,0.5 L0,6.5 L7,3.5 z" fill={color} opacity={progress > 0.8 ? 1 : 0} />
        </marker>
      </defs>
      <line
        x1={x1} y1={y1} x2={cx} y2={cy}
        stroke={color}
        strokeWidth="1.8"
        strokeDasharray="7 5"
        opacity={opacity}
        markerEnd={progress > 0.8 ? `url(#ah-${id})` : undefined}
      />
    </svg>
  );
}

// ─── Sparkle dots ─────────────────────────────────────────────────────────────
function Sparkles({ frame }: { frame: number }) {
  const dots = [
    { x: 900, y: 120, r: 2.5, phase: 0 },
    { x: 1050, y: 200, r: 1.8, phase: 12 },
    { x: 980, y: 320, r: 3, phase: 7 },
    { x: 150, y: 500, r: 2, phase: 20 },
    { x: 250, y: 160, r: 1.5, phase: 4 },
    { x: 1100, y: 450, r: 2.2, phase: 15 },
  ];

  return (
    <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }} viewBox="0 0 1200 675">
      {dots.map((d, i) => {
        const pulsate = Math.sin(((frame + d.phase) / 20) * Math.PI);
        const op = 0.3 + pulsate * 0.25;
        const sc = 0.8 + pulsate * 0.3;
        return (
          <circle key={i} cx={d.x} cy={d.y} r={d.r * sc} fill={VIOLET_LIGHT} opacity={op} />
        );
      })}
    </svg>
  );
}

// ─── Main Composition ─────────────────────────────────────────────────────────
function HeroDemoComposition() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // ── Logo
  const logoOp = ci(frame, 0, 20, 0, 1);
  const logoY = ci(frame, 0, 20, -28, 0);

  // ── Card
  const cardP = spring({ frame: frame - 20, fps, config: { damping: 14, stiffness: 100 } });
  const cardScale = interpolate(cardP, [0, 1], [0.84, 1]);
  const cardOp = clamp(cardP * 2.5, 0, 1);

  // ── Badge on card
  const badgeP = spring({ frame: frame - 34, fps, config: { damping: 18, stiffness: 140 } });
  const badgeScale = interpolate(badgeP, [0, 1], [0.5, 1]);
  const badgeOp = clamp(badgeP * 2, 0, 1);

  // ── Card shimmer
  const shimmerX = ci(frame, 35, 90, -200, 520);

  // ── Success badge
  const successOp = ci(frame, 80, 100, 0, 1);
  const successY = ci(frame, 80, 100, 22, 0);
  const successPulse = frame > 110 ? 1 + Math.sin(((frame - 110) / 18) * Math.PI) * 0.025 : 1;

  // Pill vertical positions (centered around 337)
  const pillTops = [282, 322, 362];

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse at 30% 40%, #0f0a1e 0%, ${BG} 60%)`,
        fontFamily: "system-ui,-apple-system,BlinkMacSystemFont,sans-serif",
        overflow: "hidden",
      }}
    >
      {/* Grid overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `linear-gradient(rgba(124,58,237,0.05) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(124,58,237,0.05) 1px, transparent 1px)`,
          backgroundSize: "56px 56px",
        }}
      />

      {/* Glow orbs */}
      <div style={{ position: "absolute", top: 40, left: 80, width: 360, height: 360, borderRadius: "50%", background: "radial-gradient(circle, rgba(124,58,237,0.16) 0%, transparent 70%)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: 40, right: 80, width: 280, height: 280, borderRadius: "50%", background: "radial-gradient(circle, rgba(52,211,153,0.1) 0%, transparent 70%)", pointerEvents: "none" }} />

      {/* Sparkles */}
      <Sparkles frame={frame} />

      {/* ── Logo ── */}
      <div
        style={{
          position: "absolute",
          top: 36,
          left: "50%",
          transform: `translateX(-50%) translateY(${logoY}px)`,
          opacity: logoOp,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <div
          style={{
            background: "rgba(124,58,237,0.18)",
            border: "1px solid rgba(124,58,237,0.45)",
            borderRadius: 12,
            padding: "6px 9px",
            display: "flex",
            alignItems: "center",
          }}
        >
          <ZapSVG size={24} color={VIOLET} />
        </div>
        <span style={{ fontSize: 24, fontWeight: 800, color: "#f8fafc", letterSpacing: "-0.5px" }}>
          Social<span style={{ color: VIOLET }}>Forge</span>
        </span>
      </div>

      {/* ── Platform Pills ── */}
      <PlatformPill label="Instagram" bgColor="rgba(168,85,247,0.16)" dotColor="#a855f7" frame={frame} startFrame={15} fps={fps} top={pillTops[0]} />
      <PlatformPill label="TikTok"    bgColor="rgba(148,163,184,0.1)"  dotColor="#e2e8f0" frame={frame} startFrame={25} fps={fps} top={pillTops[1]} />
      <PlatformPill label="LinkedIn"  bgColor="rgba(59,130,246,0.16)"  dotColor="#3b82f6" frame={frame} startFrame={35} fps={fps} top={pillTops[2]} />

      {/* ── Center Content Card ── */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: `translate(-50%, -50%) scale(${cardScale})`,
          opacity: cardOp,
          width: 340,
          background: CARD_BG,
          border: `1px solid ${CARD_BORDER}`,
          borderRadius: 20,
          padding: "24px 28px",
          boxShadow: `0 0 60px rgba(124,58,237,0.18), 0 24px 72px rgba(0,0,0,0.55)`,
          overflow: "hidden",
        }}
      >
        {/* Shimmer sweep */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: shimmerX,
            width: 130,
            height: "100%",
            background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.045), transparent)",
            transform: "skewX(-12deg)",
            pointerEvents: "none",
          }}
        />

        {/* AI Badge */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: "rgba(124,58,237,0.22)",
            border: "1px solid rgba(124,58,237,0.48)",
            borderRadius: 999,
            padding: "4px 13px",
            marginBottom: 14,
            transform: `scale(${badgeScale})`,
            opacity: badgeOp,
          }}
        >
          <span style={{ fontSize: 12 }}>✨</span>
          <span style={{ fontSize: 12, color: "#c4b5fd", fontWeight: 700, letterSpacing: "0.03em" }}>
            AI Caption Generated
          </span>
        </div>

        {/* Caption text */}
        <p
          style={{
            margin: "0 0 14px",
            color: "#f1f5f9",
            fontSize: 16,
            fontWeight: 600,
            lineHeight: 1.55,
          }}
        >
          Just shipped! 🚀 Our AI writes captions that convert...
        </p>

        {/* Tags */}
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 16 }}>
          {["#startup", "#SaaS", "#AI"].map((t) => (
            <span
              key={t}
              style={{
                fontSize: 12,
                color: VIOLET,
                background: "rgba(124,58,237,0.12)",
                border: "1px solid rgba(124,58,237,0.25)",
                padding: "2px 9px",
                borderRadius: 7,
              }}
            >
              {t}
            </span>
          ))}
        </div>

        {/* Author row */}
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              background: `linear-gradient(135deg, ${VIOLET}, #a855f7)`,
              flexShrink: 0,
            }}
          />
          <div>
            <div style={{ fontSize: 12, color: "#f1f5f9", fontWeight: 700 }}>@ChiselPost</div>
            <div style={{ fontSize: 11, color: "#475569" }}>Just now</div>
          </div>
          <div style={{ marginLeft: "auto", fontSize: 11, color: EMERALD, fontWeight: 700 }}>● Live</div>
        </div>
      </div>

      {/* ── Draw Arrows (card → pills) ── */}
      {/* → Instagram */}
      <DrawArrow x1={430} y1={310} x2={240} y2={pillTops[0] + 15} frame={frame} startFrame={40} endFrame={57} color="#a855f7" id="ig" />
      {/* → TikTok */}
      <DrawArrow x1={430} y1={337} x2={240} y2={pillTops[1] + 15} frame={frame} startFrame={52} endFrame={69} color="#94a3b8" id="tt" />
      {/* → LinkedIn */}
      <DrawArrow x1={430} y1={364} x2={240} y2={pillTops[2] + 15} frame={frame} startFrame={64} endFrame={81} color="#3b82f6" id="li" />

      {/* ── Success Badge ── */}
      <div
        style={{
          position: "absolute",
          bottom: 44,
          left: "50%",
          transform: `translateX(-50%) translateY(${successY}px) scale(${successPulse})`,
          opacity: successOp,
          background: "rgba(16,185,129,0.14)",
          border: "1px solid rgba(52,211,153,0.48)",
          borderRadius: 999,
          padding: "11px 28px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          boxShadow: "0 0 32px rgba(52,211,153,0.14)",
          whiteSpace: "nowrap",
        }}
      >
        <span style={{ fontSize: 16 }}>🎯</span>
        <span style={{ color: EMERALD, fontWeight: 800, fontSize: 15 }}>
          Posted to 3 platforms • 2.4k reach
        </span>
      </div>
    </AbsoluteFill>
  );
}

// ─── Exported Player ──────────────────────────────────────────────────────────
export default function HeroDemoPlayer() {
  return (
    <Player
      component={HeroDemoComposition}
      durationInFrames={150}
      fps={30}
      compositionWidth={1200}
      compositionHeight={675}
      style={{ width: "100%", borderRadius: 16 }}
      loop
      autoPlay
      controls={false}
      clickToPlay={false}
    />
  );
}
