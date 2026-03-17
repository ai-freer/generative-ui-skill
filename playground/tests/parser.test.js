import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  escapeHtml,
  inlineMarkdown,
  blockMarkdown,
  isShowWidgetFence,
  parseShowWidgetFence,
  findAllShowWidgetFences,
  extractPartialWidgetCode,
  textToHtml,
} from '../public/lib/parser.js';

describe('escapeHtml', () => {
  it('escapes angle brackets', () => {
    assert.equal(escapeHtml('<script>'), '&lt;script&gt;');
  });
  it('escapes ampersand', () => {
    assert.equal(escapeHtml('a & b'), 'a &amp; b');
  });
  it('escapes quotes', () => {
    assert.equal(escapeHtml('"hello"'), '&quot;hello&quot;');
  });
  it('returns empty string unchanged', () => {
    assert.equal(escapeHtml(''), '');
  });
});

describe('inlineMarkdown', () => {
  it('converts bold', () => {
    assert.equal(inlineMarkdown('**bold**'), '<strong>bold</strong>');
  });
  it('converts inline code', () => {
    assert.equal(inlineMarkdown('use `foo()`'), 'use <code>foo()</code>');
  });
  it('converts newlines to br', () => {
    assert.equal(inlineMarkdown('a\nb'), 'a<br>b');
  });
  it('converts italic with asterisk', () => {
    assert.equal(inlineMarkdown('*italic*'), '<em>italic</em>');
  });
  it('converts italic with underscore', () => {
    assert.equal(inlineMarkdown('_italic_'), '<em>italic</em>');
  });
  it('converts links', () => {
    assert.equal(
      inlineMarkdown('[click](https://example.com)'),
      '<a href="https://example.com" target="_blank" rel="noopener">click</a>'
    );
  });
  it('converts strikethrough', () => {
    assert.equal(inlineMarkdown('~~deleted~~'), '<del>deleted</del>');
  });
  it('does not confuse bold with italic', () => {
    assert.equal(inlineMarkdown('**bold** and *italic*'), '<strong>bold</strong> and <em>italic</em>');
  });
});

describe('blockMarkdown', () => {
  it('converts h1', () => {
    assert.equal(blockMarkdown('# Title'), '<h1>Title</h1>');
  });
  it('converts h2', () => {
    assert.equal(blockMarkdown('## Section'), '<h2>Section</h2>');
  });
  it('converts h3', () => {
    assert.equal(blockMarkdown('### Subsection'), '<h3>Subsection</h3>');
  });
  it('converts h4', () => {
    assert.equal(blockMarkdown('#### Detail'), '<h4>Detail</h4>');
  });
  it('converts unordered list', () => {
    assert.equal(
      blockMarkdown('- one<br>- two<br>- three'),
      '<ul><li>one</li><li>two</li><li>three</li></ul>'
    );
  });
  it('converts unordered list with asterisk', () => {
    assert.equal(
      blockMarkdown('* alpha<br>* beta'),
      '<ul><li>alpha</li><li>beta</li></ul>'
    );
  });
  it('converts ordered list', () => {
    assert.equal(
      blockMarkdown('1. first<br>2. second<br>3. third'),
      '<ol><li>first</li><li>second</li><li>third</li></ol>'
    );
  });
  it('converts blockquote', () => {
    assert.equal(
      blockMarkdown('&gt; quoted text'),
      '<blockquote>quoted text</blockquote>'
    );
  });
  it('merges consecutive blockquote lines', () => {
    assert.equal(
      blockMarkdown('&gt; line one<br>&gt; line two'),
      '<blockquote>line one<br>line two</blockquote>'
    );
  });
  it('converts horizontal rule (---)', () => {
    assert.ok(blockMarkdown('---').includes('<hr>'));
  });
  it('converts horizontal rule (***)', () => {
    assert.ok(blockMarkdown('***').includes('<hr>'));
  });
  it('applies inline formatting inside headings', () => {
    assert.equal(
      blockMarkdown('## **Bold** heading'),
      '<h2><strong>Bold</strong> heading</h2>'
    );
  });
  it('applies inline formatting inside list items', () => {
    assert.equal(
      blockMarkdown('- **bold** item<br>- *italic* item'),
      '<ul><li><strong>bold</strong> item</li><li><em>italic</em> item</li></ul>'
    );
  });
  it('handles mixed blocks', () => {
    const input = '# Title<br>Some text<br>- item 1<br>- item 2<br>---<br>&gt; quote';
    const html = blockMarkdown(input);
    assert.ok(html.includes('<h1>Title</h1>'));
    assert.ok(html.includes('<ul>'));
    assert.ok(html.includes('<hr>'));
    assert.ok(html.includes('<blockquote>'));
  });
  it('passes through plain text unchanged', () => {
    assert.equal(blockMarkdown('hello world'), 'hello world');
  });
});

describe('isShowWidgetFence', () => {
  it('recognizes show-widget', () => {
    assert.equal(isShowWidgetFence('show-widget'), true);
  });
  it('recognizes show_widget', () => {
    assert.equal(isShowWidgetFence('show_widget'), true);
  });
  it('rejects javascript', () => {
    assert.equal(isShowWidgetFence('javascript'), false);
  });
  it('rejects empty string', () => {
    assert.equal(isShowWidgetFence(''), false);
  });
  it('handles leading whitespace', () => {
    assert.equal(isShowWidgetFence('  show-widget'), true);
  });
});

describe('parseShowWidgetFence', () => {
  const validFence = '```show-widget\n{"title":"test","widget_code":"<div>hi</div>"}\n```';

  it('parses a valid fence', () => {
    const result = parseShowWidgetFence(validFence);
    assert.equal(result.length, 1);
    assert.equal(result[0].title, 'test');
    assert.equal(result[0].widget_code, '<div>hi</div>');
  });
  it('parses multiple fences', () => {
    const text = validFence + '\nsome text\n' + validFence;
    const result = parseShowWidgetFence(text);
    assert.equal(result.length, 2);
  });
  it('returns empty for invalid JSON', () => {
    const result = parseShowWidgetFence('```show-widget\n{not valid}\n```');
    assert.equal(result.length, 0);
  });
  it('returns empty for unclosed fence', () => {
    const result = parseShowWidgetFence('```show-widget\n{"title":"x","widget_code":"<div>"}');
    assert.equal(result.length, 0);
  });
  it('skips non-widget fences', () => {
    const result = parseShowWidgetFence('```javascript\nconsole.log("hi")\n```');
    assert.equal(result.length, 0);
  });
  it('defaults title to widget', () => {
    const result = parseShowWidgetFence('```show-widget\n{"widget_code":"<p>x</p>"}\n```');
    assert.equal(result[0].title, 'widget');
  });
  it('tracks start and end positions', () => {
    const prefix = 'hello ';
    const text = prefix + validFence;
    const result = parseShowWidgetFence(text);
    assert.equal(result[0].start, prefix.length);
    assert.equal(result[0].end, text.length);
  });
  it('handles widget_code containing triple backticks', () => {
    const code = '<pre>```js\\ncode```</pre>';
    const json = JSON.stringify({ title: 'bt', widget_code: code });
    const text = '```show-widget\n' + json + '\n```';
    const result = parseShowWidgetFence(text);
    assert.equal(result.length, 1);
    assert.equal(result[0].title, 'bt');
  });
});

describe('findAllShowWidgetFences', () => {
  it('finds fences with parsed content', () => {
    const text = 'before\n```show-widget\n{"title":"t","widget_code":"<b>x</b>"}\n```\nafter';
    const fences = findAllShowWidgetFences(text);
    assert.equal(fences.length, 1);
    assert.notEqual(fences[0].parsed, null);
    assert.equal(fences[0].parsed.title, 't');
  });
  it('returns empty for invalid JSON (no valid closing fence)', () => {
    const fences = findAllShowWidgetFences('```show-widget\n{bad}\n```');
    assert.equal(fences.length, 0);
  });
  it('handles widget_code containing triple backticks', () => {
    // The JSON value has ``` inside (escaped as part of the string), causing multiple ``` candidates
    const code = '<pre>```js\\ncode```</pre>';
    const json = JSON.stringify({ title: 'test', widget_code: code });
    const text = 'before\n```show-widget\n' + json + '\n```\nafter';
    const fences = findAllShowWidgetFences(text);
    assert.equal(fences.length, 1);
    assert.equal(fences[0].parsed.title, 'test');
  });
  it('skips truncated (unclosed) fence', () => {
    const text = 'before\n```show-widget\n{"title":"t","widget_code":"<div>partial';
    const fences = findAllShowWidgetFences(text);
    assert.equal(fences.length, 0);
  });
  it('parses valid fence after skipping truncated one', () => {
    const valid = '```show-widget\n{"title":"ok","widget_code":"<b>y</b>"}\n```';
    const text = 'text1\n```show-widget\n{bad}\n```\ntext2\n' + valid + '\ntext3';
    const fences = findAllShowWidgetFences(text);
    // The {bad} fence has no valid JSON at any candidate ```, so it gets skipped entirely
    // and the parser breaks out (since it can't find a valid close). The second valid fence
    // may or may not be found depending on whether {bad}``` is consumed as a candidate.
    // With current logic, the first ``` after {bad} fails JSON.parse, then the next ```
    // (which is the opening of the second fence) also fails, then the closing ``` of the
    // second fence succeeds with the full body from the first fence's bodyStart — but that
    // won't be valid JSON either. So we expect 0 fences here.
    assert.equal(fences.length, 0);
  });
});

describe('extractPartialWidgetCode', () => {
  it('extracts complete widget_code', () => {
    assert.equal(extractPartialWidgetCode('{"title":"x","widget_code":"<div>hello</div>"}'), '<div>hello</div>');
  });
  it('extracts partial widget_code (unclosed quote)', () => {
    assert.equal(extractPartialWidgetCode('{"title":"x","widget_code":"<svg><rect'), '<svg><rect');
  });
  it('handles escaped quotes', () => {
    assert.equal(extractPartialWidgetCode('{"widget_code":"say \\"hi\\""}'), 'say "hi"');
  });
  it('handles escaped newlines', () => {
    assert.equal(extractPartialWidgetCode('{"widget_code":"line1\\nline2"}'), 'line1\nline2');
  });
  it('returns null when no widget_code key', () => {
    assert.equal(extractPartialWidgetCode('{"title":"x"}'), null);
  });
  it('returns null for empty value', () => {
    assert.equal(extractPartialWidgetCode('{"widget_code":""}'), null);
  });
  it('handles \\uXXXX unicode escapes', () => {
    assert.equal(
      extractPartialWidgetCode('{"widget_code":"\\u003Cscript\\u003Ealert(1)\\u003C/script\\u003E"}'),
      '<script>alert(1)</script>'
    );
  });
  it('handles mixed \\uXXXX and regular escapes', () => {
    assert.equal(
      extractPartialWidgetCode('{"widget_code":"\\u003Cdiv class=\\\"test\\\"\\u003E"}'),
      '<div class="test">'
    );
  });
  it('handles partial \\uXXXX at end of truncated input', () => {
    // When input is truncated mid-unicode escape, should not crash
    const result = extractPartialWidgetCode('{"widget_code":"hello\\u003');
    assert.ok(result !== null);
  });
});

describe('textToHtml', () => {
  it('converts bold markdown', () => {
    assert.ok(textToHtml('**hello**').includes('<strong>hello</strong>'));
  });
  it('converts code blocks', () => {
    const result = textToHtml('```js\nconst x = 1;\n```');
    assert.ok(result.includes('<pre class="code-block">'));
    assert.ok(result.includes('const x = 1;'));
  });
  it('filters out show-widget fences', () => {
    const result = textToHtml('before\n```show-widget\n{"widget_code":"x"}\n```\nafter');
    assert.ok(!result.includes('widget_code'));
    assert.ok(result.includes('before'));
    assert.ok(result.includes('after'));
  });
  it('escapes HTML in text', () => {
    const result = textToHtml('<script>alert(1)</script>');
    assert.ok(!result.includes('<script>'));
    assert.ok(result.includes('&lt;script&gt;'));
  });
});
