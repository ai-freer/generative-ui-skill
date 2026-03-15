import { readFileSync, writeFileSync, mkdirSync } from 'fs';

const src = readFileSync('/tmp/guidelines.ts', 'utf8');

const sections = {};
const regex = /const (\w+) = `([\s\S]*?)`;/g;
let match;
while ((match = regex.exec(src)) !== null) {
  sections[match[1]] = match[2]
    .replace(/\\`/g, '`')
    .replace(/\\n/g, '\n')
    .replace(/\\\\/g, '\\');
}

const adaptations = [
  [/Anthropic Sans/g, 'var(--font-sans), system-ui, -apple-system, sans-serif'],
  [/claude\.ai/g, 'the host application'],
  [/sendPrompt\(/g, 'window.__widgetSendMessage('],
  [/`imagine_svg`/g, 'the `show-widget` code fence (SVG mode)'],
  [/`imagine_html`/g, 'the `show-widget` code fence (HTML mode)'],
  [/Use `imagine_svg`/g, 'Use the `show-widget` code fence with SVG'],
  [/Use `imagine_html`/g, 'Use the `show-widget` code fence with HTML'],
  [/fontFamily: '"var\(--font-sans\), system-ui, -apple-system, sans-serif"'/g,
   'fontFamily: \'system-ui, -apple-system, sans-serif\''],
];

function adapt(content) {
  for (const [pattern, replacement] of adaptations) {
    content = content.replace(pattern, replacement);
  }
  return content;
}

const fileMap = {
  CORE: 'core.md',
  COLOR_PALETTE: 'color-palette.md',
  SVG_SETUP: 'svg-setup.md',
  DIAGRAM_TYPES: 'diagram.md',
  CHARTS_CHART_JS: 'chart.md',
  UI_COMPONENTS: 'ui-components.md',
  ART_AND_ILLUSTRATION: 'art.md',
};

const outDir = 'prompts/guidelines';
mkdirSync(outDir, { recursive: true });

for (const [key, filename] of Object.entries(fileMap)) {
  if (!sections[key]) {
    console.error(`Section ${key} not found!`);
    continue;
  }
  const content = adapt(sections[key]);
  const path = `${outDir}/${filename}`;
  writeFileSync(path, content.trim() + '\n');
  const lines = content.trim().split('\n').length;
  console.log(`✓ ${path} (${lines} lines)`);
}

console.log('\nModule assembly rules:');
console.log('  diagram:     core + color-palette + svg-setup + diagram');
console.log('  chart:       core + ui-components + color-palette + chart');
console.log('  interactive: core + ui-components + color-palette');
console.log('  mockup:      core + ui-components + color-palette');
console.log('  art:         core + svg-setup + art');
