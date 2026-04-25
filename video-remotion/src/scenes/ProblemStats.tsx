import React from "react";
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, FONTS, TYPE } from "../theme";

/**
 * Scene 2 · 0:19–0:42 · Cost cross-out
 *
 * Port direct de la scene `cost-cross-out` de aria-hyperframes-archive (GSAP timeline ~ligne 2207).
 * Storyboard relatif au début de la scene (0 = 0:19 absolu) :
 *   +0.0  eyebrow "The reason nobody has it" descend
 *   +1.5  "$500,000" slams in (y:80 -> 0)
 *   +3.5  "2 YEARS" rises under it (predictive ROI horizon, source: logicline.de)
 *   +5.5  red strike sweeps across $500,000 (left -> right, scaleX 0 -> 1)
 *   +6.3  red strike sweeps across 2 YEARS
 *   +8.0  figures recede (opacity 0.15 + scale 0.5), "95%" reveal in cyan
 *   +8.4  subline fades in "of plants don't have it. They wait for things to break."
 *   +10.5 fade out
 *
 * Durée totale : 23s @ 30fps = 690 frames (post smash-cut pivot J-1).
 * On garde les beats principaux à leur rythme (1 GSAP second = 1 vrai beat),
 * et on compresse uniquement les holds finaux pour gagner les 2s.
 */

const SCALE_FRAMES = 690 / 11; // ~62.7 frames per "GSAP second" (was 68 on 750f)
const t = (sec: number) => Math.round(sec * SCALE_FRAMES);

export const ProblemStats: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Eyebrow : fade-in at 0, then stays
  const eyebrowOpacity = interpolate(frame, [0, t(0.6)], [0, 1], {
    extrapolateRight: "clamp",
  });
  const eyebrowY = interpolate(frame, [0, t(0.6)], [-10, 0], {
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  // $500,000 slams in at +1.5s
  const moneySpring = spring({
    frame: frame - t(1.5),
    fps,
    config: { damping: 12, stiffness: 100, mass: 0.8 },
  });
  const moneyY = interpolate(moneySpring, [0, 1], [80, 0]);

  // 2 YEARS at +3.5s (predictive ROI horizon)
  const monthsSpring = spring({
    frame: frame - t(3.5),
    fps,
    config: { damping: 14, stiffness: 110, mass: 0.7 },
  });
  const monthsY = interpolate(monthsSpring, [0, 1], [40, 0]);

  // Strike on $500,000 at +5.5s
  const strikeMoney = interpolate(
    frame,
    [t(5.5), t(6.3)],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.exp),
    },
  );

  // Strike on 2 YEARS at +6.3s
  const strikeMonths = interpolate(
    frame,
    [t(6.3), t(7.1)],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.exp),
    },
  );

  // Stage B at +8.0s : figures recede
  const figuresOpacity = interpolate(
    frame,
    [t(8.0), t(8.6)],
    [1, 0.15],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const figuresScale = interpolate(
    frame,
    [t(8.0), t(8.6)],
    [1, 0.55],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // 95% reveal at +8.0s
  const percentSpring = spring({
    frame: frame - t(8.0),
    fps,
    config: { damping: 9, stiffness: 80, mass: 1 },
  });
  const percentScale = interpolate(percentSpring, [0, 1], [0.85, 1]);
  const percentOpacity = interpolate(
    frame,
    [t(8.0), t(8.6)],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // Subline at +8.4s
  const sublineOpacity = interpolate(
    frame,
    [t(8.4), t(9.0)],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const sublineY = interpolate(
    frame,
    [t(8.4), t(9.0)],
    [16, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) },
  );

  // Fade-out scene at +10.5s
  const sceneOpacity = interpolate(
    frame,
    [t(10.5), t(11)],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <AbsoluteFill
      style={{
        backgroundColor: COLORS.cream,
        opacity: sceneOpacity,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Eyebrow */}
      <div
        style={{
          position: "absolute",
          top: 140,
          left: "50%",
          transform: `translate(-50%, ${eyebrowY}px)`,
          opacity: eyebrowOpacity,
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            backgroundColor: COLORS.signalOrange,
          }}
        />
        <span
          style={{
            ...TYPE.eyebrow,
            color: COLORS.slate,
            fontSize: 18,
          }}
        >
          THE REASON NOBODY HAS IT
        </span>
      </div>

      {/* Stage A : figures stack */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: `translate(-50%, -50%) scale(${figuresScale})`,
          opacity: figuresOpacity,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 20,
        }}
      >
        {/* $500,000 — major */}
        <div style={{ position: "relative", overflow: "visible" }}>
          <span
            style={{
              fontFamily: FONTS.display,
              fontSize: 200,
              fontWeight: 600,
              letterSpacing: "-0.04em",
              color: COLORS.ink,
              transform: `translateY(${moneyY}px)`,
              opacity: moneySpring,
              display: "inline-block",
              lineHeight: 1,
            }}
          >
            $500,000
          </span>
          {/* Strike */}
          <span
            style={{
              position: "absolute",
              top: "50%",
              left: -10,
              right: -10,
              height: 12,
              backgroundColor: COLORS.destructiveRed,
              transform: `translateY(-50%) scaleX(${strikeMoney})`,
              transformOrigin: "left center",
              borderRadius: 6,
            }}
          />
        </div>

        {/* 2 YEARS — minor (predictive ROI horizon) */}
        <div style={{ position: "relative", overflow: "visible" }}>
          <span
            style={{
              fontFamily: FONTS.display,
              fontSize: 110,
              fontWeight: 500,
              letterSpacing: "-0.02em",
              color: COLORS.charcoal,
              transform: `translateY(${monthsY}px)`,
              opacity: monthsSpring,
              display: "inline-block",
              lineHeight: 1,
              textTransform: "uppercase",
            }}
          >
            2 YEARS
          </span>
          <span
            style={{
              position: "absolute",
              top: "50%",
              left: -8,
              right: -8,
              height: 8,
              backgroundColor: COLORS.destructiveRed,
              transform: `translateY(-50%) scaleX(${strikeMonths})`,
              transformOrigin: "left center",
              borderRadius: 4,
            }}
          />
        </div>
      </div>

      {/* Stage B : 95% in cyan + subline */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: `translate(-50%, -50%) scale(${percentScale})`,
          opacity: percentOpacity,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 24,
        }}
      >
        <span
          style={{
            fontFamily: FONTS.display,
            fontSize: 280,
            fontWeight: 700,
            letterSpacing: "-0.05em",
            color: COLORS.sandboxCyan,
            lineHeight: 1,
          }}
        >
          95%
        </span>
        <span
          style={{
            ...TYPE.h2,
            color: COLORS.ink,
            opacity: sublineOpacity,
            transform: `translateY(${sublineY}px)`,
            textAlign: "center",
            maxWidth: 1100,
          }}
        >
          of plants <strong style={{ color: COLORS.signalOrange }}>don't have it.</strong>{" "}
          They wait for things to break.
        </span>
      </div>
    </AbsoluteFill>
  );
};
