/**
 * RepurposeExplainer — 8-second looping demo of the SocialForge repurpose engine.
 *
 * 0-20f    "Repurpose Engine" title fades in with violet glow
 * 20-50f   URL input types in, button pulses
 * 50-80f   Waveform analyser + "Extracting key points..."
 * 80-160f  8 platform output cards appear staggered (every 10f) in 2-col grid
 * 160-200f Cards glow, "Ready to schedule all 8?" button pulses, savings badge
 * 200-240f Fade to stats: "1 source → 8 posts • Used by 500+ teams"
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

// ─── Platform cards content ───────────────────────────────────────────────────
const PLATFORM_CARDS = [
  {
    name: "Twitter/X",
    emoji: "🐦",
    color: C.twitter,
    text: "🔥 AI won't take your job — but someone using AI will. Here's your 5-min daily stack:",
    chars: "180 chars",
  },
  {
    name: "LinkedIn",
    emoji: "💼",
    color: C.linkedin,
    text: "I've been thinking about the future of content creation. After analyzing 10,000 posts, here's what top creators do differently...",
    chars: "1,840 chars",
  },
  {
    name: "Instagram",
    emoji: "📸",
    color: C.instagram,
    text: "POV: You just discovered how to 10x your content output without burning out 🚀\n\n#ContentCreation #AITools #CreatorEconomy",
    chars: "512 chars",
  },
  {
    name: "TikTok",
    emoji: "🎵",
    color: C.tiktok,
    text: "The content secret top creators don't want you to know... (Part 1/3) #AIcontent #viral",
    chars: "220 chars",
  },
  {
    name: "YouTube",
    emoji: "📺",
    color: C.youtube,
    text: "How I Create 30 Days of Content in 1 Hour Using AI | Full Tutorial + Templates",
    chars: "78 chars",
  },
  {
    name: "Facebook",
    emoji: "👥",
    color: "#1877f2",
    text: "Want to know how content creators are getting ahead with AI? I tried 12 different tools so you don't have to. Here's my honest breakdown...",
    chars: "960 chars",
  },
  {
    name: "Pinterest",
    emoji: "📌",
    color: "#e60023",
    text: "10 AI Content Tools That Will Transform Your Social Media Strategy in 2025",
    chars: "144 chars",
  },
  {
    name: "Threads",
    emoji: "🧵",
    color: "#aaaaaa",
    text: "Hot take: The creators winning in 2025 aren't the ones working harder. They're the ones working smarter with AI.",
    chars: "245 chars",
  },
];

const URL_TEXT = "https://youtube.com/watch?v=xyz123";
const WAVEFORM_BARS = [0.6, 0.9, 0.4, 0.75, 0.5, 0.85, 0.45, 0.7, 0.55, 0.8, 0.65, 0.4];

// ─── Phase 1: Title (0-20) ────────────────────────────────────────────────────
function TitlePhase({ frame }: { frame: number }) {
  const opacity = ci(frame, 0, 16, 0, 1, Easing.out(Easing.ease));
  const y = ci(frame, 0, 16, -16, 0, Easing.out(Easing.ease));
  const glowScale = 0.9 + 0.1 * Math.sin((frame / 12) * Math.PI);

  return (
    <div
      style={{
        position: "absolute",
        top: "42%",
        left: "50%",
        transform: `translate(-50%, -50%) translateY(${y}px)`,
        opacity,
        textAlign: "center",
      }}
    >
      {/* Glow orb */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: `translate(-50%, -50%) scale(${glowScale})`,
          width: 240,
          height: 80,
          borderRadius: "50%",
          background: `radial-gradient(ellipse, ${C.violet}40 0%, transparent 70%)`,
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "relative",
          color: C.text,
          fontSize: 32,
          fontWeight: 900,
          letterSpacing: -1,
          textShadow: `0 0 40px ${C.violet}`,
        }}
      >
        Repurpose Engine
      </div>
      <div
        style={{
          color: C.violetLight,
          fontSize: 13,
          marginTop: 6,
          fontWeight: 500,
        }}
      >
        1 source → 8 platform-ready posts
      </div>
    </div>
  );
}

// ─── Phase 2: URL input + button (20-50) ──────────────────────────────────────
function UrlInputPhase({ frame }: { frame: number }) {
  const opacity = ci(frame, 20, 32, 0, 1, Easing.out(Easing.ease));
  const y = ci(frame, 20, 32, 20, 0, Easing.out(Easing.ease));

  const urlChars = Math.floor(ci(frame, 25, 48, 0, URL_TEXT.length));
  const showCursor = frame >= 25 && frame < 52 && Math.floor(frame / 7) % 2 === 0;

  const btnPulse = 0.95 + 0.05 * Math.sin((frame / 8) * Math.PI);
  const btnOpacity = ci(frame, 44, 52, 0, 1);

  return (
    <div
      style={{
        position: "absolute",
        top: "38%",
        left: "50%",
        transform: `translate(-50%, -50%) translateY(${y}px)`,
        opacity,
        width: 540,
      }}
    >
      <div
        style={{
          background: C.card,
          border: `1px solid ${C.cardBorder}`,
          borderRadius: 14,
          padding: "20px 24px",
          boxShadow: "0 24px 60px rgba(0,0,0,0.4)",
        }}
      >
        <div
          style={{
            color: C.muted,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 1,
            marginBottom: 10,
          }}
        >
          SOURCE URL
        </div>
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
          }}
        >
          <div
            style={{
              flex: 1,
              background: "#0d1526",
              border: `1px solid ${C.cardBorder}`,
              borderRadius: 8,
              padding: "10px 14px",
              color: C.text,
              fontSize: 13,
              fontFamily: "monospace",
            }}
          >
            {URL_TEXT.slice(0, urlChars)}
            {showCursor && (
              <span style={{ color: C.violetLight, fontWeight: 700 }}>|</span>
            )}
          </div>
          <div
            style={{
              background: `linear-gradient(135deg, ${C.violet}, #6d28d9)`,
              borderRadius: 8,
              padding: "10px 18px",
              color: C.text,
              fontSize: 13,
              fontWeight: 700,
              opacity: btnOpacity,
              transform: `scale(${btnPulse})`,
              boxShadow: `0 0 20px ${C.violet}60`,
              whiteSpace: "nowrap",
            }}
          >
            Repurpose →
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Phase 3: Waveform analyser (50-80) ───────────────────────────────────────
function WaveformPhase({ frame }: { frame: number }) {
  const opacity = ci(frame, 50, 62, 0, 1, Easing.out(Easing.ease));
  const exitOpacity = ci(frame, 74, 82, 1, 0);
  const combined = Math.min(opacity, exitOpacity);

  const label1Opacity = ci(frame, 52, 62, 0, 1);
  const label2Opacity = ci(frame, 62, 72, 0, 1);

  return (
    <div
      style={{
        position: "absolute",
        top: "52%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        opacity: combined,
        textAlign: "center",
        width: 420,
      }}
    >
      <div
        style={{
          color: C.muted,
          fontSize: 13,
          fontWeight: 600,
          marginBottom: 16,
          opacity: label1Opacity,
        }}
      >
        Analysing content...
      </div>

      {/* Waveform bars */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 5,
          height: 60,
          marginBottom: 16,
        }}
      >
        {WAVEFORM_BARS.map((baseHeight, i) => {
          // Oscillate each bar at a different phase and speed using sin
          const phase = (i / WAVEFORM_BARS.length) * Math.PI * 2;
          const speed = 0.12 + (i % 3) * 0.04;
          const heightFactor =
            baseHeight * (0.5 + 0.5 * Math.sin(frame * speed + phase));
          const barH = Math.max(6, heightFactor * 56);
          const hue = (i / WAVEFORM_BARS.length) * 60; // violet to blue range
          const barColor = i % 3 === 0 ? C.violet : i % 3 === 1 ? C.violetLight : C.blue;

          return (
            <div
              key={i}
              style={{
                width: 8,
                height: barH,
                borderRadius: 4,
                background: barColor,
                opacity: 0.7 + 0.3 * heightFactor,
                boxShadow: `0 0 8px ${barColor}60`,
              }}
            />
          );
        })}
      </div>

      <div
        style={{
          color: C.violetLight,
          fontSize: 13,
          fontWeight: 600,
          opacity: label2Opacity,
        }}
      >
        Extracting key points...
      </div>
    </div>
  );
}

// ─── Phase 4: Platform cards grid (80-160) ────────────────────────────────────
function PlatformCards({ frame }: { frame: number }) {
  const { fps } = useVideoConfig();

  const gridOpacity = ci(frame, 80, 92, 0, 1);

  return (
    <div
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: 680,
        opacity: gridOpacity,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 10,
        }}
      >
        {PLATFORM_CARDS.map((card, i) => {
          const startFrame = 82 + i * 10;
          const spr = spring({
            fps,
            frame: frame - startFrame,
            config: { damping: 65, stiffness: 160 },
            durationInFrames: 22,
          });
          const y = interpolate(spr, [0, 1], [30, 0]);
          const opacity = ci(frame, startFrame, startFrame + 12, 0, 1);

          // All-glow phase (160-200)
          const glowOpacity = ci(frame, 160, 172, 0, 1);

          return (
            <div
              key={card.name}
              style={{
                background: C.card,
                border: `1px solid ${card.color}35`,
                borderRadius: 12,
                padding: "12px 14px",
                opacity,
                transform: `translateY(${y}px)`,
                boxShadow:
                  frame >= 160
                    ? `0 0 ${20 * glowOpacity}px ${card.color}40`
                    : `0 4px 16px rgba(0,0,0,0.3)`,
              }}
            >
              {/* Card header */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 8,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: card.color,
                      boxShadow: `0 0 6px ${card.color}`,
                    }}
                  />
                  <span
                    style={{
                      color: C.text,
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  >
                    {card.emoji} {card.name}
                  </span>
                </div>
                <span
                  style={{
                    background: `${card.color}20`,
                    border: `1px solid ${card.color}40`,
                    borderRadius: 10,
                    padding: "2px 8px",
                    color: card.color,
                    fontSize: 9,
                    fontWeight: 700,
                  }}
                >
                  {card.chars}
                </span>
              </div>

              {/* Card text */}
              <div
                style={{
                  color: C.muted,
                  fontSize: 10,
                  lineHeight: 1.5,
                  overflow: "hidden",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical" as const,
                }}
              >
                {card.text}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Phase 5: CTA + savings badge (160-200) ───────────────────────────────────
function CTAPhase({ frame }: { frame: number }) {
  const { fps } = useVideoConfig();

  const btnOpacity = ci(frame, 162, 172, 0, 1, Easing.out(Easing.ease));
  const btnPulse = 0.97 + 0.03 * Math.sin((frame / 10) * Math.PI);
  const btnSpr = spring({
    fps,
    frame: frame - 162,
    config: { damping: 70, stiffness: 120 },
    durationInFrames: 20,
  });

  const badgeOpacity = ci(frame, 172, 182, 0, 1, Easing.out(Easing.ease));
  const badgeSpr = spring({
    fps,
    frame: frame - 172,
    config: { damping: 60, stiffness: 160 },
    durationInFrames: 18,
  });

  const exitOpacity = ci(frame, 195, 205, 1, 0);

  return (
    <div
      style={{
        position: "absolute",
        bottom: 52,
        left: "50%",
        transform: "translateX(-50%)",
        display: "flex",
        alignItems: "center",
        gap: 14,
        opacity: Math.min(btnOpacity, exitOpacity),
      }}
    >
      {/* CTA button */}
      <div
        style={{
          background: `linear-gradient(135deg, ${C.violet}, #5b21b6)`,
          borderRadius: 12,
          padding: "12px 24px",
          color: C.text,
          fontSize: 14,
          fontWeight: 700,
          transform: `scale(${interpolate(btnSpr, [0, 1], [0.8, 1]) * btnPulse})`,
          boxShadow: `0 0 30px ${C.violet}60, 0 8px 24px rgba(0,0,0,0.4)`,
          cursor: "pointer",
        }}
      >
        Ready to schedule all 8?
      </div>

      {/* Savings badge */}
      <div
        style={{
          background: `${C.emerald}15`,
          border: `1px solid ${C.emerald}50`,
          borderRadius: 20,
          padding: "8px 16px",
          display: "flex",
          alignItems: "center",
          gap: 6,
          opacity: badgeOpacity,
          transform: `scale(${badgeSpr})`,
          boxShadow: `0 0 20px ${C.emerald}20`,
        }}
      >
        <span style={{ fontSize: 14 }}>⏱</span>
        <span style={{ color: C.emerald, fontSize: 12, fontWeight: 700 }}>
          Saved 4.2 hours of writing
        </span>
      </div>
    </div>
  );
}

// ─── Phase 6: Final stats (200-240) ───────────────────────────────────────────
function StatsPhase({ frame }: { frame: number }) {
  const opacity = ci(frame, 200, 214, 0, 1, Easing.out(Easing.ease));
  const scale = ci(frame, 200, 214, 0.9, 1, Easing.out(Easing.ease));

  return (
    <div
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: `translate(-50%, -50%) scale(${scale})`,
        opacity,
        textAlign: "center",
      }}
    >
      {/* Glow */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 400,
          height: 200,
          borderRadius: "50%",
          background: `radial-gradient(ellipse, ${C.violet}25 0%, transparent 70%)`,
        }}
      />
      <div
        style={{
          position: "relative",
          color: C.text,
          fontSize: 34,
          fontWeight: 900,
          letterSpacing: -1,
          marginBottom: 10,
        }}
      >
        1 source → 8 posts
      </div>
      <div
        style={{
          color: C.muted,
          fontSize: 15,
          fontWeight: 500,
        }}
      >
        Used by{" "}
        <span style={{ color: C.violetLight, fontWeight: 700 }}>500+</span>{" "}
        teams worldwide
      </div>
    </div>
  );
}

// ─── Background ───────────────────────────────────────────────────────────────
function Background({ frame }: { frame: number }) {
  const pulse = 0.5 + 0.5 * Math.sin((frame / 45) * Math.PI);
  return (
    <>
      <div
        style={{
          position: "absolute",
          top: -100,
          right: -80,
          width: 440,
          height: 440,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${C.violet}${Math.round(pulse * 12 + 6).toString(16).padStart(2, "0")} 0%, transparent 65%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: -80,
          left: 100,
          width: 320,
          height: 320,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${C.blue}0a 0%, transparent 65%)`,
        }}
      />
    </>
  );
}

// ─── Main composition ─────────────────────────────────────────────────────────
export const RepurposeExplainer: React.FC = () => {
  const frame = useCurrentFrame();

  const showTitle = frame <= 55;
  const showUrl = frame >= 18 && frame <= 55;
  const showWaveform = frame >= 48 && frame <= 84;
  const showCards = frame >= 78 && frame <= 205;
  const showCTA = frame >= 160 && frame <= 205;
  const showStats = frame >= 198;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: C.bg,
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
        overflow: "hidden",
      }}
    >
      <Background frame={frame} />

      {showTitle && <TitlePhase frame={frame} />}
      {showUrl && <UrlInputPhase frame={frame} />}
      {showWaveform && <WaveformPhase frame={frame} />}
      {showCards && <PlatformCards frame={frame} />}
      {showCTA && <CTAPhase frame={frame} />}
      {showStats && <StatsPhase frame={frame} />}
    </AbsoluteFill>
  );
};
