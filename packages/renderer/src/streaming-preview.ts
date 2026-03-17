/**
 * Strip unclosed <script> tags from partial HTML to prevent
 * script source code from leaking as visible text during streaming preview.
 */
export function stripUnclosedScript(html: string): string {
  const openRe = /<script[\s>]/gi;
  const closeRe = /<\/script>/gi;

  let lastOpenIdx = -1;
  let match: RegExpExecArray | null;

  // Find the last <script> open tag
  while ((match = openRe.exec(html)) !== null) {
    lastOpenIdx = match.index;
  }
  if (lastOpenIdx === -1) return html;

  // Check if there's a matching </script> after it
  closeRe.lastIndex = lastOpenIdx;
  if (closeRe.exec(html) !== null) return html;

  // No closing tag — truncate from the last <script
  return html.slice(0, lastOpenIdx);
}

/**
 * Manages a streaming preview DOM element.
 * Renders partial widget_code into a scoped div during streaming,
 * with script content stripped for safety.
 */
export class StreamingPreview {
  private el: HTMLDivElement | null = null;
  private container: HTMLElement;
  private scopeClass: string;

  constructor(container: HTMLElement, scopeClass = 'widget-streaming') {
    this.container = container;
    this.scopeClass = scopeClass;
  }

  /** Update the preview with new partial widget code. */
  update(partialCode: string): void {
    if (!this.el) {
      this.el = document.createElement('div');
      this.el.className = `widget-wrap ${this.scopeClass}`;
      this.container.appendChild(this.el);
    }
    this.el.innerHTML = stripUnclosedScript(partialCode);
  }

  /** Get the preview element (or null if not created). */
  getElement(): HTMLDivElement | null {
    return this.el;
  }

  /** Check if the preview is currently active. */
  isActive(): boolean {
    return this.el !== null;
  }

  /** Remove the preview element and clean up. */
  destroy(): void {
    if (this.el) {
      this.el.remove();
      this.el = null;
    }
  }
}
