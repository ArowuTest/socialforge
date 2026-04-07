"use client";

/**
 * HeroDemoPlayer — wraps the HeroDemo Remotion composition for the landing page hero.
 * Client-only via dynamic import from page.tsx (ssr: false).
 */
import React from "react";
import { Player } from "@remotion/player";
import { HeroDemo } from "@/remotion/HeroDemo";

export default function HeroDemoPlayer() {
  return (
    <Player
      component={HeroDemo}
      durationInFrames={210}
      fps={30}
      compositionWidth={1200}
      compositionHeight={675}
      style={{ width: "100%", display: "block" }}
      loop
      autoPlay
      controls={false}
      clickToPlay={false}
    />
  );
}
