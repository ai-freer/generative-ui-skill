/**
 * Widget Interceptor — M3a S1
 *
 * Detects and extracts show-widget fences from model output.
 * Reuses parseShowWidgetFence from @generative-ui/renderer.
 *
 * Usage:
 *   node scripts/widget-interceptor.mjs [--input <text>] [--file <path>]
 *
 * As module:
 *   import { interceptWidgets } from './widget-interceptor.mjs';
 */

import { parseShowWidgetFence } from '../packages/renderer/dist/index.js';

/**
 * @typedef {Object} WidgetBlock
 * @property {string} title
 * @property {string} widgetCode
 * @property {string} textBefore - text between previous fence end and this fence start
 * @property {string} textAfter  - text between this fence end and next fence start (or end of string)
 */

/**
 * @typedef {Object} InterceptResult
 * @property {boolean} hasWidget
 * @property {WidgetBlock[]} widgets
 * @property {string} plainText - all text with fences removed
 */

/**
 * Detect and extract all show-widget fences from model output.
 * @param {string} modelOutput
 * @returns {InterceptResult}
 */
export function interceptWidgets(modelOutput) {
  const fences = parseShowWidgetFence(modelOutput);

  if (fences.length === 0) {
    return { hasWidget: false, widgets: [], plainText: modelOutput };
  }

  const widgets = fences.map((fence, i) => {
    const prevEnd = i > 0 ? fences[i - 1].end : 0;
    const nextStart = i < fences.length - 1 ? fences[i + 1].start : modelOutput.length;
    return {
      title: fence.title,
      widgetCode: fence.widget_code,
      textBefore: modelOutput.slice(prevEnd, fence.start),
      textAfter: modelOutput.slice(fence.end, nextStart),
    };
  });

  // Build plain text with all fences removed
  let plainText = '';
  let pos = 0;
  for (const fence of fences) {
    plainText += modelOutput.slice(pos, fence.start);
    pos = fence.end;
  }
  plainText += modelOutput.slice(pos);

  return { hasWidget: true, widgets, plainText: plainText.trim() };
}

/**
 * Replace show-widget fences with placeholder text (for message_sending hook).
 * @param {string} modelOutput
 * @returns {string}
 */
export function cleanWidgetFences(modelOutput) {
  const fences = parseShowWidgetFence(modelOutput);
  if (fences.length === 0) return modelOutput;

  let result = '';
  let pos = 0;
  for (const fence of fences) {
    result += modelOutput.slice(pos, fence.start);
    result += `[📊 ${fence.title}]`;
    pos = fence.end;
  }
  result += modelOutput.slice(pos);
  return result;
}

// CLI mode
if (process.argv[1] && process.argv[1].endsWith('widget-interceptor.mjs')) {
  const args = process.argv.slice(2);
  let input = '';

  const fileIdx = args.indexOf('--file');
  const inputIdx = args.indexOf('--input');

  if (fileIdx !== -1 && args[fileIdx + 1]) {
    const { readFileSync } = await import('node:fs');
    input = readFileSync(args[fileIdx + 1], 'utf-8');
  } else if (inputIdx !== -1 && args[inputIdx + 1]) {
    input = args[inputIdx + 1];
  } else {
    // Read from stdin
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    input = Buffer.concat(chunks).toString('utf-8');
  }

  const result = interceptWidgets(input);
  console.log(JSON.stringify(result, null, 2));
}
