"use client";

/**
 * HowItWorksPlayer — wraps the HowItWorksVideo Remotion composition.
 * Client-only via dynamic import from page.tsx (ssr: false).
 */
import React from "react";
import { Player } from "@remotion/player";
import { HowItWorksVideo } from "@/remotion/HowItWorksVideo";

export default function HowItWorksPlayer() {
  return (
    <Player
      component={HowItWorksVideo}
      durationInFrames={240}
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
