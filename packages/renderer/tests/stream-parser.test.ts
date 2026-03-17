import { describe, it, expect } from 'vitest';
import {
  isShowWidgetFence,
  parseShowWidgetFence,
  findAllShowWidgetFences,
  extractPartialWidgetCode,
  patchIncompleteWidgetFence,
  StreamParser,
} from '../src/stream-parser.js';

describe('isShowWidgetFence', () => {
  it('detects show-widget', () => {
    expect(isShowWidgetFence('show-widget')).toBe(true);
    expect(isShowWidgetFence('show_widget')).toBe(true);
    expect(isShowWidgetFence('  Show-Widget  ')).toBe(true);
    expect(isShowWidgetFence('SHOW_WIDGET')).toBe(true);
  });

  it('rejects non-widget fences', () => {
    expect(isShowWidgetFence('javascript')).toBe(false);
    expect(isShowWidgetFence('html')).toBe(false);
    expect(isShowWidgetFence('')).toBe(false);
  });
});

describe('parseShowWidgetFence', () => {
  it('parses a single complete fence', () => {
    const text = 'hello\n```show-widget\n{"title":"test","widget_code":"<div>hi</div>"}\n```\nbye';
    const fences = parseShowWidgetFence(text);
    expect(fences).toHaveLength(1);
    expect(fences[0].title).toBe('test');
    expect(fences[0].widget_code).toBe('<div>hi</div>');
  });

  it('parses multiple fences', () => {
    const text =
      '```show-widget\n{"title":"a","widget_code":"<p>1</p>"}\n```\n' +
      'middle\n' +
      '```show-widget\n{"title":"b","widget_code":"<p>2</p>"}\n```';
    const fences = parseShowWidgetFence(text);
    expect(fences).toHaveLength(2);
    expect(fences[0].title).toBe('a');
    expect(fences[1].title).toBe('b');
  });

  it('returns empty for no fences', () => {
    expect(parseShowWidgetFence('just text')).toHaveLength(0);
  });

  it('returns empty for unclosed fence', () => {
    const text = '```show-widget\n{"title":"x","widget_code":"<div>';
    expect(parseShowWidgetFence(text)).toHaveLength(0);
  });

  it('skips non-widget code fences', () => {
    const text = '```javascript\nconsole.log("hi")\n```\n```show-widget\n{"title":"w","widget_code":"<b>ok</b>"}\n```';
    const fences = parseShowWidgetFence(text);
    expect(fences).toHaveLength(1);
    expect(fences[0].title).toBe('w');
  });

  it('handles widget_code containing triple backticks', () => {
    const inner = '<div>code: ```example```</div>';
    const json = JSON.stringify({ title: 'bt', widget_code: inner });
    const text = '```show-widget\n' + json + '\n```';
    const fences = parseShowWidgetFence(text);
    expect(fences).toHaveLength(1);
    expect(fences[0].widget_code).toBe(inner);
  });

  it('defaults title to widget when missing', () => {
    const text = '```show-widget\n{"widget_code":"<p>x</p>"}\n```';
    const fences = parseShowWidgetFence(text);
    expect(fences).toHaveLength(1);
    expect(fences[0].title).toBe('widget');
  });
});

describe('findAllShowWidgetFences', () => {
  it('returns parsed fences with position info', () => {
    const text = 'pre\n```show-widget\n{"title":"t","widget_code":"<b>ok</b>"}\n```\npost';
    const fences = findAllShowWidgetFences(text);
    expect(fences).toHaveLength(1);
    expect(fences[0].parsed?.title).toBe('t');
    expect(fences[0].start).toBe(4);
  });

  it('returns null parsed for invalid JSON', () => {
    const text = '```show-widget\n{not valid json}\n```';
    const fences = findAllShowWidgetFences(text);
    // Invalid JSON means the closing ``` is tried but JSON.parse fails,
    // and there's no next ``` to try, so no fence is found
    expect(fences).toHaveLength(0);
  });
});

describe('extractPartialWidgetCode', () => {
  it('extracts partial code from incomplete JSON', () => {
    const partial = '{"title":"test","widget_code":"<svg><rect';
    const result = extractPartialWidgetCode(partial);
    expect(result).toBe('<svg><rect');
  });

  it('handles JSON escape sequences', () => {
    const partial = '{"widget_code":"line1\\nline2\\t<div class=\\"x\\">"}';
    const result = extractPartialWidgetCode(partial);
    expect(result).toBe('line1\nline2\t<div class="x">');
  });

  it('handles unicode escapes', () => {
    const partial = '{"widget_code":"\\u0041\\u0042"}';
    const result = extractPartialWidgetCode(partial);
    expect(result).toBe('AB');
  });

  it('returns null when no widget_code key', () => {
    expect(extractPartialWidgetCode('{"title":"x"}')).toBeNull();
  });

  it('returns null for empty widget_code', () => {
    expect(extractPartialWidgetCode('{"widget_code":""}')).toBeNull();
  });
});

describe('patchIncompleteWidgetFence', () => {
  it('patches a truncated fence', () => {
    const text = 'hello\n```show-widget\n{"title":"t","widget_code":"<svg width=\\"100%\\" viewBox=\\"0 0 680 400\\"><rect x=\\"10\\" y=\\"10\\"';
    const patched = patchIncompleteWidgetFence(text);
    expect(patched).toContain('```show-widget\n');
    expect(patched).toContain('\n```');
    // Should be parseable now
    const fences = parseShowWidgetFence(patched);
    expect(fences).toHaveLength(1);
    expect(fences[0].widget_code).toContain('<svg');
  });

  it('returns original text when no unclosed fence', () => {
    const text = 'just text';
    expect(patchIncompleteWidgetFence(text)).toBe(text);
  });

  it('returns original text when partial code is too short', () => {
    const text = '```show-widget\n{"widget_code":"<s';
    expect(patchIncompleteWidgetFence(text)).toBe(text);
  });
});

describe('StreamParser', () => {
  it('tracks completed widgets incrementally', () => {
    const parser = new StreamParser();

    parser.feed('hello ```show-widget\n{"title":"a","widget_code":"<p>1</p>"}\n```');
    const first = parser.getNewWidgets();
    expect(first).toHaveLength(1);
    expect(first[0].title).toBe('a');

    // Feed more text with another widget
    parser.feed(
      'hello ```show-widget\n{"title":"a","widget_code":"<p>1</p>"}\n``` mid ```show-widget\n{"title":"b","widget_code":"<p>2</p>"}\n```'
    );
    const second = parser.getNewWidgets();
    expect(second).toHaveLength(1);
    expect(second[0].title).toBe('b');
  });

  it('returns partial widget code during streaming', () => {
    const parser = new StreamParser();
    parser.feed('```show-widget\n{"title":"x","widget_code":"<svg><rect x=\\"10\\"');
    expect(parser.hasUnclosedFence()).toBe(true);
    const partial = parser.getPartialWidgetCode();
    expect(partial).toBe('<svg><rect x="10"');
  });

  it('returns tail text before unclosed fence', () => {
    const parser = new StreamParser();
    parser.feed('some text\n```show-widget\n{"widget_code":"<div>');
    expect(parser.getTailText()).toBe('some text\n');
  });

  it('returns full tail when no unclosed fence', () => {
    const parser = new StreamParser();
    parser.feed('```show-widget\n{"title":"a","widget_code":"<p>ok</p>"}\n``` trailing');
    parser.getNewWidgets(); // consume
    expect(parser.getTailText()).toBe(' trailing');
    expect(parser.hasUnclosedFence()).toBe(false);
  });

  it('getTextBetween returns text before a widget', () => {
    const parser = new StreamParser();
    parser.feed('before\n```show-widget\n{"title":"a","widget_code":"<p>1</p>"}\n```');
    expect(parser.getTextBetween(0)).toBe('before\n');
  });

  it('reset clears all state', () => {
    const parser = new StreamParser();
    parser.feed('```show-widget\n{"title":"a","widget_code":"<p>1</p>"}\n```');
    parser.getNewWidgets();
    parser.reset();
    expect(parser.getText()).toBe('');
    expect(parser.completedWidgetCount).toBe(0);
  });
});
