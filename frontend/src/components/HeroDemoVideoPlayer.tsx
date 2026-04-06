"use client";

/**
 * HeroDemoVideoPlayer — client-only Remotion Player component.
 * Split into its own file so it can be dynamically imported without SSR.
 */
import React from "react";
import { Player } from "@remotion/player";
import { SocialForgeDemo } from "@/remotion/SocialForgeDemo";

export default function HeroDemoVideoPlayer() {
  return (
    <div
      style={{
        borderRadius: 16,
        overflow: "hidden",
        boxShadow: "0 0 60px rgba(124,58,237,0.2), 0 25px 60px rgba(0,0,0,0.5)",
        border: "1px solid rgba(124,58,237,0.25)",
      }}
    >
      <Player
        component={SocialForgeDemo}
        durationInFrames={150}
        fps={30}
        compositionWidth={1200}
        compositionHeight={675}
        style={{ width: "100%", display: "block" }}
        loop
        autoPlay
        controls={false}
        clickToPlay={false}
      />
    </div>
  );
}
