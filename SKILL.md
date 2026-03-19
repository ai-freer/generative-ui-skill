---
name: generative-ui
description: "Generate interactive UI components (charts, diagrams, flowcharts, calculators, data visualizations) in conversations. Use when: user requests visualization, charts, flowcharts, architecture diagrams, comparison tables, data displays, interactive components, or any content that benefits from graphical presentation. NOT for: plain text Q&A, code generation, file operations."
metadata: { "openclaw": { "emoji": "📊", "requires": { "env": ["CHROME_CDP_URL"] } } }
---

# Generative UI Skill

Generate interactive UI components (charts, diagrams, calculators, data visualizations) using `show-widget` code fences.

## Scope

This `SKILL.md` is written for the **OpenClaw Skill runtime only**.

## MANDATORY: Widget Screenshot & Delivery

**In the OpenClaw bot delivery flow, users on IM channels cannot render HTML/SVG/JSON code directly. Do NOT send `show-widget`, HTML, SVG, or JSON code to the user as a message.**

**You must use the screenshot script, which connects to Chrome through CDP (Chrome DevTools Protocol), actually renders the widget in a browser context, captures a PNG screenshot, and then sends that PNG to the user.**

**The required flow is: generate widget code → render it through CDP → capture PNG → send PNG. Never send the raw rendering code itself.**

### Rules

1. **Always use the `show-widget` fence** — NOT `html`, `svg`, or any other fence marker
2. **In OpenClaw IM delivery, every widget must be rendered through CDP and converted to a PNG screenshot** — NEVER skip this
3. **Send the PNG image to the user** — NEVER send raw `show-widget`, HTML, SVG, or JSON as user-visible text
4. **Do not rely on any downstream cleaner or interceptor. Always assume raw `show-widget` fences will reach the user unless you render through CDP and send the PNG instead**

### Workflow (execute after EVERY widget output)

> `{baseDir}` is automatically replaced with this Skill's installation directory.
>
> The exact `exec` wrapper syntax may vary by runtime, but the command must run on **`host: gateway`** so it can access `CHROME_CDP_URL`.

**Step 1** — Screenshot the widget:

```
exec:
  host: gateway
  cmd: |
    cat <<'EOF' | node {baseDir}/scripts/widget-screenshot.mjs --title "<widget_title>"
    <your_full_response_text>
    EOF
```

Output: file path to the generated PNG.

**Step 2** — Send the image (without buttons first, or combined with Step 3):

```
send: { to: "<chat_id>", media: "<png_path>", caption: "<widget_title>" }
```

**Step 3** — Extract drill-down buttons and send image WITH buttons:

```
exec:
  host: gateway
  cmd: |
    cat <<'EOF' | node {baseDir}/scripts/widget-drilldown.mjs
    <widget_code>
    EOF
```

The script outputs extracted drill-down queries plus reference button payloads. Use the queries to construct native buttons for the current channel's send action.

**Button layout rule: pack 3 buttons per row when the channel supports rows. Avoid stacking buttons vertically one-per-row unless the channel forces it.**

Example for Telegram (buttons as top-level 2D array — each inner array is one row):

```
send: { to: "<chat_id>", media: "<png_path>", caption: "<widget_title>", buttons: [[{"text": "Explain etcd", "callback_data": "drill:Explain etcd"}, {"text": "How Raft works", "callback_data": "drill:How Raft works"}, {"text": "Compare etcd vs ZK", "callback_data": "drill:Compare etcd vs ZK"}]] }
```

Note: the drill-down script outputs a `telegram` field as a reference payload only. Re-pack buttons into compact rows yourself if the current channel supports that layout.

For other channels (Feishu, QQ, etc.), use the channel's native button format. The drill-down script provides the query text — adapt it to whatever button structure the current channel supports.

### Widget Interactivity on IM Channels

On Web, users click elements inside the widget. On IM channels (Telegram/Feishu/QQ), this interactivity is preserved through native buttons. For this to work:

- **Always include `window.__widgetSendMessage('...')` calls in your widget code** — even though the widget will be rendered as a static PNG, these calls are extracted and converted to native channel buttons
- Add drill-down interactions on meaningful nodes: key terms, data points, process steps, comparison items
- Each widget should have at least 2-3 follow-up question buttons
- Example: `<rect onclick="window.__widgetSendMessage('Explain etcd in detail')" ...>`

### Common Mistakes

- ❌ `html` fence → user sees garbled text
- ❌ IM delivery with raw `show-widget` fence and no cleaner hook → user sees raw JSON + HTML
- ❌ Generating widget code and sending it directly without CDP rendering
- ❌ Sending widget_code as text → user sees code wall
- ❌ Using `echo '...'` for full widget payloads → shell quoting breaks on `'`, newlines, or backslashes
- ✅ `show-widget` fence → CDP render → screenshot → send PNG
- ✅ Use heredoc (`cat <<'EOF'`) when passing full response text or widget HTML into scripts

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
| | `--wait <ms>` | Explicit wait time in ms (default: auto-detect based on content type; use 3000-5000 for Three.js/3D widgets) |
| `widget-drilldown.mjs` | `--code <html>` | Extract drill-down buttons from widget_code |
| | `--file <path>` | Extract from file |
