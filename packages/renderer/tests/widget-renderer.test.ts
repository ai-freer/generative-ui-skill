import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WidgetRenderer } from '../src/widget-renderer.js';

// @vitest-environment jsdom

describe('WidgetRenderer', () => {
  let container: HTMLDivElement;
  let renderer: WidgetRenderer;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    renderer?.dispose();
    container.remove();
  });

  it('creates initial text element on construction', () => {
    renderer = new WidgetRenderer({ container });
    expect(container.querySelector('.gu-text')).not.toBeNull();
  });

  it('renders plain text when no fence is present', () => {
    renderer = new WidgetRenderer({ container });
    renderer.feed('hello world');
    const textEl = container.querySelector('.gu-text');
    expect(textEl?.textContent).toBe('hello world');
  });

  it('shows placeholder when fence opens but no widget_code yet', () => {
    renderer = new WidgetRenderer({ container });
    renderer.feed('text\n```show-widget\n{"title":"x"');
    expect(container.querySelector('.gu-widget-placeholder')).not.toBeNull();
  });

  it('shows streaming preview when partial widget_code is available', () => {
    renderer = new WidgetRenderer({ container });
    renderer.feed('```show-widget\n{"title":"x","widget_code":"<svg><rect x=\\"10\\" y=\\"10\\" width=\\"100\\" height=\\"50\\"/>');
    // Should have streaming preview, not placeholder
    expect(container.querySelector('.widget-streaming')).not.toBeNull();
    expect(container.querySelector('.gu-widget-placeholder')).toBeNull();
  });

  it('creates iframe when fence closes', () => {
    renderer = new WidgetRenderer({ container });
    renderer.feed('```show-widget\n{"title":"test","widget_code":"<div>hello</div>"}\n```');
    const iframe = container.querySelector('iframe');
    expect(iframe).not.toBeNull();
    expect(iframe?.title).toBe('test');
    expect(iframe?.getAttribute('sandbox')).toBe('allow-scripts');
  });

  it('removes preview when fence closes', () => {
    renderer = new WidgetRenderer({ container });
    // First: streaming state
    renderer.feed('```show-widget\n{"title":"x","widget_code":"<svg><rect x=\\"10\\" y=\\"10\\" width=\\"100\\" height=\\"50\\"/>');
    expect(container.querySelector('.widget-streaming')).not.toBeNull();
    // Then: fence closes
    renderer.feed('```show-widget\n{"title":"x","widget_code":"<svg><rect/></svg>"}\n```');
    expect(container.querySelector('.widget-streaming')).toBeNull();
  });

  it('handles multiple widgets', () => {
    renderer = new WidgetRenderer({ container });
    renderer.feed(
      '```show-widget\n{"title":"a","widget_code":"<p>1</p>"}\n```' +
      ' mid ' +
      '```show-widget\n{"title":"b","widget_code":"<p>2</p>"}\n```'
    );
    const iframes = container.querySelectorAll('iframe');
    expect(iframes).toHaveLength(2);
    expect(iframes[0].title).toBe('a');
    expect(iframes[1].title).toBe('b');
  });

  it('renders text between widgets', () => {
    renderer = new WidgetRenderer({ container });
    renderer.feed(
      'before\n```show-widget\n{"title":"a","widget_code":"<p>1</p>"}\n``` after'
    );
    const textEls = container.querySelectorAll('.gu-text');
    // First text (before widget) + second text (after widget)
    expect(textEls.length).toBeGreaterThanOrEqual(2);
  });

  it('flush cleans up preview and placeholder', () => {
    renderer = new WidgetRenderer({ container });
    renderer.feed('```show-widget\n{"title":"x","widget_code":"<svg><rect x=\\"10\\" y=\\"10\\" width=\\"100\\" height=\\"50\\"/>');
    expect(container.querySelector('.widget-streaming')).not.toBeNull();
    renderer.flush();
    expect(container.querySelector('.widget-streaming')).toBeNull();
    expect(container.querySelector('.gu-widget-placeholder')).toBeNull();
  });

  it('reset clears everything', () => {
    renderer = new WidgetRenderer({ container });
    renderer.feed('```show-widget\n{"title":"a","widget_code":"<p>1</p>"}\n```');
    expect(container.querySelector('iframe')).not.toBeNull();
    renderer.reset();
    expect(container.querySelectorAll('iframe')).toHaveLength(0);
    expect(container.querySelector('.gu-text')).not.toBeNull(); // fresh text el
  });

  it('parseAndRender handles complete output', () => {
    renderer = new WidgetRenderer({ container });
    renderer.parseAndRender(
      'intro\n```show-widget\n{"title":"w","widget_code":"<b>ok</b>"}\n```\noutro'
    );
    expect(container.querySelector('iframe')).not.toBeNull();
    const textEls = container.querySelectorAll('.gu-text');
    expect(textEls.length).toBeGreaterThanOrEqual(2);
  });

  it('calls onSendMessage when widgetSendMessage event received', () => {
    let received = '';
    renderer = new WidgetRenderer({
      container,
      onSendMessage: (text) => { received = text; },
    });
    window.dispatchEvent(new MessageEvent('message', {
      data: { type: 'widgetSendMessage', text: 'hello' },
    }));
    expect(received).toBe('hello');
  });

  it('calls onReady when widgetReady event received', () => {
    let readyCalled = false;
    renderer = new WidgetRenderer({
      container,
      onReady: () => { readyCalled = true; },
    });
    window.dispatchEvent(new MessageEvent('message', {
      data: { type: 'widgetReady' },
    }));
    expect(readyCalled).toBe(true);
  });

  it('injects streaming styles into document head', () => {
    renderer = new WidgetRenderer({ container });
    expect(document.getElementById('gu-streaming-styles')).not.toBeNull();
  });

  it('sanitizes widget_code in iframe (strips nested iframes)', () => {
    renderer = new WidgetRenderer({ container });
    renderer.feed('```show-widget\n{"title":"x","widget_code":"<div><iframe src=\\"evil\\"></iframe>safe</div>"}\n```');
    const iframe = container.querySelector('iframe');
    expect(iframe?.srcdoc).not.toContain('<iframe');
    expect(iframe?.srcdoc).toContain('safe');
  });

  it('passes the renderer theme through to iframe rendering', () => {
    renderer = new WidgetRenderer({ container, theme: 'dark' });
    renderer.feed('```show-widget\n{"title":"x","widget_code":"<div>dark</div>"}\n```');
    const iframe = container.querySelector('iframe');
    expect(iframe?.srcdoc).toContain('color-scheme:dark');
    expect(iframe?.srcdoc).toContain('background:#1e293b');
  });
});
