/**
 * HeroDemo — 7-second looping product demo for SocialForge landing page.
 *
 * 0-25f    Dark bg, "SocialForge AI Studio" label + violet orb pulses
 * 25-60f   Text editor card slides up, cursor blinks, text types out
 * 60-80f   "Generating with GPT-4o…" spinner (3 violet dots)
 * 80-110f  "✓ Generated!" + 8 platform icons spring in with stagger
 * 110-150f "Scheduling…" calendar view + progress bar fills
 * 150-185f "All posted! 🎉" success screen with stat counters
 * 185-210f Fade out hold for seamless loop
 *
 * Every animation is driven by useCurrentFrame() — no CSS transitions,
 * no setTimeout, no Math.random(). Safe for Remotion's non-sequential renderer.
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
  violetGlow: "rgba(124,58,237,0.3)",
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

// ─── Scene 1: Intro label + pulsing orb (0-25) ───────────────────────────────
function IntroScene({ frame }: { frame: number }) {
  const labelOpacity = ci(frame, 0, 20, 0, 1, Easing.out(Easing.ease));
  const labelY = ci(frame, 0, 20, -12, 0, Easing.out(Easing.ease));

  // Orb pulse: gentle scale oscillation
  const orbPulse = 1 + 0.06 * Math.sin((frame / 15) * Math.PI);
  const orbOpacity = ci(frame, 0, 20, 0, 1);

  return (
    <>
      {/* Top-left label */}
      <div
        style={{
          position: "absolute",
          top: 32,
          left: 44,
          opacity: labelOpacity,
          transform: `translateY(${labelY}px)`,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 9,
            background: `linear-gradient(135deg, ${C.violet}, #4f46e5)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: `0 0 18px ${C.violetGlow}`,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          </svg>
        </div>
        <span
          style={{
            color: C.text,
            fontWeight: 700,
            fontSize: 18,
            letterSpacing: -0.3,
          }}
        >
          SocialForge AI Studio
        </span>
      </div>

      {/* Central glowing orb */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: `translate(-50%, -50%) scale(${orbPulse})`,
          opacity: orbOpacity,
          width: 200,
          height: 200,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${C.violet}60 0%, ${C.violet}20 40%, transparent 70%)`,
          boxShadow: `0 0 80px ${C.violetGlow}, 0 0 140px ${C.violet}20`,
        }}
      />
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: `translate(-50%, -50%) scale(${orbPulse})`,
          opacity: orbOpacity * 0.6,
          width: 80,
          height: 80,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${C.violetLight} 0%, ${C.violet} 60%)`,
          boxShadow: `0 0 40px ${C.violet}`,
        }}
      />
    </>
  );
}

// ─── Scene 2: Text editor card slides up + typewriter (25-60) ────────────────
function EditorCard({ frame }: { frame: number }) {
  const { fps } = useVideoConfig();

  const cardSlide = spring({
    fps,
    frame: frame - 25,
    config: { damping: 70, stiffness: 120 },
    durationInFrames: 30,
  });
  const cardY = interpolate(cardSlide, [0, 1], [80, 0]);
  const cardOpacity = ci(frame, 25, 40, 0, 1);

  const fullPrompt = "Write a post about our new AI feature launch";
  const charCount = Math.floor(ci(frame, 35, 58, 0, fullPrompt.length));
  const visibleText = fullPrompt.slice(0, charCount);
  const showCursor = frame >= 35 && frame < 80 && Math.floor(frame / 7) % 2 === 0;

  // Typewriter output text (frame 40-75 range)
  const outputText = "🚀 Big news! SocialForge just launched...";
  const outputCharCount = Math.floor(ci(frame, 45, 78, 0, outputText.length));
  const visibleOutput = outputText.slice(0, outputCharCount);
  const outputOpacity = ci(frame, 44, 50, 0, 1);

  // Glow intensifies when generating
  const glowOpacity = ci(frame, 55, 70, 0, 1);

  return (
    <div
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: `translate(-50%, -50%) translateY(${cardY}px)`,
        opacity: cardOpacity,
        width: 520,
      }}
    >
      {/* Card glow */}
      <div
        style={{
          position: "absolute",
          inset: -24,
          background: `radial-gradient(ellipse at center, ${C.violet}30 0%, transparent 70%)`,
          borderRadius: 28,
          opacity: glowOpacity,
        }}
      />
      <div
        style={{
          background: C.card,
          border: `1px solid ${C.cardBorder}`,
          borderRadius: 16,
          padding: "24px 28px",
          position: "relative",
          boxShadow: `0 24px 60px rgba(0,0,0,0.5)`,
        }}
      >
        {/* Editor chrome dots */}
        <div
          style={{
            display: "flex",
            gap: 6,
            marginBottom: 16,
            alignItems: "center",
          }}
        >
          {["#ef4444", "#f59e0b", "#22c55e"].map((color, i) => (
            <div
              key={i}
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: color,
                opacity: 0.7,
              }}
            />
          ))}
          <span
            style={{
              marginLeft: 8,
              color: C.muted,
              fontSize: 12,
              fontWeight: 500,
            }}
          >
            AI Content Editor
          </span>
        </div>

        {/* Prompt input */}
        <div
          style={{
            background: "#0d1526",
            border: `1px solid ${C.cardBorder}`,
            borderRadius: 10,
            padding: "12px 16px",
            marginBottom: 14,
          }}
        >
          <div
            style={{
              color: C.muted,
              fontSize: 11,
              fontWeight: 600,
              marginBottom: 6,
              letterSpacing: 0.5,
            }}
          >
            PROMPT
          </div>
          <div
            style={{
              color: C.text,
              fontSize: 14,
              fontFamily: "monospace",
              minHeight: 20,
            }}
          >
            {visibleText}
            {showCursor && frame < 60 && (
              <span style={{ color: C.violetLight, fontWeight: 700 }}>|</span>
            )}
          </div>
        </div>

        {/* Output area */}
        <div
          style={{
            background: "#060f1e",
            border: `1px solid ${C.violet}30`,
            borderRadius: 10,
            padding: "12px 16px",
            opacity: outputOpacity,
            minHeight: 56,
          }}
        >
          <div
            style={{
              color: C.violetLight,
              fontSize: 11,
              fontWeight: 600,
              marginBottom: 6,
              letterSpacing: 0.5,
            }}
          >
            OUTPUT
          </div>
          <div
            style={{
              color: C.text,
              fontSize: 14,
              fontFamily: "monospace",
            }}
          >
            {visibleOutput}
            {frame >= 44 && frame < 80 && Math.floor(frame / 7) % 2 === 0 && (
              <span style={{ color: C.emerald, fontWeight: 700 }}>|</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Scene 3: Generating spinner (60-80) ─────────────────────────────────────
function GeneratingSpinner({ frame }: { frame: number }) {
  const opacity = ci(frame, 60, 70, 0, 1, Easing.out(Easing.ease));
  const exitOpacity = ci(frame, 75, 82, 1, 0);
  const combined = Math.min(opacity, exitOpacity);

  const dotFrames = [0, 8, 16];

  return (
    <div
      style={{
        position: "absolute",
        bottom: 160,
        left: "50%",
        transform: "translateX(-50%)",
        opacity: combined,
        display: "flex",
        alignItems: "center",
        gap: 12,
        background: `${C.violet}18`,
        border: `1px solid ${C.violet}40`,
        borderRadius: 24,
        padding: "10px 20px",
      }}
    >
      <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
        {dotFrames.map((offset) => {
          const cycleFrame = (frame - 60) % 24;
          const isActive = cycleFrame >= offset && cycleFrame < offset + 12;
          return (
            <div
              key={offset}
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: C.violetLight,
                opacity: isActive ? 1 : 0.25,
                transform: `scale(${isActive ? 1.2 : 1})`,
              }}
            />
          );
        })}
      </div>
      <span style={{ color: C.violetLight, fontSize: 13, fontWeight: 600 }}>
        Generating with GPT-4o...
      </span>
    </div>
  );
}

// ─── Scene 4: Platform grid with checkmarks (80-110) ─────────────────────────
const PLATFORMS = [
  { emoji: "📸", name: "Instagram", color: C.instagram },
  { emoji: "🎵", name: "TikTok", color: C.tiktok },
  { emoji: "📺", name: "YouTube", color: C.youtube },
  { emoji: "💼", name: "LinkedIn", color: C.linkedin },
  { emoji: "🐦", name: "Twitter/X", color: C.twitter },
  { emoji: "👥", name: "Facebook", color: "#1877f2" },
  { emoji: "📌", name: "Pinterest", color: "#e60023" },
  { emoji: "🧵", name: "Threads", color: "#aaaaaa" },
];

function PlatformGrid({ frame }: { frame: number }) {
  const { fps } = useVideoConfig();

  const headerOpacity = ci(frame, 80, 90, 0, 1);
  const headerY = ci(frame, 80, 92, -10, 0, Easing.out(Easing.ease));

  return (
    <div
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: 560,
      }}
    >
      {/* Header */}
      <div
        style={{
          textAlign: "center",
          marginBottom: 20,
          opacity: headerOpacity,
          transform: `translateY(${headerY}px)`,
        }}
      >
        <div
          style={{
            color: C.emerald,
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: 0.5,
          }}
        >
          ✓ Generated! Optimizing for 8 platforms...
        </div>
      </div>

      {/* 4-column grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 10,
        }}
      >
        {PLATFORMS.map((p, i) => {
          const delay = i * 4;
          const startFrame = 83 + delay;
          const spr = spring({
            fps,
            frame: frame - startFrame,
            config: { damping: 60, stiffness: 180 },
            durationInFrames: 20,
          });
          const scale = interpolate(spr, [0, 1], [0.6, 1]);
          const opacity = ci(frame, startFrame, startFrame + 10, 0, 1);
          const checkOpacity = ci(frame, startFrame + 8, startFrame + 14, 0, 1);
          const checkScale = spring({
            fps,
            frame: frame - (startFrame + 8),
            config: { damping: 50, stiffness: 200 },
            durationInFrames: 15,
          });

          return (
            <div
              key={p.name}
              style={{
                background: C.card,
                border: `1px solid ${p.color}40`,
                borderRadius: 12,
                padding: "12px 10px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 6,
                opacity,
                transform: `scale(${scale})`,
                position: "relative",
                boxShadow: `0 0 20px ${p.color}15`,
              }}
            >
              <span style={{ fontSize: 22 }}>{p.emoji}</span>
              <span
                style={{
                  color: C.text,
                  fontSize: 10,
                  fontWeight: 600,
                  textAlign: "center",
                }}
              >
                {p.name}
              </span>
              {/* Checkmark badge */}
              <div
                style={{
                  position: "absolute",
                  top: -5,
                  right: -5,
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  background: C.emerald,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: checkOpacity,
                  transform: `scale(${checkScale})`,
                  fontSize: 10,
                  fontWeight: 700,
                  color: "#020617",
                  boxShadow: `0 0 8px ${C.emerald}`,
                }}
              >
                ✓
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Scene 5: Scheduling calendar + progress bar (110-150) ───────────────────
const CALENDAR_DOTS = [
  { col: 1, row: 1, color: C.instagram },
  { col: 3, row: 0, color: C.twitter },
  { col: 4, row: 1, color: C.linkedin },
  { col: 0, row: 2, color: C.tiktok },
  { col: 2, row: 2, color: "#1877f2" },
  { col: 5, row: 1, color: C.youtube },
  { col: 1, row: 3, color: "#e60023" },
  { col: 4, row: 3, color: "#aaaaaa" },
];
const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

function SchedulingScene({ frame }: { frame: number }) {
  const { fps } = useVideoConfig();

  const opacity = ci(frame, 110, 122, 0, 1, Easing.out(Easing.ease));
  const slideY = ci(frame, 110, 122, 20, 0, Easing.out(Easing.ease));

  const progressWidth = ci(frame, 115, 148, 0, 100);

  return (
    <div
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: `translate(-50%, -50%) translateY(${slideY}px)`,
        opacity,
        width: 500,
      }}
    >
      <div
        style={{
          background: C.card,
          border: `1px solid ${C.cardBorder}`,
          borderRadius: 16,
          padding: "24px 28px",
          boxShadow: "0 24px 60px rgba(0,0,0,0.4)",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 20,
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: `${C.blue}20`,
              border: `1px solid ${C.blue}40`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 14,
            }}
          >
            📅
          </div>
          <div>
            <div
              style={{
                color: C.text,
                fontSize: 14,
                fontWeight: 700,
              }}
            >
              Scheduling posts...
            </div>
            <div style={{ color: C.muted, fontSize: 11 }}>
              Optimal times selected by AI
            </div>
          </div>
        </div>

        {/* Mini calendar */}
        <div style={{ marginBottom: 20 }}>
          {/* Day headers */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              marginBottom: 8,
              gap: 2,
            }}
          >
            {DAY_LABELS.map((d, i) => (
              <div
                key={i}
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

          {/* 4 rows × 7 days */}
          {[0, 1, 2, 3].map((row) => (
            <div
              key={row}
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(7, 1fr)",
                gap: 2,
                marginBottom: 2,
              }}
            >
              {[0, 1, 2, 3, 4, 5, 6].map((col) => {
                const dot = CALENDAR_DOTS.find(
                  (d) => d.col === col && d.row === row
                );
                const dotIndex = dot
                  ? CALENDAR_DOTS.indexOf(dot)
                  : -1;
                const dotOpacity =
                  dot && frame > 116 + dotIndex * 4 ? 1 : 0;
                const dotScale =
                  dot && frame > 116 + dotIndex * 4
                    ? spring({
                        fps,
                        frame: frame - (116 + dotIndex * 4),
                        config: { damping: 60, stiffness: 200 },
                        durationInFrames: 12,
                      })
                    : 0;

                return (
                  <div
                    key={col}
                    style={{
                      height: 28,
                      borderRadius: 6,
                      background: "#0d1526",
                      border: `1px solid ${C.cardBorder}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      position: "relative",
                    }}
                  >
                    <div
                      style={{
                        color: C.muted,
                        fontSize: 9,
                        position: "absolute",
                        top: 3,
                        left: 4,
                      }}
                    >
                      {row * 7 + col + 1}
                    </div>
                    {dot && (
                      <div
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: dot.color,
                          opacity: dotOpacity,
                          transform: `scale(${dotScale})`,
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

        {/* Progress bar */}
        <div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: 6,
            }}
          >
            <span style={{ color: C.muted, fontSize: 11 }}>
              Scheduling progress
            </span>
            <span style={{ color: C.violetLight, fontSize: 11, fontWeight: 700 }}>
              {Math.round(progressWidth)}%
            </span>
          </div>
          <div
            style={{
              height: 6,
              borderRadius: 3,
              background: C.cardBorder,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${progressWidth}%`,
                background: `linear-gradient(90deg, ${C.violet}, ${C.violetLight})`,
                borderRadius: 3,
                boxShadow: `0 0 10px ${C.violet}80`,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Scene 6: Success screen with stats (150-185) ────────────────────────────
function SuccessScene({ frame }: { frame: number }) {
  const { fps } = useVideoConfig();

  const opacity = ci(frame, 150, 162, 0, 1, Easing.out(Easing.ease));
  const scale = spring({
    fps,
    frame: frame - 150,
    config: { damping: 80, stiffness: 100 },
    durationInFrames: 30,
  });

  const STATS = [
    { value: 8, suffix: " platforms", color: C.violet, delay: 158 },
    { value: "2.4k", suffix: " est. reach", color: C.emerald, delay: 164 },
    { value: 0, suffix: " errors", color: C.blue, delay: 170 },
  ];

  return (
    <div
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: `translate(-50%, -50%) scale(${interpolate(scale, [0, 1], [0.9, 1])})`,
        opacity,
        textAlign: "center",
        width: 480,
      }}
    >
      {/* Success icon */}
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: "50%",
          background: `linear-gradient(135deg, ${C.emerald}30, ${C.emerald}10)`,
          border: `2px solid ${C.emerald}60`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 16px",
          fontSize: 32,
          boxShadow: `0 0 30px ${C.emerald}30`,
        }}
      >
        🎉
      </div>
      <div
        style={{
          color: C.text,
          fontSize: 26,
          fontWeight: 800,
          marginBottom: 6,
        }}
      >
        All posted!
      </div>
      <div
        style={{
          color: C.muted,
          fontSize: 13,
          marginBottom: 28,
        }}
      >
        Content live across all platforms
      </div>

      {/* Stats row */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: 16,
        }}
      >
        {STATS.map((stat, i) => {
          const statOpacity = ci(frame, stat.delay, stat.delay + 10, 0, 1);
          const statY = ci(
            frame,
            stat.delay,
            stat.delay + 12,
            12,
            0,
            Easing.out(Easing.ease)
          );

          return (
            <div
              key={i}
              style={{
                background: C.card,
                border: `1px solid ${stat.color}40`,
                borderRadius: 12,
                padding: "14px 18px",
                opacity: statOpacity,
                transform: `translateY(${statY}px)`,
                boxShadow: `0 0 20px ${stat.color}15`,
              }}
            >
              <div
                style={{
                  color: stat.color,
                  fontSize: 24,
                  fontWeight: 800,
                  lineHeight: 1,
                }}
              >
                {stat.value}
              </div>
              <div
                style={{ color: C.muted, fontSize: 11, marginTop: 4 }}
              >
                {stat.suffix}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Background decoration ────────────────────────────────────────────────────
function Background({ frame }: { frame: number }) {
  const pulse = 0.5 + 0.5 * Math.sin((frame / 40) * Math.PI);

  return (
    <>
      {/* Top-left violet glow */}
      <div
        style={{
          position: "absolute",
          top: -120,
          left: -80,
          width: 500,
          height: 500,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${C.violet}${Math.round(pulse * 14 + 8).toString(16)} 0%, transparent 65%)`,
          pointerEvents: "none",
        }}
      />
      {/* Bottom-right emerald glow */}
      <div
        style={{
          position: "absolute",
          bottom: -100,
          right: -60,
          width: 360,
          height: 360,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${C.emerald}0e 0%, transparent 65%)`,
          pointerEvents: "none",
        }}
      />
    </>
  );
}

// ─── Main composition ─────────────────────────────────────────────────────────
export const HeroDemo: React.FC = () => {
  const frame = useCurrentFrame();

  // Global fade-out for loop hold
  const globalOpacity =
    frame >= 185 ? ci(frame, 185, 205, 1, 0, Easing.out(Easing.ease)) : 1;

  // Section visibility windows
  const showIntro = frame <= 65;
  const showEditor = frame >= 25 && frame <= 85;
  const showSpinner = frame >= 58 && frame <= 82;
  const showPlatformGrid = frame >= 78 && frame <= 115;
  const showScheduling = frame >= 108 && frame <= 155;
  const showSuccess = frame >= 148 && frame <= 186;

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
      <Background frame={frame} />

      {showIntro && <IntroScene frame={frame} />}
      {showEditor && <EditorCard frame={frame} />}
      {showSpinner && <GeneratingSpinner frame={frame} />}
      {showPlatformGrid && <PlatformGrid frame={frame} />}
      {showScheduling && <SchedulingScene frame={frame} />}
      {showSuccess && <SuccessScene frame={frame} />}
    </AbsoluteFill>
  );
};
