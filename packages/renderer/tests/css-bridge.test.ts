import { describe, it, expect } from 'vitest';
import {
  CDN_WHITELIST,
  DEFAULT_CSS_VAR_MAPPING,
  ALL_COLOR_NAMES,
  generateIframeStyles,
  generateStreamingStyles,
  buildCSP,
} from '../src/css-bridge.js';

describe('CDN_WHITELIST', () => {
  it('contains 4 allowed origins', () => {
    expect(CDN_WHITELIST).toHaveLength(4);
    expect(CDN_WHITELIST).toContain('https://cdnjs.cloudflare.com');
    expect(CDN_WHITELIST).toContain('https://esm.sh');
  });
});

describe('DEFAULT_CSS_VAR_MAPPING', () => {
  it('contains core color variables', () => {
    expect(DEFAULT_CSS_VAR_MAPPING['--color-text-primary']).toBeDefined();
    expect(DEFAULT_CSS_VAR_MAPPING['--color-background-primary']).toBeDefined();
    expect(DEFAULT_CSS_VAR_MAPPING['--font-sans']).toBeDefined();
  });
});

describe('generateIframeStyles', () => {
  it('includes :root variables', () => {
    const css = generateIframeStyles();
    expect(css).toContain(':root');
    expect(css).toContain('--color-text-primary');
  });

  it('includes body reset', () => {
    const css = generateIframeStyles();
    expect(css).toContain('body {');
    expect(css).toContain('margin:0');
  });

  it('includes SVG text classes', () => {
    const css = generateIframeStyles();
    expect(css).toContain('.t  {');
    expect(css).toContain('.ts {');
    expect(css).toContain('.th {');
  });

  it('includes SVG structural classes', () => {
    const css = generateIframeStyles();
    expect(css).toContain('.box {');
    expect(css).toContain('.arr {');
    expect(css).toContain('.leader {');
    expect(css).toContain('.node {');
  });

  it('includes all 9 color ramps', () => {
    const css = generateIframeStyles();
    for (const color of ALL_COLOR_NAMES) {
      expect(css).toContain(`.c-${color}`);
    }
  });

  it('accepts custom variable mapping', () => {
    const custom = { '--color-text-primary': 'red', '--font-sans': 'Arial' };
    const css = generateIframeStyles(custom);
    expect(css).toContain('--color-text-primary: red');
    expect(css).toContain('--font-sans: Arial');
  });
});

describe('generateStreamingStyles', () => {
  it('scopes all selectors under .widget-streaming by default', () => {
    const css = generateStreamingStyles();
    expect(css).toContain('.widget-streaming');
    expect(css).toContain('.widget-streaming .t');
    expect(css).toContain('.widget-streaming .c-purple');
  });

  it('accepts custom scope class', () => {
    const css = generateStreamingStyles('.my-preview');
    expect(css).toContain('.my-preview');
    expect(css).toContain('.my-preview .t');
  });

  it('includes min-height and transition', () => {
    const css = generateStreamingStyles();
    expect(css).toContain('min-height');
    expect(css).toContain('transition');
  });
});

describe('buildCSP', () => {
  it('builds CSP with default whitelist', () => {
    const csp = buildCSP();
    expect(csp).toContain("script-src 'unsafe-inline'");
    expect(csp).toContain('cdnjs.cloudflare.com');
    expect(csp).toContain("connect-src 'none'");
  });

  it('accepts custom whitelist', () => {
    const csp = buildCSP(['https://example.com']);
    expect(csp).toContain('https://example.com');
    expect(csp).not.toContain('cdnjs.cloudflare.com');
  });
});
