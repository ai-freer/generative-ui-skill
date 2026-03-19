# Generative UI — Installation Guide

This document is intended for the Agent to read and execute installation steps.

---

## 1. Install Skill

Register this directory as an OpenClaw Skill. Choose one of the following methods:

### Method A: Symlink (recommended, easy to iterate via git pull)

```bash
ln -s <absolute_path_to_this_directory> ~/.openclaw/workspace/skills/generative-ui
```

### Method B: extraDirs config

Add the parent directory of this folder to `~/.openclaw/openclaw.json`:

```jsonc
{ "skills": { "load": { "extraDirs": ["<parent_directory_of_this_folder>"] } } }
```

Verify: confirm `SKILL.md` is loaded by OpenClaw (`generative-ui` appears in the skill list).

---

## 2. Enable Always-On Routing via Each Bot's `TOOLS.md`

If you want Generative UI to behave like a system-level, always-on capability in OpenClaw, do **not** rely on an extra custom bootstrap markdown file such as `GENERATIVE-UI.md`. In practice, that file name is not loaded by the bootstrap allowlist.

Instead, append a lightweight routing block to the end of each bot's `TOOLS.md`.

Use the following snippet, and replace `<generative_ui_skill_dir>` with the actual installed absolute path of this skill directory:

- Symlink install example: `~/.openclaw/workspace/skills/generative-ui`
- Shared install example: `/root/.openclaw/shared-skills/generative-ui`

```md
## Generative UI Capability

You have the ability to generate rich interactive visual content — SVG diagrams, charts, calculators, data visualizations — rendered as images for IM delivery.

### When to Use

Evaluate every user query against this table. If the intent matches, generate a widget.

| User intent | Widget type |
|---|---|
| Process / how X works | SVG flowchart |
| Structure / what is X | SVG hierarchy or layers |
| History / sequence | SVG timeline |
| Cycle / feedback loop | HTML stepper (not SVG ring) |
| Compare A vs B | SVG side-by-side or HTML card grid |
| Data / trends | Chart.js (canvas + CDN) |
| Calculation / formula | HTML with sliders/inputs |
| Ranking / proportions | HTML bar display |
| UI mockup / prototype | HTML with CSS |
| Draw / illustrate | SVG illustration |
| Planning / itinerary / schedule | SVG flowchart or timeline with clickable nodes |
| Recommendation / options | HTML card grid with clickable items |
| Product features / selling points / advantages | HTML card grid with clickable items |
| Introduce / explain a thing with multiple aspects | SVG structural diagram or HTML card grid |
| Pros and cons / trade-offs | HTML comparison cards or SVG side-by-side |
| 3D spatial model / orbital / molecular / mechanical | Three.js (canvas + CDN) |

**Default behavior: generate a widget.** Most questions benefit from visual presentation. Only use plain text when the question is strictly conversational (greetings, opinions, short factual lookups, code snippets, or meta-discussion about the conversation itself). When in doubt, generate a widget.

### How to Execute

When you decide a widget is appropriate, use the Generative UI Skill. Do NOT search for it — use this exact path:

- **SKILL.md**: `<generative_ui_skill_dir>/SKILL.md`
- **Skill directory**: `<generative_ui_skill_dir>/`

Read the `SKILL.md` and follow its complete workflow:
1. Generate the widget using `show-widget` code fence
2. Render it via the CDP screenshot script
3. Send the PNG image to the user with drill-down buttons

All widget authoring rules, design guidelines, security constraints, and script parameters are defined in the `SKILL.md`. Refer to it at execution time.
```

This block should stay lightweight. Its job is only:

- always-on query routing
- deciding whether a widget is appropriate
- pointing the bot to the installed skill path

Do **not** paste the full `prompts/system.md` into `TOOLS.md`. Keep the detailed authoring rules inside the skill itself.

---

## 3. Install Playwright Client

The screenshot script requires `playwright-core` as a Chrome CDP client SDK (no browser binaries included).

```bash
cd <this_directory>
npm install playwright-core
```

> Prerequisite: A Chrome instance must already be running on the VPS with CDP enabled (`--remote-debugging-port=9222`).
> Installing Chrome and opening the CDP port is NOT the responsibility of this Skill.

---

## 4. Configure Environment Variables

The screenshot script connects to an existing Chrome instance via `CHROME_CDP_URL`.

```bash
# Add to ~/.openclaw/.env (recommended)
echo 'CHROME_CDP_URL=http://localhost:9222' >> ~/.openclaw/.env
```

Or configure per-skill in `~/.openclaw/openclaw.json`:

```jsonc
{
  "skills": {
    "entries": {
      "generative-ui": {
        "env": { "CHROME_CDP_URL": "http://localhost:9222" }
      }
    }
  }
}
```

Verify:

```bash
curl -s http://localhost:9222/json/version
# Should return Chrome version info
```

---

## 5. Install Plugin Hook (optional, recommended)

`extensions/widget-fence-cleaner/` is a `message_sending` Plugin Hook that replaces `show-widget` fences with `[📊 title]` placeholders before delivery, preventing users from seeing raw HTML code.

```bash
# Copy or symlink the plugin directory to OpenClaw extensions
cp -r <this_directory>/extensions/widget-fence-cleaner ~/.openclaw/extensions/widget-fence-cleaner

# Or symlink
ln -s <this_directory>/extensions/widget-fence-cleaner ~/.openclaw/extensions/widget-fence-cleaner
```

Verify: after restarting OpenClaw, `widget-fence-cleaner` appears in the plugin list.

---

## 6. Verify Installation

```bash
export CHROME_CDP_URL=http://localhost:9222
cd <this_directory>

# Verify screenshot pipeline
node scripts/widget-screenshot.mjs --file examples/jwt-flow.html --output ./imagine/test.png
ls -la ./imagine/test.png  # Should exist, size > 0

# Verify fence parsing
echo '```show-widget
{"title":"test","widget_code":"<div>hello</div>"}
```' | node scripts/widget-interceptor.mjs
# Expected: { hasWidget: true, widgets: [...] }

# Verify drill-down extraction
echo '<rect onclick="window.__widgetSendMessage('"'"'hello'"'"')" />' | node scripts/widget-drilldown.mjs
# Expected: { count: 1, drillDowns: [...] }
```

Once all checks pass, send a visualization request to the bot via Telegram/Feishu (e.g. "explain JWT auth flow") and confirm you receive text + PNG image.
