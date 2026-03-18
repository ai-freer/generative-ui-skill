import { describe, it, expect } from 'vitest';
import { sanitizeForStreaming, sanitizeForIframe } from '../src/sanitizer.js';

describe('sanitizeForStreaming', () => {
  it('strips script tags and their content', () => {
    const html = '<div>ok</div><script>alert(1)</script><p>after</p>';
    const result = sanitizeForStreaming(html);
    expect(result).not.toContain('<script');
    expect(result).not.toContain('</script');
    expect(result).not.toContain('alert(1)');
    expect(result).toContain('<div>ok</div>');
    expect(result).toContain('<p>after</p>');
  });

  it('strips iframe tags', () => {
    const html = '<div>ok</div><iframe src="evil.html"></iframe>';
    const result = sanitizeForStreaming(html);
    expect(result).not.toContain('<iframe');
  });

  it('strips object and embed tags', () => {
    const html = '<object data="x"></object><embed src="y">';
    const result = sanitizeForStreaming(html);
    expect(result).not.toContain('<object');
    expect(result).not.toContain('<embed');
  });

  it('strips form tags', () => {
    const html = '<form action="/steal"><input></form>';
    const result = sanitizeForStreaming(html);
    expect(result).not.toContain('<form');
  });

  it('strips meta/link/base tags', () => {
    const html = '<meta http-equiv="refresh" content="0;url=evil"><link rel="stylesheet" href="x"><base href="y">';
    const result = sanitizeForStreaming(html);
    expect(result).not.toContain('<meta');
    expect(result).not.toContain('<link');
    expect(result).not.toContain('<base');
  });

  it('strips on* event handlers', () => {
    const html = '<img src="x" onerror="alert(1)"><div onmouseover="steal()">';
    const result = sanitizeForStreaming(html);
    expect(result).not.toContain('onerror');
    expect(result).not.toContain('onmouseover');
  });

  it('strips javascript: URLs', () => {
    const html = '<a href="javascript:alert(1)">click</a>';
    const result = sanitizeForStreaming(html);
    expect(result).not.toContain('javascript:');
  });

  it('strips data: URLs', () => {
    const html = '<a href="data:text/html,<script>alert(1)</script>">x</a>';
    const result = sanitizeForStreaming(html);
    expect(result).not.toContain('data:text/html');
  });

  it('strips entire script block content (3D widget CDN + inline JS)', () => {
    const html = [
      '<style>canvas { display: block; }</style>',
      '<canvas id="c"></canvas>',
      '<div id="controls"></div>',
      '<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>',
      '<script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js" onload="init()"></script>',
      '<script>function init() { const scene = new THREE.Scene(); }</script>',
    ].join('\n');
    const result = sanitizeForStreaming(html);
    expect(result).toContain('<canvas id="c"></canvas>');
    expect(result).toContain('<div id="controls"></div>');
    expect(result).not.toContain('three.min.js');
    expect(result).not.toContain('OrbitControls');
    expect(result).not.toContain('THREE.Scene');
    expect(result).not.toContain('function init');
  });

  it('strips unclosed trailing script (partial streaming)', () => {
    const html = [
      '<canvas id="c"></canvas>',
      '<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>',
      '<script>function init() { var renderer = new THREE.WebGL',
    ].join('\n');
    const result = sanitizeForStreaming(html);
    expect(result).toContain('<canvas id="c"></canvas>');
    expect(result).not.toContain('three.min.js');
    expect(result).not.toContain('THREE.WebGL');
    expect(result).not.toContain('function init');
  });

  it('preserves safe HTML content', () => {
    const html = '<div class="box"><svg><rect x="10" y="10" width="100" height="50"/></svg></div>';
    expect(sanitizeForStreaming(html)).toBe(html);
  });

  it('handles mixed dangerous content', () => {
    const html = '<div onclick="alert(1)"><script>x</script><iframe src="y"></iframe><p>safe</p></div>';
    const result = sanitizeForStreaming(html);
    expect(result).not.toContain('onclick');
    expect(result).not.toContain('<script');
    expect(result).not.toContain('<iframe');
    expect(result).toContain('<p>safe</p>');
  });
});

describe('sanitizeForIframe', () => {
  it('strips iframe/object/embed (escape vectors)', () => {
    const html = '<iframe src="x"></iframe><object data="y"></object><embed src="z">';
    const result = sanitizeForIframe(html);
    expect(result).not.toContain('<iframe');
    expect(result).not.toContain('<object');
    expect(result).not.toContain('<embed');
  });

  it('keeps script tags (safe inside sandbox)', () => {
    const html = '<script>console.log("ok")</script>';
    expect(sanitizeForIframe(html)).toContain('<script>');
  });

  it('keeps event handlers (safe inside sandbox)', () => {
    const html = '<button onclick="doStuff()">click</button>';
    expect(sanitizeForIframe(html)).toContain('onclick');
  });

  it('keeps form tags (safe inside sandbox)', () => {
    const html = '<form><input type="text"></form>';
    expect(sanitizeForIframe(html)).toContain('<form>');
  });

  it('preserves all safe content', () => {
    const html = '<div><svg><rect/></svg><script>init()</script></div>';
    expect(sanitizeForIframe(html)).toBe(html);
  });

  it('preserves injectCode handler pattern (not in widget_code, but verify sanitizeForIframe does not strip it)', () => {
    const html = '<script>window.addEventListener("message",function(e){if(e.data&&e.data.type==="injectCode"){(0,eval)(e.data.code);}});</script>';
    const result = sanitizeForIframe(html);
    expect(result).toContain('injectCode');
    expect(result).toContain('(0,eval)');
  });
});
