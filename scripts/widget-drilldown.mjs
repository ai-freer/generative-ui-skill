/**
 * Drill-down Extractor — M3a S3
 *
 * Extracts __widgetSendMessage calls from widget_code,
 * producing a button list for channel-native inline buttons.
 *
 * Usage:
 *   node scripts/widget-drilldown.mjs --code "<html>..."
 *
 * As module:
 *   import { extractDrillDowns } from './widget-drilldown.mjs';
 */

/**
 * @typedef {Object} DrillDown
 * @property {string} query - the full query text passed to __widgetSendMessage
 * @property {string} label - truncated label for button display
 */

/**
 * Extract all __widgetSendMessage calls from widget code.
 * @param {string} widgetCode
 * @returns {DrillDown[]}
 */
export function extractDrillDowns(widgetCode) {
  const re = /window\.__widgetSendMessage\(\s*['"](.+?)['"]\s*\)/g;
  const seen = new Set();
  const drillDowns = [];
  let m;
  while ((m = re.exec(widgetCode)) !== null) {
    const query = m[1];
    // Deduplicate identical queries
    if (seen.has(query)) continue;
    seen.add(query);
    drillDowns.push({
      query,
      label: query.length > 30 ? query.slice(0, 30) + '…' : query,
    });
  }
  return drillDowns;
}

/**
 * Format drill-downs as Telegram inline keyboard structure.
 * @param {DrillDown[]} drillDowns
 * @param {number} [maxButtons=5]
 * @returns {Array<Array<{text: string, callback_data: string}>>}
 */
export function toTelegramButtons(drillDowns, maxButtons = 5) {
  return drillDowns.slice(0, maxButtons).map(dd => ([{
    text: dd.label,
    callback_data: `drill:${dd.query.slice(0, 60)}`,
  }]));
}

/**
 * Format drill-downs as Feishu card action buttons.
 * @param {DrillDown[]} drillDowns
 * @param {number} [maxButtons=5]
 * @returns {Object} Feishu card action element
 */
export function toFeishuButtons(drillDowns, maxButtons = 5) {
  return {
    tag: 'action',
    actions: drillDowns.slice(0, maxButtons).map(dd => ({
      tag: 'button',
      text: { tag: 'plain_text', content: dd.label },
      type: 'primary',
      value: { oc: 'ocf1', k: 'button', a: 'drill_down', q: dd.query },
    })),
  };
}

// CLI mode
if (process.argv[1] && process.argv[1].endsWith('widget-drilldown.mjs')) {
  const args = process.argv.slice(2);
  let code = '';

  const codeIdx = args.indexOf('--code');
  const fileIdx = args.indexOf('--file');

  if (codeIdx !== -1 && args[codeIdx + 1]) {
    code = args[codeIdx + 1];
  } else if (fileIdx !== -1 && args[fileIdx + 1]) {
    const { readFileSync } = await import('node:fs');
    code = readFileSync(args[fileIdx + 1], 'utf-8');
  } else {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    code = Buffer.concat(chunks).toString('utf-8');
  }

  const drillDowns = extractDrillDowns(code);
  console.log(JSON.stringify({
    count: drillDowns.length,
    drillDowns,
    telegram: toTelegramButtons(drillDowns),
    feishu: drillDowns.length > 0 ? toFeishuButtons(drillDowns) : null,
  }, null, 2));
}
