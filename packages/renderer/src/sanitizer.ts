/**
 * Two-phase HTML sanitizer for widget content.
 *
 * Phase 1 (streaming): aggressive — strip all scripts, event handlers, dangerous tags.
 * Phase 2 (iframe): permissive — only strip escape vectors, keep scripts for sandbox execution.
 */

/** Tags that are always dangerous (escape vectors) */
const ESCAPE_TAGS = /(<\/?)(iframe|object|embed|frame|frameset|applet)(\s|>|\/)/gi;

/** Tags stripped only during streaming (scripts, forms, metadata) — tag markers only */
const STREAMING_STRIP_TAGS = /(<\/?)(form|meta|link|base|noscript)(\s|>|\/)/gi;

/** Complete <script ...>...</script> blocks — strip entire content */
const SCRIPT_BLOCK_RE = /<script[\s>][\s\S]*?<\/script>/gi;

/** Unclosed trailing <script ...> with no </script> — strip from opening tag to end */
const SCRIPT_UNCLOSED_RE = /<script[\s>][\s\S]*$/i;

/** Event handler attributes: on* = "..." */
const EVENT_HANDLER_RE = /\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;

/** Dangerous URL schemes in attributes */
const DANGEROUS_URL_RE = /\s+(href|src|action|formaction|data|background)\s*=\s*(?:"javascript:[^"]*"|'javascript:[^']*'|javascript:[^\s>]+|"data:[^"]*"|'data:[^']*'|data:[^\s>]+)/gi;

/**
 * Sanitize HTML for streaming preview (Phase 1 — aggressive).
 * Strips: iframe/object/embed, script, form, meta/link/base, all on* handlers, javascript:/data: URLs.
 */
export function sanitizeForStreaming(html: string): string {
  let result = html;
  // Strip complete <script>...</script> blocks (including content)
  result = result.replace(SCRIPT_BLOCK_RE, '');
  // Strip unclosed trailing <script ...> to end of string
  result = result.replace(SCRIPT_UNCLOSED_RE, '');
  // Strip escape tags
  result = result.replace(ESCAPE_TAGS, '');
  // Strip streaming-only tags (form, meta, link, etc.)
  result = result.replace(STREAMING_STRIP_TAGS, '');
  // Strip event handlers
  result = result.replace(EVENT_HANDLER_RE, '');
  // Strip dangerous URLs
  result = result.replace(DANGEROUS_URL_RE, '');
  return result;
}

/**
 * Sanitize HTML for iframe rendering (Phase 2 — permissive).
 * Only strips escape vectors (nested iframe/object/embed).
 * Keeps script tags and event handlers — they execute safely inside the sandbox.
 */
export function sanitizeForIframe(html: string): string {
  return html.replace(ESCAPE_TAGS, '');
}
