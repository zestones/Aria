import React from "react";
import {
  AbsoluteFill,
  interpolate,
  Series,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  Video,
} from "remotion";
import { COLORS, FONTS, TYPE } from "../theme";

/**
 * Scene 1 · 0:00–0:11 · Smash-cut hook (330 frames @ 30fps).
 *
 * 3 sub-shots assembled in `<Series>` :
 *   1.1  0   – 15   (0.5s)  black-silence       → écran noir total
 *   1.2  15  – 150  (4.5s)  industrial-opener   → stock/Veo technicien de dos
 *   1.3  150 – 330  (6.0s)  autonomy-claim      → SMASH CUT ink :
 *                                                  3 colonnes 5 / 90s / 0
 *
 * Direction éditoriale : 1 idée par sub-shot, typo qui frappe, pas de fake UI.
 * Lisible en 1 seconde. Smash cut = changement de fond (charcoal → ink).
 */
const USE_VIDEO = false;

// -----------------------------------------------------------------------------
// 1.1 · Black silence (0.5s)
// -----------------------------------------------------------------------------
const BlackSilence: React.FC = () => {
  return <AbsoluteFill style={{ backgroundColor: COLORS.ink }} />;
};

// -----------------------------------------------------------------------------
// 1.2 · Industrial opener (4.5s) — stock placeholder
// -----------------------------------------------------------------------------
const IndustrialOpener: React.FC = () => {
  const frame = useCurrentFrame();

  const pulse = interpolate(
    frame % 90,
    [0, 45, 90],
    [0.85, 1, 0.85],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  if (USE_VIDEO) {
    return (
      <AbsoluteFill style={{ backgroundColor: COLORS.charcoal }}>
        <Video src={staticFile("assets/intro-stock.mp4")} muted />
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill
      style={{
        backgroundColor: COLORS.charcoal,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 20,
      }}
    >
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at 30% 70%, rgba(207,69,0,${0.10 * pulse}) 0%, transparent 60%)`,
        }}
      />
      <div
        style={{
          ...TYPE.eyebrow,
          color: COLORS.signalOrange,
          opacity: pulse,
        }}
      >
        · STOCK / VEO PLACEHOLDER
      </div>
      <div
        style={{
          ...TYPE.h2,
          color: COLORS.cream,
          textAlign: "center",
          maxWidth: 1100,
        }}
      >
        Technicien de dos devant tableau industriel — 4.5s
      </div>
      <div
        style={{
          ...TYPE.mono,
          color: COLORS.slate,
          marginTop: 32,
          fontSize: 14,
        }}
      >
        public/assets/intro-stock.mp4 · 1920x1080 · 4.5s · ambient rising
      </div>
    </AbsoluteFill>
  );
};

// -----------------------------------------------------------------------------
// Helper : staggered spring reveal — fade + scale 0.95→1
// -----------------------------------------------------------------------------
type RevealProps = {
  frame: number;
  fps: number;
  delay: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
};

const Reveal: React.FC<RevealProps> = ({ frame, fps, delay, children, style }) => {
  const progress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 18, stiffness: 180 },
    durationInFrames: 15,
  });
  const opacity = interpolate(progress, [0, 1], [0, 1]);
  const scale = interpolate(progress, [0, 1], [0.95, 1]);
  return (
    <div
      style={{
        ...style,
        opacity,
        transform: `scale(${scale})`,
        transformOrigin: "center center",
      }}
    >
      {children}
    </div>
  );
};

// -----------------------------------------------------------------------------
// 1.3 · AutonomyClaim (6s) — SMASH CUT ink :
//       eyebrow · 3 colonnes "5 AGENTS" / "90s END-TO-END" / "0 HUMAN INPUT"
//       Statique après le stagger reveal.
// -----------------------------------------------------------------------------
type StatColumnProps = {
  frame: number;
  fps: number;
  delay: number;
  value: string;
  label: string;
  accent?: boolean;
};

const StatColumn: React.FC<StatColumnProps> = ({ frame, fps, delay, value, label, accent }) => {
  const progress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 18, stiffness: 180 },
    durationInFrames: 18,
  });
  const opacity = interpolate(progress, [0, 1], [0, 1]);
  const translateY = interpolate(progress, [0, 1], [24, 0]);
  const scale = interpolate(progress, [0, 1], [0.96, 1]);

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
        opacity,
        transform: `translateY(${translateY}px) scale(${scale})`,
        transformOrigin: "center center",
      }}
    >
      <div
        style={{
          fontFamily: FONTS.display,
          fontSize: 200,
          fontWeight: 600,
          color: accent ? COLORS.signalOrange : COLORS.cream,
          letterSpacing: "-0.04em",
          lineHeight: 0.9,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontFamily: FONTS.mono,
          fontSize: 22,
          fontWeight: 500,
          color: COLORS.dustTaupe,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
    </div>
  );
};

const AutonomyClaim: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill
      style={{
        backgroundColor: COLORS.ink,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Eyebrow top-centered */}
      <Reveal
        frame={frame}
        fps={fps}
        delay={0}
        style={{
          position: "absolute",
          top: 96,
          left: 0,
          right: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
        }}
      >
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            backgroundColor: COLORS.signalOrange,
          }}
        />
        <span
          style={{
            fontFamily: FONTS.mono,
            fontSize: 18,
            fontWeight: 500,
            color: COLORS.dustTaupe,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
          }}
        >
          HOW
        </span>
      </Reveal>

      {/* 3 columns with hairline dividers */}
      <div
        style={{
          display: "flex",
          width: 1600,
          alignItems: "stretch",
          justifyContent: "space-between",
          gap: 0,
        }}
      >
        <StatColumn frame={frame} fps={fps} delay={3} value="5" label="Agents" />
        <div style={{ width: 1, backgroundColor: COLORS.charcoal }} />
        <StatColumn frame={frame} fps={fps} delay={13} value="90s" label="End-to-end" />
        <div style={{ width: 1, backgroundColor: COLORS.charcoal }} />
        <StatColumn frame={frame} fps={fps} delay={23} value="0" label="Human input" accent />
      </div>
    </AbsoluteFill>
  );
};

// -----------------------------------------------------------------------------
// IntroHook · master series.
// -----------------------------------------------------------------------------
export const IntroHook: React.FC = () => {
  return (
    <AbsoluteFill>
      <Series>
        <Series.Sequence durationInFrames={15}>
          <BlackSilence />
        </Series.Sequence>
        <Series.Sequence durationInFrames={135}>
          <IndustrialOpener />
        </Series.Sequence>
        <Series.Sequence durationInFrames={180}>
          <AutonomyClaim />
        </Series.Sequence>
      </Series>
    </AbsoluteFill>
  );
};
