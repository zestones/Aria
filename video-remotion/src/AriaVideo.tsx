import React from "react";
import { AbsoluteFill, Audio, Series, staticFile } from "remotion";
import "./fonts";
import { AppDemo } from "./scenes/AppDemo";
import { ConceptsExplained } from "./scenes/ConceptsExplained";
import { Conclusion } from "./scenes/Conclusion";
import { IntroHook } from "./scenes/IntroHook";
import { ProblemStats } from "./scenes/ProblemStats";

/**
 * Master composition — 4800 frames (2:40 @ 30fps).
 *
 * Layout (minimaliste, post sub-shot trim) :
 *   0    -  330 · IntroHook         (3 sub-shots smash cut, 11s)
 *   330  - 1020 · ProblemStats      (cost cross-out, 23s)
 *   1020 - 3210 · AppDemo           (screen recording, 73s)
 *   3210 - 4560 · ConceptsExplained (KB / Agents / Sandbox / WO, 45s)
 *   4560 - 4800 · Conclusion        (logo + tagline + credits, 8s)
 *
 * Audio voiceover spans the full timeline. The mp3 is a silent placeholder
 * for now — Adam will swap in `voiceover.mp3` once ElevenLabs has produced it.
 * Mounted ONCE here at master level — never re-mount inside scene comps.
 */

const USE_AUDIO = false; // flip true once voiceover.mp3 is real to avoid 404 in studio

export const AriaVideo: React.FC = () => {
  return (
    <AbsoluteFill>
      <Series>
        <Series.Sequence durationInFrames={330}>
          <IntroHook />
        </Series.Sequence>
        <Series.Sequence durationInFrames={690}>
          <ProblemStats />
        </Series.Sequence>
        <Series.Sequence durationInFrames={2190}>
          <AppDemo />
        </Series.Sequence>
        <Series.Sequence durationInFrames={1350}>
          <ConceptsExplained />
        </Series.Sequence>
        <Series.Sequence durationInFrames={240}>
          <Conclusion />
        </Series.Sequence>
      </Series>
      {USE_AUDIO ? <Audio src={staticFile("assets/voiceover.mp3")} /> : null}
    </AbsoluteFill>
  );
};
