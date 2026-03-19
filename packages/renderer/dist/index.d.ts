/** A successfully parsed show-widget fence with position info */
interface WidgetFence {
    title: string;
    widget_code: string;
    start: number;
    end: number;
}
/** A located fence (may or may not have valid JSON) */
interface ParsedFence {
    start: number;
    end: number;
    parsed: {
        title: string;
        widget_code: string;
    } | null;
}
/** Stream parser state machine states */
type StreamParserState = 'TEXT' | 'FENCE_OPEN' | 'WIDGET_CODE' | 'FENCE_CLOSE';
/** CSS variable mapping: model standard name → host actual value */
type CssVarMapping = Record<string, string>;
/** Options for creating a WidgetRenderer */
interface RendererOptions {
    container: HTMLElement;
    theme?: 'auto' | 'light' | 'dark';
    cdnWhitelist?: string[];
    cssVarMapping?: CssVarMapping;
    onSendMessage?: (text: string) => void;
    onLink?: (href: string) => void;
    onReady?: () => void;
    onResize?: (height: number) => void;
}
/** Options for building an iframe document */
interface IframeDocOptions {
    cssVarMapping?: CssVarMapping;
    cdnWhitelist?: string[];
    maxHeight?: number;
}
interface WidgetResizeMessage {
    type: 'widgetResize';
    height: number;
}
interface WidgetSendMessage {
    type: 'widgetSendMessage';
    text: string;
}
interface WidgetReadyMessage {
    type: 'widgetReady';
}
interface WidgetThemeMessage {
    type: 'widgetTheme';
    isDark: boolean;
    vars?: CssVarMapping;
}
type WidgetMessage = WidgetResizeMessage | WidgetSendMessage | WidgetReadyMessage | WidgetThemeMessage;

/**
 * Case-insensitive check for show-widget fence type.
 */
declare function isShowWidgetFence(firstLine: string): boolean;
/**
 * Parse all completed show-widget fences from accumulated stream text.
 * Returns an array of successfully parsed fences with position info.
 */
declare function parseShowWidgetFence(streamText: string): WidgetFence[];
/**
 * Find all show-widget fences (including ones with invalid JSON).
 * Used for static rendering of saved messages.
 */
declare function findAllShowWidgetFences(text: string): ParsedFence[];
/**
 * Extract partial widget_code from an incomplete JSON body during streaming.
 * Handles JSON escape sequences: \", \\, \n, \t, \/, \r, \uXXXX.
 */
declare function extractPartialWidgetCode(partialBody: string): string | null;
/**
 * Patch an incomplete (truncated) show-widget fence into a valid one.
 * Used to salvage content when the stream is cut off mid-fence.
 */
declare function patchIncompleteWidgetFence(text: string): string;
/**
 * Stateful stream parser that processes incremental text chunks.
 * Tracks completed widgets and exposes partial widget_code for streaming preview.
 */
declare class StreamParser {
    private text;
    private completedCount;
    /** Feed accumulated stream text (not a delta — the full text so far). */
    feed(accumulatedText: string): void;
    /** Get all newly completed widget fences since last call. */
    getNewWidgets(): WidgetFence[];
    /** Get all completed widget fences so far. */
    getCompletedWidgets(): WidgetFence[];
    /** Number of completed widgets. */
    get completedWidgetCount(): number;
    /**
     * Get partial widget_code from the current unclosed fence (if any).
     * Returns null if there's no unclosed show-widget fence.
     */
    getPartialWidgetCode(): string | null;
    /**
     * Get the text content before any unclosed fence (the visible tail text).
     * Returns the full tail if no unclosed fence exists.
     */
    getTailText(): string;
    /** Check if there's currently an unclosed show-widget fence. */
    hasUnclosedFence(): boolean;
    /** Get the text between two completed widgets (or from start). */
    getTextBetween(index: number): string;
    /** Get the full accumulated text. */
    getText(): string;
    /** Reset all state. */
    reset(): void;
}

/** Default CDN whitelist (CSP-enforced) */
declare const CDN_WHITELIST: string[];
/** Default CSS variable mapping: model standard names → values (light mode) */
declare const DEFAULT_CSS_VAR_MAPPING: CssVarMapping;
/**
 * Generate the full CSS string to inject inside an iframe.
 * Includes :root variables, body reset, SVG classes, and color ramps.
 */
declare function generateIframeStyles(mapping?: CssVarMapping): string;
/**
 * Generate scoped CSS for streaming preview in the host page.
 * All selectors are prefixed with the scope class (default: `.widget-streaming`).
 */
declare function generateStreamingStyles(scopeClass?: string): string;

/**
 * Build a complete HTML document string for a widget iframe.
 * Includes CSP, CSS variables, SVG classes, widget code, and communication scripts.
 */
declare function buildWidgetDoc(widgetCode: string, options?: IframeDocOptions): string;
/**
 * Create a sandboxed iframe element, set its srcdoc, and append to container.
 * Returns the iframe element.
 */
declare function createWidgetIframe(container: HTMLElement, widgetCode: string, options?: IframeDocOptions & {
    title?: string;
}): HTMLIFrameElement;

/**
 * Strip unclosed <script> tags from partial HTML to prevent
 * script source code from leaking as visible text during streaming preview.
 */
declare function stripUnclosedScript(html: string): string;
/**
 * Manages a streaming preview DOM element.
 * Renders partial widget_code into a scoped div during streaming,
 * with script content stripped for safety.
 */
declare class StreamingPreview {
    private el;
    private container;
    private scopeClass;
    constructor(container: HTMLElement, scopeClass?: string);
    /** Update the preview with new partial widget code. */
    update(partialCode: string): void;
    /** Get the preview element (or null if not created). */
    getElement(): HTMLDivElement | null;
    /** Check if the preview is currently active. */
    isActive(): boolean;
    /** Remove the preview element and clean up. */
    destroy(): void;
}

/**
 * Two-phase HTML sanitizer for widget content.
 *
 * Phase 1 (streaming): aggressive — strip all scripts, event handlers, dangerous tags.
 * Phase 2 (iframe): permissive — only strip escape vectors, keep scripts for sandbox execution.
 */
/**
 * Sanitize HTML for streaming preview (Phase 1 — aggressive).
 * Strips: iframe/object/embed, script, form, meta/link/base, all on* handlers, javascript:/data: URLs.
 */
declare function sanitizeForStreaming(html: string): string;
/**
 * Sanitize HTML for iframe rendering (Phase 2 — permissive).
 * Only strips escape vectors (nested iframe/object/embed).
 * Keeps script tags and event handlers — they execute safely inside the sandbox.
 */
declare function sanitizeForIframe(html: string): string;

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
declare class WidgetRenderer {
    private parser;
    private container;
    private theme;
    private cdnWhitelist;
    private cssVarMapping?;
    private maxHeight;
    private onSendMessage?;
    private onLink?;
    private onReady?;
    private onResize?;
    private preview;
    private placeholderEl;
    private activeTextEl;
    private widgetCount;
    private messageHandler;
    private styleInjected;
    constructor(options: RendererOptions);
    /** Feed accumulated stream text. Call on every SSE chunk with the full text so far. */
    feed(accumulatedText: string): void;
    /** Call when the stream ends to finalize any remaining content. */
    flush(): void;
    /** Parse and render a complete (non-streaming) model output. */
    parseAndRender(fullOutput: string): void;
    /** Reset all state, clear container. */
    reset(): void;
    /** Clean up event listeners. Call when done with this renderer. */
    dispose(): void;
    private createIframe;
    private showPlaceholder;
    private destroyPlaceholder;
    private destroyPreview;
    private injectStreamingStyles;
    private setupMessageListener;
}

export { CDN_WHITELIST, type CssVarMapping, DEFAULT_CSS_VAR_MAPPING, type IframeDocOptions, type ParsedFence, type RendererOptions, StreamParser, type StreamParserState, StreamingPreview, type WidgetFence, type WidgetMessage, type WidgetReadyMessage, WidgetRenderer, type WidgetResizeMessage, type WidgetSendMessage, type WidgetThemeMessage, buildWidgetDoc, createWidgetIframe, extractPartialWidgetCode, findAllShowWidgetFences, generateIframeStyles, generateStreamingStyles, isShowWidgetFence, parseShowWidgetFence, patchIncompleteWidgetFence, sanitizeForIframe, sanitizeForStreaming, stripUnclosedScript };
