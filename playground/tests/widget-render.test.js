import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXAMPLES_DIR = join(__dirname, '..', '..', 'examples');

const CDN_WHITELIST = [
  'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net',
  'unpkg.com',
  'esm.sh',
];

const FORBIDDEN_TAGS = ['<iframe', '<object', '<embed', '<form'];

let exampleFiles = [];
try {
  exampleFiles = readdirSync(EXAMPLES_DIR).filter(f => f.endsWith('.html'));
} catch (_) {
  // examples dir may not exist
}

describe('Widget examples — static checks', () => {
  if (exampleFiles.length === 0) {
    it('skipped: no example files found', () => { assert.ok(true); });
    return;
  }

  for (const file of exampleFiles) {
    const filePath = join(EXAMPLES_DIR, file);
    const content = readFileSync(filePath, 'utf8');

    describe(file, () => {
      it('is non-empty HTML', () => {
        assert.ok(content.length > 0);
        assert.ok(content.includes('<') && content.includes('>'));
      });

      it('does not contain forbidden tags', () => {
        for (const tag of FORBIDDEN_TAGS) {
          const lower = content.toLowerCase();
          assert.ok(!lower.includes(tag), `found forbidden tag: ${tag}`);
        }
      });

      it('script src only references whitelisted CDNs', () => {
        const srcRe = /<script[^>]+src=["']([^"']+)["']/gi;
        let match;
        while ((match = srcRe.exec(content)) !== null) {
          const url = match[1];
          const isWhitelisted = CDN_WHITELIST.some(cdn => url.includes(cdn));
          assert.ok(isWhitelisted, `script src not in CDN whitelist: ${url}`);
        }
      });

      it('uses CSS variables (not hardcoded colors in inline styles)', () => {
        // Check for common hardcoded color patterns in style attributes
        // Allow them in SVG fill/stroke attributes and <style> blocks (which may define fallbacks)
        const inlineStyleRe = /style="[^"]*color:\s*#[0-9a-f]{3,8}/gi;
        const matches = content.match(inlineStyleRe) || [];
        // Allow a few — some examples may have fallback colors
        assert.ok(matches.length <= 3, `too many hardcoded colors in inline styles: ${matches.length}`);
      });

      it('keeps 3D shell progressive-friendly when using Three.js', () => {
        if (!content.includes('three.min.js') || !content.includes('OrbitControls.js')) {
          assert.ok(true);
          return;
        }
        const initCall = 'if (window.THREE && THREE.OrbitControls) init();';
        const initCallIdx = content.indexOf(initCall);
        assert.ok(initCallIdx !== -1, 'missing init() bootstrap line');
        const afterInit = content.slice(initCallIdx + initCall.length);
        assert.ok(afterInit.includes('scene.add('), 'expected scene content after init() for progressive rendering');
      });
    });
  }
});
