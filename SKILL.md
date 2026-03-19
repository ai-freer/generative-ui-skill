---
name: generative-ui
description: "Generate interactive UI components (charts, diagrams, flowcharts, calculators, data visualizations) in conversations. Use when: user requests visualization, charts, flowcharts, architecture diagrams, comparison tables, data displays, interactive components, or any content that benefits from graphical presentation. NOT for: plain text Q&A, code generation, file operations."
metadata: { "openclaw": { "emoji": "📊", "requires": { "env": ["CHROME_CDP_URL"] } } }
---

# Generative UI Skill

Enables AI agents to generate interactive UI components in conversations — charts, diagrams, calculators, data visualizations.

## Overview

This Skill injects a System Prompt that teaches the model to output renderable HTML/SVG widgets using `show-widget` code fences. It does not depend on any specific SDK or tool_use mechanism — any model capable of outputting markdown can use it.

## Setup

Add this Skill directory to the agent's skill list. Ensure `prompts/system.md` is injected into the model's system prompt.

## Configuration

Choose which design guideline modules to inject based on the use case. Each module should be combined with `prompts/guidelines/core.md`.

| Parameter | Description | Default |
|-----------|-------------|---------|
| `modules` | Which guideline modules to load | `["core"]` |
| `send_message_fn` | Function name for in-widget follow-up | `window.__widgetSendMessage` |

### Available Modules

| Module | Guideline Files Loaded | Use Case |
|--------|----------------------|----------|
| `diagram` | core + color-palette + svg-setup + diagram | Flowcharts, architecture diagrams, schematics |
| `chart` | core + ui-components + color-palette + chart | Chart.js data charts, dashboards |
| `interactive` | core + ui-components + color-palette | Calculators, forms, interactive components |
| `mockup` | core + ui-components + color-palette | UI prototypes, cards, layouts |
| `art` | core + svg-setup + art | SVG illustrations, generative art |

## Usage

### 1. Inject System Prompt

Append the contents of `prompts/system.md` to the model's system prompt.

### 2. Inject Guideline Modules as Needed

Based on the conversation context, append the corresponding guideline files from `prompts/guidelines/` to the system prompt. Shared files (e.g. core.md) only need to be injected once.

### 3. Model Outputs Widget

The model will output widgets using code fences in its response:

````
Some explanatory text...

```show-widget
{"title": "jwt_auth_flow", "widget_code": "<svg width=\"100%\" viewBox=\"0 0 680 420\">...</svg>"}
```

More explanatory text...
````

### 4. Frontend Rendering

When the frontend detects a `show-widget` fence, it extracts `widget_code` and renders it in an iframe or DOM element.

## Examples

- `examples/flowchart.html` — JWT auth flow (SVG flowchart)
- `examples/chart.html` — User growth trend (Chart.js line chart + metric cards)
- `examples/calculator.html` — Compound interest calculator (interactive sliders + real-time chart)
- `examples/comparison.html` — REST vs GraphQL comparison (SVG side-by-side)

## Technical Requirements

### CDN Allowlist

External resources in widgets can only be loaded from these CDNs (enforced by CSP):

- `cdnjs.cloudflare.com`
- `cdn.jsdelivr.net`
- `unpkg.com`
- `esm.sh`

### Security Constraints

- Widget code runs in a sandboxed iframe (no allow-same-origin / allow-top-navigation)
- `connect-src 'none'` blocks fetch / XHR / WebSocket
- Link clicks are intercepted and handled by the host application

## Channel Adaptation: Widget Screenshot & Delivery (M3)

**CRITICAL: On Telegram, Feishu, QQ, and other non-Web channels, you MUST render widgets as PNG images before sending. NEVER send the raw show-widget fence code directly to the user — they will see garbled HTML.**

### Mandatory Rules

1. **You MUST use the `show-widget` fence** (NOT `html`, `svg`, or any other fence marker)
2. **After every `show-widget` fence output, you MUST immediately run the screenshot script** — do not skip this step
3. **Send the generated PNG image to the user**, not the raw code
4. Web Playground and Aight App support direct widget rendering — these are the ONLY channels that do not require screenshots

### Screenshot Workflow (MUST execute after every widget output)

> Script paths use the `{baseDir}` placeholder, which OpenClaw automatically replaces with this Skill's installation directory.

**Step 1** — Immediately after outputting a `show-widget` fence, call the screenshot script (via exec tool, host set to gateway):

```
exec: echo '<full_model_response>' | node {baseDir}/scripts/widget-screenshot.mjs --title "<widget_title>"
```

The script extracts the matching show-widget fence from the response, renders it as PNG, and outputs the file path.

**Step 2** — Send the image to the current conversation via send action:

```
send: { to: "<chat_id>", media: "<png_path>", caption: "<widget_title>" }
```

**Step 3** (optional) — If the widget contains drill-down buttons (`__widgetSendMessage` calls), extract the button list:

```
exec: echo '<widget_code>' | node {baseDir}/scripts/widget-drilldown.mjs
```

Then attach the buttons parameter in the send action so users can tap to follow up.

### Common Mistakes (DO NOT make these)

- ❌ Using `html` fence to output widget code → user sees garbled text
- ❌ Outputting `show-widget` fence without screenshotting → user sees raw JSON + HTML
- ❌ Sending widget_code as a text message → user sees a wall of code
- ✅ Correct: `show-widget` fence → screenshot → send PNG image

### Environment Requirements

- The exec tool must use `host: gateway` (or `node`) to inherit host environment variables (e.g. `CHROME_CDP_URL`)
- If using an existing Chrome instance on the VPS, set the environment variable: `CHROME_CDP_URL=http://localhost:9222`
- If `CHROME_CDP_URL` is not set, the script will attempt to launch headless Chromium (requires Playwright + Chromium installed)

### Script Parameters

| Script | Parameter | Description |
|--------|-----------|-------------|
| `widget-screenshot.mjs` | `--title <name>` | Extract widget by title from stdin model output and screenshot it |
| | `--file <path>` | Screenshot a raw HTML file directly |
| | `--output <path>` | Specify output PNG path (defaults to `./imagine/`) |
| | `--theme light\|dark` | Screenshot theme (default: light) |
| | `--width <px>` | Viewport width (default: 680) |
| `widget-drilldown.mjs` | `--code <html>` | Extract drill-down buttons from widget_code |
| | `--file <path>` | Extract from a file |

## Related Projects

- Rendering runtime (`@generative-ui/renderer`) — see M2 milestone
- Original references: [CodePilot](https://github.com/op7418/CodePilot) / [pi-generative-ui](https://github.com/Michaelliv/pi-generative-ui)
