/**
 * Widget Screenshot Service — M3a S2
 *
 * Renders widget_code to PNG using Playwright + buildWidgetDoc from @generative-ui/renderer.
 *
 * Usage (CLI — called by OpenClaw agent via exec):
 *   node scripts/widget-screenshot.mjs --title "jwt_flow" [--theme light] [--width 680]
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
    browser = await pw.chromium.launch({ headless: true });
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
 * @returns {Promise<Buffer>} PNG buffer
 */
export async function captureWidget(widgetCode, options = {}) {
  const {
    theme = 'light',
    width = 680,
    deviceScaleFactor = 2,
    timeout = 5000,
  } = options;

  const b = await initBrowser();
  const page = await b.newPage({
    viewport: { width, height: 800 },
    deviceScaleFactor,
    colorScheme: theme === 'dark' ? 'dark' : 'light',
  });

  const html = buildWidgetDoc(widgetCode);
  await page.setContent(html, { waitUntil: 'networkidle', timeout });

  // Extra wait for Chart.js animations / font loading
  await page.waitForTimeout(500);

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
  const { writeFileSync, readFileSync, mkdtempSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');

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
    const png = await captureWidget(widgetCode, { theme, width });

    const outPath = output || join(
      mkdtempSync(join(tmpdir(), 'widget-')),
      `${title || 'widget'}-${Date.now()}.png`
    );
    writeFileSync(outPath, png);

    // Output the path for the agent to use in send action
    console.log(outPath);
  } finally {
    await closeBrowser();
  }
}
