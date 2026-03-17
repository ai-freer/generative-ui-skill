import { describe, it, expect } from 'vitest';
import { buildWidgetDoc } from '../src/iframe-renderer.js';

describe('buildWidgetDoc', () => {
  it('produces a complete HTML document', () => {
    const doc = buildWidgetDoc('<div>hello</div>');
    expect(doc).toContain('<!DOCTYPE html>');
    expect(doc).toContain('</html>');
    expect(doc).toContain('<div>hello</div>');
  });

  it('includes CSP meta tag with default CDN whitelist', () => {
    const doc = buildWidgetDoc('<p>test</p>');
    expect(doc).toContain('Content-Security-Policy');
    expect(doc).toContain('cdnjs.cloudflare.com');
    expect(doc).toContain('cdn.jsdelivr.net');
    expect(doc).toContain('unpkg.com');
    expect(doc).toContain('esm.sh');
    expect(doc).toContain("connect-src 'none'");
  });

  it('includes CSS variables in :root', () => {
    const doc = buildWidgetDoc('<p>test</p>');
    expect(doc).toContain(':root');
    expect(doc).toContain('--color-text-primary');
    expect(doc).toContain('--font-sans');
  });

  it('includes SVG preset classes', () => {
    const doc = buildWidgetDoc('<p>test</p>');
    expect(doc).toContain('.t  {');
    expect(doc).toContain('.box {');
    expect(doc).toContain('.c-purple');
    expect(doc).toContain('.c-red');
  });

  it('includes communication scripts', () => {
    const doc = buildWidgetDoc('<p>test</p>');
    expect(doc).toContain('__widgetSendMessage');
    expect(doc).toContain('reportHeight');
    expect(doc).toContain('fixContrast');
    expect(doc).toContain('widgetReady');
    expect(doc).toContain('MutationObserver');
  });

  it('includes widgetReady postMessage', () => {
    const doc = buildWidgetDoc('<p>test</p>');
    expect(doc).toContain('"widgetReady"');
  });

  it('accepts custom CSS variable mapping', () => {
    const doc = buildWidgetDoc('<p>test</p>', {
      cssVarMapping: { '--color-text-primary': 'red' },
    });
    expect(doc).toContain('--color-text-primary: red');
  });

  it('accepts custom CDN whitelist', () => {
    const doc = buildWidgetDoc('<p>test</p>', {
      cdnWhitelist: ['https://example.com'],
    });
    expect(doc).toContain('https://example.com');
    expect(doc).not.toContain('cdnjs.cloudflare.com');
  });

  it('accepts custom maxHeight', () => {
    const doc = buildWidgetDoc('<p>test</p>', { maxHeight: 600 });
    expect(doc).toContain('__maxH=600');
  });

  it('defaults maxHeight to 800', () => {
    const doc = buildWidgetDoc('<p>test</p>');
    expect(doc).toContain('__maxH=800');
  });
});
