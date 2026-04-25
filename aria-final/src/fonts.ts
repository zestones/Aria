// Load Google Fonts once via @remotion/google-fonts so they're available
// in studio and during render without flash-of-unstyled-text.
import { loadFont as loadSofia } from "@remotion/google-fonts/SofiaSans";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";

// Side-effect imports : registers @font-face globally.
loadSofia();
loadMono();
