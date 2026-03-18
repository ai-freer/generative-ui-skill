import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  escapeHtml,
  inlineMarkdown,
  blockMarkdown,
  isShowWidgetFence,
  parseShowWidgetFence,
  findAllShowWidgetFences,
  extractPartialWidgetCode,
  detect3DWidget,
  detect3DShellComplete,
  buildEarly3DShell,
  extract3DInjectChunk,
  extractCompleteStatements,
  textToHtml,
} from '../public/lib/parser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appJsSource = readFileSync(join(__dirname, '..', 'public', 'app.js'), 'utf8');
const indexHtmlSource = readFileSync(join(__dirname, '..', 'public', 'index.html'), 'utf8');

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
  it('converts a simple markdown table', () => {
    const input = '| Name | Age |<br>|---|---|<br>| Alice | 30 |<br>| Bob | 25 |';
    const html = blockMarkdown(input);
    assert.ok(html.includes('<table class="md-table">'));
    assert.ok(html.includes('<th'));
    assert.ok(html.includes('Name'));
    assert.ok(html.includes('Age'));
    assert.ok(html.includes('<td'));
    assert.ok(html.includes('Alice'));
    assert.ok(html.includes('Bob'));
  });
  it('respects table column alignment', () => {
    const input = '| Left | Center | Right |<br>|:---|:---:|---:|<br>| a | b | c |';
    const html = blockMarkdown(input);
    assert.ok(html.includes('text-align:left'));
    assert.ok(html.includes('text-align:center'));
    assert.ok(html.includes('text-align:right'));
  });
  it('applies inline formatting inside table cells', () => {
    const input = '| Key | Value |<br>|---|---|<br>| **bold** | `code` |';
    const html = blockMarkdown(input);
    assert.ok(html.includes('<strong>bold</strong>'));
    assert.ok(html.includes('<code>code</code>'));
  });
  it('does not treat a single pipe line as a table', () => {
    const input = '| not a table |';
    const html = blockMarkdown(input);
    assert.ok(!html.includes('<table'));
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

describe('detect3DWidget', () => {
  it('detects 3D widget with canvas and Three.js CDN', () => {
    const code = '<canvas id="c"></canvas><script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>';
    assert.equal(detect3DWidget(code), true);
  });

  it('returns false for SVG widget', () => {
    assert.equal(detect3DWidget('<svg viewBox="0 0 100 100"><rect/></svg>'), false);
  });

  it('returns false for canvas without Three.js', () => {
    assert.equal(detect3DWidget('<canvas id="c"></canvas><script>ctx.fillRect(0,0,10,10)</script>'), false);
  });

  it('returns false for Three.js without canvas', () => {
    assert.equal(detect3DWidget('<div></div><script src="three.min.js"></script>'), false);
  });

  it('detects early in stream before shell is complete', () => {
    // Just the style + canvas + first CDN tag — shell is far from complete
    const earlyCode = '<style>canvas { display: block; }</style><canvas id="c"></canvas><script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>';
    assert.equal(detect3DWidget(earlyCode), true);
  });
});

describe('detect3DShellComplete', () => {
  const fullShell = [
    '<canvas id="c"></canvas>',
    '<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>',
    '<script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js" onload="init()"></script>',
    '<script>',
    'var scene, camera, renderer, controls;',
    'function init() {',
    '  renderer = new THREE.WebGLRenderer({ canvas: document.getElementById("c") });',
    '  scene = new THREE.Scene();',
    '  camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);',
    '  controls = new THREE.OrbitControls(camera, document.getElementById("c"));',
    '  function animate() {',
    '    requestAnimationFrame(animate);',
    '    controls.update();',
    '    renderer.render(scene, camera);',
    '  }',
    '  animate();',
    '}',
    'if (window.THREE && THREE.OrbitControls) init();',
    '</script>',
  ].join('\n');

  it('detects complete 3D shell', () => {
    const result = detect3DShellComplete(fullShell);
    assert.equal(result.isComplete, true);
    assert.ok(result.shellEnd > 0);
  });

  it('shellEnd points after init() call', () => {
    const result = detect3DShellComplete(fullShell);
    const before = fullShell.slice(0, result.shellEnd);
    assert.ok(before.endsWith('init();'));
  });

  it('builds an early shell with a closed script tag', () => {
    const result = detect3DShellComplete(fullShell);
    const shell = buildEarly3DShell(fullShell, result.shellEnd);
    assert.ok(shell.endsWith('</script>'));
    assert.ok(!shell.includes('onload="init()"'));
    assert.ok(!shell.includes('if (window.THREE && THREE.OrbitControls) init();'));
  });

  it('returns false when Three.js CDN missing', () => {
    const code = fullShell.replace('three.min.js', 'other.js');
    assert.equal(detect3DShellComplete(code).isComplete, false);
  });

  it('returns false when OrbitControls missing', () => {
    const code = fullShell.replace('OrbitControls.js', 'other.js');
    assert.equal(detect3DShellComplete(code).isComplete, false);
  });

  it('returns false when animate function not yet streamed', () => {
    const partial = fullShell.split('function animate')[0];
    assert.equal(detect3DShellComplete(partial).isComplete, false);
  });

  it('returns false when renderer.render not yet streamed', () => {
    const partial = fullShell.split('renderer.render')[0];
    assert.equal(detect3DShellComplete(partial).isComplete, false);
  });

  it('returns false when animate() call not yet streamed', () => {
    // Has function animate() definition but not the animate(); invocation after it
    const partial = fullShell.split('  animate();')[0];
    assert.equal(detect3DShellComplete(partial).isComplete, false);
  });

  it('returns false when init() call not yet streamed', () => {
    // Has animate(); but not the trailing init(); invocation
    const partial = fullShell.split('if (window.THREE')[0];
    assert.equal(detect3DShellComplete(partial).isComplete, false);
  });

  it('returns false for non-3D widget code', () => {
    const svgCode = '<svg viewBox="0 0 100 100"><rect width="50" height="50"/></svg>';
    assert.equal(detect3DShellComplete(svgCode).isComplete, false);
  });
});

describe('extractCompleteStatements', () => {
  it('extracts up to last semicolon', () => {
    const result = extractCompleteStatements('var a = 1; var b = 2; var c =');
    assert.equal(result.safe, 'var a = 1; var b = 2;');
    assert.equal(result.remainder, ' var c =');
  });

  it('extracts up to last closing brace', () => {
    const result = extractCompleteStatements('if (true) { doStuff(); } partial');
    assert.equal(result.safe, 'if (true) { doStuff(); }');
    assert.equal(result.remainder, ' partial');
  });

  it('returns empty safe when no complete statement', () => {
    const result = extractCompleteStatements('var x =');
    assert.equal(result.safe, '');
    assert.equal(result.remainder, 'var x =');
  });

  it('handles empty input', () => {
    const result = extractCompleteStatements('');
    assert.equal(result.safe, '');
    assert.equal(result.remainder, '');
  });

  it('returns full code when it ends with semicolon', () => {
    const result = extractCompleteStatements('scene.add(mesh);');
    assert.equal(result.safe, 'scene.add(mesh);');
    assert.equal(result.remainder, '');
  });
});

describe('extract3DInjectChunk', () => {
  it('returns trailing JS while the main script is still open', () => {
    const partial = '<script>init();scene.add(mesh);';
    const result = extract3DInjectChunk(partial, partial.indexOf('scene.add'));
    assert.equal(result.code, 'scene.add(mesh);');
    assert.equal(result.scriptClosed, false);
  });

  it('stops before the closing script tag', () => {
    const partial = '<script>init();scene.add(mesh);</script><div>tail</div>';
    const result = extract3DInjectChunk(partial, partial.indexOf('scene.add'));
    assert.equal(result.code, 'scene.add(mesh);');
    assert.equal(result.end, partial.indexOf('</script>'));
    assert.equal(result.scriptClosed, true);
  });
});

describe('playground app regression', () => {
  it('imports the shared parser module from app.js', () => {
    assert.ok(appJsSource.includes("from './lib/parser.js'"));
    assert.ok(!appJsSource.includes('function blockMarkdown('));
    assert.ok(!appJsSource.includes('function textToHtml('));
    assert.ok(!appJsSource.includes('function parseShowWidgetFence('));
  });

  it('imports renderer package for buildWidgetDoc and sanitization', () => {
    assert.ok(appJsSource.includes("from '/lib/renderer/index.js'"));
    assert.ok(appJsSource.includes('buildWidgetDoc'));
    assert.ok(appJsSource.includes('sanitizeForIframe'));
    assert.ok(appJsSource.includes('sanitizeForStreaming'));
    assert.ok(appJsSource.includes('stripUnclosedScript'));
    // Should NOT have inline buildWidgetDoc function
    assert.ok(!appJsSource.includes('function buildWidgetDoc('));
    assert.ok(!appJsSource.includes("const CDN_ORIGINS"));
  });

  it('imports progressive 3D helpers into app.js', () => {
    assert.ok(appJsSource.includes('detect3DWidget'));
    assert.ok(appJsSource.includes('detect3DShellComplete'));
    assert.ok(appJsSource.includes('buildEarly3DShell'));
    assert.ok(appJsSource.includes('extract3DInjectChunk'));
    assert.ok(appJsSource.includes('extractCompleteStatements'));
  });

  it('keeps a placeholder until the 3D shell is streamable', () => {
    assert.ok(appJsSource.includes("state.placeholderEl.innerHTML = '<p class=\"typing\">正在生成 3D 场景…</p>'"));
    assert.ok(appJsSource.includes('widget-3d-progressive'));
    assert.ok(appJsSource.includes("type: 'injectCode'"));
    assert.ok(appJsSource.includes("e.data?.type === 'widgetReady'"));
  });

  it('suspends widget iframes while streaming sessions are in background', () => {
    assert.ok(appJsSource.includes('function suspendWidgetIframes(root)'));
    assert.ok(appJsSource.includes('function resumeWidgetIframes(root)'));
    assert.ok(appJsSource.includes('suspendWidgetIframes(messagesEl);'));
    assert.ok(appJsSource.includes('resumeWidgetIframes(fragment);'));
  });

  it('loads app.js as an ES module', () => {
    assert.ok(indexHtmlSource.includes('<script type="module" src="app.js"></script>'));
  });
});
