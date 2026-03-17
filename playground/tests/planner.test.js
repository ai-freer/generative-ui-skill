import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectTruncation } from '../lib/planner.js';

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
