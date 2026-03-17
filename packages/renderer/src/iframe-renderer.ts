import type { IframeDocOptions } from './types.js';
import { generateIframeStyles, buildCSP, CDN_WHITELIST } from './css-bridge.js';

/**
 * Script injected into every widget iframe.
 * Provides: __widgetSendMessage, reportHeight, fixContrast, MutationObserver.
 */
const IFRAME_SCRIPT = `
window.__widgetSendMessage=function(t){window.parent.postMessage({type:"widgetSendMessage",text:t},"*");};
function reportHeight(){var h=Math.max(document.body.scrollHeight,document.documentElement.scrollHeight);window.parent.postMessage({type:"widgetResize",height:h},"*");}
window.addEventListener("load",function(){reportHeight();setTimeout(reportHeight,300);setTimeout(reportHeight,1000);fixContrast();window.parent.postMessage({type:"widgetReady"},"*");});
new MutationObserver(function(){reportHeight();fixContrast();}).observe(document.body,{childList:true,subtree:true,attributes:true});
function fixContrast(){document.querySelectorAll("svg rect, svg circle, svg ellipse, svg polygon").forEach(function(shape){var fill=shape.getAttribute("fill")||"";if(!fill||fill==="none"||fill==="transparent"||fill.startsWith("var("))return;var lum=parseLum(fill);if(lum===null||lum>100)return;var g=shape.closest("g")||shape.parentNode;g.querySelectorAll("text").forEach(function(t){var tf=t.getAttribute("fill")||"";var tl=parseLum(tf);if(tl!==null&&tl>180)return;t.setAttribute("fill","#fff");});});}
function parseLum(c){if(!c)return null;c=c.trim();var m=c.match(/^#([0-9a-f]{3,8})$/i);if(!m)return null;var h=m[1];if(h.length===3)h=h[0]+h[0]+h[1]+h[1]+h[2]+h[2];if(h.length<6)return null;var r=parseInt(h.slice(0,2),16),g=parseInt(h.slice(2,4),16),b=parseInt(h.slice(4,6),16);return 0.299*r+0.587*g+0.114*b;}
`.trim();

/**
 * Build a complete HTML document string for a widget iframe.
 * Includes CSP, CSS variables, SVG classes, widget code, and communication scripts.
 */
export function buildWidgetDoc(widgetCode: string, options?: IframeDocOptions): string {
  const styles = generateIframeStyles(options?.cssVarMapping);
  const csp = buildCSP(options?.cdnWhitelist);
  const maxH = options?.maxHeight ?? 800;

  return (
    '<!DOCTYPE html><html><head><meta charset="UTF-8"/>' +
    '<meta http-equiv="Content-Security-Policy" content="' +
    csp.replace(/"/g, '&quot;') +
    '"/>' +
    '<style>' + styles + '</style></head><body>' +
    widgetCode +
    '<script>' + IFRAME_SCRIPT +
    '\nvar __maxH=' + maxH + ';' +
    '</script></body></html>'
  );
}

/**
 * Create a sandboxed iframe element, set its srcdoc, and append to container.
 * Returns the iframe element.
 */
export function createWidgetIframe(
  container: HTMLElement,
  widgetCode: string,
  options?: IframeDocOptions & { title?: string },
): HTMLIFrameElement {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('sandbox', 'allow-scripts');
  iframe.title = options?.title ?? 'widget';
  iframe.srcdoc = buildWidgetDoc(widgetCode, options);
  iframe.style.width = '100%';
  iframe.style.border = 'none';
  container.appendChild(iframe);
  return iframe;
}
