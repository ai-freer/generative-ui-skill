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
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/~~(.+?)~~/g, '<del>$1</del>')
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>')
    .replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

function blockMarkdown(text) {
  var lines = text.split(/\n|<br>/);
  var out = [];
  var i = 0;
  while (i < lines.length) {
    var line = lines[i];
    var headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      var level = headingMatch[1].length;
      out.push('<h' + level + '>' + inlineFmt(headingMatch[2]) + '</h' + level + '>');
      i++;
      continue;
    }
    if (/^(?:---+|\*\*\*+)$/.test(line.trim())) {
      out.push('<hr>');
      i++;
      continue;
    }
    var ulMatch = line.match(/^[\s]*[-*]\s+(.+)$/);
    if (ulMatch) {
      var items = [];
      while (i < lines.length) {
        var um = lines[i].match(/^[\s]*[-*]\s+(.+)$/);
        if (!um) break;
        items.push('<li>' + inlineFmt(um[1]) + '</li>');
        i++;
      }
      out.push('<ul>' + items.join('') + '</ul>');
      continue;
    }
    var olMatch = line.match(/^[\s]*\d+[.)]\s+(.+)$/);
    if (olMatch) {
      var olItems = [];
      while (i < lines.length) {
        var om = lines[i].match(/^[\s]*\d+[.)]\s+(.+)$/);
        if (!om) break;
        olItems.push('<li>' + inlineFmt(om[1]) + '</li>');
        i++;
      }
      out.push('<ol>' + olItems.join('') + '</ol>');
      continue;
    }
    // Markdown pipe table
    if (/^\|.+\|/.test(line)) {
      var headerCells = line.split('|').slice(1, -1).map(function(c) { return c.trim(); });
      // Check next line is separator (|---|---|)
      if (i + 1 < lines.length && /^\|[\s:-]+\|/.test(lines[i + 1])) {
        var sepCells = lines[i + 1].split('|').slice(1, -1);
        var aligns = sepCells.map(function(c) {
          c = c.trim();
          if (c.startsWith(':') && c.endsWith(':')) return 'center';
          if (c.endsWith(':')) return 'right';
          return 'left';
        });
        i += 2; // skip header + separator
        var rows = [];
        while (i < lines.length && /^\|.+\|/.test(lines[i])) {
          rows.push(lines[i].split('|').slice(1, -1).map(function(c) { return c.trim(); }));
          i++;
        }
        var html = '<table class="md-table"><thead><tr>';
        headerCells.forEach(function(c, idx) {
          var a = aligns[idx] || 'left';
          html += '<th style="text-align:' + a + '">' + inlineFmt(c) + '</th>';
        });
        html += '</tr></thead><tbody>';
        rows.forEach(function(row) {
          html += '<tr>';
          row.forEach(function(c, idx) {
            var a = aligns[idx] || 'left';
            html += '<td style="text-align:' + a + '">' + inlineFmt(c) + '</td>';
          });
          html += '</tr>';
        });
        html += '</tbody></table>';
        out.push(html);
        continue;
      }
    }
    var bqMatch = line.match(/^&gt;\s?(.*)$/);
    if (bqMatch) {
      var bqLines = [];
      while (i < lines.length) {
        var bm = lines[i].match(/^&gt;\s?(.*)$/);
        if (!bm) break;
        bqLines.push(inlineFmt(bm[1]));
        i++;
      }
      out.push('<blockquote>' + bqLines.join('<br>') + '</blockquote>');
      continue;
    }
    out.push(inlineFmt(line));
    i++;
  }
  return out.join('\n');
}

function inlineFmt(s) {
  return s
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/~~(.+?)~~/g, '<del>$1</del>')
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>')
    .replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, '<em>$1</em>')
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

/**
 * Early detection of a 3D widget from partial streaming code.
 * Returns true as soon as we see canvas + Three.js CDN reference,
 * which appears very early in the stream before the shell is complete.
 */
function detect3DWidget(partialCode) {
  return partialCode.includes('<canvas') && partialCode.includes('three.min.js');
}

/**
 * Detect if a 3D widget's shell (canvas + CDN + init skeleton + animate loop)
 * is complete enough to create an early iframe for progressive rendering.
 * Returns { isComplete: boolean, shellEnd: number } where shellEnd is the
 * character index after the animate() call.
 */
function detect3DShellComplete(partialCode) {
  if (!partialCode.includes('three.min.js')) return { isComplete: false };
  if (!partialCode.includes('OrbitControls.js')) return { isComplete: false };
  var animateMatch = partialCode.match(/function\s+animate\s*\(\)/);
  if (!animateMatch) return { isComplete: false };
  if (!partialCode.includes('renderer.render(')) return { isComplete: false };
  var animateCallIdx = partialCode.indexOf('animate();', animateMatch.index);
  if (animateCallIdx === -1) return { isComplete: false };
  // Shell must include the init() invocation line so the iframe actually runs
  var initCallIdx = partialCode.indexOf('init();', animateCallIdx);
  if (initCallIdx === -1) return { isComplete: false };
  return { isComplete: true, shellEnd: initCallIdx + 'init();'.length };
}

/**
 * Build a valid early 3D shell document from a partial widget_code string.
 * The shell intentionally stops right after the first init() call so later
 * streamed mesh code can be injected via postMessage. If the source script
 * tag is still open at shellEnd, we close it here so buildWidgetDoc does not
 * inject its own helper script into the middle of model-generated JS.
 */
function buildEarly3DShell(partialCode, shellEnd) {
  var shell = partialCode.slice(0, shellEnd);
  shell = shell.replace(/\s+onload=(['"])init\(\)\1/, '');
  shell = shell.replace(/\s*if\s*\(\s*window\.THREE\s*&&\s*THREE\.OrbitControls\s*\)\s*init\(\);\s*$/, '');
  if (!shell.includes('<script')) return shell;
  var lastOpenIdx = shell.lastIndexOf('<script');
  var lastCloseIdx = shell.lastIndexOf('</script>');
  if (lastOpenIdx > lastCloseIdx) {
    shell += '</script>';
  }
  return shell;
}

/**
 * Extract only the JS tail that still belongs to the model's main 3D script.
 * Once the source stream reaches </script>, we stop before the closing tag so
 * the injected delta stays valid JavaScript for eval().
 */
function extract3DInjectChunk(partialCode, start) {
  var closeIdx = partialCode.indexOf('</script>', start);
  if (closeIdx === -1) {
    return { code: partialCode.slice(start), end: partialCode.length, scriptClosed: false };
  }
  return { code: partialCode.slice(start, closeIdx), end: closeIdx, scriptClosed: true };
}

/**
 * Extract complete JS statements from a code fragment.
 * Only returns code up to the last ';' or '}' to avoid injecting
 * partial statements that would cause SyntaxError.
 */
function extractCompleteStatements(code) {
  var lastSafe = Math.max(code.lastIndexOf(';'), code.lastIndexOf('}'));
  if (lastSafe === -1) return { safe: '', remainder: code };
  return { safe: code.slice(0, lastSafe + 1), remainder: code.slice(lastSafe + 1) };
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
        parts.push(blockMarkdown(escaped.slice(cursor, m.index)));
      }
      cursor = m.index + m[0].length;
      continue;
    }
    if (m.index > cursor) {
      parts.push(blockMarkdown(escaped.slice(cursor, m.index)));
    }
    parts.push('<pre class="code-block"><code' + (lang ? ' data-lang="' + lang + '"' : '') + '>' + m[2] + '</code></pre>');
    cursor = m.index + m[0].length;
  }
  if (cursor < escaped.length) {
    let tail = escaped.slice(cursor);
    tail = tail.replace(/```(?:show-widget|show_widget)[\s\S]*/gi, '\n[图表内容被截断]');
    parts.push(blockMarkdown(tail));
  }
  return parts.join('');
}

export {
  escapeHtml,
  inlineMarkdown,
  blockMarkdown,
  isShowWidgetFence,
  parseShowWidgetFence,
  findAllShowWidgetFences,
  extractPartialWidgetCode,
  detect3DWidget,
  detect3DShellComplete,
  buildEarly3DShell,
  extract3DInjectChunk,
  extractCompleteStatements,
  textToHtml,
};
