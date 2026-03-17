// --- Fence parsing types ---

/** A successfully parsed show-widget fence with position info */
export interface WidgetFence {
  title: string;
  widget_code: string;
  start: number;
  end: number;
}

/** A located fence (may or may not have valid JSON) */
export interface ParsedFence {
  start: number;
  end: number;
  parsed: { title: string; widget_code: string } | null;
}

/** Stream parser state machine states */
export type StreamParserState = 'TEXT' | 'FENCE_OPEN' | 'WIDGET_CODE' | 'FENCE_CLOSE';

// --- Renderer types ---

/** CSS variable mapping: model standard name → host actual value */
export type CssVarMapping = Record<string, string>;

/** Options for creating a WidgetRenderer */
export interface RendererOptions {
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
export interface IframeDocOptions {
  cssVarMapping?: CssVarMapping;
  cdnWhitelist?: string[];
  maxHeight?: number;
}

// --- PostMessage protocol ---

export interface WidgetResizeMessage {
  type: 'widgetResize';
  height: number;
}

export interface WidgetSendMessage {
  type: 'widgetSendMessage';
  text: string;
}

export interface WidgetReadyMessage {
  type: 'widgetReady';
}

export interface WidgetThemeMessage {
  type: 'widgetTheme';
  isDark: boolean;
  vars?: CssVarMapping;
}

export type WidgetMessage =
  | WidgetResizeMessage
  | WidgetSendMessage
  | WidgetReadyMessage
  | WidgetThemeMessage;
