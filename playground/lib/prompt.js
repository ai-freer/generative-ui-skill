import { readFileSync } from 'fs';
import { join } from 'path';

export const MODULE_FILES = {
  core: ['core.md'],
  diagram: ['color-palette.md', 'svg-setup.md', 'diagram.md'],
  chart: ['ui-components.md', 'color-palette.md', 'chart.md'],
  interactive: ['ui-components.md', 'color-palette.md'],
  mockup: ['ui-components.md', 'color-palette.md'],
  art: ['svg-setup.md', 'art.md'],
  '3d': ['color-palette.md', '3d-scene.md'],
};

function isSeed2SeriesModel(model = '') {
  const normalized = String(model).toLowerCase();
  return (
    /(?:^|[-_ ])seed(?:[-_ ]?2|[-_ ]?2\.0)(?:[-_ ]|$)/i.test(normalized) ||
    /(?:^|[-_ ])doubao[-_ ]seed[-_ ]2(?:[-_ ]0)?(?:[-_ ]|$)/i.test(normalized)
  );
}

function resolvePromptPatchFiles({ model } = {}) {
  if (isSeed2SeriesModel(model)) {
    return ['seed-color-discipline.md'];
  }
  return [];
}

export function loadSystemPrompt(promptsDir, guidelinesDir, modules = ['core', 'diagram'], options = {}) {
  const systemPath = join(promptsDir, 'system.md');
  let text = readFileSync(systemPath, 'utf8');
  const seen = new Set();
  const modList = Array.isArray(modules) && modules.length ? [...modules] : ['core', 'diagram'];
  if (!modList.includes('core')) modList.unshift('core');
  for (const mod of modList) {
    const files = MODULE_FILES[mod];
    if (!files) continue;
    for (const file of files) {
      if (seen.has(file)) continue;
      seen.add(file);
      const path = join(guidelinesDir, file);
      try {
        text += '\n\n' + readFileSync(path, 'utf8');
      } catch (_) {
        // skip missing
      }
    }
  }

  const patchFiles = resolvePromptPatchFiles(options);
  for (const file of patchFiles) {
    const path = join(promptsDir, 'patches', file);
    try {
      text += '\n\n' + readFileSync(path, 'utf8');
    } catch (_) {
      // skip missing
    }
  }

  return text;
}
