/**
 * SocialForgeDemo — Remotion composition for the hero section.
 *
 * Shows a slick 5-second looping product demo:
 *   0–20f   Logo + headline fade in
 *   20–60f  AI card animates in + text types out
 *   60–90f  Platform pills fly in (staggered)
 *   90–120f Draw-on arrows from card → platforms
 *   120–150f Success badge appears + subtle loop hold
 *
 * Every animation is driven by useCurrentFrame() — no CSS transitions,
 * no setTimeout, no Date.now(). Safe for Remotion's non-sequential renderer.
 */
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Easing,
} from "remotion";

// ─── Design tokens ───────────────────────────────────────────────────────────
const C = {
  bg: "#020617",          // slate-950
  card: "#0f172a",        // slate-900
  border: "#1e293b",      // slate-800
  violet: "#7c3aed",      // violet-600
  violetLight: "#a78bfa", // violet-400
  emerald: "#34d399",     // emerald-400
  text: "#f8fafc",        // slate-50
  muted: "#94a3b8",       // slate-400
  instagram: "#e1306c",
  tiktok: "#00f2ea",
  linkedin: "#0077b5",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function clamp(
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

// ─── Sub-components ───────────────────────────────────────────────────────────

function Logo({ frame }: { frame: number }) {
  const opacity = clamp(frame, 0, 18, 0, 1, Easing.out(Easing.ease));
  const y = clamp(frame, 0, 18, -16, 0, Easing.out(Easing.ease));

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        opacity,
        transform: `translateY(${y}px)`,
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: `linear-gradient(135deg, ${C.violet}, #4f46e5)`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: `0 0 20px ${C.violet}80`,
        }}
      >
        {/* Zap shape in pure SVG */}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
      </div>
      <span style={{ color: C.text, fontWeight: 700, fontSize: 20, letterSpacing: -0.5 }}>
        SocialForge
      </span>
    </div>
  );
}

function AICard({ frame }: { frame: number }) {
  const opacity = clamp(frame, 20, 45, 0, 1, Easing.out(Easing.ease));
  const y = clamp(frame, 20, 45, 30, 0, Easing.out(Easing.back(1.2)));
  const glowOpacity = clamp(frame, 45, 70, 0, 1);

  // Typing animation for caption text
  const fullCaption = "🚀 Big news! We just launched our AI-powered repurpose engine. Transform any content into 8 platform-ready posts in seconds. #AI #SocialMedia #ContentCreation";
  const charCount = Math.floor(clamp(frame, 40, 85, 0, fullCaption.length));
  const visibleCaption = fullCaption.slice(0, charCount);
  const showCursor = frame < 90 && Math.floor(frame / 8) % 2 === 0;

  return (
    <div
      style={{
        opacity,
        transform: `translateY(${y}px)`,
        position: "relative",
      }}
    >
      {/* Glow behind card */}
      <div
        style={{
          position: "absolute",
          inset: -20,
          background: `radial-gradient(ellipse at center, ${C.violet}30 0%, transparent 70%)`,
          opacity: glowOpacity,
          borderRadius: 24,
        }}
      />
      <div
        style={{
          background: C.card,
          border: `1px solid ${C.violetLight}40`,
          borderRadius: 16,
          padding: "20px 24px",
          width: 320,
          position: "relative",
          boxShadow: `0 0 40px ${C.violet}25`,
        }}
      >
        {/* Card header */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: `linear-gradient(135deg, ${C.violet}, #4f46e5)`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 14,
            }}
          >
            🤖
          </div>
          <span style={{ color: C.violetLight, fontSize: 13, fontWeight: 600 }}>
            AI Caption Generator
          </span>
        </div>

        {/* Caption text */}
        <div
          style={{
            color: C.text,
            fontSize: 12,
            lineHeight: 1.6,
            minHeight: 80,
            fontFamily: "monospace",
          }}
        >
          {visibleCaption}
          {showCursor && (
            <span style={{ color: C.violetLight, fontWeight: 700 }}>|</span>
          )}
        </div>

        {/* Generated badge */}
        <GeneratedBadge frame={frame} />
      </div>
    </div>
  );
}

function GeneratedBadge({ frame }: { frame: number }) {
  const opacity = clamp(frame, 88, 100, 0, 1, Easing.out(Easing.ease));
  const scale = clamp(frame, 88, 100, 0.8, 1, Easing.out(Easing.back(1.5)));

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        marginTop: 14,
        opacity,
        transform: `scale(${scale})`,
        transformOrigin: "left center",
      }}
    >
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: C.emerald,
          boxShadow: `0 0 8px ${C.emerald}`,
        }}
      />
      <span style={{ color: C.emerald, fontSize: 12, fontWeight: 600 }}>
        AI Caption Generated ✓
      </span>
    </div>
  );
}

const PLATFORMS = [
  { name: "Instagram", color: C.instagram, emoji: "📸", delay: 60 },
  { name: "TikTok", color: C.tiktok, emoji: "🎵", delay: 72 },
  { name: "LinkedIn", color: C.linkedin, emoji: "💼", delay: 84 },
];

function PlatformPill({
  name,
  color,
  emoji,
  delay,
  frame,
}: {
  name: string;
  color: string;
  emoji: string;
  delay: number;
  frame: number;
}) {
  const { fps } = useVideoConfig();
  const progress = spring({ fps, frame: frame - delay, config: { damping: 60, stiffness: 120 }, durationInFrames: 30 });
  const opacity = clamp(frame, delay, delay + 20, 0, 1);
  const x = interpolate(progress, [0, 1], [-60, 0]);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        background: C.card,
        border: `1px solid ${color}40`,
        borderRadius: 12,
        padding: "10px 16px",
        opacity,
        transform: `translateX(${x}px)`,
        boxShadow: `0 0 16px ${color}20`,
        width: 160,
      }}
    >
      <span style={{ fontSize: 16 }}>{emoji}</span>
      <span style={{ color: C.text, fontSize: 13, fontWeight: 600 }}>{name}</span>
      <PostingIndicator frame={frame} delay={delay} color={color} />
    </div>
  );
}

function PostingIndicator({
  frame,
  delay,
  color,
}: {
  frame: number;
  delay: number;
  color: string;
}) {
  const showPosting = frame >= delay + 20 && frame < 130;
  const showPosted = frame >= 130;

  if (showPosted) {
    const opacity = clamp(frame, 130, 140, 0, 1);
    return (
      <span
        style={{
          marginLeft: "auto",
          color: C.emerald,
          fontSize: 11,
          fontWeight: 700,
          opacity,
        }}
      >
        ✓ Posted
      </span>
    );
  }

  if (showPosting) {
    const dotFrame = (frame - delay - 20) % 24;
    return (
      <div
        style={{
          marginLeft: "auto",
          display: "flex",
          gap: 3,
          alignItems: "center",
        }}
      >
        {[0, 8, 16].map((offset) => (
          <div
            key={offset}
            style={{
              width: 4,
              height: 4,
              borderRadius: "50%",
              background: color,
              opacity: dotFrame >= offset && dotFrame < offset + 12 ? 1 : 0.3,
            }}
          />
        ))}
      </div>
    );
  }

  return null;
}

function Arrow({
  fromX,
  fromY,
  toX,
  toY,
  color,
  frame,
  startFrame,
}: {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  color: string;
  frame: number;
  startFrame: number;
}) {
  const progress = clamp(frame, startFrame, startFrame + 20, 0, 1, Easing.out(Easing.ease));

  const dx = toX - fromX;
  const dy = toY - fromY;
  const len = Math.sqrt(dx * dx + dy * dy);
  const currentLen = len * progress;
  const endX = fromX + (dx / len) * currentLen;
  const endY = fromY + (dy / len) * currentLen;

  if (progress === 0) return null;

  return (
    <svg
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      width="100%"
      height="100%"
    >
      <defs>
        <marker
          id={`arrow-${color.replace("#", "")}`}
          markerWidth="6"
          markerHeight="6"
          refX="5"
          refY="3"
          orient="auto"
        >
          <path d="M0,0 L6,3 L0,6 Z" fill={color} opacity={0.7} />
        </marker>
      </defs>
      <line
        x1={fromX}
        y1={fromY}
        x2={endX}
        y2={endY}
        stroke={color}
        strokeWidth={1.5}
        strokeDasharray="4 3"
        opacity={0.6}
        markerEnd={progress > 0.9 ? `url(#arrow-${color.replace("#", "")})` : undefined}
      />
    </svg>
  );
}

function SuccessBanner({ frame }: { frame: number }) {
  const opacity = clamp(frame, 128, 142, 0, 1, Easing.out(Easing.ease));
  const y = clamp(frame, 128, 142, 12, 0, Easing.out(Easing.back(1.2)));

  return (
    <div
      style={{
        opacity,
        transform: `translateY(${y}px)`,
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: `linear-gradient(135deg, ${C.emerald}20, ${C.emerald}08)`,
        border: `1px solid ${C.emerald}50`,
        borderRadius: 12,
        padding: "10px 20px",
        boxShadow: `0 0 24px ${C.emerald}20`,
      }}
    >
      <span style={{ fontSize: 20 }}>🎉</span>
      <div>
        <div style={{ color: C.emerald, fontWeight: 700, fontSize: 14 }}>
          Posted! 3 platforms
        </div>
        <div style={{ color: C.muted, fontSize: 12 }}>
          2,400 estimated reach • 0 errors
        </div>
      </div>
      <div
        style={{
          marginLeft: "auto",
          background: `${C.emerald}20`,
          border: `1px solid ${C.emerald}40`,
          borderRadius: 8,
          padding: "4px 10px",
          color: C.emerald,
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        2.4k reach
      </div>
    </div>
  );
}

// ─── Main composition ─────────────────────────────────────────────────────────

export const SocialForgeDemo: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  // Layout constants (relative to 1200×675)
  const cardX = 60;
  const cardY = 180;
  const cardCenterX = cardX + 160;
  const cardCenterY = cardY + 80;

  const platformStartX = width - 240;
  const platformPositions = [
    { x: platformStartX + 80, y: 190 },
    { x: platformStartX + 80, y: 250 },
    { x: platformStartX + 80, y: 310 },
  ];

  return (
    <AbsoluteFill
      style={{
        backgroundColor: C.bg,
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
        overflow: "hidden",
      }}
    >
      {/* Background glow orbs */}
      <div
        style={{
          position: "absolute",
          top: -100,
          left: -100,
          width: 400,
          height: 400,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${C.violet}18 0%, transparent 70%)`,
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: -80,
          right: 100,
          width: 300,
          height: 300,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${C.emerald}10 0%, transparent 70%)`,
          pointerEvents: "none",
        }}
      />

      {/* Arrows (drawn on as SVG overlaid on full canvas) */}
      {PLATFORMS.map((p, i) => (
        <Arrow
          key={p.name}
          fromX={cardCenterX + 160}
          fromY={cardCenterY}
          toX={platformPositions[i].x - 80}
          toY={platformPositions[i].y}
          color={p.color}
          frame={frame}
          startFrame={90 + i * 8}
        />
      ))}

      {/* Top bar */}
      <div
        style={{
          position: "absolute",
          top: 28,
          left: 40,
          right: 40,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Logo frame={frame} />
        <div
          style={{
            opacity: clamp(frame, 5, 22, 0, 1),
            background: `${C.violet}20`,
            border: `1px solid ${C.violet}40`,
            borderRadius: 20,
            padding: "5px 14px",
            color: C.violetLight,
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          🤖 AI Studio
        </div>
      </div>

      {/* AI Card (left side) */}
      <div
        style={{
          position: "absolute",
          left: cardX,
          top: cardY,
        }}
      >
        <AICard frame={frame} />
      </div>

      {/* Platform pills (right side) */}
      <div
        style={{
          position: "absolute",
          right: 40,
          top: 170,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {PLATFORMS.map((p) => (
          <PlatformPill key={p.name} {...p} frame={frame} />
        ))}
      </div>

      {/* Center label */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          textAlign: "center",
          opacity: clamp(frame, 60, 78, 0, 1),
        }}
      >
        <div style={{ color: C.muted, fontSize: 11, fontWeight: 600, letterSpacing: 2 }}>
          DISTRIBUTING TO
        </div>
        <div
          style={{
            color: C.violetLight,
            fontSize: 24,
            fontWeight: 800,
            marginTop: 4,
          }}
        >
          3 platforms
        </div>
      </div>

      {/* Success banner (bottom) */}
      <div
        style={{
          position: "absolute",
          bottom: 36,
          left: 40,
          right: 40,
        }}
      >
        <SuccessBanner frame={frame} />
      </div>
    </AbsoluteFill>
  );
};
