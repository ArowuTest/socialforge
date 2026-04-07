"use client";

/**
 * RepurposePlayer — wraps the RepurposeExplainer Remotion composition.
 * Client-only via dynamic import from page.tsx (ssr: false).
 */
import React from "react";
import { Player } from "@remotion/player";
import { RepurposeExplainer } from "@/remotion/RepurposeExplainer";

export default function RepurposePlayer() {
  return (
    <Player
      component={RepurposeExplainer}
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
