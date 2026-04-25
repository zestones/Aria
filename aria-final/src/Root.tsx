import React from "react";
import { Composition } from "remotion";
import { AriaVideo } from "./AriaVideo";
import { AppDemo } from "./scenes/AppDemo";
import { ConceptsExplained } from "./scenes/ConceptsExplained";
import { Conclusion } from "./scenes/Conclusion";
import { IntroHook } from "./scenes/IntroHook";
import { ProblemStats } from "./scenes/ProblemStats";

const FPS = 30;
const W = 1920;
const H = 1080;

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* MAIN — full pitch 2:40 (4800 frames @ 30fps) */}
      <Composition
        id="AriaVideo"
        component={AriaVideo}
        durationInFrames={4800}
        fps={FPS}
        width={W}
        height={H}
      />

      {/* Sub-comps for standalone iteration */}
      <Composition
        id="IntroHook"
        component={IntroHook}
        durationInFrames={330}
        fps={FPS}
        width={W}
        height={H}
      />
      <Composition
        id="ProblemStats"
        component={ProblemStats}
        durationInFrames={690}
        fps={FPS}
        width={W}
        height={H}
      />
      <Composition
        id="AppDemo"
        component={AppDemo}
        durationInFrames={2190}
        fps={FPS}
        width={W}
        height={H}
      />
      <Composition
        id="ConceptsExplained"
        component={ConceptsExplained}
        durationInFrames={1350}
        fps={FPS}
        width={W}
        height={H}
      />
      <Composition
        id="Conclusion"
        component={Conclusion}
        durationInFrames={240}
        fps={FPS}
        width={W}
        height={H}
      />
    </>
  );
};
