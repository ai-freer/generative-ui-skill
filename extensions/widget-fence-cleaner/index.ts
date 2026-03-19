/**
 * Widget Fence Cleaner — OpenClaw Plugin Hook (S4b)
 *
 * Intercepts outgoing messages via `message_sending` hook.
 * Replaces `show-widget` code fences with placeholder text
 * so users on Telegram/Feishu/etc. don't see raw HTML/SVG code.
 *
 * The actual widget PNG is sent separately by the agent via exec + send action.
 */

import { definePluginEntry } from "openclaw/plugin-sdk/core";

const FENCE_RE = /```show[-_]widget\s*\n[\s\S]*?```/g;

function extractTitle(fence: string): string {
  const m = fence.match(/"title"\s*:\s*"([^"]+)"/);
  return m ? m[1] : "widget";
}

function cleanFences(content: string): string {
  return content.replace(FENCE_RE, (match) => {
    const title = extractTitle(match);
    return `[📊 ${title}]`;
  });
}

export default definePluginEntry({
  id: "widget-fence-cleaner",
  name: "Widget Fence Cleaner",
  description: "Replaces show-widget fences with placeholder text before sending",
  register(api) {
    api.on("message_sending", (event) => {
      if (!FENCE_RE.test(event.content)) return;
      FENCE_RE.lastIndex = 0;
      return { content: cleanFences(event.content) };
    });
  },
});
