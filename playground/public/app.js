(function () {
  const form = document.getElementById('form');
  const input = document.getElementById('input');
  const messagesEl = document.getElementById('messages');

  function getModules() {
    return Array.from(document.querySelectorAll('.modules input[name=mod]:checked')).map((el) => el.value);
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function textToHtml(text) {
    const escaped = escapeHtml(text);
    const parts = [];
    let cursor = 0;
    const fenceRe = /```(\w*)\n([\s\S]*?)```/g;
    let m;
    while ((m = fenceRe.exec(escaped)) !== null) {
      if (m.index > cursor) {
        parts.push(inlineMarkdown(escaped.slice(cursor, m.index)));
      }
      const lang = m[1] || '';
      parts.push('<pre class="code-block"><code' + (lang ? ' data-lang="' + lang + '"' : '') + '>' + m[2] + '</code></pre>');
      cursor = m.index + m[0].length;
    }
    if (cursor < escaped.length) {
      parts.push(inlineMarkdown(escaped.slice(cursor)));
    }
    return parts.join('');
  }

  function inlineMarkdown(s) {
    return s
      .replace(/\n/g, '<br>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
  }

  const CDN_ORIGINS = [
    'https://cdnjs.cloudflare.com',
    'https://cdn.jsdelivr.net',
    'https://unpkg.com',
    'https://esm.sh',
  ];
  const CSP =
    "default-src 'none'; script-src 'unsafe-inline' " +
    CDN_ORIGINS.join(' ') +
    "; style-src 'unsafe-inline'; img-src data:; connect-src 'none';";

  function buildWidgetDoc(widgetCode) {
    const svgStyles = `
:root {
  --color-background-primary: #fff; --color-background-secondary: #f1f5f9; --color-background-tertiary: #e2e8f0;
  --color-text-primary: #0f172a; --color-text-secondary: #64748b; --color-text-tertiary: #94a3b8;
  --color-border-tertiary: rgba(0,0,0,.12); --color-border-secondary: rgba(0,0,0,.2);
  --color-border-primary: rgba(0,0,0,.4);
  --font-sans: system-ui,-apple-system,sans-serif; --font-serif: Georgia,serif; --font-mono: ui-monospace,monospace;
  --border-radius-md: 8px; --border-radius-lg: 12px; --border-radius-xl: 16px;
  --p: #0f172a; --s: #64748b; --t: #94a3b8; --bg2: #f1f5f9; --b: rgba(0,0,0,.12);
}
body { margin:0; padding:1rem; font:16px/1.6 var(--font-sans); color:var(--color-text-primary); background:#fff; }

/* SVG text classes */
.t  { font: 400 14px/1.4 var(--font-sans); fill: var(--color-text-primary); }
.ts { font: 400 12px/1.4 var(--font-sans); fill: var(--color-text-secondary); }
.th { font: 500 14px/1.4 var(--font-sans); fill: var(--color-text-primary); }

/* SVG structural classes */
.box { fill: var(--color-background-secondary); stroke: var(--color-border-tertiary); stroke-width: 0.5px; }
.node { cursor: pointer; } .node:hover { opacity: 0.85; }
.arr { stroke: var(--color-text-secondary); stroke-width: 1.5px; fill: none; }
.leader { stroke: var(--color-text-tertiary); stroke-width: 0.5px; stroke-dasharray: 4 2; fill: none; }

/* Color ramp classes — light mode fills (50), strokes (600), text title (800), subtitle (600) */
.c-purple > rect,.c-purple > circle,.c-purple > ellipse { fill:#EEEDFE; stroke:#534AB7; stroke-width:0.5px; }
.c-purple .t,.c-purple .th { fill:#3C3489; } .c-purple .ts { fill:#534AB7; }

.c-teal > rect,.c-teal > circle,.c-teal > ellipse { fill:#E1F5EE; stroke:#0F6E56; stroke-width:0.5px; }
.c-teal .t,.c-teal .th { fill:#085041; } .c-teal .ts { fill:#0F6E56; }

.c-coral > rect,.c-coral > circle,.c-coral > ellipse { fill:#FAECE7; stroke:#993C1D; stroke-width:0.5px; }
.c-coral .t,.c-coral .th { fill:#712B13; } .c-coral .ts { fill:#993C1D; }

.c-pink > rect,.c-pink > circle,.c-pink > ellipse { fill:#FBEAF0; stroke:#993556; stroke-width:0.5px; }
.c-pink .t,.c-pink .th { fill:#72243E; } .c-pink .ts { fill:#993556; }

.c-gray > rect,.c-gray > circle,.c-gray > ellipse { fill:#F1EFE8; stroke:#5F5E5A; stroke-width:0.5px; }
.c-gray .t,.c-gray .th { fill:#444441; } .c-gray .ts { fill:#5F5E5A; }

.c-blue > rect,.c-blue > circle,.c-blue > ellipse { fill:#E6F1FB; stroke:#185FA5; stroke-width:0.5px; }
.c-blue .t,.c-blue .th { fill:#0C447C; } .c-blue .ts { fill:#185FA5; }

.c-green > rect,.c-green > circle,.c-green > ellipse { fill:#EAF3DE; stroke:#3B6D11; stroke-width:0.5px; }
.c-green .t,.c-green .th { fill:#27500A; } .c-green .ts { fill:#3B6D11; }

.c-amber > rect,.c-amber > circle,.c-amber > ellipse { fill:#FAEEDA; stroke:#854F0B; stroke-width:0.5px; }
.c-amber .t,.c-amber .th { fill:#633806; } .c-amber .ts { fill:#854F0B; }

.c-red > rect,.c-red > circle,.c-red > ellipse { fill:#FCEBEB; stroke:#A32D2D; stroke-width:0.5px; }
.c-red .t,.c-red .th { fill:#791F1F; } .c-red .ts { fill:#A32D2D; }
`;
    return (
      '<!DOCTYPE html><html><head><meta charset="UTF-8"/>' +
      '<meta http-equiv="Content-Security-Policy" content="' +
      CSP.replace(/"/g, '&quot;') +
      '"/>' +
      '<style>' + svgStyles + '</style></head><body>' +
      widgetCode +
      '<script>' +
      'window.__widgetSendMessage=function(t){window.parent.postMessage({type:"widgetSendMessage",text:t},"*");};' +
      'function reportHeight(){var h=Math.max(document.body.scrollHeight,document.documentElement.scrollHeight);window.parent.postMessage({type:"widgetResize",height:h},"*");}' +
      'window.addEventListener("load",function(){reportHeight();setTimeout(reportHeight,300);setTimeout(reportHeight,1000);fixContrast();});' +
      'new MutationObserver(function(){reportHeight();fixContrast();}).observe(document.body,{childList:true,subtree:true,attributes:true});' +
      'function fixContrast(){' +
        'document.querySelectorAll("svg rect, svg circle, svg ellipse, svg polygon").forEach(function(shape){' +
          'var fill=shape.getAttribute("fill")||"";' +
          'if(!fill||fill==="none"||fill==="transparent"||fill.startsWith("var("))return;' +
          'var lum=parseLum(fill);if(lum===null||lum>100)return;' +
          'var g=shape.closest("g")||shape.parentNode;' +
          'g.querySelectorAll("text").forEach(function(t){' +
            'var tf=t.getAttribute("fill")||"";' +
            'var tl=parseLum(tf);' +
            'if(tl!==null&&tl>180)return;' +
            't.setAttribute("fill","#fff");' +
          '});' +
        '});' +
      '}' +
      'function parseLum(c){' +
        'if(!c)return null;c=c.trim();' +
        'var m=c.match(/^#([0-9a-f]{3,8})$/i);if(!m)return null;' +
        'var h=m[1];' +
        'if(h.length===3)h=h[0]+h[0]+h[1]+h[1]+h[2]+h[2];' +
        'if(h.length<6)return null;' +
        'var r=parseInt(h.slice(0,2),16),g=parseInt(h.slice(2,4),16),b=parseInt(h.slice(4,6),16);' +
        'return 0.299*r+0.587*g+0.114*b;' +
      '}' +
      '</script></body></html>'
    );
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
      const close = streamText.indexOf('```', bodyStart);
      if (close === -1) break;
      const body = streamText.slice(bodyStart, close).trim();
      const fenceEnd = close + 3;
      i = fenceEnd;
      try {
        const obj = JSON.parse(body);
        if (obj && typeof obj.widget_code === 'string') {
          fences.push({ title: obj.title || 'widget', widget_code: obj.widget_code, start: open, end: fenceEnd });
        }
      } catch (e) {
        console.warn('[show-widget] JSON parse failed:', e.message, 'body length:', body.length);
      }
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

  function createRenderState(container) {
    const textEl = document.createElement('div');
    textEl.className = 'stream-text';
    container.appendChild(textEl);
    return { widgetCount: 0, activeTextEl: textEl, placeholderEl: null, previewEl: null, container: container };
  }

  function renderStreamChunk(state, streamText) {
    const parsed = parseShowWidgetFence(streamText);

    while (state.widgetCount < parsed.length) {
      const w = parsed[state.widgetCount];
      const prevEnd = state.widgetCount > 0 ? parsed[state.widgetCount - 1].end : 0;
      const textBefore = streamText.slice(prevEnd, w.start);
      if (state.activeTextEl) {
        state.activeTextEl.innerHTML = textBefore ? textToHtml(textBefore) : '';
      }

      if (state.previewEl) {
        state.previewEl.remove();
        state.previewEl = null;
      }
      if (state.placeholderEl) {
        state.placeholderEl.remove();
        state.placeholderEl = null;
      }

      const wrap = document.createElement('div');
      wrap.className = 'widget-wrap';
      const iframe = document.createElement('iframe');
      iframe.sandbox = 'allow-scripts';
      iframe.title = w.title;
      iframe.srcdoc = buildWidgetDoc(w.widget_code);
      wrap.appendChild(iframe);
      state.container.appendChild(wrap);

      state.activeTextEl = document.createElement('div');
      state.activeTextEl.className = 'stream-text';
      state.container.appendChild(state.activeTextEl);

      state.widgetCount++;
    }

    const tailStart = parsed.length > 0 ? parsed[parsed.length - 1].end : 0;
    const tail = streamText.slice(tailStart);

    let unclosedIdx = -1;
    const bt = tail.indexOf('```');
    if (bt !== -1 && isShowWidgetFence(tail.slice(bt + 3).split('\n')[0])) {
      unclosedIdx = bt;
    }

    if (unclosedIdx !== -1) {
      const visibleText = tail.slice(0, unclosedIdx);
      state.activeTextEl.innerHTML = visibleText ? textToHtml(visibleText) : '';

      const afterFence = tail.slice(unclosedIdx + 3);
      const nl = afterFence.indexOf('\n');
      const partialBody = nl !== -1 ? afterFence.slice(nl + 1) : '';
      const partialCode = extractPartialWidgetCode(partialBody);

      if (partialCode && partialCode.length > 30) {
        if (state.placeholderEl) {
          state.placeholderEl.remove();
          state.placeholderEl = null;
        }
        if (!state.previewEl) {
          state.previewEl = document.createElement('div');
          state.previewEl.className = 'widget-wrap widget-streaming';
          state.container.appendChild(state.previewEl);
        }
        state.previewEl.innerHTML = partialCode;
      } else {
        if (!state.placeholderEl && !state.previewEl) {
          state.placeholderEl = document.createElement('div');
          state.placeholderEl.className = 'widget-wrap widget-placeholder';
          state.placeholderEl.innerHTML = '<p class="typing">正在生成图表…</p>';
          state.container.appendChild(state.placeholderEl);
        }
      }
    } else {
      state.activeTextEl.innerHTML = tail ? textToHtml(tail) : '';
      if (state.placeholderEl) {
        state.placeholderEl.remove();
        state.placeholderEl = null;
      }
      if (state.previewEl) {
        state.previewEl.remove();
        state.previewEl = null;
      }
    }

    return parsed.length;
  }

  window.addEventListener('message', (e) => {
    if (e.data?.type === 'widgetResize' && typeof e.data.height === 'number') {
      const iframes = document.querySelectorAll('.widget-wrap iframe');
      for (const iframe of iframes) {
        if (iframe.contentWindow === e.source) {
          iframe.style.height = Math.min(e.data.height + 16, 800) + 'px';
          break;
        }
      }
      return;
    }
    if (e.data?.type !== 'widgetSendMessage' || typeof e.data.text !== 'string') return;
    input.value = e.data.text;
    form.requestSubmit();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const message = input.value.trim();
    if (!message) return;
    const modules = getModules();

    const userBubble = document.createElement('div');
    userBubble.className = 'msg user';
    userBubble.innerHTML = '<div class="bubble">' + escapeHtml(message) + '</div>';
    messagesEl.appendChild(userBubble);

    const assistantWrap = document.createElement('div');
    assistantWrap.className = 'msg assistant';
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.innerHTML = '<p class="typing">…</p>';
    assistantWrap.appendChild(bubble);
    messagesEl.appendChild(assistantWrap);

    input.value = '';
    form.querySelector('.send').disabled = true;

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, modules }),
      });
      if (!res.ok) {
        bubble.innerHTML = '<p>请求失败: ' + res.status + '</p>';
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let rawBuffer = '';
      let streamText = '';
      bubble.innerHTML = '';
      const renderState = createRenderState(bubble);

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        rawBuffer += dec.decode(value, { stream: true });
        const events = rawBuffer.split('\n\n');
        rawBuffer = events.pop() || '';
        for (const event of events) {
          const line = event.split('\n')[0];
          if (!line || !line.startsWith('data: ')) continue;
          const payload = line.slice(6);
          if (payload === '[DONE]') continue;
          try {
            const data = JSON.parse(payload);
            if (data.error) {
              renderState.activeTextEl.innerHTML = '<p>错误: ' + escapeHtml(data.error) + '</p>';
              break;
            }
            if (data.text) {
              streamText += data.text;
              renderStreamChunk(renderState, streamText);
            }
          } catch (_) {}
        }
      }
      if (rawBuffer) {
        const line = rawBuffer.split('\n')[0];
        if (line.startsWith('data: ') && line.slice(6) !== '[DONE]') {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.text) streamText += data.text;
          } catch (_) {}
        }
      }
      renderStreamChunk(renderState, streamText);
      const hasMarker = streamText.includes('show-widget') || streamText.includes('show_widget');
      const finalParsed = parseShowWidgetFence(streamText);
      console.log('[show-widget] 流结束: 响应中含 show-widget 标记 =', hasMarker, ', 解析出 widget 数 =', finalParsed.length, finalParsed.length ? '(应已渲染图表)' : '(若未见图表，多半是模型未输出完整围栏或 JSON 解析失败)');
    } finally {
      form.querySelector('.send').disabled = false;
    }
  });
})();
