"use client";

/**
 * AIStudioPlayer — wraps the AIStudioDemo Remotion composition.
 * Client-only via dynamic import from page.tsx (ssr: false).
 */
import React from "react";
import { Player } from "@remotion/player";
import { AIStudioDemo } from "@/remotion/AIStudioDemo";

export default function AIStudioPlayer() {
  return (
    <Player
      component={AIStudioDemo}
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
