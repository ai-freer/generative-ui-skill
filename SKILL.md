---
name: generative-ui
description: "Generate interactive UI components (charts, diagrams, flowcharts, calculators, data visualizations) in conversations. Use when: user requests visualization, charts, flowcharts, architecture diagrams, comparison tables, data displays, interactive components, or any content that benefits from graphical presentation. NOT for: plain text Q&A, code generation, file operations."
metadata: { "openclaw": { "emoji": "📊", "requires": { "env": ["CHROME_CDP_URL"] } } }
---

# Generative UI Skill

Generate interactive UI components (charts, diagrams, calculators, data visualizations) using `show-widget` code fences.

## MANDATORY: Widget Screenshot & Delivery

**You are NOT on a Web browser. Users cannot render HTML/SVG. Every widget you generate MUST be screenshotted and sent as a PNG image. There are ZERO exceptions.**

### Rules

1. **Always use the `show-widget` fence** — NOT `html`, `svg`, or any other fence marker
2. **Immediately after outputting a `show-widget` fence, run the screenshot script** — NEVER skip this
3. **Send the PNG image to the user** — NEVER send raw code, JSON, or HTML as text
4. **If you forget to screenshot, the user sees garbled code** — this is a critical failure

### Workflow (execute after EVERY widget output)

> `{baseDir}` is automatically replaced with this Skill's installation directory.

**Step 1** — Screenshot the widget:

```
exec: echo '<your_full_response_text>' | node {baseDir}/scripts/widget-screenshot.mjs --title "<widget_title>"
```

Output: file path to the generated PNG.

**Step 2** — Send the image (without buttons first, or combined with Step 3):

```
send: { to: "<chat_id>", media: "<png_path>", caption: "<widget_title>" }
```

**Step 3** — Extract drill-down buttons and send image WITH buttons:

```
exec: echo '<widget_code>' | node {baseDir}/scripts/widget-drilldown.mjs
```

The script outputs a JSON with extracted drill-down queries. Use these to construct native buttons for the current channel's send action.

Example for Telegram (buttons as top-level 2D array of `{text, callback_data}`):

```
send: { to: "<chat_id>", media: "<png_path>", caption: "<widget_title>", buttons: [[{"text": "Explain etcd", "callback_data": "drill:Explain etcd"}]] }
```

For other channels (Feishu, QQ, etc.), use the channel's native button format. The drill-down script provides the query text — adapt it to whatever button structure the current channel supports.

### Widget Interactivity on IM Channels

On Web, users click elements inside the widget. On IM channels (Telegram/Feishu/QQ), this interactivity is preserved through native buttons. For this to work:

- **Always include `window.__widgetSendMessage('...')` calls in your widget code** — even though the widget will be rendered as a static PNG, these calls are extracted and converted to native channel buttons
- Add drill-down interactions on meaningful nodes: key terms, data points, process steps, comparison items
- Each widget should have at least 2-3 follow-up question buttons
- Example: `<rect onclick="window.__widgetSendMessage('Explain etcd in detail')" ...>`

### Common Mistakes

- ❌ `html` fence → user sees garbled text
- ❌ `show-widget` fence without screenshot → user sees raw JSON + HTML
- ❌ Sending widget_code as text → user sees code wall
- ✅ `show-widget` fence → screenshot → send PNG

### Environment

- exec must use `host: gateway` to inherit `CHROME_CDP_URL`
- Screenshot output defaults to `./imagine/` directory

---

## Widget Output Format

Output widgets using `show-widget` code fences:

````
Some explanatory text...

```show-widget
{"title": "jwt_auth_flow", "widget_code": "<svg width=\"100%\" viewBox=\"0 0 680 420\">...</svg>"}
```

More explanatory text...
````

### CDN Allowlist (CSP enforced)

- `cdnjs.cloudflare.com`
- `cdn.jsdelivr.net`
- `unpkg.com`
- `esm.sh`

### Security

- Widget code runs in sandboxed iframe (no allow-same-origin)
- `connect-src 'none'` blocks fetch / XHR / WebSocket

---

## Script Parameters

| Script | Parameter | Description |
|--------|-----------|-------------|
| `widget-screenshot.mjs` | `--title <name>` | Extract widget by title from stdin and screenshot |
| | `--file <path>` | Screenshot a raw HTML file |
| | `--output <path>` | Output PNG path (default: `./imagine/`) |
| | `--theme light\|dark` | Theme (default: light) |
| | `--width <px>` | Viewport width (default: 680) |
| `widget-drilldown.mjs` | `--code <html>` | Extract drill-down buttons from widget_code |
| | `--file <path>` | Extract from file |
