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

## 2. Install Playwright Client

The screenshot script requires `playwright-core` as a Chrome CDP client SDK (no browser binaries included).

```bash
cd <this_directory>
npm install playwright-core
```

> Prerequisite: A Chrome instance must already be running on the VPS with CDP enabled (`--remote-debugging-port=9222`).
> Installing Chrome and opening the CDP port is NOT the responsibility of this Skill.

---

## 3. Configure Environment Variables

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

## 4. Install Plugin Hook (optional, recommended)

`extensions/widget-fence-cleaner/` is a `message_sending` Plugin Hook that replaces `show-widget` fences with `[📊 title]` placeholders before delivery, preventing users from seeing raw HTML code.

```bash
# Copy or symlink the plugin directory to OpenClaw extensions
cp -r <this_directory>/extensions/widget-fence-cleaner ~/.openclaw/extensions/widget-fence-cleaner

# Or symlink
ln -s <this_directory>/extensions/widget-fence-cleaner ~/.openclaw/extensions/widget-fence-cleaner
```

Verify: after restarting OpenClaw, `widget-fence-cleaner` appears in the plugin list.

---

## 5. Verify Installation

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
