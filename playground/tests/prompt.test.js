import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadSystemPrompt, MODULE_FILES } from '../lib/prompt.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..');
const PROMPTS_DIR = join(PROJECT_ROOT, 'prompts');
const GUIDELINES_DIR = join(PROJECT_ROOT, 'prompts', 'guidelines');

describe('MODULE_FILES', () => {
  it('has core module', () => {
    assert.ok(MODULE_FILES.core);
    assert.ok(MODULE_FILES.core.includes('core.md'));
  });
  it('has all 6 modules', () => {
    const keys = Object.keys(MODULE_FILES);
    assert.deepEqual(keys.sort(), ['art', 'chart', 'core', 'diagram', 'interactive', 'mockup']);
  });
});

describe('loadSystemPrompt', () => {
  it('loads system.md content', () => {
    const text = loadSystemPrompt(PROMPTS_DIR, GUIDELINES_DIR);
    assert.ok(text.includes('show-widget'));
  });

  it('includes core guidelines by default', () => {
    const text = loadSystemPrompt(PROMPTS_DIR, GUIDELINES_DIR);
    assert.ok(text.includes('widget-capability'));
  });

  it('includes diagram guidelines when requested', () => {
    const text = loadSystemPrompt(PROMPTS_DIR, GUIDELINES_DIR, ['core', 'diagram']);
    assert.ok(text.includes('Flowchart') || text.includes('flowchart') || text.includes('diagram'));
  });

  it('auto-prepends core when missing', () => {
    const text = loadSystemPrompt(PROMPTS_DIR, GUIDELINES_DIR, ['diagram']);
    // Should still contain core content
    assert.ok(text.includes('widget-capability'));
  });

  it('deduplicates shared files', () => {
    // chart and interactive both include color-palette.md and ui-components.md
    const text = loadSystemPrompt(PROMPTS_DIR, GUIDELINES_DIR, ['core', 'chart', 'interactive']);
    const colorPaletteCount = text.split('Color palette').length - 1;
    // Should appear only once (deduped)
    assert.ok(colorPaletteCount <= 1, `color-palette appeared ${colorPaletteCount} times`);
  });

  it('falls back to core+diagram for empty modules', () => {
    const text = loadSystemPrompt(PROMPTS_DIR, GUIDELINES_DIR, []);
    assert.ok(text.includes('show-widget'));
  });
});

// README 167-177: 每种推荐主题组合都应能正确构建 system prompt
describe('README theme combinations', () => {
  const THEME_COMBOS = [
    { name: '技术/概念讲解', modules: ['core', 'diagram'], mustInclude: ['diagram'] },
    { name: '数据相关主题', modules: ['core', 'chart', 'diagram'], mustInclude: ['chart', 'diagram'] },
    { name: '产品/功能设计', modules: ['core', 'mockup', 'diagram'], mustInclude: ['diagram', 'ui-components'] },
    { name: '交互或算法可视化', modules: ['core', 'diagram', 'interactive'], mustInclude: ['diagram', 'ui-components'] },
    { name: '品牌/世界观/设定', modules: ['core', 'art', 'mockup'], mustInclude: ['art', 'ui-components'] },
    { name: '复杂策略/流程优化', modules: ['core', 'diagram', 'chart', 'interactive'], mustInclude: ['diagram', 'chart', 'ui-components'] },
    { name: '视觉灵感', modules: ['art', 'mockup'], mustInclude: ['art', 'ui-components'] },
  ];

  for (const combo of THEME_COMBOS) {
    describe(combo.name + ' → [' + combo.modules.join(', ') + ']', () => {
      it('loads without error', () => {
        const text = loadSystemPrompt(PROMPTS_DIR, GUIDELINES_DIR, combo.modules);
        assert.ok(text.length > 0);
      });

      it('always includes core', () => {
        const text = loadSystemPrompt(PROMPTS_DIR, GUIDELINES_DIR, combo.modules);
        assert.ok(text.includes('show-widget'), 'missing core content (show-widget)');
      });

      for (const keyword of combo.mustInclude) {
        it(`includes ${keyword} guideline content`, () => {
          const text = loadSystemPrompt(PROMPTS_DIR, GUIDELINES_DIR, combo.modules);
          // Each guideline file has a markdown heading with its name
          const lower = text.toLowerCase();
          assert.ok(
            lower.includes(keyword.toLowerCase()),
            `prompt missing expected keyword: ${keyword}`
          );
        });
      }

      it('deduplicates shared files', () => {
        const text = loadSystemPrompt(PROMPTS_DIR, GUIDELINES_DIR, combo.modules);
        // color-palette.md is shared across many modules — should appear at most once
        const matches = text.match(/Color palette/gi) || [];
        assert.ok(matches.length <= 1, `color-palette appeared ${matches.length} times (should be deduped)`);
      });
    });
  }
});
