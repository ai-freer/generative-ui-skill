// src/stream-parser.ts
function isShowWidgetFence(firstLine) {
  const t = firstLine.trim().toLowerCase();
  return t.startsWith("show-widget") || t.startsWith("show_widget");
}
function parseShowWidgetFence(streamText) {
  const fences = [];
  let i = 0;
  const len = streamText.length;
  while (i < len) {
    const open = streamText.indexOf("```", i);
    if (open === -1) break;
    const afterOpen = streamText.slice(open + 3);
    const lineEnd = afterOpen.indexOf("\n");
    const firstLine = lineEnd === -1 ? afterOpen : afterOpen.slice(0, lineEnd);
    if (!isShowWidgetFence(firstLine)) {
      i = open + 3;
      continue;
    }
    const bodyStart = open + 3 + (lineEnd === -1 ? firstLine.length : lineEnd + 1);
    let found = false;
    let searchFrom = bodyStart;
    while (searchFrom < len) {
      const close = streamText.indexOf("```", searchFrom);
      if (close === -1) break;
      const body = streamText.slice(bodyStart, close).trim();
      const fenceEnd = close + 3;
      try {
        const obj = JSON.parse(body);
        if (obj && typeof obj.widget_code === "string") {
          fences.push({ title: obj.title || "widget", widget_code: obj.widget_code, start: open, end: fenceEnd });
        }
      } catch {
        searchFrom = fenceEnd;
        continue;
      }
      i = fenceEnd;
      found = true;
      break;
    }
    if (!found) break;
  }
  return fences;
}
function findAllShowWidgetFences(text) {
  const fences = [];
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf("```", i);
    if (open === -1) break;
    const afterOpen = text.slice(open + 3);
    const lineEnd = afterOpen.indexOf("\n");
    const firstLine = lineEnd === -1 ? afterOpen : afterOpen.slice(0, lineEnd);
    if (!isShowWidgetFence(firstLine)) {
      i = open + 3;
      continue;
    }
    const bodyStart = open + 3 + (lineEnd === -1 ? firstLine.length : lineEnd + 1);
    let found = false;
    let searchFrom = bodyStart;
    while (searchFrom < text.length) {
      const close = text.indexOf("```", searchFrom);
      if (close === -1) break;
      const body = text.slice(bodyStart, close).trim();
      const fenceEnd = close + 3;
      let parsed = null;
      try {
        const obj = JSON.parse(body);
        if (obj && typeof obj.widget_code === "string") {
          parsed = { title: obj.title || "widget", widget_code: obj.widget_code };
        }
      } catch {
        searchFrom = fenceEnd;
        continue;
      }
      fences.push({ start: open, end: fenceEnd, parsed });
      i = fenceEnd;
      found = true;
      break;
    }
    if (!found) break;
  }
  return fences;
}
function extractPartialWidgetCode(partialBody) {
  const key = '"widget_code"';
  const keyIdx = partialBody.indexOf(key);
  if (keyIdx === -1) return null;
  let pos = keyIdx + key.length;
  while (pos < partialBody.length && (partialBody[pos] === " " || partialBody[pos] === ":")) pos++;
  if (pos >= partialBody.length || partialBody[pos] !== '"') return null;
  pos++;
  let result = "";
  while (pos < partialBody.length) {
    const ch = partialBody[pos];
    if (ch === "\\" && pos + 1 < partialBody.length) {
      const next = partialBody[pos + 1];
      if (next === '"') {
        result += '"';
        pos += 2;
      } else if (next === "\\") {
        result += "\\";
        pos += 2;
      } else if (next === "n") {
        result += "\n";
        pos += 2;
      } else if (next === "t") {
        result += "	";
        pos += 2;
      } else if (next === "/") {
        result += "/";
        pos += 2;
      } else if (next === "r") {
        result += "\r";
        pos += 2;
      } else if (next === "u" && pos + 5 < partialBody.length) {
        const hex = partialBody.slice(pos + 2, pos + 6);
        if (/^[0-9a-fA-F]{4}$/.test(hex)) {
          result += String.fromCharCode(parseInt(hex, 16));
          pos += 6;
        } else {
          result += ch;
          pos++;
        }
      } else {
        result += ch;
        pos++;
      }
    } else if (ch === '"') {
      break;
    } else {
      result += ch;
      pos++;
    }
  }
  return result || null;
}
function patchIncompleteWidgetFence(text) {
  const parsed = parseShowWidgetFence(text);
  const tailStart = parsed.length > 0 ? parsed[parsed.length - 1].end : 0;
  const tail = text.slice(tailStart);
  const bt = tail.indexOf("```");
  if (bt === -1 || !isShowWidgetFence(tail.slice(bt + 3).split("\n")[0])) {
    return text;
  }
  const afterFence = tail.slice(bt + 3);
  const nl = afterFence.indexOf("\n");
  const partialBody = nl !== -1 ? afterFence.slice(nl + 1) : "";
  const partialCode = extractPartialWidgetCode(partialBody);
  if (!partialCode || partialCode.length < 30) {
    return text;
  }
  const fenceStart = tailStart + bt;
  const patchedJson = JSON.stringify({ title: "widget", widget_code: partialCode });
  return text.slice(0, fenceStart) + "```show-widget\n" + patchedJson + "\n```";
}
var StreamParser = class {
  constructor() {
    this.text = "";
    this.completedCount = 0;
  }
  /** Feed accumulated stream text (not a delta — the full text so far). */
  feed(accumulatedText) {
    this.text = accumulatedText;
  }
  /** Get all newly completed widget fences since last call. */
  getNewWidgets() {
    const all = parseShowWidgetFence(this.text);
    const newOnes = all.slice(this.completedCount);
    this.completedCount = all.length;
    return newOnes;
  }
  /** Get all completed widget fences so far. */
  getCompletedWidgets() {
    return parseShowWidgetFence(this.text);
  }
  /** Number of completed widgets. */
  get completedWidgetCount() {
    return this.completedCount;
  }
  /**
   * Get partial widget_code from the current unclosed fence (if any).
   * Returns null if there's no unclosed show-widget fence.
   */
  getPartialWidgetCode() {
    const parsed = parseShowWidgetFence(this.text);
    const tailStart = parsed.length > 0 ? parsed[parsed.length - 1].end : 0;
    const tail = this.text.slice(tailStart);
    const bt = tail.indexOf("```");
    if (bt === -1 || !isShowWidgetFence(tail.slice(bt + 3).split("\n")[0])) {
      return null;
    }
    const afterFence = tail.slice(bt + 3);
    const nl = afterFence.indexOf("\n");
    const partialBody = nl !== -1 ? afterFence.slice(nl + 1) : "";
    return extractPartialWidgetCode(partialBody);
  }
  /**
   * Get the text content before any unclosed fence (the visible tail text).
   * Returns the full tail if no unclosed fence exists.
   */
  getTailText() {
    const parsed = parseShowWidgetFence(this.text);
    const tailStart = parsed.length > 0 ? parsed[parsed.length - 1].end : 0;
    const tail = this.text.slice(tailStart);
    const bt = tail.indexOf("```");
    if (bt !== -1 && isShowWidgetFence(tail.slice(bt + 3).split("\n")[0])) {
      return tail.slice(0, bt);
    }
    return tail;
  }
  /** Check if there's currently an unclosed show-widget fence. */
  hasUnclosedFence() {
    const parsed = parseShowWidgetFence(this.text);
    const tailStart = parsed.length > 0 ? parsed[parsed.length - 1].end : 0;
    const tail = this.text.slice(tailStart);
    const bt = tail.indexOf("```");
    return bt !== -1 && isShowWidgetFence(tail.slice(bt + 3).split("\n")[0]);
  }
  /** Get the text between two completed widgets (or from start). */
  getTextBetween(index) {
    const parsed = parseShowWidgetFence(this.text);
    if (index >= parsed.length) return "";
    const prevEnd = index > 0 ? parsed[index - 1].end : 0;
    return this.text.slice(prevEnd, parsed[index].start);
  }
  /** Get the full accumulated text. */
  getText() {
    return this.text;
  }
  /** Reset all state. */
  reset() {
    this.text = "";
    this.completedCount = 0;
  }
};

// src/css-bridge.ts
var CDN_WHITELIST = [
  "https://cdnjs.cloudflare.com",
  "https://cdn.jsdelivr.net",
  "https://unpkg.com",
  "https://esm.sh"
];
var DEFAULT_CSS_VAR_MAPPING = {
  "--color-background-primary": "#fff",
  "--color-background-secondary": "#f1f5f9",
  "--color-background-tertiary": "#e2e8f0",
  "--color-text-primary": "#0f172a",
  "--color-text-secondary": "#64748b",
  "--color-text-tertiary": "#94a3b8",
  "--color-border-tertiary": "rgba(0,0,0,.12)",
  "--color-border-secondary": "rgba(0,0,0,.2)",
  "--color-border-primary": "rgba(0,0,0,.4)",
  "--font-sans": "system-ui,-apple-system,sans-serif",
  "--font-serif": "Georgia,serif",
  "--font-mono": "ui-monospace,monospace",
  "--border-radius-md": "8px",
  "--border-radius-lg": "12px",
  "--border-radius-xl": "16px"
};
var DARK_CSS_VAR_MAPPING = {
  "--color-background-primary": "#1e293b",
  "--color-background-secondary": "#334155",
  "--color-background-tertiary": "#475569",
  "--color-text-primary": "#f1f5f9",
  "--color-text-secondary": "#94a3b8",
  "--color-text-tertiary": "#64748b",
  "--color-border-tertiary": "rgba(255,255,255,.10)",
  "--color-border-secondary": "rgba(255,255,255,.18)",
  "--color-border-primary": "rgba(255,255,255,.32)",
  "--font-sans": "system-ui,-apple-system,sans-serif",
  "--font-serif": "Georgia,serif",
  "--font-mono": "ui-monospace,monospace",
  "--border-radius-md": "8px",
  "--border-radius-lg": "12px",
  "--border-radius-xl": "16px"
};
function buildShortAliases(isDark) {
  return isDark ? "  --p:#f1f5f9; --s:#94a3b8; --t:#64748b; --bg2:#334155; --b:rgba(255,255,255,.10);" : "  --p:#0f172a; --s:#64748b; --t:#94a3b8; --bg2:#f1f5f9; --b:rgba(0,0,0,.12);";
}
var FORM_ELEMENT_STYLES = `
button { font:inherit; font-size:13px; color:var(--color-text-secondary); background:var(--color-background-secondary); border:none; border-radius:999px; padding:0.4rem 0.9rem; cursor:pointer; transition:background 0.15s,color 0.15s; }
button:hover { background:var(--color-background-tertiary); color:var(--color-text-primary); }
button:active { transform:scale(0.98); }
a { color:var(--color-text-secondary); text-decoration:none; cursor:pointer; }
a:hover { color:var(--color-text-primary); text-decoration:underline; }`;
var SVG_TEXT_CLASSES = `
.t  { font: 400 14px/1.4 var(--font-sans); fill: var(--color-text-primary); }
.ts { font: 400 12px/1.4 var(--font-sans); fill: var(--color-text-secondary); }
.th { font: 500 14px/1.4 var(--font-sans); fill: var(--color-text-primary); }`;
var SVG_STRUCTURAL_CLASSES = `
.box { fill: var(--color-background-secondary); stroke: var(--color-border-tertiary); stroke-width: 0.5px; }
.node { cursor: pointer; } .node:hover { opacity: 0.85; }
.arr { stroke: var(--color-text-secondary); stroke-width: 1.5px; fill: none; }
.leader { stroke: var(--color-text-tertiary); stroke-width: 0.5px; stroke-dasharray: 4 2; fill: none; }`;
var COLOR_RAMPS = `
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
var COLOR_RAMPS_DARK = `
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
`;
function buildRootVars(mapping, isDark = false) {
  const entries = Object.entries(mapping).map(([k, v]) => `  ${k}: ${v};`).join("\n");
  return `:root {
${entries}
${buildShortAliases(isDark)}
}`;
}
function resolveTheme(theme = "auto") {
  if (theme === "light" || theme === "dark") return theme;
  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    try {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    } catch (_) {
    }
  }
  return "light";
}
function getThemeSurface(theme, mapping) {
  const vars = theme === "dark" ? DARK_CSS_VAR_MAPPING : mapping ?? DEFAULT_CSS_VAR_MAPPING;
  return {
    background: vars["--color-background-primary"] ?? (theme === "dark" ? "#1e293b" : "#fff"),
    text: vars["--color-text-primary"] ?? (theme === "dark" ? "#f1f5f9" : "#0f172a")
  };
}
function generateIframeStyles(mapping, theme = "auto") {
  const vars = buildRootVars(
    theme === "dark" ? DARK_CSS_VAR_MAPPING : mapping ?? DEFAULT_CSS_VAR_MAPPING,
    theme === "dark"
  );
  const darkVars = buildRootVars(DARK_CSS_VAR_MAPPING, true);
  const body = `body { margin:0; padding:1rem; font:16px/1.6 var(--font-sans); color:var(--color-text-primary); background:var(--color-background-primary); }`;
  const darkOverride = theme === "auto" ? `@media (prefers-color-scheme: dark) {
${darkVars}
body { color:var(--color-text-primary); background:var(--color-background-primary); }
}` : "";
  const darkRamps = theme === "light" ? "" : theme === "dark" ? COLOR_RAMPS_DARK : `@media (prefers-color-scheme: dark) {
${COLOR_RAMPS_DARK}
}`;
  return `${vars}
${body}
${darkOverride}
${FORM_ELEMENT_STYLES}
${SVG_TEXT_CLASSES}
${SVG_STRUCTURAL_CLASSES}
${COLOR_RAMPS}
${darkRamps}`;
}
function generateStreamingStyles(scopeClass = ".widget-streaming") {
  const scope = (css) => css.replace(/^(\.[a-z])/gm, `${scopeClass} $1`);
  const lightVars = Object.entries(DEFAULT_CSS_VAR_MAPPING).map(([k, v]) => `  ${k}: ${v};`).join("\n");
  const darkVars = Object.entries(DARK_CSS_VAR_MAPPING).map(([k, v]) => `  ${k}: ${v};`).join("\n");
  return `${scopeClass} {
  min-height: 120px;
  transition: min-height 0.3s ease;
  ${lightVars}
  ${buildShortAliases(false)}
  color: var(--color-text-primary);
  background: var(--color-background-primary);
}
@media (prefers-color-scheme: dark) {
  ${scopeClass} {
  ${darkVars}
  ${buildShortAliases(true)}
  color: var(--color-text-primary);
  background: var(--color-background-primary);
  }
}
${scopeClass} svg { max-width: 100%; height: auto; }
${scope(SVG_TEXT_CLASSES)}
${scope(SVG_STRUCTURAL_CLASSES)}
${scope(COLOR_RAMPS)}
@media (prefers-color-scheme: dark) {
${scope(COLOR_RAMPS_DARK)}
}`;
}
function buildCSP(cdnWhitelist) {
  const origins = (cdnWhitelist ?? CDN_WHITELIST).join(" ");
  return `default-src 'none'; script-src 'unsafe-inline' ${origins}; style-src 'unsafe-inline'; img-src data:; connect-src 'none';`;
}

// src/iframe-renderer.ts
var IFRAME_SCRIPT = `
window.__widgetSendMessage=function(t){window.parent.postMessage({type:"widgetSendMessage",text:t},"*");};
function px(n){n=parseFloat(n);return Number.isFinite(n)?n:0;}
function measureElementBlockHeight(el){if(!el)return 0;var cs=getComputedStyle(el);var r=el.getBoundingClientRect();return r.height+px(cs.marginTop)+px(cs.marginBottom);}
function measureSceneHeight(){var c=document.getElementById("c");if(!c)return 0;var total=0;var bodyStyle=getComputedStyle(document.body);total+=px(bodyStyle.paddingTop)+px(bodyStyle.paddingBottom);var wrap=c.closest(".scene-wrap");total+=measureElementBlockHeight(wrap||c);var controls=document.getElementById("controls");if(controls)total+=measureElementBlockHeight(controls);return Math.ceil(total);}
function reportHeight(){var sceneH=measureSceneHeight();var h=sceneH||Math.max(document.body.scrollHeight,document.documentElement.scrollHeight);window.parent.postMessage({type:"widgetResize",height:h},"*");}
function tryBoot3DScene(){var c=document.getElementById("c");if(!c)return true;if(typeof renderer!=="undefined"&&renderer)return true;if(typeof init!=="function")return false;if(!window.THREE)return false;try{init();setTimeout(reportHeight,60);return typeof renderer!=="undefined"&&!!renderer;}catch(err){console.error("[widget boot]",err);return false;}}
function schedule3DBoot(){if(!document.getElementById("c"))return;if(tryBoot3DScene())return;var tries=0;var timer=setInterval(function(){tries+=1;if(tryBoot3DScene()||tries>=40)clearInterval(timer);},150);}
function __guOnLoad(){reportHeight();setTimeout(reportHeight,300);setTimeout(reportHeight,1000);fixContrast();window.parent.postMessage({type:"widgetReady"},"*");}
function injectCodeBlock(code){var s=document.createElement("script");s.textContent=String(code||"");document.body.appendChild(s);s.remove();}
var __guFixTimer=setInterval(function(){if(typeof renderer==="undefined"||typeof camera==="undefined")return;var c=document.getElementById("c");if(!c)return;var w=c.clientWidth;if(w<10)return;var h=parseInt(c.style.height)||c.clientHeight||420;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();clearInterval(__guFixTimer);},100);
if(document.readyState==="complete"){schedule3DBoot();__guOnLoad();}else{window.addEventListener("load",function(){schedule3DBoot();__guOnLoad();});}
window.addEventListener("message",function(e){if(e.data&&e.data.type==="injectCode"&&typeof e.data.code==="string"){try{injectCodeBlock(e.data.code);}catch(err){console.error("[inject]",err);}reportHeight();}});
new MutationObserver(function(){reportHeight();fixContrast();}).observe(document.body,{childList:true,subtree:true,attributes:true});
function fixContrast(){document.querySelectorAll("svg rect, svg circle, svg ellipse, svg polygon").forEach(function(shape){var fill=shape.getAttribute("fill")||"";if(!fill||fill==="none"||fill==="transparent"||fill.startsWith("var("))return;var lum=parseLum(fill);if(lum===null||lum>100)return;var g=shape.closest("g")||shape.parentNode;g.querySelectorAll("text").forEach(function(t){var tf=t.getAttribute("fill")||"";var tl=parseLum(tf);if(tl!==null&&tl>180)return;t.setAttribute("fill","#fff");});});}
function parseLum(c){if(!c)return null;c=c.trim();var m=c.match(/^#([0-9a-f]{3,8})$/i);if(!m)return null;var h=m[1];if(h.length===3)h=h[0]+h[0]+h[1]+h[1]+h[2]+h[2];if(h.length<6)return null;var r=parseInt(h.slice(0,2),16),g=parseInt(h.slice(2,4),16),b=parseInt(h.slice(4,6),16);return 0.299*r+0.587*g+0.114*b;}
`.trim();
function buildWidgetDoc(widgetCode, options) {
  const requestedTheme = options?.theme ?? "auto";
  const initialTheme = resolveTheme(requestedTheme);
  const styles = generateIframeStyles(options?.cssVarMapping, requestedTheme);
  const csp = buildCSP(options?.cdnWhitelist);
  const maxH = options?.maxHeight ?? 800;
  const surface = getThemeSurface(initialTheme, options?.cssVarMapping);
  const colorScheme = requestedTheme === "auto" ? "light dark" : requestedTheme;
  return '<!DOCTYPE html><html style="color-scheme:' + colorScheme + ";background:" + surface.background + ';"><head><meta charset="UTF-8"/><meta http-equiv="Content-Security-Policy" content="' + csp.replace(/"/g, "&quot;") + '"/><style>' + styles + '</style></head><body style="background:' + surface.background + ";color:" + surface.text + ';">' + widgetCode + "<script>" + IFRAME_SCRIPT + "\nvar __maxH=" + maxH + ";</script></body></html>";
}
function createWidgetIframe(container, widgetCode, options) {
  const requestedTheme = options?.theme ?? "auto";
  const initialTheme = resolveTheme(requestedTheme);
  const surface = getThemeSurface(initialTheme, options?.cssVarMapping);
  const iframe = document.createElement("iframe");
  iframe.setAttribute("sandbox", "allow-scripts");
  iframe.title = options?.title ?? "widget";
  iframe.srcdoc = buildWidgetDoc(widgetCode, options);
  iframe.style.width = "100%";
  iframe.style.border = "none";
  iframe.style.backgroundColor = surface.background;
  iframe.style.colorScheme = requestedTheme === "auto" ? "light dark" : requestedTheme;
  container.appendChild(iframe);
  return iframe;
}

// src/streaming-preview.ts
function stripUnclosedScript(html) {
  const openRe = /<script[\s>]/gi;
  const closeRe = /<\/script>/gi;
  let lastOpenIdx = -1;
  let match;
  while ((match = openRe.exec(html)) !== null) {
    lastOpenIdx = match.index;
  }
  if (lastOpenIdx === -1) return html;
  closeRe.lastIndex = lastOpenIdx;
  if (closeRe.exec(html) !== null) return html;
  return html.slice(0, lastOpenIdx);
}
var StreamingPreview = class {
  constructor(container, scopeClass = "widget-streaming") {
    this.el = null;
    this.container = container;
    this.scopeClass = scopeClass;
  }
  /** Update the preview with new partial widget code. */
  update(partialCode) {
    if (!this.el) {
      this.el = document.createElement("div");
      this.el.className = `widget-wrap ${this.scopeClass}`;
      this.container.appendChild(this.el);
    }
    this.el.innerHTML = stripUnclosedScript(partialCode);
  }
  /** Get the preview element (or null if not created). */
  getElement() {
    return this.el;
  }
  /** Check if the preview is currently active. */
  isActive() {
    return this.el !== null;
  }
  /** Remove the preview element and clean up. */
  destroy() {
    if (this.el) {
      this.el.remove();
      this.el = null;
    }
  }
};

// src/sanitizer.ts
var ESCAPE_TAGS = /(<\/?)(iframe|object|embed|frame|frameset|applet)(\s|>|\/)/gi;
var STREAMING_STRIP_TAGS = /(<\/?)(form|meta|link|base|noscript)(\s|>|\/)/gi;
var SCRIPT_BLOCK_RE = /<script[\s>][\s\S]*?<\/script>/gi;
var SCRIPT_UNCLOSED_RE = /<script[\s>][\s\S]*$/i;
var EVENT_HANDLER_RE = /\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
var DANGEROUS_URL_RE = /\s+(href|src|action|formaction|data|background)\s*=\s*(?:"javascript:[^"]*"|'javascript:[^']*'|javascript:[^\s>]+|"data:[^"]*"|'data:[^']*'|data:[^\s>]+)/gi;
function sanitizeForStreaming(html) {
  let result = html;
  result = result.replace(SCRIPT_BLOCK_RE, "");
  result = result.replace(SCRIPT_UNCLOSED_RE, "");
  result = result.replace(ESCAPE_TAGS, "");
  result = result.replace(STREAMING_STRIP_TAGS, "");
  result = result.replace(EVENT_HANDLER_RE, "");
  result = result.replace(DANGEROUS_URL_RE, "");
  return result;
}
function sanitizeForIframe(html) {
  return html.replace(ESCAPE_TAGS, "");
}

// src/widget-renderer.ts
var WidgetRenderer = class {
  constructor(options) {
    this.preview = null;
    this.placeholderEl = null;
    this.activeTextEl = null;
    this.widgetCount = 0;
    this.messageHandler = null;
    this.styleInjected = false;
    this.parser = new StreamParser();
    this.container = options.container;
    this.theme = options.theme ?? "auto";
    this.cdnWhitelist = options.cdnWhitelist ?? CDN_WHITELIST;
    this.cssVarMapping = options.cssVarMapping;
    this.maxHeight = 800;
    this.onSendMessage = options.onSendMessage;
    this.onLink = options.onLink;
    this.onReady = options.onReady;
    this.onResize = options.onResize;
    this.activeTextEl = document.createElement("div");
    this.activeTextEl.className = "gu-text";
    this.container.appendChild(this.activeTextEl);
    this.injectStreamingStyles();
    this.setupMessageListener();
  }
  /** Feed accumulated stream text. Call on every SSE chunk with the full text so far. */
  feed(accumulatedText) {
    this.parser.feed(accumulatedText);
    const newWidgets = this.parser.getNewWidgets();
    for (let i = 0; i < newWidgets.length; i++) {
      const w = newWidgets[i];
      const globalIdx = this.widgetCount;
      const textBefore = this.parser.getTextBetween(globalIdx);
      if (this.activeTextEl) {
        this.activeTextEl.textContent = textBefore.trim() ? textBefore : "";
      }
      this.destroyPreview();
      this.destroyPlaceholder();
      this.createIframe(w);
      this.activeTextEl = document.createElement("div");
      this.activeTextEl.className = "gu-text";
      this.container.appendChild(this.activeTextEl);
      this.widgetCount++;
    }
    const tailText = this.parser.getTailText();
    if (this.parser.hasUnclosedFence()) {
      if (this.activeTextEl) {
        this.activeTextEl.textContent = tailText.trim() ? tailText : "";
      }
      const partialCode = this.parser.getPartialWidgetCode();
      if (partialCode && partialCode.length > 30) {
        this.destroyPlaceholder();
        if (!this.preview) {
          this.preview = new StreamingPreview(this.container);
        }
        const sanitized = sanitizeForStreaming(partialCode);
        this.preview.update(stripUnclosedScript(sanitized));
      } else if (!this.preview) {
        this.showPlaceholder();
      }
    } else {
      if (this.activeTextEl) {
        this.activeTextEl.textContent = tailText.trim() ? tailText : "";
      }
      this.destroyPreview();
      this.destroyPlaceholder();
    }
  }
  /** Call when the stream ends to finalize any remaining content. */
  flush() {
    this.destroyPreview();
    this.destroyPlaceholder();
  }
  /** Parse and render a complete (non-streaming) model output. */
  parseAndRender(fullOutput) {
    this.reset();
    this.parser.feed(fullOutput);
    const widgets = this.parser.getCompletedWidgets();
    let lastEnd = 0;
    for (const w of widgets) {
      const textBefore = fullOutput.slice(lastEnd, w.start);
      if (textBefore.trim()) {
        const textEl = document.createElement("div");
        textEl.className = "gu-text";
        textEl.textContent = textBefore;
        this.container.appendChild(textEl);
      }
      this.createIframe(w);
      lastEnd = w.end;
    }
    const tail = fullOutput.slice(lastEnd);
    if (tail.trim()) {
      const textEl = document.createElement("div");
      textEl.className = "gu-text";
      textEl.textContent = tail;
      this.container.appendChild(textEl);
    }
  }
  /** Reset all state, clear container. */
  reset() {
    this.parser.reset();
    this.destroyPreview();
    this.destroyPlaceholder();
    this.container.innerHTML = "";
    this.widgetCount = 0;
    this.activeTextEl = document.createElement("div");
    this.activeTextEl.className = "gu-text";
    this.container.appendChild(this.activeTextEl);
  }
  /** Clean up event listeners. Call when done with this renderer. */
  dispose() {
    if (this.messageHandler) {
      window.removeEventListener("message", this.messageHandler);
      this.messageHandler = null;
    }
    this.destroyPreview();
    this.destroyPlaceholder();
  }
  // --- Private helpers ---
  createIframe(w) {
    const wrap = document.createElement("div");
    wrap.className = "gu-widget-wrap";
    const sanitized = sanitizeForIframe(w.widget_code);
    const iframe = createWidgetIframe(wrap, sanitized, {
      title: w.title,
      cssVarMapping: this.cssVarMapping,
      cdnWhitelist: this.cdnWhitelist,
      maxHeight: this.maxHeight,
      theme: this.theme
    });
    iframe.style.minHeight = "300px";
    this.container.appendChild(wrap);
  }
  showPlaceholder() {
    if (this.placeholderEl) return;
    this.placeholderEl = document.createElement("div");
    this.placeholderEl.className = "gu-widget-wrap gu-widget-placeholder";
    this.placeholderEl.textContent = "\u6B63\u5728\u751F\u6210\u56FE\u8868\u2026";
    this.container.appendChild(this.placeholderEl);
  }
  destroyPlaceholder() {
    if (this.placeholderEl) {
      this.placeholderEl.remove();
      this.placeholderEl = null;
    }
  }
  destroyPreview() {
    if (this.preview) {
      this.preview.destroy();
      this.preview = null;
    }
  }
  injectStreamingStyles() {
    if (this.styleInjected) return;
    const existing = document.getElementById("gu-streaming-styles");
    if (existing) {
      this.styleInjected = true;
      return;
    }
    const style = document.createElement("style");
    style.id = "gu-streaming-styles";
    style.textContent = generateStreamingStyles();
    document.head.appendChild(style);
    this.styleInjected = true;
  }
  setupMessageListener() {
    this.messageHandler = (e) => {
      if (!e.data?.type) return;
      if (e.data.type === "widgetResize" && typeof e.data.height === "number") {
        const height = Math.min(e.data.height + 16, this.maxHeight);
        const iframes = this.container.querySelectorAll(".gu-widget-wrap iframe");
        for (const iframe of iframes) {
          if (iframe.contentWindow === e.source) {
            iframe.style.height = height + "px";
            this.onResize?.(height);
            break;
          }
        }
      }
      if (e.data.type === "widgetSendMessage" && typeof e.data.text === "string") {
        this.onSendMessage?.(e.data.text);
      }
      if (e.data.type === "widgetReady") {
        this.onReady?.();
      }
    };
    window.addEventListener("message", this.messageHandler);
  }
};
export {
  CDN_WHITELIST,
  DEFAULT_CSS_VAR_MAPPING,
  StreamParser,
  StreamingPreview,
  WidgetRenderer,
  buildWidgetDoc,
  createWidgetIframe,
  extractPartialWidgetCode,
  findAllShowWidgetFences,
  generateIframeStyles,
  generateStreamingStyles,
  isShowWidgetFence,
  parseShowWidgetFence,
  patchIncompleteWidgetFence,
  sanitizeForIframe,
  sanitizeForStreaming,
  stripUnclosedScript
};
//# sourceMappingURL=index.js.map