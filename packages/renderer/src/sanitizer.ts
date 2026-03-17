/**
 * Two-phase HTML sanitizer for widget content.
 *
 * Phase 1 (streaming): aggressive — strip all scripts, event handlers, dangerous tags.
 * Phase 2 (iframe): permissive — only strip escape vectors, keep scripts for sandbox execution.
 */

/** Tags that are always dangerous (escape vectors) */
const ESCAPE_TAGS = /(<\/?)(iframe|object|embed|frame|frameset|applet)(\s|>|\/)/gi;

/** Tags stripped only during streaming (scripts, forms, metadata) */
const STREAMING_STRIP_TAGS = /(<\/?)(script|form|meta|link|base|noscript)(\s|>|\/)/gi;

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
  // Strip escape tags
  result = result.replace(ESCAPE_TAGS, '');
  // Strip streaming-only tags (script, form, meta, etc.)
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
