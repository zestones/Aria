/**
 * record-app-demo.ts — automated capture of the ARIA end-to-end demo flow.
 *
 * Produces `public/assets/app-demo.mp4` (1920x1080, ~73s) from a live ARIA
 * stack at http://localhost:5173. Used as the SECTION 3 hero clip in the
 * Remotion master composition (see SCRIPT-VOICEOVER-V3.md §3).
 *
 * Pre-requisites :
 *   1. ARIA stack up (`make deploy` from the ARIA repo, port 5173)
 *   2. ffmpeg installed (Homebrew or system) for webm → mp4 conversion
 *   3. `npm install -D @playwright/test playwright` (run once)
 *
 * Run :
 *   npm run record:app-demo
 *
 * Output :
 *   recordings/app-demo-raw.webm   (Playwright native recording)
 *   public/assets/app-demo.mp4     (H.264 yuv420p, ready for <Video>)
 *
 * Resilience : every step is wrapped in step() which catches/logs errors
 * and continues to the next step instead of crashing the run. The mp4 is
 * always produced, even if some beats failed.
 */

import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

// -----------------------------------------------------------------------------
// Config
// -----------------------------------------------------------------------------
const BASE_URL = process.env.ARIA_BASE_URL ?? "http://localhost:5173";
const VIEWPORT = { width: 1920, height: 1080 };
const RECORDINGS_DIR = path.resolve(__dirname, "..", "recordings");
const OUTPUT_DIR = path.resolve(__dirname, "..", "public", "assets");
const OUTPUT_MP4 = path.join(OUTPUT_DIR, "app-demo.mp4");
const MOCK_PDF_PATH = path.join(RECORDINGS_DIR, "grundfos-mock.pdf");

const STEP_TIMEOUT_MS = 30_000;

// -----------------------------------------------------------------------------
// Utilities
// -----------------------------------------------------------------------------
function log(step: string, msg: string): void {
  // eslint-disable-next-line no-console
  console.log(`[${step}] ${msg}`);
}

function warn(step: string, msg: string): void {
  // eslint-disable-next-line no-console
  console.warn(`[${step}] WARN: ${msg}`);
}

function err(step: string, msg: string): void {
  // eslint-disable-next-line no-console
  console.error(`[${step}] FAILED: ${msg}`);
}

async function step(
  name: string,
  fn: () => Promise<void>,
  { timeoutMs = STEP_TIMEOUT_MS }: { timeoutMs?: number } = {},
): Promise<void> {
  const t0 = Date.now();
  log(name, "start");
  try {
    const result = await Promise.race([
      fn().then(() => ({ ok: true } as const)),
      new Promise<{ ok: false; reason: string }>((resolve) =>
        setTimeout(() => resolve({ ok: false, reason: `timeout after ${timeoutMs}ms` }), timeoutMs),
      ),
    ]);
    if (!result.ok) {
      warn(name, result.reason + " — continuing to next step");
      return;
    }
    log(name, `done in ${Date.now() - t0}ms`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    err(name, msg);
  }
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Ensure a mock PDF exists for the Bottle Labeler onboarding step.
 * Creates a tiny but valid PDF if none is provided.
 */
function ensureMockPdf(): void {
  if (fs.existsSync(MOCK_PDF_PATH)) {
    log("setup", `mock PDF already at ${MOCK_PDF_PATH}`);
    return;
  }
  // Minimal PDF 1.4 — accepted by most parsers as "valid empty"
  const minimalPdf = Buffer.from(
    "%PDF-1.4\n" +
      "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
      "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
      "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<<>>>>endobj\n" +
      "4 0 obj<</Length 44>>stream\nBT /F1 12 Tf 100 700 Td (Grundfos Mock) Tj ET\nendstream\nendobj\n" +
      "xref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000054 00000 n \n0000000101 00000 n \n0000000184 00000 n \n" +
      "trailer<</Size 5/Root 1 0 R>>\nstartxref\n270\n%%EOF\n",
    "utf-8",
  );
  fs.writeFileSync(MOCK_PDF_PATH, minimalPdf);
  log("setup", `created mock PDF at ${MOCK_PDF_PATH}`);
}

/**
 * Try multiple locator strategies in order — return the first that resolves
 * to a visible element within shortTimeout. Returns null if nothing matches.
 */
async function firstVisible(
  page: Page,
  candidates: Array<() => ReturnType<Page["locator"]>>,
  { timeoutMs = 5_000 }: { timeoutMs?: number } = {},
): Promise<ReturnType<Page["locator"]> | null> {
  for (const get of candidates) {
    try {
      const loc = get();
      await loc.first().waitFor({ state: "visible", timeout: timeoutMs });
      return loc.first();
    } catch {
      // try next candidate
    }
  }
  return null;
}

// -----------------------------------------------------------------------------
// Main flow
// -----------------------------------------------------------------------------
async function main(): Promise<void> {
  ensureDir(RECORDINGS_DIR);
  ensureDir(OUTPUT_DIR);
  ensureMockPdf();

  log("boot", `launching Chromium (headed) → ${BASE_URL}`);

  let browser: Browser | null = null;
  let context: BrowserContext | null = null;

  try {
    browser = await chromium.launch({
      headless: false,
      args: [
        "--window-size=1920,1080",
        "--start-maximized",
        "--disable-blink-features=AutomationControlled",
      ],
    });

    context = await browser.newContext({
      viewport: VIEWPORT,
      recordVideo: {
        dir: RECORDINGS_DIR,
        size: VIEWPORT,
      },
      deviceScaleFactor: 1,
    });

    const page = await context.newPage();
    page.setDefaultTimeout(STEP_TIMEOUT_MS);

    // -------------------------------------------------------------------------
    // STEP 1 · Login (5s)
    // -------------------------------------------------------------------------
    await step("step 1 · login", async () => {
      await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });

      // username field — try multiple semantic locators
      const userField = await firstVisible(page, [
        () => page.getByLabel(/username|user|email/i),
        () => page.getByPlaceholder(/username|user|email/i),
        () => page.locator("input[name='username'], input[type='text']"),
      ]);
      if (!userField) throw new Error("no username field found");
      await userField.fill("admin");

      const passField = await firstVisible(page, [
        () => page.getByLabel(/password/i),
        () => page.getByPlaceholder(/password/i),
        () => page.locator("input[name='password'], input[type='password']"),
      ]);
      if (!passField) throw new Error("no password field found");
      await passField.fill("admin123");

      const submit = await firstVisible(page, [
        () => page.getByRole("button", { name: /sign in|log in|login|submit/i }),
        () => page.locator("button[type='submit']"),
      ]);
      if (!submit) throw new Error("no submit button found");
      await submit.click();

      // Wait for navigation to control room (or fallback any post-login route)
      await page
        .waitForURL((url) => /control-room|dashboard|home/i.test(url.pathname), {
          timeout: 15_000,
        })
        .catch(() => warn("step 1 · login", "did not detect control-room url, continuing"));
    });

    // -------------------------------------------------------------------------
    // STEP 2 · Onboarding Bottle Labeler (10s)
    // -------------------------------------------------------------------------
    await step("step 2 · onboarding bottle labeler", async () => {
      // If we're not already on control-room, navigate
      if (!/control-room/.test(page.url())) {
        await page.goto(`${BASE_URL}/control-room`).catch(() => {});
      }

      const tile = await firstVisible(page, [
        () => page.getByRole("button", { name: /bottle labeler/i }),
        () => page.getByRole("link", { name: /bottle labeler/i }),
        () => page.getByText(/bottle labeler/i),
      ]);
      if (!tile) throw new Error("Bottle Labeler tile not found");
      await tile.click();

      // Find file input — Playwright handles hidden inputs via setInputFiles
      const fileInput = page.locator("input[type='file']").first();
      await fileInput.waitFor({ state: "attached", timeout: 10_000 });
      await fileInput.setInputFiles(MOCK_PDF_PATH);
      log("step 2 · onboarding bottle labeler", `uploaded ${MOCK_PDF_PATH}`);

      // Wait for the 5 KbProgress phases to play out — generous 12s window
      await page.waitForTimeout(10_000);

      // Try to confirm KbCard reveal
      await firstVisible(
        page,
        [
          () => page.getByText(/knowledge base|kb card|extracted|threshold/i),
          () => page.locator("[data-testid='kb-card']"),
        ],
        { timeoutMs: 5_000 },
      );
    }, { timeoutMs: 45_000 });

    // -------------------------------------------------------------------------
    // STEP 3 · Forecast (10s)
    // -------------------------------------------------------------------------
    await step("step 3 · forecast", async () => {
      await page.goto(`${BASE_URL}/control-room`).catch(() => {});
      await page.waitForLoadState("domcontentloaded");

      // Trigger forecast scene via API (cookies from page context auto-attached)
      const seedRes = await page.request
        .post(`${BASE_URL}/api/v1/demo/scene/seed-forecast`, { data: {} })
        .catch((e) => {
          warn("step 3 · forecast", `seed-forecast POST failed: ${e?.message ?? e}`);
          return null;
        });
      if (seedRes) {
        log("step 3 · forecast", `seed-forecast → HTTP ${seedRes.status()}`);
      }

      // Wait for forecast banner on the Filler
      const banner = await firstVisible(
        page,
        [
          () => page.getByText(/forecast|predicted breach|filler/i),
          () => page.locator("[data-testid='forecast-banner']"),
        ],
        { timeoutMs: 10_000 },
      );
      if (banner) {
        await banner.click().catch(() => {});
      }

      // Wait for SignalChart to render
      await firstVisible(
        page,
        [
          () => page.locator("svg.recharts-surface, canvas, [data-testid='signal-chart']"),
        ],
        { timeoutMs: 8_000 },
      );

      await page.waitForTimeout(2_000);
    }, { timeoutMs: 35_000 });

    // -------------------------------------------------------------------------
    // STEP 4 · Breach + Investigation (15s)
    // -------------------------------------------------------------------------
    await step("step 4 · breach + investigation", async () => {
      const breachRes = await page.request
        .post(`${BASE_URL}/api/v1/demo/scene/trigger-breach`, { data: {} })
        .catch((e) => {
          warn("step 4 · breach + investigation", `trigger-breach POST failed: ${e?.message ?? e}`);
          return null;
        });
      if (breachRes) {
        log("step 4 · breach + investigation", `trigger-breach → HTTP ${breachRes.status()}`);
      }

      // Wait for the destructive AnomalyBanner
      const anomaly = await firstVisible(
        page,
        [
          () => page.getByText(/anomaly|breach|critical|investigate/i),
          () => page.locator("[data-testid='anomaly-banner']"),
        ],
        { timeoutMs: 10_000 },
      );

      const investigate = await firstVisible(
        page,
        [
          () => page.getByRole("button", { name: /investigate/i }),
          () => page.getByText(/investigate/i),
        ],
        { timeoutMs: 5_000 },
      );
      if (investigate) await investigate.click();
      else if (anomaly) await anomaly.click().catch(() => {});

      // Wait for chat drawer + Inspector header
      await firstVisible(
        page,
        [
          () => page.getByText(/investigator|opus 4\.7|extended thinking/i),
          () => page.locator("[data-testid='chat-drawer']"),
        ],
        { timeoutMs: 10_000 },
      );

      // Let the thinking_delta stream play out (~15s realtime)
      await page.waitForTimeout(15_000);
    }, { timeoutMs: 50_000 });

    // -------------------------------------------------------------------------
    // STEP 5 · Sandbox HERO (20s) ⭐
    // -------------------------------------------------------------------------
    await step("step 5 · sandbox hero", async () => {
      const sandbox = await firstVisible(
        page,
        [
          () => page.getByText(/ran in anthropic.*sandbox/i),
          () => page.getByText(/sandbox/i),
          () => page.locator("[data-testid='sandbox-execution']"),
        ],
        { timeoutMs: 15_000 },
      );

      if (sandbox) {
        await sandbox
          .scrollIntoViewIfNeeded()
          .catch(() => {});
        // Smooth-scroll a bit further to make the chip visible mid-screen
        await page.evaluate(() => {
          const el = document.querySelector(
            "[data-testid='sandbox-execution']",
          ) as HTMLElement | null;
          if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
        });
      } else {
        warn("step 5 · sandbox hero", "sandbox card not found, holding viewport");
      }

      // HOLD — minimum 5s on the cyan chip for the camera to breathe
      await page.waitForTimeout(7_000);
    }, { timeoutMs: 35_000 });

    // -------------------------------------------------------------------------
    // STEP 6 · Diagnostic + Work Order (10s)
    // -------------------------------------------------------------------------
    await step("step 6 · diagnostic + work order", async () => {
      // Wait for DiagnosticCard with 87% confidence
      await firstVisible(
        page,
        [
          () => page.getByText(/87%|confidence/i),
          () => page.locator("[data-testid='diagnostic-card']"),
        ],
        { timeoutMs: 10_000 },
      );

      const woLink = await firstVisible(
        page,
        [
          () => page.getByRole("link", { name: /work order|wo-/i }),
          () => page.getByText(/work order #|WO-/i),
        ],
        { timeoutMs: 8_000 },
      );
      if (woLink) await woLink.click();

      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(2_000);

      const printBtn = await firstVisible(
        page,
        [
          () => page.getByRole("button", { name: /print/i }),
          () => page.getByText(/^print$/i),
        ],
        { timeoutMs: 5_000 },
      );
      if (printBtn) {
        // Avoid actually opening the native print dialog (would block recording);
        // just hover/highlight and let the work order page hold for 3s
        await printBtn.hover().catch(() => {});
        await page.waitForTimeout(3_000);
      } else {
        await page.waitForTimeout(3_000);
      }
    }, { timeoutMs: 35_000 });

    // -------------------------------------------------------------------------
    // STEP 7 · Constellation hotkey (5s)
    // -------------------------------------------------------------------------
    await step("step 7 · constellation", async () => {
      await page.keyboard.press("KeyA");
      await firstVisible(
        page,
        [
          () => page.getByText(/sentinel|investigator|kb builder|work order/i),
          () => page.locator("[data-testid='agent-constellation']"),
        ],
        { timeoutMs: 5_000 },
      );
      await page.waitForTimeout(3_000);
    }, { timeoutMs: 15_000 });

    // -------------------------------------------------------------------------
    // Close & finalize
    // -------------------------------------------------------------------------
    log("close", "closing context to flush video");
    const video = page.video();
    await context.close();
    context = null;

    let videoPath: string | undefined;
    try {
      videoPath = await video?.path();
    } catch (e) {
      warn("close", `could not resolve video path: ${e instanceof Error ? e.message : String(e)}`);
    }

    if (browser) {
      await browser.close();
      browser = null;
    }

    if (!videoPath) {
      // Fallback : pick newest webm in recordings/
      const webms = fs
        .readdirSync(RECORDINGS_DIR)
        .filter((f) => f.endsWith(".webm"))
        .map((f) => ({ f, mtime: fs.statSync(path.join(RECORDINGS_DIR, f)).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime);
      if (webms[0]) {
        videoPath = path.join(RECORDINGS_DIR, webms[0].f);
        log("close", `fallback newest webm: ${videoPath}`);
      }
    }

    if (!videoPath || !fs.existsSync(videoPath)) {
      err("close", "no video file produced — aborting conversion");
      process.exit(2);
    }

    // Rename raw to a stable name
    const rawTarget = path.join(RECORDINGS_DIR, "app-demo-raw.webm");
    if (videoPath !== rawTarget) {
      fs.copyFileSync(videoPath, rawTarget);
    }
    log("close", `raw recording → ${rawTarget}`);

    // -------------------------------------------------------------------------
    // FFmpeg : webm → mp4 (H.264 yuv420p, web-friendly)
    // -------------------------------------------------------------------------
    log("ffmpeg", `converting → ${OUTPUT_MP4}`);
    try {
      execSync(
        `ffmpeg -y -i "${rawTarget}" -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p -movflags +faststart "${OUTPUT_MP4}"`,
        { stdio: "inherit" },
      );
      log("ffmpeg", `done → ${OUTPUT_MP4}`);
    } catch (e) {
      err("ffmpeg", `conversion failed: ${e instanceof Error ? e.message : String(e)}`);
      err(
        "ffmpeg",
        "raw webm is preserved at " + rawTarget + " — convert manually with: " +
          `ffmpeg -i "${rawTarget}" -c:v libx264 -pix_fmt yuv420p "${OUTPUT_MP4}"`,
      );
      process.exit(3);
    }

    log("done", `final mp4 → ${OUTPUT_MP4}`);
  } catch (e) {
    err("main", e instanceof Error ? e.stack ?? e.message : String(e));
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    process.exit(1);
  }
}

main().catch((e: unknown) => {
  err("entry", e instanceof Error ? e.stack ?? e.message : String(e));
  process.exit(1);
});
