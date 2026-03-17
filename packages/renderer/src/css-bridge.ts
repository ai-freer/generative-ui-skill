import type { CssVarMapping } from './types.js';

/** Default CDN whitelist (CSP-enforced) */
export const CDN_WHITELIST = [
  'https://cdnjs.cloudflare.com',
  'https://cdn.jsdelivr.net',
  'https://unpkg.com',
  'https://esm.sh',
];

/** Default CSS variable mapping: model standard names → values (light mode) */
export const DEFAULT_CSS_VAR_MAPPING: CssVarMapping = {
  '--color-background-primary': '#fff',
  '--color-background-secondary': '#f1f5f9',
  '--color-background-tertiary': '#e2e8f0',
  '--color-text-primary': '#0f172a',
  '--color-text-secondary': '#64748b',
  '--color-text-tertiary': '#94a3b8',
  '--color-border-tertiary': 'rgba(0,0,0,.12)',
  '--color-border-secondary': 'rgba(0,0,0,.2)',
  '--color-border-primary': 'rgba(0,0,0,.4)',
  '--font-sans': 'system-ui,-apple-system,sans-serif',
  '--font-serif': 'Georgia,serif',
  '--font-mono': 'ui-monospace,monospace',
  '--border-radius-md': '8px',
  '--border-radius-lg': '12px',
  '--border-radius-xl': '16px',
};

/** Dark-mode CSS variable mapping */
export const DARK_CSS_VAR_MAPPING: CssVarMapping = {
  '--color-background-primary': '#1e293b',
  '--color-background-secondary': '#334155',
  '--color-background-tertiary': '#475569',
  '--color-text-primary': '#f1f5f9',
  '--color-text-secondary': '#94a3b8',
  '--color-text-tertiary': '#64748b',
  '--color-border-tertiary': 'rgba(255,255,255,.10)',
  '--color-border-secondary': 'rgba(255,255,255,.18)',
  '--color-border-primary': 'rgba(255,255,255,.32)',
  '--font-sans': 'system-ui,-apple-system,sans-serif',
  '--font-serif': 'Georgia,serif',
  '--font-mono': 'ui-monospace,monospace',
  '--border-radius-md': '8px',
  '--border-radius-lg': '12px',
  '--border-radius-xl': '16px',
};

/** Shorthand aliases used in some widget code */
function buildShortAliases(isDark: boolean): string {
  return isDark
    ? '  --p:#f1f5f9; --s:#94a3b8; --t:#64748b; --bg2:#334155; --b:rgba(255,255,255,.10);'
    : '  --p:#0f172a; --s:#64748b; --t:#94a3b8; --bg2:#f1f5f9; --b:rgba(0,0,0,.12);';
}

// --- Form element pre-styles (button subtle pill + anchor text-link) ---
const FORM_ELEMENT_STYLES = `
button { font:inherit; font-size:13px; color:var(--color-text-secondary); background:var(--color-background-secondary); border:none; border-radius:999px; padding:0.4rem 0.9rem; cursor:pointer; transition:background 0.15s,color 0.15s; }
button:hover { background:var(--color-background-tertiary); color:var(--color-text-primary); }
button:active { transform:scale(0.98); }
a { color:var(--color-text-secondary); text-decoration:none; cursor:pointer; }
a:hover { color:var(--color-text-primary); text-decoration:underline; }`;

// --- SVG text classes ---
const SVG_TEXT_CLASSES = `
.t  { font: 400 14px/1.4 var(--font-sans); fill: var(--color-text-primary); }
.ts { font: 400 12px/1.4 var(--font-sans); fill: var(--color-text-secondary); }
.th { font: 500 14px/1.4 var(--font-sans); fill: var(--color-text-primary); }`;

// --- SVG structural classes ---
const SVG_STRUCTURAL_CLASSES = `
.box { fill: var(--color-background-secondary); stroke: var(--color-border-tertiary); stroke-width: 0.5px; }
.node { cursor: pointer; } .node:hover { opacity: 0.85; }
.arr { stroke: var(--color-text-secondary); stroke-width: 1.5px; fill: none; }
.leader { stroke: var(--color-text-tertiary); stroke-width: 0.5px; stroke-dasharray: 4 2; fill: none; }`;

// --- Color ramp classes: 9 colors × fill(50), stroke(600), title text(800), subtitle text(600) ---
const COLOR_RAMPS = `
.c-purple > rect,.c-purple > circle,.c-purple > ellipse { fill:#EEEDFE; stroke:#534AB7; stroke-width:0.5px; }
.c-purple .t,.c-purple .th { fill:#3C3489; } .c-purple .ts { fill:#534AB7; }

.c-teal > rect,.c-teal > circle,.c-teal > ellipse { fill:#E1F5EE; stroke:#0F6E56; stroke-width:0.5px; }
.c-teal .t,.c-teal .th { fill:#085041; } .c-teal .ts { fill:#0F6E56; }

.c-coral > rect,.c-coral > circle,.c-coral > ellipse { fill:#FAECE7; stroke:#993C1D; stroke-width:0.5px; }
.c-coral .t,.c-coral .th { fill:#712B13; } .c-coral .ts { fill:#993C1D; }

.c-pink > rect,.c-pink > circle,.c-pink > ellipse { fill:#FBEAF0; stroke:#993556; stroke-width:0.5px; }
.c-pink .t,.c-pink .th { fill:#72243E; } .c-pink .ts { fill:#993556; }

.c-gray > rect,.c-gray > circle,.c-gray > ellipse { fill:#F1EFE8; stroke:#5F5E5A; stroke-width:0.5px; }
.c-gray .t,.c-gray .th { fill:#444441; } .c-gray .ts { fill:#5F5E5A; }

.c-blue > rect,.c-blue > circle,.c-blue > ellipse { fill:#E6F1FB; stroke:#185FA5; stroke-width:0.5px; }
.c-blue .t,.c-blue .th { fill:#0C447C; } .c-blue .ts { fill:#185FA5; }

.c-green > rect,.c-green > circle,.c-green > ellipse { fill:#EAF3DE; stroke:#3B6D11; stroke-width:0.5px; }
.c-green .t,.c-green .th { fill:#27500A; } .c-green .ts { fill:#3B6D11; }

.c-amber > rect,.c-amber > circle,.c-amber > ellipse { fill:#FAEEDA; stroke:#854F0B; stroke-width:0.5px; }
.c-amber .t,.c-amber .th { fill:#633806; } .c-amber .ts { fill:#854F0B; }

.c-red > rect,.c-red > circle,.c-red > ellipse { fill:#FCEBEB; stroke:#A32D2D; stroke-width:0.5px; }
.c-red .t,.c-red .th { fill:#791F1F; } .c-red .ts { fill:#A32D2D; }`;

// --- Dark color ramps: 800 fill + 200 stroke + 100 title / 200 subtitle ---
const COLOR_RAMPS_DARK = `
@media (prefers-color-scheme: dark) {
.c-purple > rect,.c-purple > circle,.c-purple > ellipse { fill:#3C3489; stroke:#AFA9EC; stroke-width:0.5px; }
.c-purple .t,.c-purple .th { fill:#CECBF6; } .c-purple .ts { fill:#AFA9EC; }

.c-teal > rect,.c-teal > circle,.c-teal > ellipse { fill:#085041; stroke:#5DCAA5; stroke-width:0.5px; }
.c-teal .t,.c-teal .th { fill:#9FE1CB; } .c-teal .ts { fill:#5DCAA5; }

.c-coral > rect,.c-coral > circle,.c-coral > ellipse { fill:#712B13; stroke:#F0997B; stroke-width:0.5px; }
.c-coral .t,.c-coral .th { fill:#F5C4B3; } .c-coral .ts { fill:#F0997B; }

.c-pink > rect,.c-pink > circle,.c-pink > ellipse { fill:#72243E; stroke:#ED93B1; stroke-width:0.5px; }
.c-pink .t,.c-pink .th { fill:#F4C0D1; } .c-pink .ts { fill:#ED93B1; }

.c-gray > rect,.c-gray > circle,.c-gray > ellipse { fill:#444441; stroke:#B4B2A9; stroke-width:0.5px; }
.c-gray .t,.c-gray .th { fill:#D3D1C7; } .c-gray .ts { fill:#B4B2A9; }

.c-blue > rect,.c-blue > circle,.c-blue > ellipse { fill:#0C447C; stroke:#85B7EB; stroke-width:0.5px; }
.c-blue .t,.c-blue .th { fill:#B5D4F4; } .c-blue .ts { fill:#85B7EB; }

.c-green > rect,.c-green > circle,.c-green > ellipse { fill:#27500A; stroke:#97C459; stroke-width:0.5px; }
.c-green .t,.c-green .th { fill:#C0DD97; } .c-green .ts { fill:#97C459; }

.c-amber > rect,.c-amber > circle,.c-amber > ellipse { fill:#633806; stroke:#EF9F27; stroke-width:0.5px; }
.c-amber .t,.c-amber .th { fill:#FAC775; } .c-amber .ts { fill:#EF9F27; }

.c-red > rect,.c-red > circle,.c-red > ellipse { fill:#791F1F; stroke:#F09595; stroke-width:0.5px; }
.c-red .t,.c-red .th { fill:#F7C1C1; } .c-red .ts { fill:#F09595; }
}`;

const ALL_COLOR_NAMES = ['purple', 'teal', 'coral', 'pink', 'gray', 'blue', 'green', 'amber', 'red'] as const;
export type ColorName = typeof ALL_COLOR_NAMES[number];
export { ALL_COLOR_NAMES };

function buildRootVars(mapping: CssVarMapping, isDark = false): string {
  const entries = Object.entries(mapping)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n');
  return `:root {\n${entries}\n${buildShortAliases(isDark)}\n}`;
}

/**
 * Generate the full CSS string to inject inside an iframe.
 * Includes :root variables, body reset, SVG classes, and color ramps.
 */
export function generateIframeStyles(mapping?: CssVarMapping): string {
  const vars = buildRootVars(mapping ?? DEFAULT_CSS_VAR_MAPPING);
  const darkVars = buildRootVars(DARK_CSS_VAR_MAPPING, true);
  const body = `body { margin:0; padding:1rem; font:16px/1.6 var(--font-sans); color:var(--color-text-primary); background:var(--color-background-primary); }`;
  const darkOverride = `@media (prefers-color-scheme: dark) {\n${darkVars}\nbody { background:var(--color-background-primary); }\n}`;
  return `${vars}\n${body}\n${darkOverride}\n${FORM_ELEMENT_STYLES}\n${SVG_TEXT_CLASSES}\n${SVG_STRUCTURAL_CLASSES}\n${COLOR_RAMPS}\n${COLOR_RAMPS_DARK}`;
}

/**
 * Generate scoped CSS for streaming preview in the host page.
 * All selectors are prefixed with the scope class (default: `.widget-streaming`).
 */
export function generateStreamingStyles(scopeClass = '.widget-streaming'): string {
  const scope = (css: string) =>
    css.replace(/^(\.[a-z])/gm, `${scopeClass} $1`);

  return `${scopeClass} { min-height: 120px; transition: min-height 0.3s ease; }
${scopeClass} svg { max-width: 100%; height: auto; }
${scope(SVG_TEXT_CLASSES)}
${scope(SVG_STRUCTURAL_CLASSES)}
${scope(COLOR_RAMPS)}`;
}

/**
 * Build the CSP meta tag content string.
 */
export function buildCSP(cdnWhitelist?: string[]): string {
  const origins = (cdnWhitelist ?? CDN_WHITELIST).join(' ');
  return `default-src 'none'; script-src 'unsafe-inline' ${origins}; style-src 'unsafe-inline'; img-src data:; connect-src 'none';`;
}
