import React from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  Sequence,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { COLORS, FONTS, TYPE } from "../theme";

/**
 * Scene 4 · 2:00–2:45 · 4 concepts in flow
 *
 * 1350 frames @ 30fps = 45s. Split in 4 mini-beats of 330 frames (11s) each
 * + 30 frames final hold/transition :
 *   0     – 330  · KbBuilder      : PDF realistic → vision tokens → KB graph
 *   330   – 660  · ManagedAgents  : 5-dot pentagon + MCP center + cyan particles
 *   660   – 990  · SandboxPython  : code typewriter + count-up output + cyan chip
 *   990   – 1320 · WorkOrder      : full work order card with sequential actions
 *   1320  – 1350 · final hold
 *
 * Each sub-scene is its own component — easier to iterate and to standalone-preview.
 */

const BEAT_FRAMES = 330;

export const ConceptsExplained: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.cream }}>
      <Sequence durationInFrames={BEAT_FRAMES}>
        <ConceptKB />
      </Sequence>
      <Sequence durationInFrames={BEAT_FRAMES} from={BEAT_FRAMES}>
        <ConceptManagedAgents />
      </Sequence>
      <Sequence durationInFrames={BEAT_FRAMES} from={BEAT_FRAMES * 2}>
        <ConceptSandbox />
      </Sequence>
      <Sequence durationInFrames={BEAT_FRAMES} from={BEAT_FRAMES * 3}>
        <ConceptWorkOrder />
      </Sequence>
    </AbsoluteFill>
  );
};

/* -------------------------------------------------------------------------- */
/*  Shared chrome                                                             */
/* -------------------------------------------------------------------------- */

const ConceptFrame: React.FC<{
  eyebrow: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}> = ({ eyebrow, title, subtitle, children }) => {
  const frame = useCurrentFrame();
  const intro = interpolate(frame, [0, 14], [0, 1], { extrapolateRight: "clamp" });
  const outro = interpolate(
    frame,
    [BEAT_FRAMES - 20, BEAT_FRAMES],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const opacity = Math.min(intro, outro);

  // Title slide-up subtle
  const titleY = interpolate(intro, [0, 1], [12, 0]);

  return (
    <AbsoluteFill style={{ opacity, padding: "56px 72px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          transform: `translateY(${titleY}px)`,
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
        <span style={{ ...TYPE.eyebrow, color: COLORS.signalOrange, fontSize: 14 }}>
          {eyebrow}
        </span>
      </div>
      <div
        style={{
          fontFamily: FONTS.display,
          fontSize: 68,
          fontWeight: 600,
          letterSpacing: "-0.025em",
          lineHeight: 1.05,
          color: COLORS.ink,
          marginTop: 14,
          transform: `translateY(${titleY}px)`,
        }}
      >
        {title}
      </div>
      {subtitle ? (
        <div
          style={{
            fontFamily: FONTS.mono,
            fontSize: 16,
            color: COLORS.slate,
            letterSpacing: "0.04em",
            marginTop: 8,
            transform: `translateY(${titleY}px)`,
          }}
        >
          {subtitle}
        </div>
      ) : null}
      <div style={{ flex: 1, position: "relative", marginTop: 24 }}>{children}</div>
    </AbsoluteFill>
  );
};

/* -------------------------------------------------------------------------- */
/*  4a · Knowledge Base — PDF → tokens → graph                                */
/* -------------------------------------------------------------------------- */

const ConceptKB: React.FC = () => {
  const frame = useCurrentFrame();

  // Stage progression
  // 0–30  : PDF reveal (1s)
  // 30–90 : scan tokens (2s)
  // 90–180: migration tokens vers right
  // 180–300 : graph nodes cascade
  const pdfReveal = interpolate(frame, [0, 30], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const scanProgress = interpolate(frame, [30, 90], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Center "Opus 4.7 vision" hint, fade in/out
  const hintIn = interpolate(frame, [60, 90], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const hintOut = interpolate(frame, [180, 220], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const hintOpacity = Math.min(hintIn, hintOut);

  // PDF mock body lines : simulate paragraphs
  const pdfLines = [
    { width: "92%", highlight: false },
    { width: "78%", highlight: false },
    { width: "85%", highlight: false },
    { width: "60%", highlight: false },
    { width: "94%", highlight: true },
    { width: "70%", highlight: true },
    { width: "88%", highlight: false },
    { width: "82%", highlight: false },
    { width: "65%", highlight: false },
    { width: "90%", highlight: false },
    { width: "76%", highlight: true },
    { width: "84%", highlight: false },
    { width: "55%", highlight: false },
  ];

  // Stream continu de tokens vision : naissent à la PDF, voyagent en bezier, meurent près du graph
  // Période d'émission : frame 40 → ~230 (avant que le graph s'illumine, mais avec recouvrement)
  // 48 tokens × spawn 4 frames = dernier né à frame 40 + 47*4 = 228 → couvre toute la période
  const TOKEN_COUNT = 48;
  const TOKEN_LIFE = 35; // frames — courte vie pour un effet stream
  const SPAWN_INTERVAL = 4; // frames entre naissances
  const STREAM_START = 40;

  const streamEasing = Easing.bezier(0.42, 0, 0.58, 1);

  // Calcul d'un point sur trajectoire bezier quadratique pour un token donné à un localFrame donné
  type TokenPoint = {
    x: number;
    y: number;
    opacity: number;
    scale: number;
    radius: number;
    key: number;
  };

  const sampleToken = (i: number, sampleFrame: number): TokenPoint | null => {
    const birthFrame = STREAM_START + i * SPAWN_INTERVAL;
    const localFrame = sampleFrame - birthFrame;
    if (localFrame < 0 || localFrame >= TOKEN_LIFE) return null;

    const rawProg = localFrame / TOKEN_LIFE; // 0 → 1 linéaire
    const tProg = streamEasing(rawProg); // easing organique

    // Variations déterministes par index
    const startY = 320 + ((i * 17) % 240); // étalé sur la hauteur de la PDF
    const endYOffset = ((i * 23) % 220) - 110; // arrivée variée autour du graph centre Y
    const arcShape = i % 3; // 0 : arc haut, 1 : arc plat, 2 : arc bas
    const arcHeight = 80 + ((i * 13) % 60);

    const startX = 480;
    const endX = 1380;
    const endY = 470 + endYOffset;
    const ctrlX = 880 + ((i * 11) % 80);
    let ctrlY: number;
    if (arcShape === 0) {
      ctrlY = Math.min(startY, endY) - arcHeight; // courbe par le haut
    } else if (arcShape === 1) {
      ctrlY = (startY + endY) / 2 + ((i * 7) % 30) - 15; // quasi droite, micro-ondulation
    } else {
      ctrlY = Math.max(startY, endY) + arcHeight * 0.6; // léger arc bas
    }

    const t = tProg;
    const x = (1 - t) * (1 - t) * startX + 2 * (1 - t) * t * ctrlX + t * t * endX;
    const y = (1 - t) * (1 - t) * startY + 2 * (1 - t) * t * ctrlY + t * t * endY;

    // Opacity : fade-in (0–0.22), plateau, fade-out (0.78–1) — basé sur rawProg pour un timing stable
    let opacity: number;
    if (rawProg < 0.22) {
      opacity = rawProg / 0.22;
    } else if (rawProg > 0.78) {
      opacity = (1 - rawProg) / 0.22;
    } else {
      opacity = 1;
    }

    // Scale : 0.8 → 1.1 → 0.9 (mid-life pulse)
    const scale = interpolate(rawProg, [0, 0.5, 1], [0.8, 1.1, 0.9]);

    // Radius variation déterministe (3 → 5)
    const radius = 3 + ((i * 31) % 21) / 10; // 3.0 → 5.0

    return {
      x,
      y,
      opacity,
      scale,
      radius,
      key: i,
    };
  };

  const tokens = Array.from({ length: TOKEN_COUNT })
    .map((_, i) => sampleToken(i, frame))
    .filter((t): t is TokenPoint => t !== null);

  // Trail samples : 2 circles décalés de 2 et 4 frames pour un effet motion blur
  const trailOffsets = [2, 4];
  const trails = Array.from({ length: TOKEN_COUNT })
    .flatMap((_, i) =>
      trailOffsets.map((dt, idx) => {
        const p = sampleToken(i, frame - dt);
        if (!p) return null;
        const trailOpacity = p.opacity * (idx === 0 ? 0.35 : 0.15);
        return {
          x: p.x,
          y: p.y,
          opacity: trailOpacity,
          radius: p.radius * (idx === 0 ? 0.85 : 0.65),
          key: `${i}-${idx}`,
        };
      }),
    )
    .filter(
      (t): t is { x: number; y: number; opacity: number; radius: number; key: string } =>
        t !== null,
    );

  // Absorption flashes : pour chaque token "arrivé", un glow radial sur le nœud target
  // On ne déclenche un flash que si le nœud target est déjà apparu (frame >= node.delayFrame)
  type Flash = {
    targetIdx: number;
    opacity: number;
    scale: number;
    key: string;
  };
  const flashes: Flash[] = [];
  // Nodes delays : duplicate ici (non destructif, source de vérité reste en bas)
  const nodeDelays = [180, 192, 204, 216, 228];
  for (let i = 0; i < TOKEN_COUNT; i++) {
    const birthFrame = STREAM_START + i * SPAWN_INTERVAL;
    const arrivalFrame = birthFrame + TOKEN_LIFE - 6; // commence 6 frames avant la mort
    const flashLocal = frame - arrivalFrame;
    if (flashLocal < 0 || flashLocal > 8) continue;
    const targetIdx = i % 5;
    if (frame < nodeDelays[targetIdx]) continue; // skip si nœud pas encore visible
    const flashProg = flashLocal / 8;
    flashes.push({
      targetIdx,
      opacity: (1 - flashProg) * 0.45,
      scale: interpolate(flashProg, [0, 1], [1, 1.5]),
      key: `flash-${i}`,
    });
  }

  // Scan beam Y position — top of PDF body to bottom
  const pdfTop = 280;
  const pdfBottom = 700;
  const scanY = interpolate(scanProgress, [0, 1], [pdfTop, pdfBottom]);
  const scanOpacity = interpolate(scanProgress, [0, 0.05, 0.95, 1], [0, 1, 1, 0]);

  // Graph nodes positions (right side, around x=1500) — each carries
  // structured KB metadata: threshold + confidence score + PDF source.
  // panelX/panelY are HTML-overlay anchor points (top-left of the small card)
  // expressed in the SAME 1776×800 coordinate space as the SVG viewBox.
  const nodes = [
    {
      cx: 1500,
      cy: 320,
      label: "Pump",
      delayFrame: 180,
      panelX: 1545,
      panelY: 282,
      threshold: "flow < 200 L/min",
      confidence: "0.91",
      source: "pdf:p.18",
    },
    {
      cx: 1380,
      cy: 460,
      label: "Bearing",
      delayFrame: 192,
      panelX: 1228,
      panelY: 422,
      threshold: "vibration > 4.5 mm/s",
      confidence: "0.94",
      source: "pdf:p.42",
    },
    {
      cx: 1620,
      cy: 460,
      label: "Motor",
      delayFrame: 204,
      panelX: 1665,
      panelY: 422,
      threshold: "current > 12 A",
      confidence: "0.89",
      source: "pdf:p.31",
    },
    {
      cx: 1410,
      cy: 620,
      label: "6205-2RS",
      delayFrame: 216,
      panelX: 1228,
      panelY: 660,
      threshold: "MTTF: 8000 h",
      confidence: "0.96",
      source: "pdf:p.55",
    },
    {
      cx: 1600,
      cy: 620,
      label: "ISO-VG46",
      delayFrame: 228,
      panelX: 1645,
      panelY: 660,
      threshold: "temp: -10/+80°C",
      confidence: "0.92",
      source: "pdf:p.67",
    },
  ];

  // Edges between nodes (Pump→Bearing, Pump→Motor, Bearing→Motor,
  // Bearing→6205-2RS, Motor→ISO-VG46) — each carries a weight label
  const edges: Array<{ a: number; b: number; weight: string }> = [
    { a: 0, b: 1, weight: "0.87" },
    { a: 0, b: 2, weight: "0.84" },
    { a: 1, b: 2, weight: "0.71" },
    { a: 1, b: 3, weight: "0.93" },
    { a: 2, b: 4, weight: "0.88" },
  ];

  return (
    <ConceptFrame
      eyebrow="● 01 · KNOWLEDGE BASE"
      title="From PDF to graph in two minutes"
      subtitle="Structured · Scored · Sourced"
    >
      {/* Full-bleed canvas under the title */}
      <div style={{ position: "absolute", inset: 0 }}>
        <svg
          width="100%"
          height="100%"
          viewBox="0 0 1776 800"
          preserveAspectRatio="xMidYMid meet"
          style={{ position: "absolute", inset: 0 }}
        >
          {/* Token trails (motion blur subtil) — rendus AVANT les tokens pour passer derrière */}
          {trails.map((t) => (
            <circle
              key={t.key}
              cx={t.x}
              cy={t.y}
              r={t.radius}
              fill={COLORS.lightOrange}
              opacity={t.opacity}
            />
          ))}

          {/* Stream de tokens vision : flow continu PDF → graph */}
          {tokens.map((t) => (
            <circle
              key={t.key}
              cx={t.x}
              cy={t.y}
              r={t.radius * t.scale}
              fill={COLORS.signalOrange}
              opacity={t.opacity}
            />
          ))}

          {/* Absorption flashes : glow radial sur le nœud target quand un token arrive */}
          {flashes.map((f) => {
            const target = nodes[f.targetIdx];
            if (!target) return null;
            return (
              <circle
                key={f.key}
                cx={target.cx}
                cy={target.cy}
                r={36 * f.scale}
                fill="none"
                stroke={COLORS.signalOrange}
                strokeWidth={1.5}
                opacity={f.opacity}
              />
            );
          })}

          {/* Graph edges — each with a weight label at midpoint */}
          {edges.map((e, i) => {
            const a = nodes[e.a];
            const b = nodes[e.b];
            const lineOp = interpolate(frame, [200 + i * 6, 240 + i * 6], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            // Edge labels appear after BOTH endpoints are revealed (~+12 frames after the later one)
            const labelStart =
              Math.max(a.delayFrame, b.delayFrame) + 18;
            const labelOp = interpolate(frame, [labelStart, labelStart + 14], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            const mx = (a.cx + b.cx) / 2;
            const my = (a.cy + b.cy) / 2;
            return (
              <g key={`edge-${i}`}>
                <line
                  x1={a.cx}
                  y1={a.cy}
                  x2={b.cx}
                  y2={b.cy}
                  stroke={COLORS.signalOrange}
                  strokeWidth="1.5"
                  strokeDasharray="6 6"
                  opacity={lineOp * 0.85}
                />
                {/* Weight label background pad (cream) for legibility */}
                <rect
                  x={mx - 30}
                  y={my - 9}
                  width={60}
                  height={14}
                  fill={COLORS.cream}
                  opacity={labelOp * 0.92}
                  rx={2}
                />
                <text
                  x={mx}
                  y={my + 1}
                  textAnchor="middle"
                  fontFamily={FONTS.mono}
                  fontSize="9"
                  fill={COLORS.slate}
                  letterSpacing="0.04em"
                  opacity={labelOp}
                >
                  {`weight: ${e.weight}`}
                </text>
              </g>
            );
          })}

          {/* Graph nodes */}
          {nodes.map((n, i) => {
            const pop = interpolate(
              frame,
              [n.delayFrame, n.delayFrame + 18],
              [0, 1],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.back(1.4)) },
            );
            return (
              <g key={n.label} transform={`translate(${n.cx}, ${n.cy}) scale(${pop})`} opacity={pop}>
                <circle r="28" fill={COLORS.ink} />
                <circle r="28" fill="none" stroke={COLORS.lightOrange} strokeWidth="1.5" />
                <text
                  y={56}
                  textAnchor="middle"
                  fontFamily={FONTS.mono}
                  fontSize="13"
                  fill={COLORS.charcoal}
                >
                  {n.label}
                </text>
              </g>
            );
          })}

          {/* Scoring panels — appear ~+6 frames AFTER each node, fade-in + slide-up 8px.
              Rendered as foreignObject so they share the SVG coordinate space and
              line up regardless of letterboxing. */}
          {nodes.map((n) => {
            const start = n.delayFrame + 6;
            const end = start + 12;
            const op = interpolate(frame, [start, end], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            const ty = interpolate(op, [0, 1], [8, 0]);
            const PANEL_W = 168;
            const PANEL_H = 64;
            return (
              <foreignObject
                key={`panel-${n.label}`}
                x={n.panelX}
                y={n.panelY}
                width={PANEL_W}
                height={PANEL_H}
              >
                <div
                  style={{
                    width: PANEL_W,
                    boxSizing: "border-box",
                    backgroundColor: COLORS.liftedCream,
                    border: `1px solid ${COLORS.dustTaupe}`,
                    borderRadius: 4,
                    padding: "6px 10px",
                    opacity: op,
                    transform: `translateY(${ty}px)`,
                    fontFamily: FONTS.mono,
                    lineHeight: 1.35,
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      color: COLORS.ink,
                      letterSpacing: "0.01em",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {n.threshold}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: COLORS.signalOrange,
                      fontWeight: 700,
                      letterSpacing: "0.02em",
                    }}
                  >
                    conf {n.confidence}
                  </div>
                  <div
                    style={{
                      fontSize: 9,
                      color: COLORS.slate,
                      letterSpacing: "0.04em",
                    }}
                  >
                    {n.source}
                  </div>
                </div>
              </foreignObject>
            );
          })}
        </svg>

        {/* === PDF mock card LEFT === */}
        <div
          style={{
            position: "absolute",
            left: "8%",
            top: "12%",
            width: 360,
            height: 480,
            backgroundColor: COLORS.liftedCream,
            borderRadius: 6,
            border: `1px solid ${COLORS.dustTaupe}`,
            padding: "28px 26px 20px",
            opacity: pdfReveal,
            transform: `translateY(${interpolate(pdfReveal, [0, 1], [24, 0])}px)`,
            boxShadow: "0 36px 80px rgba(20,20,19,0.14)",
            overflow: "hidden",
          }}
        >
          {/* PDF header bar — black */}
          <div
            style={{
              height: 14,
              backgroundColor: COLORS.ink,
              borderRadius: 2,
              marginBottom: 10,
              width: "55%",
            }}
          />
          {/* Sub-header lines */}
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={`h-${i}`}
              style={{
                height: 4,
                backgroundColor: COLORS.dustTaupe,
                borderRadius: 1,
                marginBottom: 6,
                width: `${40 + i * 12}%`,
              }}
            />
          ))}
          <div style={{ height: 16 }} />
          {/* Body lines */}
          {pdfLines.map((line, i) => (
            <div
              key={`b-${i}`}
              style={{
                height: 5,
                backgroundColor: line.highlight
                  ? "rgba(207,69,0,0.55)"
                  : COLORS.dustTaupe,
                borderRadius: 1,
                marginBottom: 8,
                width: line.width,
              }}
            />
          ))}
          {/* Filename footer */}
          <div
            style={{
              position: "absolute",
              left: 26,
              right: 26,
              bottom: 18,
              fontFamily: FONTS.mono,
              fontSize: 12,
              color: COLORS.slate,
              borderTop: `1px solid ${COLORS.dustTaupe}`,
              paddingTop: 10,
            }}
          >
            grundfos-NB-G-65-250.pdf
          </div>

          {/* Scan beam — horizontal cyan-orange line that travels down */}
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: scanY - 280, // relative to card top (which is at viewport pdfTop ≈ 280)
              height: 2,
              background: `linear-gradient(90deg, transparent 0%, ${COLORS.signalOrange} 50%, transparent 100%)`,
              opacity: scanOpacity,
              boxShadow: `0 0 12px ${COLORS.signalOrange}`,
              pointerEvents: "none",
            }}
          />
        </div>

        {/* Center hint : "Opus 4.7 vision · 1M context" */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "20%",
            transform: "translateX(-50%)",
            fontFamily: FONTS.mono,
            fontSize: 14,
            color: COLORS.slate,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            opacity: hintOpacity,
            whiteSpace: "nowrap",
          }}
        >
          Opus 4.7 vision · 1M context
        </div>
      </div>
    </ConceptFrame>
  );
};

/* -------------------------------------------------------------------------- */
/*  4b · Managed Agents — pentagon + MCP center + cyan particles              */
/* -------------------------------------------------------------------------- */

const ConceptManagedAgents: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Sentinel CENTER (cx, cy) — bigger, conductor of the stack
  const cx = 960;
  const cy = 500;

  // 4 agents in arc/cross around Sentinel — radius 280
  const r = 280;
  const otherAgents = [
    { name: "Investigator", letter: "I", angle: -45 },   // top-right
    { name: "Work Order",   letter: "W", angle: 30 },    // right
    { name: "Q&A",          letter: "Q", angle: 110 },   // bottom
    { name: "KB Builder",   letter: "K", angle: -150 },  // left
  ].map((a) => {
    const rad = (a.angle * Math.PI) / 180;
    return { ...a, x: cx + Math.cos(rad) * r, y: cy + Math.sin(rad) * r };
  });

  // Sentinel pulse (heartbeat watching) — 0.8s = 24 frames
  const pulsePhase = (frame % 24) / 24; // 0 → 1
  const pulseSin = Math.sin(pulsePhase * Math.PI * 2); // -1 → 1
  const sentinelRadius = 113 + pulseSin * 3; // 110 ↔ 116
  const sentinelBorderWidth = 3 + (pulseSin + 1) * 0.5; // 3 ↔ 4

  // Sentinel intro spring (scale + opacity)
  const sentinelSpring = spring({
    frame: frame - 18,
    fps,
    config: { damping: 12, stiffness: 110 },
    durationInFrames: 22,
  });

  // MCP toolbox slide-in from top-left (cream-light card)
  const toolboxSpring = spring({
    frame: frame - 40,
    fps,
    config: { damping: 14, stiffness: 120 },
    durationInFrames: 22,
  });
  const toolboxX = interpolate(toolboxSpring, [0, 1], [-24, 0]);

  // Toolbox position (top-left of viewBox 1920x920)
  const toolboxX0 = 96;
  const toolboxY0 = 90;
  const toolboxW = 320;
  const toolboxH = 158;
  // Approx connection point (right edge, vertical center) of the toolbox
  const toolboxAnchorX = toolboxX0 + toolboxW;
  const toolboxAnchorY = toolboxY0 + toolboxH / 2;

  // Cyan particles — Sentinel ↔ MCP toolbox AND toolbox → other agents
  // 5-6 particles spread over the 330 frames
  type Particle = { x: number; y: number; opacity: number; key: number };
  const particleSchedules = [
    { startFrame: 80,  toToolbox: true,  agentIdx: 0 }, // Sentinel → toolbox
    { startFrame: 130, toToolbox: false, agentIdx: 0 }, // toolbox  → Investigator
    { startFrame: 175, toToolbox: true,  agentIdx: 1 }, // Sentinel → toolbox
    { startFrame: 215, toToolbox: false, agentIdx: 2 }, // toolbox  → Q&A
    { startFrame: 250, toToolbox: true,  agentIdx: 3 }, // Sentinel → toolbox
    { startFrame: 285, toToolbox: false, agentIdx: 3 }, // toolbox  → KB Builder
  ];
  const particleLife = 50;

  const particles: Particle[] = particleSchedules
    .map((p, i) => {
      const local = frame - p.startFrame;
      if (local < 0 || local > particleLife) return null;
      const t = local / particleLife;
      // Quadratic bezier between Sentinel (cx,cy) and MCP toolbox (toolboxAnchorX, toolboxAnchorY)
      // For "fromToolbox" particles we go toolbox → Sentinel passing-through arc → other agent
      let p0x: number, p0y: number, p2x: number, p2y: number, p1x: number, p1y: number;
      if (p.toToolbox) {
        p0x = cx;
        p0y = cy;
        p2x = toolboxAnchorX;
        p2y = toolboxAnchorY;
      } else {
        p0x = toolboxAnchorX;
        p0y = toolboxAnchorY;
        p2x = otherAgents[p.agentIdx].x;
        p2y = otherAgents[p.agentIdx].y;
      }
      // Control point: midpoint pulled towards Sentinel (so visually flows through center area)
      p1x = (p0x + p2x) / 2 + (cx - (p0x + p2x) / 2) * 0.35;
      p1y = (p0y + p2y) / 2 + (cy - (p0y + p2y) / 2) * 0.35 - 30;
      const x = (1 - t) * (1 - t) * p0x + 2 * (1 - t) * t * p1x + t * t * p2x;
      const y = (1 - t) * (1 - t) * p0y + 2 * (1 - t) * t * p1y + t * t * p2y;
      const opacity = interpolate(t, [0, 0.1, 0.9, 1], [0, 1, 1, 0]);
      return { x, y, opacity, key: i };
    })
    .filter((p): p is Particle => p !== null);

  // MCP toolbox chips
  const chips = [
    "query_signals",
    "fetch_kb",
    "submit_rca",
    "print_workorder",
    "query_history",
    "... +12",
  ];

  return (
    <ConceptFrame
      eyebrow="● 02 · MANAGED AGENTS"
      title="Five specialists. Seventeen tools."
      subtitle="Sentinel orchestrates · Anthropic-native"
    >
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 1920 920"
        preserveAspectRatio="xMidYMid meet"
        style={{ position: "absolute", inset: 0 }}
      >
        {/* Lines from each OTHER agent to Sentinel — orange dashed (Sentinel = conductor) */}
        {otherAgents.map((a, i) => {
          const baseDelay = i * 6;
          const dash = interpolate(frame, [60 + baseDelay, 200], [0, 600], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const op = interpolate(frame, [60 + baseDelay, 100 + baseDelay], [0, 0.7], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          return (
            <line
              key={`sentinel-${a.name}`}
              x1={a.x}
              y1={a.y}
              x2={cx}
              y2={cy}
              stroke={COLORS.signalOrange}
              strokeWidth="1.5"
              strokeDasharray="6 8"
              strokeDashoffset={-dash}
              opacity={op}
            />
          );
        })}

        {/* Secondary line Sentinel ↔ MCP toolbox (paler, solid) — Sentinel uses tools */}
        <line
          x1={cx}
          y1={cy}
          x2={toolboxAnchorX}
          y2={toolboxAnchorY}
          stroke={COLORS.signalOrange}
          strokeWidth="1"
          opacity={interpolate(frame, [70, 130], [0, 0.5], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })}
        />

        {/* Sentinel CENTER — bigger, with pulse + glow */}
        <g
          transform={`translate(${cx}, ${cy}) scale(${sentinelSpring})`}
          opacity={sentinelSpring}
        >
          {/* Outer glow halo (concentric faint rings) */}
          <circle
            r={sentinelRadius + 24}
            fill="none"
            stroke={COLORS.signalOrange}
            strokeWidth="1"
            opacity={0.12}
          />
          <circle
            r={sentinelRadius + 12}
            fill="none"
            stroke={COLORS.signalOrange}
            strokeWidth="1"
            opacity={0.22}
          />
          {/* Body */}
          <circle r={sentinelRadius} fill={COLORS.ink} />
          {/* Border with pulse — orange-light */}
          <circle
            r={sentinelRadius}
            fill="none"
            stroke={COLORS.lightOrange}
            strokeWidth={sentinelBorderWidth}
            style={{ filter: `drop-shadow(0 0 14px ${COLORS.signalOrange})` }}
          />
          {/* S letter */}
          <text
            y={16}
            textAnchor="middle"
            fontFamily={FONTS.display}
            fontSize="92"
            fontWeight="700"
            fill={COLORS.cream}
          >
            S
          </text>
          {/* Sentinel label — semibold mono */}
          <text
            y={sentinelRadius + 36}
            textAnchor="middle"
            fontFamily={FONTS.mono}
            fontSize="16"
            fontWeight="600"
            fill={COLORS.ink}
            letterSpacing="0.04em"
          >
            Sentinel
          </text>
        </g>

        {/* Cyan particles : Sentinel ↔ toolbox ↔ agents */}
        {particles.map((p) => (
          <circle
            key={`p-${p.key}`}
            cx={p.x}
            cy={p.y}
            r={6}
            fill={COLORS.sandboxCyan}
            opacity={p.opacity}
            style={{ filter: `drop-shadow(0 0 6px ${COLORS.sandboxCyan})` }}
          />
        ))}

        {/* OTHER agent nodes (4) — smaller circles in arc around Sentinel */}
        {otherAgents.map((a, i) => {
          const popSpring = spring({
            frame: frame - 50 - i * 10,
            fps,
            config: { damping: 12, stiffness: 130 },
          });
          return (
            <g
              key={a.name}
              transform={`translate(${a.x}, ${a.y}) scale(${popSpring})`}
              opacity={popSpring}
            >
              <circle r="40" fill={COLORS.ink} />
              <circle
                r="40"
                fill="none"
                stroke={COLORS.lightOrange}
                strokeWidth={2}
              />
              <text
                y={11}
                textAnchor="middle"
                fontFamily={FONTS.display}
                fontSize="32"
                fontWeight="700"
                fill={COLORS.cream}
              >
                {a.letter}
              </text>
              <text
                y={70}
                textAnchor="middle"
                fontFamily={FONTS.mono}
                fontSize="14"
                fill={COLORS.ink}
                letterSpacing="0.02em"
              >
                {a.name}
              </text>
            </g>
          );
        })}
      </svg>

      {/* MCP TOOLBOX — overlay div top-left (mapped to viewBox 1920x920 via percentage approx) */}
      {/* Use absolute positioning relative to ConceptFrame children container */}
      <div
        style={{
          position: "absolute",
          left: `${(toolboxX0 / 1920) * 100}%`,
          top: `${(toolboxY0 / 920) * 100}%`,
          width: `${(toolboxW / 1920) * 100}%`,
          // height auto via content
          backgroundColor: COLORS.liftedCream,
          border: `1px solid ${COLORS.dustTaupe}`,
          borderRadius: 8,
          padding: "14px 16px 16px",
          opacity: toolboxSpring,
          transform: `translateX(${toolboxX}px)`,
          boxShadow: "0 18px 48px rgba(20,20,19,0.10)",
        }}
      >
        {/* Header line */}
        <div
          style={{
            fontFamily: FONTS.mono,
            fontSize: 13,
            color: COLORS.ink,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            fontWeight: 600,
            marginBottom: 12,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              backgroundColor: COLORS.signalOrange,
            }}
          />
          MCP · 17 TOOLS
        </div>
        {/* Chips flex-wrap */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {chips.map((chip, i) => {
            const chipDelay = 50 + i * 4;
            const chipOp = interpolate(frame, [chipDelay, chipDelay + 12], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            return (
              <span
                key={chip}
                style={{
                  fontFamily: FONTS.mono,
                  fontSize: 11,
                  color: chip.startsWith("...") ? COLORS.slate : COLORS.ink,
                  backgroundColor: COLORS.cream,
                  border: `1px solid ${COLORS.dustTaupe}`,
                  borderRadius: 4,
                  padding: "3px 8px",
                  letterSpacing: "0.01em",
                  opacity: chipOp,
                }}
              >
                {chip}
              </span>
            );
          })}
        </div>
      </div>
    </ConceptFrame>
  );
};

/* -------------------------------------------------------------------------- */
/*  4c · Sandbox Python — code typewriter + count-up output + cyan chip       */
/* -------------------------------------------------------------------------- */

const ConceptSandbox: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const codeLines: Array<{ text: string; type?: "kw" | "str" | "num" | "comment" | "plain" }> = [
    { text: "import numpy as np" },
    { text: "import pandas as pd" },
    { text: "" },
    { text: "df = pd.read_csv('/sandbox/signals.csv')" },
    { text: "pressure = df['discharge_pressure_bar'].values" },
    { text: "flow = df['flow_l_min'].values" },
    { text: "" },
    { text: "rho, _ = scipy.stats.pearsonr(pressure, flow)" },
    { text: "print(f\"rho_pressure_flow={rho:.4f}\")" },
    { text: "print(f\"n={len(pressure)}\")" },
  ];

  // Type-write: line-by-line, 9 frames per line ≈ 0.3s, total ≈ 90 frames
  const lineFrames = 9;
  const linesShown = Math.min(
    codeLines.length,
    Math.max(0, Math.floor((frame - 10) / lineFrames)),
  );

  // Output appears 30 frames after typing done (~ frame 130 onward)
  const outputStart = 10 + codeLines.length * lineFrames + 30;
  const outputOpacity = interpolate(
    frame,
    [outputStart, outputStart + 12],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // Count-up rho 0.0000 → 0.9944 over 24 frames
  const rhoCountStart = outputStart + 6;
  const rhoCountEnd = rhoCountStart + 24;
  const rhoValue = interpolate(frame, [rhoCountStart, rhoCountEnd], [0, 0.9944], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const nValue = Math.floor(
    interpolate(frame, [rhoCountStart, rhoCountEnd], [0, 21443], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    }),
  );

  // Cyan chip pop with spring
  const chipSpring = spring({
    frame: frame - (rhoCountEnd + 6),
    fps,
    config: { damping: 10, stiffness: 140 },
    durationInFrames: 18,
  });

  return (
    <ConceptFrame
      eyebrow="● 03 · SANDBOX EXECUTION"
      title="Real Python. Not tokens."
      subtitle="Anthropic Managed Agents · cloud sandbox"
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 24,
          height: "100%",
          paddingTop: 12,
        }}
      >
        {/* Code editor */}
        <div
          style={{
            width: 820,
            backgroundColor: COLORS.ink,
            borderRadius: 12,
            padding: "28px 32px",
            fontFamily: FONTS.mono,
            fontSize: 18,
            color: COLORS.cream,
            position: "relative",
            boxShadow: "0 30px 80px rgba(20,20,19,0.18)",
          }}
        >
          {/* macOS-style header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginBottom: 18,
              paddingBottom: 14,
              borderBottom: `1px solid ${COLORS.charcoal}`,
            }}
          >
            <span style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: "#ff5f56" }} />
            <span style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: "#ffbd2e" }} />
            <span style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: "#27c93f" }} />
            <span
              style={{
                marginLeft: 16,
                fontFamily: FONTS.mono,
                fontSize: 11,
                color: COLORS.slate,
                letterSpacing: "0.08em",
              }}
            >
              sandbox.py · /tmp/aria-sandbox-7f3a
            </span>
          </div>

          {codeLines.map((line, i) => {
            const visible = i < linesShown;
            return (
              <div key={i} style={{ minHeight: 28, display: "flex", gap: 14 }}>
                <span style={{ color: COLORS.slate, width: 24, textAlign: "right", flexShrink: 0 }}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span style={{ opacity: visible ? 1 : 0 }}>{colorize(line.text)}</span>
                {i === linesShown && i < codeLines.length ? (
                  <span style={{ color: COLORS.signalOrange, marginLeft: -10 }}>▋</span>
                ) : null}
              </div>
            );
          })}
        </div>

        {/* Output panel : ink dark, mono white, count-up */}
        <div
          style={{
            width: 820,
            backgroundColor: "#0a0a09",
            borderRadius: 8,
            padding: "22px 28px",
            fontFamily: FONTS.mono,
            fontSize: 22,
            color: COLORS.cream,
            opacity: outputOpacity,
            position: "relative",
            border: `1px solid ${COLORS.charcoal}`,
            boxShadow: "0 20px 50px rgba(20,20,19,0.20)",
          }}
        >
          {/* Cyan chip top-right */}
          <div
            style={{
              position: "absolute",
              top: -16,
              right: 20,
              padding: "8px 16px",
              borderRadius: 999,
              backgroundColor: COLORS.sandboxCyan,
              color: COLORS.cream,
              fontFamily: FONTS.mono,
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              transform: `scale(${chipSpring})`,
              opacity: chipSpring,
              boxShadow: `0 0 20px rgba(6,182,212,0.45)`,
              whiteSpace: "nowrap",
            }}
          >
            Ran in Anthropic sandbox
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 6 }}>
            <span style={{ color: COLORS.sandboxCyan }}>▸</span>
            <span>rho_pressure_flow=
              <span style={{ color: COLORS.sandboxCyan, fontWeight: 600 }}>
                {rhoValue.toFixed(4)}
              </span>
            </span>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span style={{ color: COLORS.sandboxCyan }}>▸</span>
            <span>n=
              <span style={{ color: COLORS.sandboxCyan, fontWeight: 600 }}>
                {nValue.toLocaleString("en-US")}
              </span>
            </span>
          </div>
        </div>
      </div>
    </ConceptFrame>
  );
};

// Tiny syntax highlighter — keywords / strings / numbers / comments
function colorize(line: string): React.ReactNode {
  if (line.trim().startsWith("#")) {
    return <span style={{ color: COLORS.slate, fontStyle: "italic" }}>{line}</span>;
  }
  // tokenize on whitespace + punctuation we care about
  const parts = line.split(/(\s+|[(),])/);
  const keywords = new Set(["import", "from", "def", "print", "as", "for", "in", "return"]);
  return parts.map((token, i) => {
    if (keywords.has(token)) {
      return (
        <span key={i} style={{ color: COLORS.signalOrange, fontWeight: 600 }}>
          {token}
        </span>
      );
    }
    if (/^['"].*['"]$/.test(token) || /^f?['"]/.test(token)) {
      return (
        <span key={i} style={{ color: COLORS.sandboxCyan }}>
          {token}
        </span>
      );
    }
    if (/^\d+(\.\d+)?$/.test(token)) {
      return (
        <span key={i} style={{ color: COLORS.lightOrange }}>
          {token}
        </span>
      );
    }
    return <span key={i}>{token}</span>;
  });
}

/* -------------------------------------------------------------------------- */
/*  4d · Work Order — full card with sequential action reveal                 */
/* -------------------------------------------------------------------------- */

const ConceptWorkOrder: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Card slide-in from bottom + fade — frame 30 → 48
  const cardSpring = spring({
    frame: frame - 30,
    fps,
    config: { damping: 16, stiffness: 110 },
    durationInFrames: 18,
  });
  const cardY = interpolate(cardSpring, [0, 1], [50, 0]);

  const actions = [
    "1. Lock-out / tag-out main breaker",
    "2. Drain coolant loop (15 min)",
    "3. Replace bearing 6205-2RS",
    "4. Re-grease ISO-VG46 (30 mL)",
    "5. Run vibration baseline · 5 min",
  ];
  const actionsStart = 80;
  const actionStep = 6;

  // APPROVED stamp — appears at frame 200 with rotate
  const stampSpring = spring({
    frame: frame - 200,
    fps,
    config: { damping: 12, stiffness: 140 },
    durationInFrames: 20,
  });

  return (
    <ConceptFrame
      eyebrow="● 04 · WORK ORDER"
      title="The exact part. The exact steps."
    >
      <div style={{ display: "flex", justifyContent: "center", height: "100%", paddingTop: 8 }}>
        <div
          style={{
            width: 820,
            backgroundColor: COLORS.liftedCream,
            border: `1px solid ${COLORS.dustTaupe}`,
            borderRadius: 8,
            padding: "44px 56px",
            transform: `translateY(${cardY}px)`,
            opacity: cardSpring,
            boxShadow: "0 40px 100px rgba(20,20,19,0.14)",
            position: "relative",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              borderBottom: `1px solid ${COLORS.dustTaupe}`,
              paddingBottom: 14,
            }}
          >
            <div
              style={{
                fontFamily: FONTS.mono,
                fontSize: 13,
                color: COLORS.granite,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                fontWeight: 600,
              }}
            >
              WORK ORDER · WO-2026-04-26-038
            </div>
            <div
              style={{
                fontFamily: FONTS.mono,
                fontSize: 13,
                color: COLORS.slate,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              2026-04-26 · 14:08
            </div>
          </div>

          {/* ASSET */}
          <div style={{ marginTop: 22 }}>
            <div
              style={{
                ...TYPE.eyebrow,
                fontSize: 11,
                color: COLORS.granite,
              }}
            >
              ASSET
            </div>
            <div
              style={{
                fontFamily: FONTS.display,
                fontSize: 42,
                fontWeight: 600,
                color: COLORS.ink,
                letterSpacing: "-0.02em",
                marginTop: 6,
                lineHeight: 1.1,
              }}
            >
              Bottle Filler · Bearing
            </div>
          </div>

          {/* PART */}
          <div style={{ marginTop: 22 }}>
            <div
              style={{
                ...TYPE.eyebrow,
                fontSize: 11,
                color: COLORS.granite,
              }}
            >
              PART
            </div>
            <div
              style={{
                fontFamily: FONTS.mono,
                fontSize: 30,
                color: COLORS.signalOrange,
                fontWeight: 600,
                marginTop: 6,
                letterSpacing: "-0.005em",
              }}
            >
              6205-2RS · ISO-VG46 30mL
            </div>
          </div>

          {/* ACTIONS */}
          <div style={{ marginTop: 26 }}>
            <div
              style={{
                ...TYPE.eyebrow,
                fontSize: 11,
                color: COLORS.granite,
                marginBottom: 14,
              }}
            >
              ACTIONS
            </div>
            {actions.map((a, i) => {
              const startF = actionsStart + i * actionStep;
              const op = interpolate(frame, [startF, startF + 14], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              });
              const tx = interpolate(op, [0, 1], [-14, 0]);
              return (
                <div
                  key={i}
                  style={{
                    fontFamily: FONTS.display,
                    fontSize: 19,
                    fontWeight: 450,
                    color: COLORS.charcoal,
                    lineHeight: 1.5,
                    marginBottom: 8,
                    opacity: op,
                    transform: `translateX(${tx}px)`,
                  }}
                >
                  {a}
                </div>
              );
            })}
          </div>

          {/* APPROVED stamp top-right diagonal */}
          <div
            style={{
              position: "absolute",
              top: 28,
              right: 28,
              width: 130,
              height: 130,
              borderRadius: "50%",
              border: `3px solid ${COLORS.signalOrange}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: FONTS.display,
              fontSize: 18,
              fontWeight: 700,
              color: COLORS.signalOrange,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              transform: `rotate(${interpolate(stampSpring, [0, 1], [-25, -12])}deg) scale(${stampSpring})`,
              opacity: stampSpring * 0.9,
            }}
          >
            Approved
          </div>
        </div>
      </div>
    </ConceptFrame>
  );
};
