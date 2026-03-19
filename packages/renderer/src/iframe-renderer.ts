import type { IframeDocOptions } from './types.js';
import {
  generateIframeStyles,
  buildCSP,
  CDN_WHITELIST,
  getThemeSurface,
  resolveTheme,
} from './css-bridge.js';

/**
 * Script injected into every widget iframe.
 * Provides: __widgetSendMessage, reportHeight, fixContrast, MutationObserver.
 */
const IFRAME_SCRIPT = `
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

/**
 * Build a complete HTML document string for a widget iframe.
 * Includes CSP, CSS variables, SVG classes, widget code, and communication scripts.
 */
export function buildWidgetDoc(widgetCode: string, options?: IframeDocOptions): string {
  const requestedTheme = options?.theme ?? 'auto';
  const initialTheme = resolveTheme(requestedTheme);
  const styles = generateIframeStyles(options?.cssVarMapping, requestedTheme);
  const csp = buildCSP(options?.cdnWhitelist);
  const maxH = options?.maxHeight ?? 800;
  const surface = getThemeSurface(initialTheme, options?.cssVarMapping);
  const colorScheme = requestedTheme === 'auto' ? 'light dark' : requestedTheme;

  return (
    '<!DOCTYPE html><html style="color-scheme:' + colorScheme + ';background:' + surface.background + ';"><head><meta charset="UTF-8"/>' +
    '<meta http-equiv="Content-Security-Policy" content="' +
    csp.replace(/"/g, '&quot;') +
    '"/>' +
    '<style>' + styles + '</style></head><body style="background:' + surface.background + ';color:' + surface.text + ';">' +
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
  const requestedTheme = options?.theme ?? 'auto';
  const initialTheme = resolveTheme(requestedTheme);
  const surface = getThemeSurface(initialTheme, options?.cssVarMapping);
  const iframe = document.createElement('iframe');
  iframe.setAttribute('sandbox', 'allow-scripts');
  iframe.title = options?.title ?? 'widget';
  iframe.srcdoc = buildWidgetDoc(widgetCode, options);
  iframe.style.width = '100%';
  iframe.style.border = 'none';
  iframe.style.backgroundColor = surface.background;
  iframe.style.colorScheme = requestedTheme === 'auto' ? 'light dark' : requestedTheme;
  container.appendChild(iframe);
  return iframe;
}
