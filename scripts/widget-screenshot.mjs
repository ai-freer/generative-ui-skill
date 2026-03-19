/**
 * Widget Screenshot Service — M3a S2
 *
 * Renders widget_code to PNG using Playwright + buildWidgetDoc from @generative-ui/renderer.
 *
 * Usage (CLI — called by OpenClaw agent via exec):
 *   node scripts/widget-screenshot.mjs --title "jwt_flow" [--theme light] [--width 680] [--wait 3000]
 *   (reads model output from stdin, extracts widget by title, screenshots it)
 *
 *   node scripts/widget-screenshot.mjs --file examples/jwt-flow.html --output /tmp/out.png
 *   (screenshots a raw HTML file directly)
 *
 * As module:
 *   import { captureWidget, initBrowser, closeBrowser } from './widget-screenshot.mjs';
 */

import { buildWidgetDoc } from '../packages/renderer/dist/index.js';
import { interceptWidgets } from './widget-interceptor.mjs';

let browser = null;

const THREE_RENDER_SETTLE_MS = 1200;
const CANVAS_RENDER_SETTLE_MS = 500;
const SOFTWARE_GL_ARGS = [
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-webgl',
  '--ignore-gpu-blocklist',
  '--enable-unsafe-swiftshader',
  '--disable-dev-shm-usage',
];

/**
 * Poll until a canvas element has non-blank pixels, or timeout.
 * @param {import('playwright').Page} page
 * @param {number} maxWait - max wait in ms
 */
async function waitForCanvasRender(page, maxWait = 5000) {
  const interval = 200;
  const maxAttempts = Math.ceil(maxWait / interval);
  for (let i = 0; i < maxAttempts; i++) {
    const rendered = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return true; // no canvas, nothing to wait for
      try {
        const ctx = canvas.getContext('2d') || canvas.getContext('webgl') || canvas.getContext('webgl2');
        if (!ctx) return true;
        // For WebGL: check if anything was drawn
        if (ctx.drawingBufferWidth !== undefined) {
          const pixels = new Uint8Array(4);
          ctx.readPixels(
            Math.floor(ctx.drawingBufferWidth / 2),
            Math.floor(ctx.drawingBufferHeight / 2),
            1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, pixels
          );
          return pixels[0] + pixels[1] + pixels[2] + pixels[3] > 0;
        }
        // For 2D canvas: sample center pixel
        const data = ctx.getImageData(
          Math.floor(canvas.width / 2),
          Math.floor(canvas.height / 2),
          1, 1
        ).data;
        return data[0] + data[1] + data[2] + data[3] > 0;
      } catch { return false; }
    });
    if (rendered) return true;
    await page.waitForTimeout(interval);
  }
  return false;
}

/**
 * Wait a little longer after the first visible render so async scene setup,
 * late texture/material work, and iframe-like post-load tasks can settle.
 * @param {import('playwright').Page} page
 * @param {number} delayMs
 */
async function waitForRenderSettle(page, delayMs = 0) {
  if (delayMs > 0) {
    await page.waitForTimeout(delayMs);
  }
}

/**
 * Resolve playwright/playwright-core from multiple possible locations.
 */
async function resolvePlaywright() {
  // 1. Try standard import (local node_modules or global)
  for (const mod of ['playwright', 'playwright-core']) {
    try { return await import(mod); } catch { /* continue */ }
  }
  // 2. Scan npx cache for playwright
  const { readdirSync, existsSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { homedir } = await import('node:os');
  const npxDir = join(homedir(), '.npm', '_npx');
  if (existsSync(npxDir)) {
    for (const entry of readdirSync(npxDir)) {
      const candidate = join(npxDir, entry, 'node_modules', 'playwright', 'index.mjs');
      if (existsSync(candidate)) {
        return await import(candidate);
      }
    }
  }
  console.error('Error: playwright is required. Install with: npm i playwright');
  process.exit(1);
}

/**
 * Initialize or reuse a Playwright browser instance.
 *
 * Supports two modes:
 * - CDP mode: connect to an existing Chrome via CDP endpoint (set CHROME_CDP_URL env var)
 *   e.g. CHROME_CDP_URL=http://localhost:9222
 * - Launch mode: start a new headless Chromium process (default)
 */
export async function initBrowser() {
  if (browser) return browser;
  const pw = await resolvePlaywright();
  const cdpUrl = process.env.CHROME_CDP_URL;
  if (cdpUrl) {
    browser = await pw.chromium.connectOverCDP(cdpUrl);
  } else {
    browser = await pw.chromium.launch({
      headless: true,
      args: SOFTWARE_GL_ARGS,
    });
  }
  return browser;
}

/**
 * Capture a widget as PNG.
 * @param {string} widgetCode - raw HTML/SVG widget code
 * @param {Object} [options]
 * @param {string} [options.theme='light']
 * @param {number} [options.width=680]
 * @param {number} [options.deviceScaleFactor=2]
 * @param {number} [options.timeout=5000]
 * @param {number} [options.wait=0] - explicit wait override in ms (0 = auto-detect)
 * @returns {Promise<Buffer>} PNG buffer
 */
export async function captureWidget(widgetCode, options = {}) {
  const {
    theme = 'light',
    width = 680,
    deviceScaleFactor = 2,
    timeout = 5000,
    wait = 0,
  } = options;

  const b = await initBrowser();
  const page = await b.newPage({
    viewport: { width, height: 800 },
    deviceScaleFactor,
    colorScheme: theme === 'dark' ? 'dark' : 'light',
  });

  const html = buildWidgetDoc(widgetCode);
  await page.setContent(html, { waitUntil: 'networkidle', timeout });

  if (wait > 0) {
    // Explicit wait override (caller knows best)
    await page.waitForTimeout(wait);
  } else {
    // Smart wait: detect content type and wait accordingly
    const contentType = await page.evaluate(() => {
      const hasCanvas = !!document.querySelector('canvas');
      const hasThreeJS = typeof window.THREE !== 'undefined'
        || !!document.querySelector('script[src*="three"]');
      const hasChartJS = typeof window.Chart !== 'undefined'
        || !!document.querySelector('script[src*="chart"]');
      return { hasCanvas, hasThreeJS, hasChartJS };
    });

    if (contentType.hasThreeJS) {
      // Three.js: CDN load + WebGL init + first render, then allow extra
      // settle time for scene bootstrapping before capture.
      const rendered = await waitForCanvasRender(page, 8000);
      if (!rendered) {
        const mode = process.env.CHROME_CDP_URL ? 'cdp' : 'launch';
        throw new Error(
          mode === 'cdp'
            ? 'Three.js/WebGL did not render on the CDP Chrome instance. On GPU-less VPS hosts, start Chrome with software WebGL flags such as: --use-gl=angle --use-angle=swiftshader --enable-webgl --ignore-gpu-blocklist --enable-unsafe-swiftshader'
            : 'Three.js/WebGL did not render even after enabling SwiftShader software rendering. Check whether the VPS blocks headless WebGL, or increase the 3D wait time and inspect browser logs.'
        );
      }
      await waitForRenderSettle(page, THREE_RENDER_SETTLE_MS);
    } else if (contentType.hasChartJS || contentType.hasCanvas) {
      // Canvas widgets often draw a first frame before labels/animations finish.
      await waitForCanvasRender(page, 3000);
      await waitForRenderSettle(page, CANVAS_RENDER_SETTLE_MS);
    } else {
      // SVG / static HTML: brief wait for fonts
      await page.waitForTimeout(500);
    }
  }

  // Auto-fit height: prefer actual content height
  const height = await page.evaluate(() => {
    const body = document.body;
    const html = document.documentElement;
    // Check for SVG with explicit viewBox
    const svg = body.querySelector('svg[viewBox]');
    if (svg) {
      const vb = svg.getAttribute('viewBox').split(/[\s,]+/).map(Number);
      if (vb.length === 4 && vb[3] > 0) {
        const svgAspect = vb[3] / vb[2];
        return Math.ceil(body.clientWidth * svgAspect);
      }
    }
    return Math.max(body.scrollHeight, html.scrollHeight);
  });
  await page.setViewportSize({ width, height: Math.max(100, Math.min(height + 16, 4000)) });

  const buffer = await page.screenshot({ type: 'png', fullPage: true });
  await page.close();
  return buffer;
}

/**
 * Close the browser instance.
 */
export async function closeBrowser() {
  if (browser) {
    await browser.close();
    browser = null;
  }
}

// CLI mode
if (process.argv[1] && process.argv[1].endsWith('widget-screenshot.mjs')) {
  const { writeFileSync, readFileSync, mkdirSync, existsSync } = await import('node:fs');
  const { join } = await import('node:path');

  const args = process.argv.slice(2);
  const getArg = (name) => {
    const idx = args.indexOf(name);
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
  };

  const title = getArg('--title');
  const file = getArg('--file');
  const output = getArg('--output');
  const theme = getArg('--theme') || 'light';
  const width = parseInt(getArg('--width') || '680', 10);
  const wait = parseInt(getArg('--wait') || '0', 10);

  let widgetCode;

  if (file) {
    // Direct file mode: screenshot raw HTML
    widgetCode = readFileSync(file, 'utf-8');
  } else if (title) {
    // Agent mode: read model output from stdin, find widget by title
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    const modelOutput = Buffer.concat(chunks).toString('utf-8');

    const result = interceptWidgets(modelOutput);
    if (!result.hasWidget) {
      console.error('No show-widget fences found in input');
      process.exit(1);
    }

    const widget = result.widgets.find(w =>
      w.title.toLowerCase() === title.toLowerCase()
    ) || result.widgets[0];
    widgetCode = widget.widgetCode;
  } else {
    // Stdin as raw widget code
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    widgetCode = Buffer.concat(chunks).toString('utf-8');
  }

  try {
    const png = await captureWidget(widgetCode, { theme, width, wait });

    const outPath = output || (() => {
      const dir = join(process.cwd(), 'imagine');
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      return join(dir, `${title || 'widget'}-${Date.now()}.png`);
    })();
    writeFileSync(outPath, png);

    // Output the path for the agent to use in send action
    console.log(outPath);
  } finally {
    await closeBrowser();
  }
}
