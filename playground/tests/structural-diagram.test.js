import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..');
const DIAGRAM_GUIDELINES_PATH = join(PROJECT_ROOT, 'prompts', 'guidelines', 'diagram.md');

function extractStructuralExample(markdown) {
  const marker = '**Structural container example**';
  const start = markdown.indexOf(marker);
  assert.ok(start >= 0, 'missing structural container example section');
  const afterMarker = markdown.slice(start);
  const match = afterMarker.match(/```svg\n([\s\S]*?)\n```/);
  assert.ok(match, 'missing structural example svg block');
  return match[1];
}

function parseNumericAttr(tag, name) {
  const match = tag.match(new RegExp(`${name}="([^"]+)"`));
  return match ? Number(match[1]) : null;
}

function parseRect(tag) {
  return {
    x: parseNumericAttr(tag, 'x'),
    y: parseNumericAttr(tag, 'y'),
    width: parseNumericAttr(tag, 'width'),
    height: parseNumericAttr(tag, 'height'),
    rx: parseNumericAttr(tag, 'rx'),
  };
}

function rectArea(rect) {
  return rect.width * rect.height;
}

function isInside(outer, inner, padding) {
  return (
    inner.x >= outer.x + padding &&
    inner.y >= outer.y + padding &&
    inner.x + inner.width <= outer.x + outer.width - padding &&
    inner.y + inner.height <= outer.y + outer.height - padding
  );
}

function getStructuralGroups(svg) {
  const groups = [];
  const groupRe = /<g class="c-([a-z0-9-]+)">([\s\S]*?)<\/g>/g;
  let match;
  while ((match = groupRe.exec(svg)) !== null) {
    const [, ramp, content] = match;
    const rectMatch = content.match(/<rect\b[^>]*\/>/);
    if (!rectMatch) continue;
    const rect = parseRect(rectMatch[0]);
    if ([rect.x, rect.y, rect.width, rect.height, rect.rx].some(v => Number.isNaN(v) || v === null)) continue;
    groups.push({ ramp, rect });
  }
  return groups;
}

function validateStructuralSvg(svg) {
  const issues = [];
  const groups = getStructuralGroups(svg);
  if (groups.length < 3) {
    issues.push(`expected at least 3 colored rect groups, got ${groups.length}`);
    return issues;
  }

  const outer = groups.reduce((largest, current) => {
    if (!largest) return current;
    return rectArea(current.rect) > rectArea(largest.rect) ? current : largest;
  }, null);

  if (!outer) {
    issues.push('missing outer container');
    return issues;
  }

  if (outer.rect.rx < 20) {
    issues.push(`outer container rx too small: ${outer.rect.rx}`);
  }

  const innerGroups = groups.filter(group => group !== outer && isInside(outer.rect, group.rect, 20));
  if (innerGroups.length < 2) {
    issues.push(`expected at least 2 inner regions with 20px padding, got ${innerGroups.length}`);
  }

  const innerRamps = new Set(innerGroups.map(group => group.ramp));
  if (innerRamps.size < 2) {
    issues.push('inner regions must use at least 2 color ramps');
  }

  if (innerGroups.some(group => group.ramp === outer.ramp)) {
    issues.push('inner regions must not reuse the outer container color ramp');
  }

  return issues;
}

describe('Structural diagram regression checks', () => {
  it('structural example in diagram guidelines satisfies the container rules', () => {
    const markdown = readFileSync(DIAGRAM_GUIDELINES_PATH, 'utf8');
    const svg = extractStructuralExample(markdown);
    const issues = validateStructuralSvg(svg);
    assert.deepEqual(issues, []);
  });

  it('rejects outer containers with rx below 20', () => {
    const svg = `
<g class="c-purple">
  <rect x="80" y="40" width="520" height="280" rx="16" stroke-width="0.5"/>
</g>
<g class="c-teal">
  <rect x="120" y="90" width="180" height="140" rx="12" stroke-width="0.5"/>
</g>
<g class="c-amber">
  <rect x="340" y="90" width="180" height="140" rx="12" stroke-width="0.5"/>
</g>`;
    const issues = validateStructuralSvg(svg);
    assert.ok(issues.includes('outer container rx too small: 16'));
  });

  it('rejects inner regions that flatten the hierarchy with one color ramp', () => {
    const svg = `
<g class="c-green">
  <rect x="80" y="40" width="520" height="280" rx="20" stroke-width="0.5"/>
</g>
<g class="c-green">
  <rect x="120" y="90" width="180" height="140" rx="12" stroke-width="0.5"/>
</g>
<g class="c-green">
  <rect x="340" y="90" width="180" height="140" rx="12" stroke-width="0.5"/>
</g>`;
    const issues = validateStructuralSvg(svg);
    assert.ok(issues.includes('inner regions must use at least 2 color ramps'));
    assert.ok(issues.includes('inner regions must not reuse the outer container color ramp'));
  });
});
