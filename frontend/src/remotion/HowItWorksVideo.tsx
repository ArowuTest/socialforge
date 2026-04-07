/**
 * HowItWorksVideo — 9-second looping 3-step explainer for SocialForge.
 *
 * Scene 1 (0-90f):   "Connect your socials" — platform cards slide in, phone mockup
 * Scene 2 (90-180f): "Create or Generate" — split screen, typing + AI output
 * Scene 3 (180-270f): "Schedule & Track" — calendar grid, line chart, confetti
 *
 * All animations driven by useCurrentFrame(). No CSS transitions, no Math.random().
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
  instagram: "#e1306c",
  tiktok: "#00f2ea",
  youtube: "#ff0000",
  linkedin: "#0077b5",
  twitter: "#1da1f2",
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

// Crossfade opacity between scenes
function sceneOpacity(frame: number, inStart: number, outStart: number) {
  const fadeIn = ci(frame, inStart, inStart + 12, 0, 1, Easing.out(Easing.ease));
  const fadeOut = ci(frame, outStart, outStart + 12, 1, 0, Easing.out(Easing.ease));
  return Math.min(fadeIn, fadeOut);
}

// ─── Shared background ────────────────────────────────────────────────────────
function Background({
  glowColor,
  glowX,
  glowY,
}: {
  glowColor: string;
  glowX: string;
  glowY: string;
}) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: C.bg,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: glowY,
          left: glowX,
          width: 480,
          height: 480,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${glowColor}15 0%, transparent 65%)`,
        }}
      />
    </div>
  );
}

// ─── Step number badge ────────────────────────────────────────────────────────
function StepNumber({
  number,
  color,
  frame,
  startFrame,
}: {
  number: string;
  color: string;
  frame: number;
  startFrame: number;
}) {
  const opacity = ci(frame, startFrame, startFrame + 16, 0, 1, Easing.out(Easing.ease));
  const x = ci(frame, startFrame, startFrame + 18, -20, 0, Easing.out(Easing.ease));

  return (
    <div
      style={{
        fontSize: 72,
        fontWeight: 900,
        color,
        opacity: opacity * 0.25,
        letterSpacing: -4,
        transform: `translateX(${x}px)`,
        lineHeight: 1,
        fontFamily: "system-ui, sans-serif",
        userSelect: "none",
      }}
    >
      {number}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCENE 1: Connect your socials (frames 0-90)
// ═══════════════════════════════════════════════════════════════════════════════

const CONNECT_PLATFORMS = [
  { name: "Instagram", emoji: "📸", color: C.instagram },
  { name: "TikTok", emoji: "🎵", color: C.tiktok },
  { name: "LinkedIn", emoji: "💼", color: C.linkedin },
  { name: "YouTube", emoji: "📺", color: C.youtube },
];

function ConnectPlatformCard({
  platform,
  index,
  frame,
}: {
  platform: (typeof CONNECT_PLATFORMS)[0];
  index: number;
  frame: number;
}) {
  const { fps } = useVideoConfig();
  const delay = 20 + index * 10;

  const spr = spring({
    fps,
    frame: frame - delay,
    config: { damping: 70, stiffness: 150 },
    durationInFrames: 24,
  });
  const x = interpolate(spr, [0, 1], [80, 0]);
  const opacity = ci(frame, delay, delay + 14, 0, 1);
  const badgeOpacity = ci(frame, delay + 16, delay + 24, 0, 1);
  const badgeScale = spring({
    fps,
    frame: frame - (delay + 16),
    config: { damping: 60, stiffness: 200 },
    durationInFrames: 14,
  });

  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${platform.color}50`,
        borderRadius: 12,
        padding: "12px 16px",
        display: "flex",
        alignItems: "center",
        gap: 10,
        opacity,
        transform: `translateX(${x}px)`,
        boxShadow: `0 0 24px ${platform.color}18`,
        position: "relative",
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: `${platform.color}20`,
          border: `1px solid ${platform.color}40`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 18,
        }}
      >
        {platform.emoji}
      </div>
      <div>
        <div style={{ color: C.text, fontSize: 13, fontWeight: 700 }}>
          {platform.name}
        </div>
        <div style={{ color: platform.color, fontSize: 11 }}>@yourhandle</div>
      </div>
      {/* Connected badge */}
      <div
        style={{
          marginLeft: "auto",
          background: `${C.emerald}18`,
          border: `1px solid ${C.emerald}40`,
          borderRadius: 20,
          padding: "3px 10px",
          display: "flex",
          alignItems: "center",
          gap: 4,
          opacity: badgeOpacity,
          transform: `scale(${badgeScale})`,
        }}
      >
        <div
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: C.emerald,
            boxShadow: `0 0 6px ${C.emerald}`,
          }}
        />
        <span style={{ color: C.emerald, fontSize: 10, fontWeight: 700 }}>
          Connected
        </span>
      </div>
    </div>
  );
}

function PhoneMockup({ frame }: { frame: number }) {
  const opacity = ci(frame, 45, 58, 0, 1, Easing.out(Easing.ease));
  const y = ci(frame, 45, 58, 20, 0, Easing.out(Easing.ease));

  return (
    <div
      style={{
        opacity,
        transform: `translateY(${y}px)`,
        width: 80,
        height: 140,
        borderRadius: 16,
        border: `2px solid ${C.cardBorder}`,
        background: C.card,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "10px 6px 6px",
        gap: 6,
        boxShadow: `0 0 30px ${C.violet}18`,
      }}
    >
      {/* Phone notch */}
      <div
        style={{
          width: 24,
          height: 4,
          borderRadius: 2,
          background: C.cardBorder,
          marginBottom: 4,
        }}
      />
      {/* Platform icons in phone */}
      {CONNECT_PLATFORMS.map((p, i) => {
        const iconOpacity = ci(frame, 52 + i * 3, 58 + i * 3, 0, 1);
        return (
          <div
            key={p.name}
            style={{
              width: "100%",
              height: 18,
              borderRadius: 4,
              background: `${p.color}30`,
              border: `1px solid ${p.color}40`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 9,
              opacity: iconOpacity,
            }}
          >
            {p.emoji}
          </div>
        );
      })}
    </div>
  );
}

function Scene1({ frame }: { frame: number }) {
  const opacity = sceneOpacity(frame, 0, 78);

  const headingOpacity = ci(frame, 8, 22, 0, 1, Easing.out(Easing.ease));
  const headingY = ci(frame, 8, 22, 14, 0, Easing.out(Easing.ease));
  const footerOpacity = ci(frame, 55, 66, 0, 1);

  return (
    <AbsoluteFill style={{ opacity }}>
      <Background glowColor={C.blue} glowX="-100px" glowY="-80px" />

      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 560,
          display: "flex",
          gap: 32,
          alignItems: "center",
        }}
      >
        {/* Left: text + cards */}
        <div style={{ flex: 1 }}>
          <StepNumber number="01" color={C.blue} frame={frame} startFrame={2} />
          <div
            style={{
              color: C.text,
              fontSize: 22,
              fontWeight: 800,
              marginBottom: 4,
              opacity: headingOpacity,
              transform: `translateY(${headingY}px)`,
              letterSpacing: -0.5,
            }}
          >
            Connect your socials
          </div>
          <div
            style={{
              color: C.muted,
              fontSize: 12,
              marginBottom: 20,
              opacity: headingOpacity,
            }}
          >
            One-click OAuth — no passwords stored
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {CONNECT_PLATFORMS.map((p, i) => (
              <ConnectPlatformCard
                key={p.name}
                platform={p}
                index={i}
                frame={frame}
              />
            ))}
          </div>
        </div>

        {/* Right: phone mockup */}
        <PhoneMockup frame={frame} />
      </div>

      {/* Footer note */}
      <div
        style={{
          position: "absolute",
          bottom: 32,
          left: "50%",
          transform: "translateX(-50%)",
          color: C.muted,
          fontSize: 12,
          opacity: footerOpacity,
          background: `${C.blue}10`,
          border: `1px solid ${C.blue}30`,
          borderRadius: 20,
          padding: "6px 18px",
        }}
      >
        OAuth in one click — no passwords stored
      </div>
    </AbsoluteFill>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCENE 2: Create or Generate (frames 90-180)
// ═══════════════════════════════════════════════════════════════════════════════

const PROMPT_TEXT = "Write a viral hook about AI...";
const AI_OUTPUT =
  "🔥 AI is not replacing humans — it's replacing humans who don't use AI. Here's what smart creators know:";
const OPTIMIZATION_BADGES = [
  { label: "280 chars for X", color: C.twitter },
  { label: "2200 chars for LinkedIn", color: C.linkedin },
  { label: "hashtags for Instagram", color: C.instagram },
];

function Scene2({ frame }: { frame: number }) {
  const { fps } = useVideoConfig();
  const localFrame = frame - 90;
  const opacity = sceneOpacity(frame, 90, 168);

  const headingOpacity = ci(localFrame, 4, 18, 0, 1, Easing.out(Easing.ease));

  // Left: typing prompt
  const promptChars = Math.floor(ci(localFrame, 12, 38, 0, PROMPT_TEXT.length));
  const showPromptCursor =
    localFrame >= 12 && localFrame < 50 && Math.floor(localFrame / 7) % 2 === 0;

  // Right: AI output appears
  const outputChars = Math.floor(ci(localFrame, 32, 70, 0, AI_OUTPUT.length));
  const outputOpacity = ci(localFrame, 30, 38, 0, 1);

  // GPT badge pulse
  const badgePulse = 0.85 + 0.15 * Math.sin((localFrame / 10) * Math.PI);
  const badgeOpacity = ci(localFrame, 28, 38, 0, 1);

  return (
    <AbsoluteFill style={{ opacity }}>
      <Background glowColor={C.emerald} glowX="60%" glowY="-40px" />

      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 620,
        }}
      >
        {/* Header */}
        <div style={{ marginBottom: 18, opacity: headingOpacity }}>
          <StepNumber number="02" color={C.emerald} frame={frame} startFrame={92} />
          <div
            style={{
              color: C.text,
              fontSize: 22,
              fontWeight: 800,
              letterSpacing: -0.5,
            }}
          >
            Create or Generate
          </div>
        </div>

        {/* Split screen */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 14,
            marginBottom: 14,
          }}
        >
          {/* Left: prompt input */}
          <div
            style={{
              background: C.card,
              border: `1px solid ${C.cardBorder}`,
              borderRadius: 12,
              padding: "16px 18px",
              boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
            }}
          >
            <div
              style={{
                color: C.muted,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: 1,
                marginBottom: 10,
              }}
            >
              YOUR PROMPT
            </div>
            <div
              style={{
                color: C.text,
                fontSize: 13,
                fontFamily: "monospace",
                lineHeight: 1.5,
                minHeight: 60,
              }}
            >
              {PROMPT_TEXT.slice(0, promptChars)}
              {showPromptCursor && (
                <span style={{ color: C.violetLight, fontWeight: 700 }}>
                  |
                </span>
              )}
            </div>
          </div>

          {/* Right: AI output */}
          <div
            style={{
              background: "#060f1e",
              border: `1px solid ${C.emerald}30`,
              borderRadius: 12,
              padding: "16px 18px",
              opacity: outputOpacity,
              boxShadow: `0 8px 32px ${C.emerald}10`,
            }}
          >
            <div
              style={{
                color: C.emerald,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: 1,
                marginBottom: 10,
              }}
            >
              AI OUTPUT
            </div>
            <div
              style={{
                color: C.text,
                fontSize: 12,
                fontFamily: "monospace",
                lineHeight: 1.5,
                minHeight: 60,
              }}
            >
              {AI_OUTPUT.slice(0, outputChars)}
              {localFrame >= 32 &&
                localFrame < 75 &&
                Math.floor(localFrame / 7) % 2 === 0 && (
                  <span
                    style={{ color: C.emerald, fontWeight: 700 }}
                  >
                    |
                  </span>
                )}
            </div>
          </div>
        </div>

        {/* GPT badge */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 14,
            opacity: badgeOpacity,
          }}
        >
          <div
            style={{
              background: `${C.violet}20`,
              border: `1px solid ${C.violet}50`,
              borderRadius: 20,
              padding: "5px 14px",
              display: "flex",
              alignItems: "center",
              gap: 6,
              transform: `scale(${badgePulse})`,
              boxShadow: `0 0 16px ${C.violet}30`,
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: C.violetLight,
                boxShadow: `0 0 8px ${C.violetLight}`,
              }}
            />
            <span
              style={{
                color: C.violetLight,
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              GPT-4o
            </span>
          </div>
          <span style={{ color: C.muted, fontSize: 11 }}>
            Powered by latest model
          </span>
        </div>

        {/* Optimization badges */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {OPTIMIZATION_BADGES.map((badge, i) => {
            const badgeDelay = 55 + i * 8;
            const bOpacity = ci(localFrame, badgeDelay, badgeDelay + 10, 0, 1);
            const bX = ci(
              localFrame,
              badgeDelay,
              badgeDelay + 12,
              -12,
              0,
              Easing.out(Easing.ease)
            );

            return (
              <div
                key={badge.label}
                style={{
                  background: `${badge.color}18`,
                  border: `1px solid ${badge.color}40`,
                  borderRadius: 20,
                  padding: "4px 12px",
                  color: badge.color,
                  fontSize: 11,
                  fontWeight: 600,
                  opacity: bOpacity,
                  transform: `translateX(${bX}px)`,
                }}
              >
                {badge.label}
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCENE 3: Schedule & Track (frames 180-270)
// ═══════════════════════════════════════════════════════════════════════════════

// Deterministic "random" dot positions for confetti
const CONFETTI = [
  { x: 0.2, y: 0.3, color: C.violet, size: 8 },
  { x: 0.8, y: 0.2, color: C.emerald, size: 6 },
  { x: 0.5, y: 0.1, color: C.pink, size: 10 },
  { x: 0.15, y: 0.7, color: C.blue, size: 7 },
  { x: 0.85, y: 0.6, color: C.instagram, size: 9 },
  { x: 0.3, y: 0.85, color: C.tiktok, size: 6 },
  { x: 0.7, y: 0.8, color: C.youtube, size: 8 },
  { x: 0.6, y: 0.4, color: C.violetLight, size: 5 },
  { x: 0.1, y: 0.45, color: C.linkedin, size: 7 },
  { x: 0.9, y: 0.4, color: C.twitter, size: 6 },
  { x: 0.45, y: 0.92, color: C.emerald, size: 9 },
  { x: 0.55, y: 0.15, color: C.pink, size: 7 },
];

const WEEK_DOTS = [
  { day: 1, time: 1, color: C.instagram },
  { day: 3, time: 0, color: C.twitter },
  { day: 2, time: 2, color: C.linkedin },
  { day: 4, time: 1, color: C.tiktok },
  { day: 0, time: 2, color: "#1877f2" },
  { day: 5, time: 0, color: C.youtube },
  { day: 1, time: 3, color: "#e60023" },
  { day: 6, time: 2, color: "#aaaaaa" },
];

const TIME_LABELS = ["9am", "12pm", "3pm", "6pm"];
const DAY_COLS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function WeekCalendar({ frame }: { frame: number }) {
  const { fps } = useVideoConfig();
  const localFrame = frame - 180;

  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.cardBorder}`,
        borderRadius: 12,
        padding: "14px 16px",
        marginBottom: 14,
      }}
    >
      {/* Day headers */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `60px repeat(7, 1fr)`,
          gap: 4,
          marginBottom: 6,
        }}
      >
        <div />
        {DAY_COLS.map((d) => (
          <div
            key={d}
            style={{
              textAlign: "center",
              color: C.muted,
              fontSize: 10,
              fontWeight: 600,
            }}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Time rows */}
      {TIME_LABELS.map((time, timeIdx) => (
        <div
          key={time}
          style={{
            display: "grid",
            gridTemplateColumns: `60px repeat(7, 1fr)`,
            gap: 4,
            marginBottom: 4,
          }}
        >
          <div
            style={{
              color: C.muted,
              fontSize: 9,
              display: "flex",
              alignItems: "center",
            }}
          >
            {time}
          </div>
          {DAY_COLS.map((_, dayIdx) => {
            const dot = WEEK_DOTS.find(
              (d) => d.day === dayIdx && d.time === timeIdx
            );
            const dotIdx = dot ? WEEK_DOTS.indexOf(dot) : -1;
            const dotVisible = dot && localFrame > 12 + dotIdx * 5;
            const dotSpr = dotVisible
              ? spring({
                  fps,
                  frame: localFrame - (12 + dotIdx * 5),
                  config: { damping: 60, stiffness: 200 },
                  durationInFrames: 14,
                })
              : 0;

            return (
              <div
                key={dayIdx}
                style={{
                  height: 22,
                  borderRadius: 4,
                  background: "#0d1526",
                  border: `1px solid ${C.cardBorder}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {dot && (
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: dot.color,
                      opacity: dotVisible ? 1 : 0,
                      transform: `scale(${dotSpr})`,
                      boxShadow: `0 0 6px ${dot.color}`,
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function LineChart({ frame }: { frame: number }) {
  const localFrame = frame - 180;
  const progress = ci(localFrame, 30, 72, 0, 1, Easing.out(Easing.ease));

  // Chart data points (normalized 0-1)
  const POINTS = [
    { x: 0, y: 0.7 },
    { x: 0.15, y: 0.55 },
    { x: 0.28, y: 0.62 },
    { x: 0.42, y: 0.38 },
    { x: 0.55, y: 0.28 },
    { x: 0.68, y: 0.18 },
    { x: 0.82, y: 0.1 },
    { x: 1, y: 0.05 },
  ];

  const W = 300;
  const H = 80;

  // Build SVG path up to current progress
  const activePoints = POINTS.filter((p) => p.x <= progress);
  if (activePoints.length < 2 && progress < 0.01) {
    return (
      <div
        style={{
          background: C.card,
          border: `1px solid ${C.cardBorder}`,
          borderRadius: 12,
          padding: "14px 16px",
          width: "100%",
          height: 110,
        }}
      />
    );
  }

  // Add interpolated end point at current progress
  const lastFull = POINTS.filter((p) => p.x <= progress);
  const nextPoint = POINTS.find((p) => p.x > progress);
  let chartPoints = [...lastFull];
  if (nextPoint && lastFull.length > 0) {
    const prev = lastFull[lastFull.length - 1];
    const t = (progress - prev.x) / (nextPoint.x - prev.x);
    chartPoints.push({ x: progress, y: prev.y + t * (nextPoint.y - prev.y) });
  }

  const toSvgX = (x: number) => x * W;
  const toSvgY = (y: number) => y * H;

  let d = chartPoints
    .map((p, i) =>
      i === 0
        ? `M ${toSvgX(p.x)} ${toSvgY(p.y)}`
        : `L ${toSvgX(p.x)} ${toSvgY(p.y)}`
    )
    .join(" ");

  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.cardBorder}`,
        borderRadius: 12,
        padding: "14px 16px",
      }}
    >
      <div
        style={{
          color: C.muted,
          fontSize: 10,
          fontWeight: 600,
          marginBottom: 8,
        }}
      >
        ENGAGEMENT OVER TIME ↑
      </div>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        {/* Area fill */}
        <defs>
          <linearGradient
            id="chartGrad"
            x1="0"
            y1="0"
            x2="0"
            y2="1"
          >
            <stop offset="0%" stopColor={C.emerald} stopOpacity={0.3} />
            <stop offset="100%" stopColor={C.emerald} stopOpacity={0} />
          </linearGradient>
        </defs>
        {chartPoints.length > 1 && (
          <path
            d={`${d} L ${toSvgX(chartPoints[chartPoints.length - 1].x)} ${H} L 0 ${H} Z`}
            fill="url(#chartGrad)"
          />
        )}
        {/* Line */}
        {chartPoints.length > 1 && (
          <path
            d={d}
            stroke={C.emerald}
            strokeWidth={2}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {/* Endpoint dot */}
        {chartPoints.length > 0 && progress > 0.05 && (
          <circle
            cx={toSvgX(chartPoints[chartPoints.length - 1].x)}
            cy={toSvgY(chartPoints[chartPoints.length - 1].y)}
            r={4}
            fill={C.emerald}
            style={{ filter: `drop-shadow(0 0 4px ${C.emerald})` }}
          />
        )}
      </svg>
    </div>
  );
}

function Scene3({ frame }: { frame: number }) {
  const localFrame = frame - 180;
  const opacity = sceneOpacity(frame, 180, 258);

  const headingOpacity = ci(localFrame, 4, 18, 0, 1, Easing.out(Easing.ease));
  const statsOpacity = ci(localFrame, 78, 88, 0, 1, Easing.out(Easing.ease));

  // Confetti scatter
  const confettiProgress = ci(localFrame, 78, 110, 0, 1, Easing.out(Easing.ease));

  return (
    <AbsoluteFill style={{ opacity }}>
      <Background glowColor={C.pink} glowX="40%" glowY="40%" />

      {/* Confetti dots */}
      {CONFETTI.map((dot, i) => {
        const angle = (i / CONFETTI.length) * Math.PI * 2;
        const dist = 200 * confettiProgress;
        const dx = Math.cos(angle) * dist;
        const dy = Math.sin(angle) * dist * 0.6;
        const startX = 600;
        const startY = 337;

        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: startX + dx * dot.x - dot.size / 2,
              top: startY + dy * dot.y - dot.size / 2,
              width: dot.size,
              height: dot.size,
              borderRadius: "50%",
              background: dot.color,
              opacity: confettiProgress * 0.7,
              boxShadow: `0 0 ${dot.size * 2}px ${dot.color}`,
            }}
          />
        );
      })}

      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 600,
        }}
      >
        {/* Header */}
        <div style={{ marginBottom: 16, opacity: headingOpacity }}>
          <StepNumber number="03" color={C.pink} frame={frame} startFrame={182} />
          <div
            style={{
              color: C.text,
              fontSize: 22,
              fontWeight: 800,
              letterSpacing: -0.5,
            }}
          >
            Schedule &amp; Track
          </div>
        </div>

        {/* Two-column: calendar + chart */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <WeekCalendar frame={frame} />
          <LineChart frame={frame} />
        </div>

        {/* Stats banner */}
        <div
          style={{
            marginTop: 14,
            background: `linear-gradient(135deg, ${C.pink}18, ${C.pink}08)`,
            border: `1px solid ${C.pink}40`,
            borderRadius: 12,
            padding: "12px 18px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            opacity: statsOpacity,
            boxShadow: `0 0 24px ${C.pink}15`,
          }}
        >
          <div>
            <div style={{ color: C.text, fontSize: 14, fontWeight: 700 }}>
              Posted to 8 platforms
            </div>
            <div style={{ color: C.muted, fontSize: 11 }}>
              47k reach this week
            </div>
          </div>
          <div
            style={{
              color: C.pink,
              fontSize: 22,
              fontWeight: 800,
            }}
          >
            ↑ 47k
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
}

// ─── Main composition ─────────────────────────────────────────────────────────
export const HowItWorksVideo: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      style={{
        backgroundColor: C.bg,
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
        overflow: "hidden",
      }}
    >
      <Scene1 frame={frame} />
      <Scene2 frame={frame} />
      <Scene3 frame={frame} />
    </AbsoluteFill>
  );
};
