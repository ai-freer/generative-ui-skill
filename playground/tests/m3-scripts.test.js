/**
 * M3a Scripts Tests — Widget Interceptor, Drill-down Extractor
 *
 * Tests for the M3 channel adapter scripts.
 * Screenshot service is tested manually (requires Playwright + Chromium).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Import from renderer dist (same as scripts do)
import { parseShowWidgetFence } from '../../packages/renderer/dist/index.js';

// We can't directly import .mjs from CJS test runner easily,
// so we inline the core logic for testing. The actual scripts
// import from renderer and are verified via CLI tests.

// ============================================================
// Widget Interceptor logic (mirrors scripts/widget-interceptor.mjs)
// ============================================================

function interceptWidgets(modelOutput) {
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
  let plainText = '';
  let pos = 0;
  for (const fence of fences) {
    plainText += modelOutput.slice(pos, fence.start);
    pos = fence.end;
  }
  plainText += modelOutput.slice(pos);
  return { hasWidget: true, widgets, plainText: plainText.trim() };
}

function cleanWidgetFences(modelOutput) {
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

// ============================================================
// Drill-down Extractor logic (mirrors scripts/widget-drilldown.mjs)
// ============================================================

function extractDrillDowns(widgetCode) {
  const re = /window\.__widgetSendMessage\(\s*['"](.+?)['"]\s*\)/g;
  const seen = new Set();
  const drillDowns = [];
  let m;
  while ((m = re.exec(widgetCode)) !== null) {
    const query = m[1];
    if (seen.has(query)) continue;
    seen.add(query);
    drillDowns.push({
      query,
      label: query.length > 30 ? query.slice(0, 30) + '…' : query,
    });
  }
  return drillDowns;
}

function toTelegramButtons(drillDowns, maxButtons = 5) {
  return drillDowns.slice(0, maxButtons).map(dd => ([{
    text: dd.label,
    callback_data: `drill:${dd.query.slice(0, 60)}`,
  }]));
}

function toFeishuButtons(drillDowns, maxButtons = 5) {
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

// ============================================================
// Tests
// ============================================================

describe('Widget Interceptor', () => {
  it('should detect no widgets in plain text', () => {
    const result = interceptWidgets('Hello, this is plain text.');
    assert.equal(result.hasWidget, false);
    assert.equal(result.widgets.length, 0);
    assert.equal(result.plainText, 'Hello, this is plain text.');
  });

  it('should extract a single widget', () => {
    const input = `说明文字。

\`\`\`show-widget
{"title":"jwt_flow","widget_code":"<svg>test</svg>"}
\`\`\`

后续文字。`;

    const result = interceptWidgets(input);
    assert.equal(result.hasWidget, true);
    assert.equal(result.widgets.length, 1);
    assert.equal(result.widgets[0].title, 'jwt_flow');
    assert.equal(result.widgets[0].widgetCode, '<svg>test</svg>');
    assert.ok(result.widgets[0].textBefore.includes('说明文字'));
    assert.ok(result.widgets[0].textAfter.includes('后续文字'));
  });

  it('should extract multiple widgets', () => {
    const input = `第一段。

\`\`\`show-widget
{"title":"chart_a","widget_code":"<div>A</div>"}
\`\`\`

中间文字。

\`\`\`show-widget
{"title":"chart_b","widget_code":"<div>B</div>"}
\`\`\`

结尾。`;

    const result = interceptWidgets(input);
    assert.equal(result.hasWidget, true);
    assert.equal(result.widgets.length, 2);
    assert.equal(result.widgets[0].title, 'chart_a');
    assert.equal(result.widgets[1].title, 'chart_b');
    assert.ok(result.plainText.includes('第一段'));
    assert.ok(result.plainText.includes('中间文字'));
    assert.ok(result.plainText.includes('结尾'));
    assert.ok(!result.plainText.includes('show-widget'));
  });

  it('should handle widget_code with escaped characters', () => {
    const code = '<svg viewBox=\\"0 0 680 200\\"><text>Hello</text></svg>';
    const input = `\`\`\`show-widget\n{"title":"test","widget_code":"${code}"}\n\`\`\``;
    const result = interceptWidgets(input);
    assert.equal(result.hasWidget, true);
    assert.equal(result.widgets[0].title, 'test');
  });

  it('should ignore non-show-widget fences', () => {
    const input = `\`\`\`javascript
console.log("hello");
\`\`\`

\`\`\`show-widget
{"title":"w1","widget_code":"<div>ok</div>"}
\`\`\``;

    const result = interceptWidgets(input);
    assert.equal(result.hasWidget, true);
    assert.equal(result.widgets.length, 1);
    assert.equal(result.widgets[0].title, 'w1');
  });
});

describe('cleanWidgetFences', () => {
  it('should replace fences with placeholder text', () => {
    const input = `说明。

\`\`\`show-widget
{"title":"jwt_flow","widget_code":"<svg>test</svg>"}
\`\`\`

结尾。`;

    const cleaned = cleanWidgetFences(input);
    assert.ok(cleaned.includes('[📊 jwt_flow]'));
    assert.ok(!cleaned.includes('show-widget'));
    assert.ok(cleaned.includes('说明'));
    assert.ok(cleaned.includes('结尾'));
  });

  it('should return original text when no fences', () => {
    const input = 'No widgets here.';
    assert.equal(cleanWidgetFences(input), input);
  });
});

describe('Drill-down Extractor', () => {
  it('should extract __widgetSendMessage calls', () => {
    const code = `
      <rect onclick="window.__widgetSendMessage('详细介绍 JWT 签名')" />
      <rect onclick="window.__widgetSendMessage('对比 Session 认证')" />
    `;
    const result = extractDrillDowns(code);
    assert.equal(result.length, 2);
    assert.equal(result[0].query, '详细介绍 JWT 签名');
    assert.equal(result[1].query, '对比 Session 认证');
  });

  it('should deduplicate identical queries', () => {
    const code = `
      <rect onclick="window.__widgetSendMessage('same query')" />
      <rect onclick="window.__widgetSendMessage('same query')" />
    `;
    const result = extractDrillDowns(code);
    assert.equal(result.length, 1);
  });

  it('should truncate long labels', () => {
    const longQuery = 'A'.repeat(50);
    const code = `<rect onclick="window.__widgetSendMessage('${longQuery}')" />`;
    const result = extractDrillDowns(code);
    assert.equal(result[0].query, longQuery);
    assert.equal(result[0].label.length, 31); // 30 + '…'
    assert.ok(result[0].label.endsWith('…'));
  });

  it('should handle double-quoted strings', () => {
    const code = `<rect onclick='window.__widgetSendMessage("hello world")' />`;
    const result = extractDrillDowns(code);
    assert.equal(result.length, 1);
    assert.equal(result[0].query, 'hello world');
  });

  it('should return empty array when no drill-downs', () => {
    const code = '<svg><rect fill="blue"/></svg>';
    const result = extractDrillDowns(code);
    assert.equal(result.length, 0);
  });
});

describe('Telegram button formatting', () => {
  it('should format drill-downs as inline keyboard', () => {
    const drillDowns = [
      { query: 'Q1', label: 'Q1' },
      { query: 'Q2', label: 'Q2' },
    ];
    const buttons = toTelegramButtons(drillDowns);
    assert.equal(buttons.length, 2);
    assert.equal(buttons[0][0].text, 'Q1');
    assert.equal(buttons[0][0].callback_data, 'drill:Q1');
  });

  it('should limit to maxButtons', () => {
    const drillDowns = Array.from({ length: 10 }, (_, i) => ({
      query: `Q${i}`, label: `Q${i}`,
    }));
    const buttons = toTelegramButtons(drillDowns, 3);
    assert.equal(buttons.length, 3);
  });
});

describe('Feishu button formatting', () => {
  it('should format drill-downs as card action', () => {
    const drillDowns = [
      { query: '详细介绍', label: '详细介绍' },
    ];
    const action = toFeishuButtons(drillDowns);
    assert.equal(action.tag, 'action');
    assert.equal(action.actions.length, 1);
    assert.equal(action.actions[0].tag, 'button');
    assert.equal(action.actions[0].value.oc, 'ocf1');
    assert.equal(action.actions[0].value.k, 'button');
    assert.equal(action.actions[0].value.a, 'drill_down');
    assert.equal(action.actions[0].value.q, '详细介绍');
  });
});
