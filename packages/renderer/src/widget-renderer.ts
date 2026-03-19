import type { RendererOptions, CssVarMapping, WidgetFence } from './types.js';
import { StreamParser } from './stream-parser.js';
import { createWidgetIframe } from './iframe-renderer.js';
import { StreamingPreview, stripUnclosedScript } from './streaming-preview.js';
import { sanitizeForStreaming, sanitizeForIframe } from './sanitizer.js';
import { generateStreamingStyles, CDN_WHITELIST } from './css-bridge.js';

/**
 * WidgetRenderer — orchestrates the three-phase rendering pipeline.
 *
 * Phase 1: Plain text (no fence detected)
 * Phase 2: Streaming preview (fence open, widget_code flowing in)
 * Phase 3: Sandbox iframe (fence closed, final render)
 *
 * Usage:
 *   const renderer = new WidgetRenderer({ container, onSendMessage });
 *   // For each SSE chunk, feed the full accumulated text:
 *   renderer.feed(accumulatedText);
 *   // When stream ends:
 *   renderer.flush();
 */
export class WidgetRenderer {
  private parser: StreamParser;
  private container: HTMLElement;
  private theme: 'auto' | 'light' | 'dark';
  private cdnWhitelist: string[];
  private cssVarMapping?: CssVarMapping;
  private maxHeight: number;

  private onSendMessage?: (text: string) => void;
  private onLink?: (href: string) => void;
  private onReady?: () => void;
  private onResize?: (height: number) => void;

  private preview: StreamingPreview | null = null;
  private placeholderEl: HTMLElement | null = null;
  private activeTextEl: HTMLElement | null = null;
  private widgetCount = 0;
  private messageHandler: ((e: MessageEvent) => void) | null = null;
  private styleInjected = false;

  constructor(options: RendererOptions) {
    this.parser = new StreamParser();
    this.container = options.container;
    this.theme = options.theme ?? 'auto';
    this.cdnWhitelist = options.cdnWhitelist ?? CDN_WHITELIST;
    this.cssVarMapping = options.cssVarMapping;
    this.maxHeight = 800;
    this.onSendMessage = options.onSendMessage;
    this.onLink = options.onLink;
    this.onReady = options.onReady;
    this.onResize = options.onResize;

    this.activeTextEl = document.createElement('div');
    this.activeTextEl.className = 'gu-text';
    this.container.appendChild(this.activeTextEl);

    this.injectStreamingStyles();
    this.setupMessageListener();
  }

  /** Feed accumulated stream text. Call on every SSE chunk with the full text so far. */
  feed(accumulatedText: string): void {
    this.parser.feed(accumulatedText);

    // Phase 3: render any newly completed widgets
    const newWidgets = this.parser.getNewWidgets();
    for (let i = 0; i < newWidgets.length; i++) {
      const w = newWidgets[i];
      const globalIdx = this.widgetCount;

      // Render text before this widget
      const textBefore = this.parser.getTextBetween(globalIdx);
      if (this.activeTextEl) {
        this.activeTextEl.textContent = textBefore.trim() ? textBefore : '';
      }

      // Destroy streaming preview / placeholder
      this.destroyPreview();
      this.destroyPlaceholder();

      // Create iframe
      this.createIframe(w);

      // New text element for content after this widget
      this.activeTextEl = document.createElement('div');
      this.activeTextEl.className = 'gu-text';
      this.container.appendChild(this.activeTextEl);

      this.widgetCount++;
    }

    // Handle tail content (after all completed widgets)
    const tailText = this.parser.getTailText();

    if (this.parser.hasUnclosedFence()) {
      // Phase 2: streaming preview
      if (this.activeTextEl) {
        this.activeTextEl.textContent = tailText.trim() ? tailText : '';
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
        // Show placeholder while waiting for widget_code
        this.showPlaceholder();
      }
    } else {
      // Phase 1: plain text only
      if (this.activeTextEl) {
        this.activeTextEl.textContent = tailText.trim() ? tailText : '';
      }
      this.destroyPreview();
      this.destroyPlaceholder();
    }
  }

  /** Call when the stream ends to finalize any remaining content. */
  flush(): void {
    this.destroyPreview();
    this.destroyPlaceholder();
  }

  /** Parse and render a complete (non-streaming) model output. */
  parseAndRender(fullOutput: string): void {
    this.reset();
    this.parser.feed(fullOutput);
    const widgets = this.parser.getCompletedWidgets();

    let lastEnd = 0;
    for (const w of widgets) {
      const textBefore = fullOutput.slice(lastEnd, w.start);
      if (textBefore.trim()) {
        const textEl = document.createElement('div');
        textEl.className = 'gu-text';
        textEl.textContent = textBefore;
        this.container.appendChild(textEl);
      }
      this.createIframe(w);
      lastEnd = w.end;
    }

    const tail = fullOutput.slice(lastEnd);
    if (tail.trim()) {
      const textEl = document.createElement('div');
      textEl.className = 'gu-text';
      textEl.textContent = tail;
      this.container.appendChild(textEl);
    }
  }

  /** Reset all state, clear container. */
  reset(): void {
    this.parser.reset();
    this.destroyPreview();
    this.destroyPlaceholder();
    this.container.innerHTML = '';
    this.widgetCount = 0;
    this.activeTextEl = document.createElement('div');
    this.activeTextEl.className = 'gu-text';
    this.container.appendChild(this.activeTextEl);
  }

  /** Clean up event listeners. Call when done with this renderer. */
  dispose(): void {
    if (this.messageHandler) {
      window.removeEventListener('message', this.messageHandler);
      this.messageHandler = null;
    }
    this.destroyPreview();
    this.destroyPlaceholder();
  }

  // --- Private helpers ---

  private createIframe(w: WidgetFence): void {
    const wrap = document.createElement('div');
    wrap.className = 'gu-widget-wrap';
    const sanitized = sanitizeForIframe(w.widget_code);
    const iframe = createWidgetIframe(wrap, sanitized, {
      title: w.title,
      cssVarMapping: this.cssVarMapping,
      cdnWhitelist: this.cdnWhitelist,
      maxHeight: this.maxHeight,
      theme: this.theme,
    });
    iframe.style.minHeight = '300px';
    this.container.appendChild(wrap);
  }

  private showPlaceholder(): void {
    if (this.placeholderEl) return;
    this.placeholderEl = document.createElement('div');
    this.placeholderEl.className = 'gu-widget-wrap gu-widget-placeholder';
    this.placeholderEl.textContent = '正在生成图表…';
    this.container.appendChild(this.placeholderEl);
  }

  private destroyPlaceholder(): void {
    if (this.placeholderEl) {
      this.placeholderEl.remove();
      this.placeholderEl = null;
    }
  }

  private destroyPreview(): void {
    if (this.preview) {
      this.preview.destroy();
      this.preview = null;
    }
  }

  private injectStreamingStyles(): void {
    if (this.styleInjected) return;
    const existing = document.getElementById('gu-streaming-styles');
    if (existing) { this.styleInjected = true; return; }
    const style = document.createElement('style');
    style.id = 'gu-streaming-styles';
    style.textContent = generateStreamingStyles();
    document.head.appendChild(style);
    this.styleInjected = true;
  }

  private setupMessageListener(): void {
    this.messageHandler = (e: MessageEvent) => {
      if (!e.data?.type) return;

      if (e.data.type === 'widgetResize' && typeof e.data.height === 'number') {
        const height = Math.min(e.data.height + 16, this.maxHeight);
        const iframes = this.container.querySelectorAll<HTMLIFrameElement>('.gu-widget-wrap iframe');
        for (const iframe of iframes) {
          if (iframe.contentWindow === e.source) {
            iframe.style.height = height + 'px';
            this.onResize?.(height);
            break;
          }
        }
      }

      if (e.data.type === 'widgetSendMessage' && typeof e.data.text === 'string') {
        this.onSendMessage?.(e.data.text);
      }

      if (e.data.type === 'widgetReady') {
        this.onReady?.();
      }
    };
    window.addEventListener('message', this.messageHandler);
  }
}
