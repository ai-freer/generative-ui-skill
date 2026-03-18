import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectTruncation, analyzeTruncation, planTasks } from '../lib/planner.js';

describe('detectTruncation', () => {
  it('returns false when no show-widget fence exists', () => {
    assert.equal(detectTruncation('Hello world, no widget here'), false);
  });

  it('returns false for a complete widget fence', () => {
    const text = 'Some text\n```show-widget\n{"title":"t","widget_code":"<div>hi</div>"}\n```\nMore text';
    assert.equal(detectTruncation(text), false);
  });

  it('returns true for an unclosed widget fence', () => {
    const text = 'Some text\n```show-widget\n{"title":"t","widget_code":"<div>partial content';
    assert.equal(detectTruncation(text), true);
  });

  it('returns true when fence body is not valid JSON', () => {
    const text = '```show-widget\n{"title":"t","widget_code":"<svg><rect x=\n```';
    assert.equal(detectTruncation(text), true);
  });

  it('returns false when last fence is closed even if earlier text has backticks', () => {
    const text = 'Use ```code``` for inline.\n```show-widget\n{"title":"ok","widget_code":"<b>x</b>"}\n```';
    assert.equal(detectTruncation(text), false);
  });

  it('returns true when first fence is complete but second is truncated', () => {
    const complete = '```show-widget\n{"title":"a","widget_code":"<div>1</div>"}\n```';
    const truncated = '```show-widget\n{"title":"b","widget_code":"<div>partial';
    const text = complete + '\nSome text\n' + truncated;
    assert.equal(detectTruncation(text), true);
  });

  it('handles show_widget (underscore variant)', () => {
    const text = '```show_widget\n{"title":"t","widget_code":"<p>trunc';
    assert.equal(detectTruncation(text), true);
  });

  it('returns false for empty string', () => {
    assert.equal(detectTruncation(''), false);
  });

  it('returns false for text with only non-widget code fences', () => {
    const text = '```javascript\nconsole.log("hi")\n```';
    assert.equal(detectTruncation(text), false);
  });
});

describe('analyzeTruncation', () => {
  it('detects a truncated 3D widget and extracts partial widget_code', () => {
    const text = [
      'before',
      '```show-widget',
      '{"title":"3d","widget_code":"<canvas id=\\"c\\"></canvas><script src=\\"https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js\\"></script><script>var scene = new THREE.Scene();',
    ].join('\n');
    const result = analyzeTruncation(text);
    assert.equal(result.truncated, true);
    assert.equal(result.is3D, true);
    assert.ok(result.widgetCode?.includes('<canvas id="c"></canvas>'));
    assert.ok(result.widgetCode?.includes('three.min.js'));
  });

  it('returns non-3D metadata for truncated html widget', () => {
    const text = '```show-widget\n{"title":"x","widget_code":"<div><p>partial';
    const result = analyzeTruncation(text);
    assert.equal(result.truncated, true);
    assert.equal(result.is3D, false);
  });
});

describe('planTasks', () => {
  it('adds progressive 3D planning rules when plannerMode is progressive3d', async () => {
    let capturedSystem = '';
    const fakeCallModel = async (_messages, system) => {
      capturedSystem = system;
      return JSON.stringify({
        summary: '3D palace scene',
        tasks: [{ id: 'scene-shell', description: 'Build the base 3D shell', type: 'html', estimated_lines: 80 }],
        assembly: 'merge',
        layout: 'vertical',
        shared_state: ['scene', 'camera', 'renderer', 'controls'],
      });
    };

    await planTasks(fakeCallModel, 'SYSTEM', [{ role: 'user', content: 'build a palace' }], 'truncated', { plannerMode: 'progressive3d' });
    assert.ok(capturedSystem.includes('Task 1 MUST be the 3D shell only'));
    assert.ok(capturedSystem.includes('Do NOT put the full scene assembly inside init()'));
  });

  it('keeps default planner prompt for non-3D mode', async () => {
    let capturedSystem = '';
    const fakeCallModel = async (_messages, system) => {
      capturedSystem = system;
      return JSON.stringify({
        summary: 'chart widget',
        tasks: [{ id: 'chart', description: 'Build chart', type: 'html', estimated_lines: 80 }],
      });
    };

    await planTasks(fakeCallModel, 'SYSTEM', [{ role: 'user', content: 'build a chart' }], 'truncated');
    assert.equal(capturedSystem.includes('Task 1 MUST be the 3D shell only'), false);
  });
});
