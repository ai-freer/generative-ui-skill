import { describe, it, expect } from 'vitest';
import { stripUnclosedScript } from '../src/streaming-preview.js';

describe('stripUnclosedScript', () => {
  it('returns html unchanged when no script tags', () => {
    const html = '<div><p>hello</p></div>';
    expect(stripUnclosedScript(html)).toBe(html);
  });

  it('returns html unchanged when script is properly closed', () => {
    const html = '<div>before</div><script>console.log("hi")</script><p>after</p>';
    expect(stripUnclosedScript(html)).toBe(html);
  });

  it('strips unclosed script tag at the end', () => {
    const html = '<svg><rect/></svg><script>var x = 1;\nvar y = 2;';
    expect(stripUnclosedScript(html)).toBe('<svg><rect/></svg>');
  });

  it('strips unclosed script with attributes', () => {
    const html = '<div>ok</div><script src="https://cdn.example.com/lib.js">';
    expect(stripUnclosedScript(html)).toBe('<div>ok</div>');
  });

  it('keeps closed scripts but strips trailing unclosed one', () => {
    const html = '<script>var a=1;</script><div>mid</div><script>var b=2;';
    expect(stripUnclosedScript(html)).toBe('<script>var a=1;</script><div>mid</div>');
  });

  it('handles multiple closed scripts correctly', () => {
    const html = '<script>a()</script><script>b()</script><p>end</p>';
    expect(stripUnclosedScript(html)).toBe(html);
  });

  it('handles empty unclosed script tag', () => {
    const html = '<div>content</div><script>';
    expect(stripUnclosedScript(html)).toBe('<div>content</div>');
  });

  it('is case insensitive', () => {
    const html = '<div>ok</div><SCRIPT>var x = 1;';
    expect(stripUnclosedScript(html)).toBe('<div>ok</div>');
  });
});
