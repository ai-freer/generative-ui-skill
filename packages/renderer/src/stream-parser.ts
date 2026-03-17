import type { WidgetFence, ParsedFence } from './types.js';

/**
 * Case-insensitive check for show-widget fence type.
 */
export function isShowWidgetFence(firstLine: string): boolean {
  const t = firstLine.trim().toLowerCase();
  return t.startsWith('show-widget') || t.startsWith('show_widget');
}

/**
 * Parse all completed show-widget fences from accumulated stream text.
 * Returns an array of successfully parsed fences with position info.
 */
export function parseShowWidgetFence(streamText: string): WidgetFence[] {
  const fences: WidgetFence[] = [];
  let i = 0;
  const len = streamText.length;
  while (i < len) {
    const open = streamText.indexOf('```', i);
    if (open === -1) break;
    const afterOpen = streamText.slice(open + 3);
    const lineEnd = afterOpen.indexOf('\n');
    const firstLine = lineEnd === -1 ? afterOpen : afterOpen.slice(0, lineEnd);
    if (!isShowWidgetFence(firstLine)) {
      i = open + 3;
      continue;
    }
    const bodyStart = open + 3 + (lineEnd === -1 ? firstLine.length : lineEnd + 1);

    let found = false;
    let searchFrom = bodyStart;
    while (searchFrom < len) {
      const close = streamText.indexOf('```', searchFrom);
      if (close === -1) break;
      const body = streamText.slice(bodyStart, close).trim();
      const fenceEnd = close + 3;
      try {
        const obj = JSON.parse(body);
        if (obj && typeof obj.widget_code === 'string') {
          fences.push({ title: obj.title || 'widget', widget_code: obj.widget_code, start: open, end: fenceEnd });
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

/**
 * Find all show-widget fences (including ones with invalid JSON).
 * Used for static rendering of saved messages.
 */
export function findAllShowWidgetFences(text: string): ParsedFence[] {
  const fences: ParsedFence[] = [];
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf('```', i);
    if (open === -1) break;
    const afterOpen = text.slice(open + 3);
    const lineEnd = afterOpen.indexOf('\n');
    const firstLine = lineEnd === -1 ? afterOpen : afterOpen.slice(0, lineEnd);
    if (!isShowWidgetFence(firstLine)) {
      i = open + 3;
      continue;
    }
    const bodyStart = open + 3 + (lineEnd === -1 ? firstLine.length : lineEnd + 1);

    let found = false;
    let searchFrom = bodyStart;
    while (searchFrom < text.length) {
      const close = text.indexOf('```', searchFrom);
      if (close === -1) break;
      const body = text.slice(bodyStart, close).trim();
      const fenceEnd = close + 3;
      let parsed: { title: string; widget_code: string } | null = null;
      try {
        const obj = JSON.parse(body);
        if (obj && typeof obj.widget_code === 'string') {
          parsed = { title: obj.title || 'widget', widget_code: obj.widget_code };
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

/**
 * Extract partial widget_code from an incomplete JSON body during streaming.
 * Handles JSON escape sequences: \", \\, \n, \t, \/, \r, \uXXXX.
 */
export function extractPartialWidgetCode(partialBody: string): string | null {
  const key = '"widget_code"';
  const keyIdx = partialBody.indexOf(key);
  if (keyIdx === -1) return null;
  let pos = keyIdx + key.length;
  while (pos < partialBody.length && (partialBody[pos] === ' ' || partialBody[pos] === ':')) pos++;
  if (pos >= partialBody.length || partialBody[pos] !== '"') return null;
  pos++;
  let result = '';
  while (pos < partialBody.length) {
    const ch = partialBody[pos];
    if (ch === '\\' && pos + 1 < partialBody.length) {
      const next = partialBody[pos + 1];
      if (next === '"') { result += '"'; pos += 2; }
      else if (next === '\\') { result += '\\'; pos += 2; }
      else if (next === 'n') { result += '\n'; pos += 2; }
      else if (next === 't') { result += '\t'; pos += 2; }
      else if (next === '/') { result += '/'; pos += 2; }
      else if (next === 'r') { result += '\r'; pos += 2; }
      else if (next === 'u' && pos + 5 < partialBody.length) {
        const hex = partialBody.slice(pos + 2, pos + 6);
        if (/^[0-9a-fA-F]{4}$/.test(hex)) {
          result += String.fromCharCode(parseInt(hex, 16));
          pos += 6;
        } else { result += ch; pos++; }
      }
      else { result += ch; pos++; }
    } else if (ch === '"') {
      break;
    } else {
      result += ch;
      pos++;
    }
  }
  return result || null;
}

/**
 * Patch an incomplete (truncated) show-widget fence into a valid one.
 * Used to salvage content when the stream is cut off mid-fence.
 */
export function patchIncompleteWidgetFence(text: string): string {
  const parsed = parseShowWidgetFence(text);
  const tailStart = parsed.length > 0 ? parsed[parsed.length - 1].end : 0;
  const tail = text.slice(tailStart);
  const bt = tail.indexOf('```');
  if (bt === -1 || !isShowWidgetFence(tail.slice(bt + 3).split('\n')[0])) {
    return text;
  }
  const afterFence = tail.slice(bt + 3);
  const nl = afterFence.indexOf('\n');
  const partialBody = nl !== -1 ? afterFence.slice(nl + 1) : '';
  const partialCode = extractPartialWidgetCode(partialBody);
  if (!partialCode || partialCode.length < 30) {
    return text;
  }
  const fenceStart = tailStart + bt;
  const patchedJson = JSON.stringify({ title: 'widget', widget_code: partialCode });
  return text.slice(0, fenceStart) + '```show-widget\n' + patchedJson + '\n```';
}

/**
 * Stateful stream parser that processes incremental text chunks.
 * Tracks completed widgets and exposes partial widget_code for streaming preview.
 */
export class StreamParser {
  private text = '';
  private completedCount = 0;

  /** Feed accumulated stream text (not a delta — the full text so far). */
  feed(accumulatedText: string): void {
    this.text = accumulatedText;
  }

  /** Get all newly completed widget fences since last call. */
  getNewWidgets(): WidgetFence[] {
    const all = parseShowWidgetFence(this.text);
    const newOnes = all.slice(this.completedCount);
    this.completedCount = all.length;
    return newOnes;
  }

  /** Get all completed widget fences so far. */
  getCompletedWidgets(): WidgetFence[] {
    return parseShowWidgetFence(this.text);
  }

  /** Number of completed widgets. */
  get completedWidgetCount(): number {
    return this.completedCount;
  }

  /**
   * Get partial widget_code from the current unclosed fence (if any).
   * Returns null if there's no unclosed show-widget fence.
   */
  getPartialWidgetCode(): string | null {
    const parsed = parseShowWidgetFence(this.text);
    const tailStart = parsed.length > 0 ? parsed[parsed.length - 1].end : 0;
    const tail = this.text.slice(tailStart);
    const bt = tail.indexOf('```');
    if (bt === -1 || !isShowWidgetFence(tail.slice(bt + 3).split('\n')[0])) {
      return null;
    }
    const afterFence = tail.slice(bt + 3);
    const nl = afterFence.indexOf('\n');
    const partialBody = nl !== -1 ? afterFence.slice(nl + 1) : '';
    return extractPartialWidgetCode(partialBody);
  }

  /**
   * Get the text content before any unclosed fence (the visible tail text).
   * Returns the full tail if no unclosed fence exists.
   */
  getTailText(): string {
    const parsed = parseShowWidgetFence(this.text);
    const tailStart = parsed.length > 0 ? parsed[parsed.length - 1].end : 0;
    const tail = this.text.slice(tailStart);
    const bt = tail.indexOf('```');
    if (bt !== -1 && isShowWidgetFence(tail.slice(bt + 3).split('\n')[0])) {
      return tail.slice(0, bt);
    }
    return tail;
  }

  /** Check if there's currently an unclosed show-widget fence. */
  hasUnclosedFence(): boolean {
    const parsed = parseShowWidgetFence(this.text);
    const tailStart = parsed.length > 0 ? parsed[parsed.length - 1].end : 0;
    const tail = this.text.slice(tailStart);
    const bt = tail.indexOf('```');
    return bt !== -1 && isShowWidgetFence(tail.slice(bt + 3).split('\n')[0]);
  }

  /** Get the text between two completed widgets (or from start). */
  getTextBetween(index: number): string {
    const parsed = parseShowWidgetFence(this.text);
    if (index >= parsed.length) return '';
    const prevEnd = index > 0 ? parsed[index - 1].end : 0;
    return this.text.slice(prevEnd, parsed[index].start);
  }

  /** Get the full accumulated text. */
  getText(): string {
    return this.text;
  }

  /** Reset all state. */
  reset(): void {
    this.text = '';
    this.completedCount = 0;
  }
}
