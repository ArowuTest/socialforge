/**
 * AIStudioDemo — 6-second looping AI image generation demo for ChiselPost.
 *
 * 0-20f    "AI Media Studio" label appears
 * 20-50f   Prompt input types: "A professional woman using her phone in Lagos..."
 * 50-80f   "Generating with FLUX..." — shimmer loading effect + progress bar
 * 80-130f  Placeholder box reveals as a rich gradient "image" via left-to-right wipe
 * 130-160f "Image generated ✓" — 3 action buttons spring in staggered
 * 160-180f Stats appear: "Generated in 2.3s • FLUX Schnell model • $0.03 credit"
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

// ─── Content ──────────────────────────────────────────────────────────────────
const PROMPT_TEXT =
  "A professional woman using her phone in Lagos, golden hour, vibrant colors";

const ACTION_BUTTONS = [
  { label: "Use in post", color: C.violet, icon: "✨" },
  { label: "Generate variation", color: C.blue, icon: "🔄" },
  { label: "Download", color: C.emerald, icon: "⬇" },
];

// ─── Phase 1: Studio label (0-20) ────────────────────────────────────────────
function StudioLabel({ frame }: { frame: number }) {
  const opacity = ci(frame, 0, 16, 0, 1, Easing.out(Easing.ease));
  const y = ci(frame, 0, 16, -12, 0, Easing.out(Easing.ease));

  return (
    <div
      style={{
        position: "absolute",
        top: 34,
        left: "50%",
        transform: `translateX(-50%) translateY(${y}px)`,
        opacity,
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
          fontSize: 16,
        }}
      >
        🎨
      </div>
      <span
        style={{
          color: C.text,
          fontWeight: 700,
          fontSize: 18,
          letterSpacing: -0.3,
        }}
      >
        AI Media Studio
      </span>
      <div
        style={{
          background: `${C.violet}20`,
          border: `1px solid ${C.violet}40`,
          borderRadius: 20,
          padding: "3px 10px",
          color: C.violetLight,
          fontSize: 11,
          fontWeight: 600,
        }}
      >
        FLUX Schnell
      </div>
    </div>
  );
}

// ─── Phase 2: Prompt input (20-50) ────────────────────────────────────────────
function PromptInput({ frame }: { frame: number }) {
  const cardOpacity = ci(frame, 20, 32, 0, 1, Easing.out(Easing.ease));
  const cardY = ci(frame, 20, 32, 18, 0, Easing.out(Easing.ease));

  const charCount = Math.floor(ci(frame, 26, 50, 0, PROMPT_TEXT.length));
  const showCursor =
    frame >= 26 && frame < 52 && Math.floor(frame / 7) % 2 === 0;

  return (
    <div
      style={{
        position: "absolute",
        top: 100,
        left: "50%",
        transform: `translateX(-50%) translateY(${cardY}px)`,
        opacity: cardOpacity,
        width: 600,
      }}
    >
      <div
        style={{
          background: C.card,
          border: `1px solid ${C.cardBorder}`,
          borderRadius: 14,
          padding: "18px 22px",
          boxShadow: "0 16px 48px rgba(0,0,0,0.4)",
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
          IMAGE PROMPT
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
              lineHeight: 1.5,
              minHeight: 42,
            }}
          >
            {PROMPT_TEXT.slice(0, charCount)}
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
              opacity: ci(frame, 46, 52, 0, 1),
              boxShadow: `0 0 20px ${C.violet}60`,
              whiteSpace: "nowrap",
            }}
          >
            Generate →
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Phase 3: Loading shimmer (50-80) ─────────────────────────────────────────
function LoadingShimmer({ frame }: { frame: number }) {
  const opacity = ci(frame, 50, 60, 0, 1, Easing.out(Easing.ease));
  const exitOpacity = ci(frame, 76, 84, 1, 0);
  const combined = Math.min(opacity, exitOpacity);

  // Shimmer sweep: position goes from -100% to 200% over 20 frames, cycling
  const shimmerCycle = (frame - 50) % 20;
  const shimmerX = interpolate(shimmerCycle, [0, 20], [-100, 200]);

  const progressWidth = ci(frame, 52, 78, 0, 100, Easing.out(Easing.ease));

  return (
    <div
      style={{
        position: "absolute",
        top: 210,
        left: "50%",
        transform: "translateX(-50%)",
        opacity: combined,
        width: 600,
      }}
    >
      {/* Loading header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 14,
        }}
      >
        <div style={{ display: "flex", gap: 4 }}>
          {[0, 6, 12].map((offset) => {
            const cycleFrame = (frame - 50) % 24;
            const isActive = cycleFrame >= offset && cycleFrame < offset + 12;
            return (
              <div
                key={offset}
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: C.violetLight,
                  opacity: isActive ? 1 : 0.25,
                }}
              />
            );
          })}
        </div>
        <span
          style={{ color: C.violetLight, fontSize: 13, fontWeight: 600 }}
        >
          Generating with FLUX...
        </span>
      </div>

      {/* Shimmer placeholder box */}
      <div
        style={{
          width: "100%",
          height: 240,
          borderRadius: 12,
          background: "#0d1526",
          border: `1px solid ${C.cardBorder}`,
          overflow: "hidden",
          position: "relative",
          marginBottom: 14,
        }}
      >
        {/* Shimmer sweep gradient */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: `linear-gradient(
              90deg,
              transparent 0%,
              ${C.violet}20 ${shimmerX - 20}%,
              ${C.violetLight}30 ${shimmerX}%,
              ${C.violet}20 ${shimmerX + 20}%,
              transparent 100%
            )`,
          }}
        />
        {/* Placeholder lines */}
        {[0.3, 0.5, 0.7].map((yRatio, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              top: `${yRatio * 100}%`,
              left: "10%",
              right: `${10 + i * 15}%`,
              height: 2,
              background: C.cardBorder,
              borderRadius: 1,
            }}
          />
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
            Generating high-quality image...
          </span>
          <span
            style={{ color: C.violetLight, fontSize: 11, fontWeight: 700 }}
          >
            {Math.round(progressWidth)}%
          </span>
        </div>
        <div
          style={{
            height: 4,
            borderRadius: 2,
            background: C.cardBorder,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${progressWidth}%`,
              background: `linear-gradient(90deg, ${C.violet}, ${C.violetLight})`,
              borderRadius: 2,
              boxShadow: `0 0 8px ${C.violet}80`,
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Phase 4: Image reveal (80-130) ──────────────────────────────────────────
function ImageReveal({ frame }: { frame: number }) {
  const containerOpacity = ci(frame, 80, 90, 0, 1, Easing.out(Easing.ease));

  // Left-to-right wipe: clip using width
  const revealProgress = ci(frame, 82, 126, 0, 1, Easing.out(Easing.ease));

  const successOpacity = ci(frame, 126, 136, 0, 1, Easing.out(Easing.ease));

  return (
    <div
      style={{
        position: "absolute",
        top: 210,
        left: "50%",
        transform: "translateX(-50%)",
        opacity: containerOpacity,
        width: 600,
      }}
    >
      {/* Image container with wipe reveal */}
      <div
        style={{
          width: "100%",
          height: 280,
          borderRadius: 12,
          overflow: "hidden",
          position: "relative",
          border: `1px solid ${C.violet}40`,
          boxShadow: `0 0 40px ${C.violet}25, 0 20px 60px rgba(0,0,0,0.5)`,
          marginBottom: 14,
        }}
      >
        {/* The "generated" image — rich gradient art piece */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `
              radial-gradient(ellipse at 20% 80%, #f97316 0%, transparent 50%),
              radial-gradient(ellipse at 80% 20%, #ec4899 0%, transparent 50%),
              radial-gradient(ellipse at 50% 50%, #7c3aed 0%, transparent 60%),
              linear-gradient(135deg, #1e1b4b 0%, #312e81 30%, #4c1d95 60%, #831843 100%)
            `,
          }}
        />
        {/* Subtle texture overlay */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(ellipse at 60% 70%, rgba(251,146,60,0.4) 0%, transparent 40%)",
          }}
        />
        {/* "Subject" silhouette hint */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: "35%",
            width: "30%",
            height: "85%",
            background:
              "radial-gradient(ellipse at 50% 60%, rgba(0,0,0,0.5) 0%, transparent 70%)",
            borderRadius: "50% 50% 0 0",
          }}
        />
        {/* Golden hour glow */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: "40%",
            background:
              "linear-gradient(0deg, rgba(251,146,60,0.35) 0%, transparent 100%)",
          }}
        />
        {/* Image label overlay */}
        <div
          style={{
            position: "absolute",
            top: 12,
            left: 12,
            background: "rgba(0,0,0,0.5)",
            backdropFilter: "blur(4px)",
            borderRadius: 8,
            padding: "4px 10px",
            color: "rgba(255,255,255,0.8)",
            fontSize: 10,
            fontWeight: 600,
          }}
        >
          FLUX Schnell • 1024×1024
        </div>

        {/* Wipe mask — white overlay that slides away left-to-right */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: `${revealProgress * 100}%`,
            right: 0,
            bottom: 0,
            background: "#0d1526",
            transition: "none",
          }}
        />

        {/* Wipe edge shimmer */}
        {revealProgress < 0.99 && (
          <div
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: `calc(${revealProgress * 100}% - 3px)`,
              width: 6,
              background: `linear-gradient(90deg, transparent, ${C.violetLight}80, transparent)`,
            }}
          />
        )}
      </div>

      {/* Success label */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          opacity: successOpacity,
          marginBottom: 14,
        }}
      >
        <div
          style={{
            width: 20,
            height: 20,
            borderRadius: "50%",
            background: C.emerald,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11,
            fontWeight: 700,
            color: "#020617",
            boxShadow: `0 0 10px ${C.emerald}`,
          }}
        >
          ✓
        </div>
        <span
          style={{ color: C.emerald, fontSize: 14, fontWeight: 700 }}
        >
          Image generated
        </span>
      </div>
    </div>
  );
}

// ─── Phase 5: Action buttons (130-160) ───────────────────────────────────────
function ActionButtons({ frame }: { frame: number }) {
  const { fps } = useVideoConfig();

  return (
    <div
      style={{
        position: "absolute",
        top: 536,
        left: "50%",
        transform: "translateX(-50%)",
        display: "flex",
        gap: 12,
        width: 600,
      }}
    >
      {ACTION_BUTTONS.map((btn, i) => {
        const startFrame = 132 + i * 8;
        const spr = spring({
          fps,
          frame: frame - startFrame,
          config: { damping: 60, stiffness: 180 },
          durationInFrames: 18,
        });
        const opacity = ci(frame, startFrame, startFrame + 10, 0, 1);
        const y = interpolate(spr, [0, 1], [14, 0]);

        return (
          <div
            key={btn.label}
            style={{
              flex: 1,
              background:
                i === 0
                  ? `linear-gradient(135deg, ${C.violet}, #6d28d9)`
                  : C.card,
              border:
                i === 0 ? "none" : `1px solid ${btn.color}40`,
              borderRadius: 10,
              padding: "11px 16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              opacity,
              transform: `translateY(${y}px)`,
              boxShadow:
                i === 0
                  ? `0 0 24px ${C.violet}50, 0 8px 20px rgba(0,0,0,0.3)`
                  : `0 4px 16px rgba(0,0,0,0.2)`,
            }}
          >
            <span style={{ fontSize: 14 }}>{btn.icon}</span>
            <span
              style={{
                color: i === 0 ? C.text : btn.color,
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {btn.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Phase 6: Stats footer (160-180) ─────────────────────────────────────────
function StatsFooter({ frame }: { frame: number }) {
  const opacity = ci(frame, 160, 172, 0, 1, Easing.out(Easing.ease));

  const STAT_ITEMS = [
    { icon: "⚡", text: "Generated in 2.3s" },
    { icon: "🤖", text: "FLUX Schnell model" },
    { icon: "💳", text: "$0.03 credit used" },
  ];

  return (
    <div
      style={{
        position: "absolute",
        bottom: 30,
        left: "50%",
        transform: "translateX(-50%)",
        opacity,
        display: "flex",
        gap: 20,
        alignItems: "center",
      }}
    >
      {STAT_ITEMS.map((item, i) => (
        <React.Fragment key={item.text}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              color: C.muted,
              fontSize: 12,
            }}
          >
            <span>{item.icon}</span>
            <span>{item.text}</span>
          </div>
          {i < STAT_ITEMS.length - 1 && (
            <div
              style={{
                width: 1,
                height: 14,
                background: C.cardBorder,
              }}
            />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// ─── Background ───────────────────────────────────────────────────────────────
function Background({ frame }: { frame: number }) {
  const pulse = 0.5 + 0.5 * Math.sin((frame / 35) * Math.PI);
  return (
    <>
      <div
        style={{
          position: "absolute",
          top: -80,
          left: "30%",
          width: 400,
          height: 300,
          borderRadius: "50%",
          background: `radial-gradient(ellipse, ${C.violet}${Math.round(pulse * 14 + 6).toString(16).padStart(2, "0")} 0%, transparent 70%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: -60,
          right: "20%",
          width: 280,
          height: 200,
          borderRadius: "50%",
          background: `radial-gradient(ellipse, ${C.pink}0a 0%, transparent 70%)`,
        }}
      />
    </>
  );
}

// ─── Main composition ─────────────────────────────────────────────────────────
export const AIStudioDemo: React.FC = () => {
  const frame = useCurrentFrame();

  // Global fade-out for loop
  const globalOpacity =
    frame >= 172 ? ci(frame, 172, 180, 1, 0, Easing.out(Easing.ease)) : 1;

  const showLabel = frame <= 85;
  const showPrompt = frame >= 18 && frame <= 85;
  const showShimmer = frame >= 48 && frame <= 84;
  const showReveal = frame >= 78;
  const showButtons = frame >= 128 && frame <= 175;
  const showStats = frame >= 158;

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

      {showLabel && <StudioLabel frame={frame} />}
      {showPrompt && <PromptInput frame={frame} />}
      {showShimmer && <LoadingShimmer frame={frame} />}
      {showReveal && <ImageReveal frame={frame} />}
      {showButtons && <ActionButtons frame={frame} />}
      {showStats && <StatsFooter frame={frame} />}
    </AbsoluteFill>
  );
};
