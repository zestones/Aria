# aria-final

Remotion composition for the ARIA hackathon demo video (Anthropic Opus 4.7, April 2026).

Target duration: **2:50** (5100 frames @ 60fps, 1920x1080).

## Quick start

```bash
npm install
npx remotion studio   # http://localhost:3000
```

## Compositions

| ID | Frames | Duration | Purpose |
|---|---|---|---|
| `AriaVideo` | 5100 | 2:50 | Full pitch — chains 5 scenes + voiceover |
| `IntroHook` | 750 | 0:25 | Veo intro placeholder |
| `ProblemStats` | 750 | 0:25 | Cost cross-out scene |
| `AppDemo` | 2100 | 1:10 | Screen recording placeholder |
| `ConceptsExplained` | 1050 | 0:35 | 4 concept micro-animations |
| `Conclusion` | 450 | 0:15 | Logo + tagline + credits |

## Assets

Drop into `public/assets/`:

- `intro-veo.mp4` — Veo-generated intro, 25s, 1920x1080
- `app-demo.mp4` — App screen recording, 70s, 1920x1080, continuous take
- `voiceover.mp3` — Adam's narration, 2:50, mono 320kbps

The `assets/logo/*.svg` files are already there.
