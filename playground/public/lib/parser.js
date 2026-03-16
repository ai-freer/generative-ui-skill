// Pure parsing functions extracted from app.js for testability.
// This file works both as a browser script and a Node.js module.

function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function inlineMarkdown(s) {
  return s
    .replace(/\n/g, '<br>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

function isShowWidgetFence(firstLine) {
  const t = firstLine.trim().toLowerCase();
  return t.startsWith('show-widget') || t.startsWith('show_widget');
}

function parseShowWidgetFence(streamText) {
  const fences = [];
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
      } catch (e) {
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
      let parsed = null;
      try {
        const obj = JSON.parse(body);
        if (obj && typeof obj.widget_code === 'string') {
          parsed = { title: obj.title || 'widget', widget_code: obj.widget_code };
        }
      } catch (_) {
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

function textToHtml(text) {
  const escaped = escapeHtml(text);
  const parts = [];
  let cursor = 0;
  const fenceRe = /```(\w[\w-]*)\n([\s\S]*?)```/g;
  let m;
  while ((m = fenceRe.exec(escaped)) !== null) {
    const lang = m[1] || '';
    const langLower = lang.toLowerCase();
    if (langLower === 'show-widget' || langLower === 'show_widget') {
      if (m.index > cursor) {
        parts.push(inlineMarkdown(escaped.slice(cursor, m.index)));
      }
      cursor = m.index + m[0].length;
      continue;
    }
    if (m.index > cursor) {
      parts.push(inlineMarkdown(escaped.slice(cursor, m.index)));
    }
    parts.push('<pre class="code-block"><code' + (lang ? ' data-lang="' + lang + '"' : '') + '>' + m[2] + '</code></pre>');
    cursor = m.index + m[0].length;
  }
  if (cursor < escaped.length) {
    let tail = escaped.slice(cursor);
    tail = tail.replace(/```(?:show-widget|show_widget)[\s\S]*/gi, '\n[图表内容被截断]');
    parts.push(inlineMarkdown(tail));
  }
  return parts.join('');
}

export {
  escapeHtml,
  inlineMarkdown,
  isShowWidgetFence,
  parseShowWidgetFence,
  findAllShowWidgetFences,
  extractPartialWidgetCode,
  textToHtml,
};
