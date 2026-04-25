import React from "react";
import { AbsoluteFill, interpolate, staticFile, useCurrentFrame, Video } from "remotion";
import { COLORS, FONTS, TYPE } from "../theme";

/**
 * Scene 3 · 0:50–2:00 · App screen recording
 *
 * Premier jet : placeholder. Quand Adam aura `app-demo.mp4` (continuous take),
 * flip USE_VIDEO=true. Pour speed-ramp, on peut utiliser <Video startFrom> et
 * <Sequence> imbriquées; ou playbackRate sur <Video>.
 *
 * Spec output : 1920x1080, ~70s, H.264, mute (le voiceover global porte l'audio).
 * Si le take fait plus de 70s, ajuste durationInFrames dans Root.tsx ou crop via
 * <Sequence durationInFrames={...} />.
 */
const USE_VIDEO = false;

export const AppDemo: React.FC = () => {
  const frame = useCurrentFrame();

  // Subtle scanline shimmer to break the flat gray
  const scan = interpolate(frame % 60, [0, 60], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Annotation chips that fade in at scripted beats (relative to scene start)
  // 30 fps assumed. Tweak when real recording is in.
  const beats = [
    { fromFrame: 60, label: "ONBOARDING — drop PDF" },
    { fromFrame: 600, label: "FORECAST — Bottle Filler" },
    { fromFrame: 1050, label: "BREACH — extended thinking live" },
    { fromFrame: 1500, label: "SANDBOX — Python in Anthropic cloud" },
    { fromFrame: 1800, label: "WORK ORDER — bearing 6205-2RS" },
  ];

  if (USE_VIDEO) {
    return (
      <AbsoluteFill style={{ backgroundColor: COLORS.ink }}>
        <Video src={staticFile("assets/app-demo.mp4")} muted />
      </AbsoluteFill>
    );
  }

  let activeBeat: (typeof beats)[number] | undefined;
  for (const b of beats) {
    if (frame >= b.fromFrame) {
      activeBeat = b;
    }
  }

  return (
    <AbsoluteFill
      style={{
        backgroundColor: COLORS.charcoal,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 32,
      }}
    >
      {/* Scanline overlay */}
      <AbsoluteFill
        style={{
          background: `repeating-linear-gradient(0deg, rgba(255,255,255,0.02) 0px, rgba(255,255,255,0.02) 1px, transparent 1px, transparent 4px)`,
          opacity: 0.4 + scan * 0.2,
          mixBlendMode: "screen",
        }}
      />

      {/* Mock window chrome */}
      <div
        style={{
          width: 1600,
          height: 900,
          borderRadius: 16,
          backgroundColor: COLORS.ink,
          border: `1px solid ${COLORS.granite}`,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 40px 120px rgba(0,0,0,0.5)",
        }}
      >
        {/* Title bar */}
        <div
          style={{
            height: 48,
            backgroundColor: "#1f1f20",
            borderBottom: `1px solid ${COLORS.granite}`,
            display: "flex",
            alignItems: "center",
            paddingInline: 20,
            gap: 8,
          }}
        >
          <span style={{ width: 12, height: 12, borderRadius: "50%", backgroundColor: "#ff5f56" }} />
          <span style={{ width: 12, height: 12, borderRadius: "50%", backgroundColor: "#ffbd2e" }} />
          <span style={{ width: 12, height: 12, borderRadius: "50%", backgroundColor: "#27c93f" }} />
          <span
            style={{
              ...TYPE.mono,
              color: COLORS.slate,
              marginLeft: 24,
              fontSize: 14,
            }}
          >
            aria.app/dashboard
          </span>
        </div>

        {/* Screen body */}
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            gap: 20,
            padding: 60,
          }}
        >
          <div
            style={{
              ...TYPE.eyebrow,
              color: COLORS.sandboxCyan,
              fontSize: 14,
            }}
          >
            APP SCREEN RECORDING · 70s · CONTINUOUS TAKE
          </div>
          <div
            style={{
              ...TYPE.h1,
              color: COLORS.cream,
              textAlign: "center",
              maxWidth: 1200,
            }}
          >
            Drop in `public/assets/app-demo.mp4` to replace this placeholder.
          </div>
          <div
            style={{
              ...TYPE.body,
              color: COLORS.dustTaupe,
              textAlign: "center",
              maxWidth: 900,
            }}
          >
            Onboarding → Forecast → Breach → Sandbox → Work Order. One take, no
            cuts. Speed-ramp via Sequence durationInFrames or Video playbackRate.
          </div>

          {/* Mock vital signs row */}
          <div
            style={{
              display: "flex",
              gap: 16,
              marginTop: 32,
            }}
          >
            {[
              { label: "Bottle Filler", value: "0.82", color: COLORS.signalOrange },
              { label: "Bottle Capper", value: "0.41", color: COLORS.sandboxCyan },
              { label: "Labeler", value: "0.18", color: COLORS.lightOrange },
              { label: "Pasteurizer", value: "0.27", color: COLORS.linkBlue },
              { label: "Conveyor", value: "0.12", color: COLORS.granite },
            ].map((m) => (
              <div
                key={m.label}
                style={{
                  width: 220,
                  padding: 20,
                  borderRadius: 12,
                  backgroundColor: "rgba(255,255,255,0.04)",
                  border: `1px solid ${COLORS.granite}`,
                }}
              >
                <div
                  style={{
                    fontFamily: FONTS.mono,
                    fontSize: 11,
                    color: COLORS.slate,
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                  }}
                >
                  {m.label}
                </div>
                <div
                  style={{
                    fontFamily: FONTS.display,
                    fontSize: 36,
                    fontWeight: 600,
                    color: m.color,
                    marginTop: 4,
                  }}
                >
                  {m.value}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Active beat label */}
      {activeBeat ? (
        <div
          style={{
            position: "absolute",
            bottom: 40,
            left: "50%",
            transform: "translateX(-50%)",
            padding: "10px 24px",
            backgroundColor: COLORS.signalOrange,
            color: COLORS.cream,
            borderRadius: 999,
            ...TYPE.eyebrow,
            fontSize: 14,
          }}
        >
          {activeBeat.label}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
