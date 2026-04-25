import React from "react";
import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { COLORS, TYPE } from "../theme";

/**
 * Scene 5 · 2:40–2:48 · Conclusion (J-1 pivot — banner.png authoritative)
 *
 * 240 frames @ 30fps = 8s. Trois beats :
 *   0   – 60   (2s) · banner.png ARIA fade in centré, scale 0.92 → 1
 *   60  – 180  (4s) · banner tient + sub-line callback "For the one machine..."
 *   180 – 240  (2s) · credits "zestones · vgtray · Anthropic Opus 4.7 Hackathon · 2026"
 *                     puis fade out global
 *
 * Le banner.png contient déjà le wordmark + tagline officiel —
 * on n'écrit donc PAS la tagline en plus en texte. Il s'auto-suffit.
 */

export const Conclusion: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Beat 1 (0-60) · Banner fade in + scale spring
  const bannerSpring = spring({
    frame: frame - 6,
    fps,
    config: { damping: 16, stiffness: 90 },
    durationInFrames: 30,
  });
  const bannerOpacity = bannerSpring;
  const bannerScale = interpolate(bannerSpring, [0, 1], [0.92, 1]);

  // Beat 2 (60-180) · Sub-line callback
  const subOpacity = interpolate(frame, [60, 96], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const subY = interpolate(frame, [60, 96], [12, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Beat 3 (180-240) · Credits
  const creditsOpacity = interpolate(frame, [180, 210], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Final fade out (last 12 frames = 0.4s)
  const sceneOpacity = interpolate(frame, [228, 240], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: COLORS.cream,
        opacity: sceneOpacity,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 40,
      }}
    >
      {/* Banner ARIA officiel — wordmark + tagline + orbit dot */}
      <Img
        src={staticFile("assets/logo/aria-banner.png")}
        style={{
          width: 880,
          height: "auto",
          opacity: bannerOpacity,
          transform: `scale(${bannerScale})`,
        }}
      />

      {/* Sub-line callback */}
      <div
        style={{
          ...TYPE.h2,
          fontSize: 32,
          color: COLORS.charcoal,
          opacity: subOpacity,
          transform: `translateY(${subY}px)`,
          textAlign: "center",
          maxWidth: 1100,
          fontWeight: 450,
          fontStyle: "italic",
          lineHeight: 1.35,
        }}
      >
        For the one machine. The one signal. And the one person who knows.
      </div>

      {/* Credits */}
      <div
        style={{
          ...TYPE.body,
          fontSize: 16,
          color: COLORS.slate,
          opacity: creditsOpacity,
          marginTop: 8,
          letterSpacing: "0.06em",
          fontFamily: TYPE.body.fontFamily,
        }}
      >
        zestones · vgtray · Anthropic Opus 4.7 Hackathon · 2026
      </div>
    </AbsoluteFill>
  );
};
