import {
  escapeHtml,
  extractPartialWidgetCode,
  findAllShowWidgetFences,
  isShowWidgetFence,
  parseShowWidgetFence,
  textToHtml,
} from './lib/parser.js';

(function () {
  const STORAGE_KEY = 'gu-sessions';

  const SAMPLE_PROMPTS = [
    '解释 JWT 认证流程',
    '展示过去 6 个月的 OpenAI 用户增长趋势',
    '做一个 BMI 计算器',
    '比较 REST 和 GraphQL',
    '画一下 Kubernetes 的架构',
    '做一个 D3.js 的数据可视化',
    '设计一个电商 App 的商品详情页，包含主要功能模块',
    '用可视化的方式演示冒泡排序的过程，最好能一步步操作',
    '帮我设计一个赛博朋克风格的虚拟咖啡品牌，包括品牌名、视觉风格和菜单概念',
    '分析一个 SaaS 产品从获客到留存的完整用户生命周期，给出优化建议',
    '给我一些日式侘寂风格的室内设计灵感，用视觉方式呈现',
  ];

  function pickRandom(arr, n) {
    const shuffled = [...arr].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, n);
  }

  const form = document.getElementById('form');
  const input = document.getElementById('input');
  const messagesEl = document.getElementById('messages');
  const sessionListEl = document.getElementById('sessionList');
  const btnNewChat = document.getElementById('btnNewChat');
  const providerSelect = document.getElementById('providerSelect');
  const modelSelect = document.getElementById('modelSelect');
  const modelStatusEl = document.getElementById('modelStatus');
  const searchToggle = document.getElementById('searchToggle');
  const searchStatusEl = document.getElementById('searchStatus');

  let sessions = [];
  let currentSessionId = null;
  let providers = [];

  // Per-session streaming state: sessionId -> { fragment, streaming }
  // fragment: DocumentFragment holding the live DOM while session is in background
  const activeStreams = new Map();

  function updateModulePills(activeModules) {
    document.querySelectorAll('.mod-pill').forEach((el) => {
      el.classList.toggle('active', activeModules.includes(el.dataset.mod));
    });
  }

  function resetModulePills() {
    document.querySelectorAll('.mod-pill').forEach((el) => el.classList.remove('active'));
  }

  function getSearchEnabled() {
    return searchToggle ? searchToggle.checked : false;
  }

  function loadSessions() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      sessions = raw ? JSON.parse(raw) : [];
    } catch (_) {
      sessions = [];
    }
  }

  function saveSessions() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  }

  function createSession() {
    const provider = providers[0];
    const model = provider?.models?.[0];
    const session = {
      id: crypto.randomUUID(),
      title: '新对话',
      provider: provider?.id ?? '',
      model: model ?? '',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    sessions.unshift(session);
    saveSessions();
    return session;
  }

  function getCurrentSession() {
    return sessions.find((s) => s.id === currentSessionId);
  }

  function switchSession(id) {
    if (id === currentSessionId) return;

    // Detach current session's live DOM if it's streaming
    if (currentSessionId && activeStreams.has(currentSessionId)) {
      const fragment = document.createDocumentFragment();
      while (messagesEl.firstChild) {
        fragment.appendChild(messagesEl.firstChild);
      }
      activeStreams.get(currentSessionId).fragment = fragment;
    }

    currentSessionId = id;
    const session = getCurrentSession();

    // Restore live DOM if target session is streaming, otherwise re-render
    if (session && activeStreams.has(id)) {
      messagesEl.innerHTML = '';
      const { fragment } = activeStreams.get(id);
      if (fragment) {
        messagesEl.appendChild(fragment);
        activeStreams.get(id).fragment = null;
      }
    } else if (session) {
      renderMessages(session);
    }

    syncProviderModelFromSession(session);
    updateSendButton();
    resetModulePills();
    renderSessionList();
  }

  function deleteSession(id, e) {
    if (e) e.stopPropagation();
    sessions = sessions.filter((s) => s.id !== id);
    saveSessions();
    if (currentSessionId === id) {
      currentSessionId = null;
      if (sessions.length) {
        switchSession(sessions[0].id);
      } else {
        const newSession = createSession();
        switchSession(newSession.id);
      }
    } else {
      renderSessionList();
    }
  }

  function renderSessionList() {
    sessionListEl.innerHTML = '';
    const sorted = [...sessions].sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));
    sorted.forEach((s) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'session-item' + (s.id === currentSessionId ? ' active' : '') + (activeStreams.has(s.id) ? ' streaming' : '');
      btn.setAttribute('data-session-id', s.id);
      const titleSpan = document.createElement('span');
      titleSpan.className = 'session-title';
      titleSpan.textContent = s.title || '新对话';
      btn.appendChild(titleSpan);
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'btn-delete-session';
      delBtn.textContent = '删除';
      delBtn.setAttribute('aria-label', '删除会话');
      delBtn.addEventListener('click', (ev) => deleteSession(s.id, ev));
      btn.appendChild(delBtn);
      btn.addEventListener('click', () => switchSession(s.id));
      sessionListEl.appendChild(btn);
    });
  }

  function syncProviderModelFromSession(session) {
    if (!session) return;
    fillModelSelect(session.provider);
    providerSelect.value = session.provider || '';
    modelSelect.value = session.model || '';
  }

  function reuseUserQuery(content, shouldSubmit) {
    input.value = content;
    input.focus();
    if (!shouldSubmit) return;
    if (activeStreams.has(currentSessionId)) return;
    form.requestSubmit();
  }

  async function copyText(text) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const temp = document.createElement('textarea');
    temp.value = text;
    temp.setAttribute('readonly', '');
    temp.style.position = 'absolute';
    temp.style.left = '-9999px';
    document.body.appendChild(temp);
    temp.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(temp);
    if (!copied) {
      throw new Error('copy failed');
    }
  }

  function setActionFeedback(button, nextLabel) {
    const labelEl = button.querySelector('.msg-action-label');
    if (!labelEl) return;
    const originalLabel = button.getAttribute('data-label') || labelEl.textContent;
    labelEl.textContent = nextLabel;
    clearTimeout(Number(button.dataset.feedbackTimer || 0));
    const timerId = window.setTimeout(() => {
      labelEl.textContent = originalLabel;
      delete button.dataset.feedbackTimer;
    }, 1200);
    button.dataset.feedbackTimer = String(timerId);
  }

  function createUserActionButton(type, label, iconSvg, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'msg-action-btn';
    button.setAttribute('data-label', label);
    button.setAttribute('data-action', type);
    button.setAttribute('aria-label', label);
    button.innerHTML =
      '<span class="msg-action-icon" aria-hidden="true">' + iconSvg + '</span>' +
      '<span class="msg-action-label">' + label + '</span>';
    button.addEventListener('click', onClick);
    return button;
  }

  function createUserMessageElement(content, messageIndex) {
    const wrap = document.createElement('div');
    wrap.className = 'msg user';

    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.textContent = content;
    wrap.appendChild(bubble);

    const actions = document.createElement('div');
    actions.className = 'user-actions';

    const retryIcon =
      '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M13 3v4H9"></path><path d="M13 7a5 5 0 1 0 1 3"></path></svg>';
    const copyIcon =
      '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">' +
      '<rect x="5" y="3" width="8" height="10" rx="2"></rect><path d="M3 11V5a2 2 0 0 1 2-2"></path></svg>';

    actions.appendChild(createUserActionButton('retry', '重试', retryIcon, async (event) => {
      await retryUserMessage(messageIndex, content, event.currentTarget);
    }));

    actions.appendChild(createUserActionButton('copy', '复制', copyIcon, async (event) => {
      const button = event.currentTarget;
      try {
        await copyText(content);
        setActionFeedback(button, '已复制');
      } catch (_) {
        reuseUserQuery(content, false);
        setActionFeedback(button, '已回填');
      }
    }));

    wrap.appendChild(actions);
    return wrap;
  }

  function validateSessionForSend(session) {
    if (!session) {
      return false;
    }
    if (activeStreams.has(session.id)) {
      return false;
    }
    if (!session.provider || !session.model) {
      alert('请先在右侧选择 Provider 和 Model');
      return false;
    }
    return true;
  }

  function updateSendButton() {
    const isCurrentStreaming = currentSessionId && activeStreams.has(currentSessionId);
    form.querySelector('.send').disabled = !!isCurrentStreaming;
  }

  function appendAssistantPlaceholder() {
    const assistantWrap = document.createElement('div');
    assistantWrap.className = 'msg assistant';
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.innerHTML =
      '<p class="thinking">模型正在思考中…（这一步可能会稍慢一些）</p>' +
      '<p class="typing"><span class="typing-dots"><span></span><span></span><span></span></span></p>';
    assistantWrap.appendChild(bubble);
    messagesEl.appendChild(assistantWrap);
    return bubble;
  }

  async function streamAssistantReply(session, bubble, options) {
    const onFailure = options?.onFailure;
    activeStreams.set(session.id, { fragment: null });
    updateSendButton();
    // Only update status bar if this session is currently visible
    const setStatus = (text) => { if (session.id === currentSessionId) setModelStatus(text); };
    const providerName = getProviderName(session.provider);
    setStatus(`正在调用 ${providerName || 'Provider'} · ${session.model}…`);

    const apiMessages = session.messages.map((m) => ({ role: m.role, content: m.content }));

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: session.provider,
          model: session.model,
          messages: apiMessages,
          searchEnabled: getSearchEnabled(),
        }),
      });
      if (!res.ok) {
        const errText = await res.text();
        const handled = await onFailure?.({ status: res.status, errorText: errText });
        if (!handled) {
          bubble.innerHTML = '<p>请求失败: ' + res.status + ' ' + escapeHtml(errText.slice(0, 200)) + '</p>';
          setStatus('调用失败，请稍后重试');
        }
        return false;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let rawBuffer = '';
      let streamText = '';
      const renderState = createRenderState(bubble);

      let plannerActive = false;
      let plannerEl = null;
      let plannerContent = null; // final content from planner to save

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        rawBuffer += dec.decode(value, { stream: true });
        const events = rawBuffer.split('\n\n');
        rawBuffer = events.pop() || '';
        for (const event of events) {
          // Parse named SSE events (e.g. "event: modules\ndata: [...]")
          const lines = event.split('\n');
          let eventType = '';
          let dataLine = '';
          for (const l of lines) {
            if (l.startsWith('event: ')) eventType = l.slice(7).trim();
            if (l.startsWith('data: ')) dataLine = l.slice(6);
          }
          if (!dataLine) continue;

          // Handle named events
          if (eventType === 'modules_used') {
            try { updateModulePills(JSON.parse(dataLine)); } catch (_) {}
            continue;
          }

          const payload = dataLine;
          if (payload === '[DONE]') continue;
          try {
            const data = JSON.parse(payload);
            if (data.error) {
              renderState.activeTextEl.innerHTML = '<p>错误: ' + escapeHtml(data.error) + '</p>';
              break;
            }
            if (data.searching) {
              setStatus(`正在搜索: ${data.searching}`);
              let searchingEl = bubble.querySelector('.searching-indicator');
              if (!searchingEl) {
                searchingEl = document.createElement('p');
                searchingEl.className = 'thinking searching-indicator';
                searchingEl.textContent = '正在搜索: ' + data.searching + '…';
                bubble.appendChild(searchingEl);
              }
            }
            if (data.text) {
              streamText += data.text;
              renderStreamChunk(renderState, streamText);
            }
            // --- Planner events ---
            if (data.stream_status) {
              if (data.stream_status === 'truncated') {
                setStatus('检测到内容截断，准备重试…');
              }
            }
            if (data.retrying) {
              setStatus('正在重试生成…');
            }
            if (data.retry_success && data.content) {
              // Retry succeeded — replace the truncated content with complete version
              setStatus('重试成功，正在渲染…');
              streamText = data.content;
              // Reset render state and re-render from scratch
              bubble.innerHTML = '';
              const newState = createRenderState(bubble);
              renderState.widgetCount = 0;
              renderState.activeTextEl = newState.activeTextEl;
              renderState.previewEl = null;
              renderState.placeholderEl = null;
              renderState.container = newState.container;
              renderStreamChunk(renderState, streamText);
            }
            if (data.planning) {
              plannerActive = true;
              setStatus('正在规划生成方案…');
              // Remove streaming preview / placeholder
              if (renderState.previewEl) { renderState.previewEl.remove(); renderState.previewEl = null; }
              if (renderState.placeholderEl) { renderState.placeholderEl.remove(); renderState.placeholderEl = null; }
              plannerEl = document.createElement('div');
              plannerEl.className = 'planner-progress';
              plannerEl.innerHTML = '<p class="thinking">正在规划生成方案…</p>';
              bubble.appendChild(plannerEl);
            }
            if (data.plan && plannerEl) {
              renderPlannerTasks(plannerEl, data.plan);
              setStatus(`规划完成，共 ${data.plan.tasks.length} 个子任务`);
            }
            if (data.subtask_start && plannerEl) {
              updatePlannerTask(plannerEl, data.subtask_start.id, 'running', data.subtask_start.index, data.subtask_start.total);
              setStatus(`正在生成 (${(data.subtask_start.index || 0) + 1}/${data.subtask_start.total || '?'}) ${data.subtask_start.description}`);
            }
            if (data.subtask_done && plannerEl) {
              updatePlannerTask(plannerEl, data.subtask_done.id, data.subtask_done.widget_code ? 'done' : 'error');
              if (data.subtask_done.widget_code) {
                renderSubTaskWidget(bubble, data.subtask_done.id, data.subtask_done.widget_code);
              }
            }
            if (data.assembling) {
              setStatus('正在组装最终结果…');
              if (plannerEl) {
                const assembleNote = document.createElement('p');
                assembleNote.className = 'thinking';
                assembleNote.textContent = '正在组装最终结果…';
                plannerEl.appendChild(assembleNote);
              }
            }
            if (data.assembled && data.assembled.widget_code) {
              // Replace all sub-task iframes with the final assembled widget
              removeSubTaskWidgets(bubble);
              const wrap = document.createElement('div');
              wrap.className = 'widget-wrap';
              const iframe = document.createElement('iframe');
              iframe.sandbox = 'allow-scripts allow-same-origin';
              iframe.title = 'assembled-widget';
              iframe.srcdoc = buildWidgetDoc(data.assembled.widget_code);
              wrap.appendChild(iframe);
              // Insert after planner progress
              if (plannerEl && plannerEl.nextSibling) {
                bubble.insertBefore(wrap, plannerEl.nextSibling);
              } else {
                bubble.appendChild(wrap);
              }
              setStatus('');
            }
            if (data.planner_content) {
              plannerContent = data.planner_content;
            }
            if (data.planning_failed) {
              setStatus('规划失败: ' + data.planning_failed);
              if (plannerEl) {
                plannerEl.innerHTML = '<p>规划失败: ' + escapeHtml(data.planning_failed) + '</p>';
              }
            }
            if (data.planner_error) {
              setStatus('规划出错: ' + data.planner_error);
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

      // Save content: use planner result if available, otherwise patch truncated fence
      let contentToSave;
      if (plannerContent) {
        contentToSave = plannerContent;
      } else {
        contentToSave = patchIncompleteWidgetFence(streamText);
      }
      session.messages.push({ role: 'assistant', content: contentToSave });
      saveSessions();
      renderSessionList();
      setStatus('');
      return true;
    } catch (err) {
      const errText = err?.message || String(err);
      const handled = await onFailure?.({ errorText: errText });
      if (!handled) {
        bubble.innerHTML = '<p>请求失败: ' + escapeHtml(errText.slice(0, 200)) + '</p>';
        setStatus('调用失败，请稍后重试');
      }
      return false;
    } finally {
      activeStreams.delete(session.id);
      updateSendButton();
      renderSessionList();
      if (session.id === currentSessionId && !modelStatusEl.textContent) {
        setModelStatus('');
      }
    }
  }

  async function submitUserMessage(message) {
    hideSuggestionTags();
    const session = getCurrentSession();
    if (!validateSessionForSend(session)) {
      return;
    }

    session.messages.push({ role: 'user', content: message });
    session.updatedAt = Date.now();
    if (session.messages.length === 1) {
      session.title = message.slice(0, 20) + (message.length > 20 ? '…' : '');
    }
    saveSessions();
    renderSessionList();

    const userBubble = createUserMessageElement(message, session.messages.length - 1);
    messagesEl.appendChild(userBubble);

    input.value = '';
    const bubble = appendAssistantPlaceholder();
    await streamAssistantReply(session, bubble, {
      onFailure: () => {
        session.messages.pop();
        saveSessions();
        renderSessionList();
        return false;
      },
    });
  }

  async function retryUserMessage(messageIndex, content, button) {
    if (activeStreams.has(currentSessionId)) {
      setActionFeedback(button, '生成中');
      return;
    }

    const session = getCurrentSession();
    if (!validateSessionForSend(session)) {
      return;
    }
    const targetMessage = session.messages[messageIndex];
    if (!targetMessage || targetMessage.role !== 'user') {
      reuseUserQuery(content, false);
      return;
    }

    const originalMessages = session.messages.slice();
    session.messages = session.messages.slice(0, messageIndex + 1);
    session.updatedAt = Date.now();
    saveSessions();
    renderSessionList();
    renderMessages(session);

    const bubble = appendAssistantPlaceholder();
    const succeeded = await streamAssistantReply(session, bubble, {
      onFailure: () => {
        session.messages = originalMessages;
        session.updatedAt = Date.now();
        saveSessions();
        renderSessionList();
        renderMessages(session);
        setModelStatus('重试失败，已恢复原对话');
        return true;
      },
    });

    if (succeeded) {
      setActionFeedback(button, '已重试');
    }
  }

  function renderMessages(session) {
    messagesEl.innerHTML = '';
    if (!session || !session.messages.length) {
      renderSuggestionTags();
      return;
    }
    hideSuggestionTags();
    session.messages.forEach((msg, index) => {
      if (msg.role === 'user') {
        messagesEl.appendChild(createUserMessageElement(msg.content, index));
      } else {
        const wrap = document.createElement('div');
        wrap.className = 'msg assistant';
        const bubble = document.createElement('div');
        bubble.className = 'bubble';
        renderAssistantContentToDom(bubble, msg.content);
        wrap.appendChild(bubble);
        messagesEl.appendChild(wrap);
      }
    });
  }

  const suggestionTagsEl = document.getElementById('suggestionTags');

  function renderSuggestionTags() {
    const picked = pickRandom(SAMPLE_PROMPTS, 4);
    const placeholderPrompt = picked[0];
    const tagPrompts = picked.slice(1, 4);

    input.placeholder = '例如：' + placeholderPrompt;

    suggestionTagsEl.innerHTML = '';
    tagPrompts.forEach((prompt) => {
      const tag = document.createElement('button');
      tag.type = 'button';
      tag.className = 'suggestion-tag';
      tag.textContent = prompt.length > 20 ? prompt.slice(0, 18) + '…' : prompt;
      tag.title = prompt;
      tag.addEventListener('click', () => {
        input.value = prompt;
        hideSuggestionTags();
        form.requestSubmit();
      });
      suggestionTagsEl.appendChild(tag);
    });
    suggestionTagsEl.style.display = '';
  }

  function hideSuggestionTags() {
    suggestionTagsEl.innerHTML = '';
    suggestionTagsEl.style.display = 'none';
  }

  function patchIncompleteWidgetFence(text) {
    // Find the last unclosed show-widget fence
    const parsed = parseShowWidgetFence(text);
    const tailStart = parsed.length > 0 ? parsed[parsed.length - 1].end : 0;
    const tail = text.slice(tailStart);
    const bt = tail.indexOf('```');
    if (bt === -1 || !isShowWidgetFence(tail.slice(bt + 3).split('\n')[0])) {
      return text; // no unclosed fence
    }
    const afterFence = tail.slice(bt + 3);
    const nl = afterFence.indexOf('\n');
    const partialBody = nl !== -1 ? afterFence.slice(nl + 1) : '';
    const partialCode = extractPartialWidgetCode(partialBody);
    if (!partialCode || partialCode.length < 30) {
      return text; // too little content to salvage
    }
    // Build a valid fence to replace the broken one
    const fenceStart = tailStart + bt;
    const patchedJson = JSON.stringify({ title: 'widget', widget_code: partialCode });
    return text.slice(0, fenceStart) + '```show-widget\n' + patchedJson + '\n```';
  }

  function renderAssistantContentToDom(container, content) {
    const fences = findAllShowWidgetFences(content);
    let lastEnd = 0;
    fences.forEach((f) => {
      const textBefore = content.slice(lastEnd, f.start);
      if (textBefore.trim()) {
        const div = document.createElement('div');
        div.className = 'stream-text';
        div.innerHTML = textToHtml(textBefore);
        container.appendChild(div);
      }
      if (f.parsed) {
        const wrap = document.createElement('div');
        wrap.className = 'widget-wrap';
        const iframe = document.createElement('iframe');
        iframe.sandbox = 'allow-scripts allow-same-origin';
        iframe.title = f.parsed.title;
        iframe.srcdoc = buildWidgetDoc(f.parsed.widget_code);
        wrap.appendChild(iframe);
        container.appendChild(wrap);
      } else {
        const wrap = document.createElement('div');
        wrap.className = 'widget-wrap widget-placeholder';
        wrap.innerHTML = '<p class="typing">图表生成失败（模型输出了无效的 JSON）</p>';
        container.appendChild(wrap);
      }
      lastEnd = f.end;
    });
    const tail = content.slice(lastEnd);
    if (tail.trim()) {
      const div = document.createElement('div');
      div.className = 'stream-text';
      div.innerHTML = textToHtml(stripShowWidgetRaw(tail));
      container.appendChild(div);
    }
  }

  function stripShowWidgetRaw(text) {
    // Strip complete show-widget fences
    let result = text.replace(/```(?:show-widget|show_widget)[\s\S]*?```/gi, '');
    // For incomplete (truncated) fences, only strip the fence itself, keep text before it
    result = result.replace(/```(?:show-widget|show_widget)[\s\S]*/gi, '\n[图表内容被截断]');
    return result;
  }

  async function fetchProviders() {
    const res = await fetch('/api/providers');
    const data = await res.json().catch(() => ({}));
    providers = data.providers || [];
  }

  function fillProviderSelect() {
    providerSelect.innerHTML = '';
    if (!providers.length) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = '（请配置 .env 中的 API Key 并重启服务）';
      opt.disabled = true;
      providerSelect.appendChild(opt);
      return;
    }
    providers.forEach((p) => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      providerSelect.appendChild(opt);
    });
  }

  function fillModelSelect(providerId) {
    const p = providers.find((x) => x.id === providerId);
    const models = p?.models || [];
    modelSelect.innerHTML = '';
    models.forEach((m) => {
      const opt = document.createElement('option');
      opt.value = m;
      opt.textContent = m;
      modelSelect.appendChild(opt);
    });
    const session = getCurrentSession();
    if (session && session.provider === providerId && models.includes(session.model)) {
      modelSelect.value = session.model;
    } else if (models.length) {
      modelSelect.value = models[0];
      if (session && session.provider === providerId) {
        session.model = models[0];
        saveSessions();
      }
    }
  }

  function getProviderName(id) {
    const p = providers.find((x) => x.id === id);
    return p ? p.name : id || '';
  }

  function setModelStatus(text) {
    if (!modelStatusEl) return;
    modelStatusEl.textContent = text || '';
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

  function createRenderState(container) {
    const textEl = document.createElement('div');
    textEl.className = 'stream-text';
    container.appendChild(textEl);
    return { widgetCount: 0, activeTextEl: textEl, placeholderEl: null, previewEl: null, container: container };
  }

  function renderStreamChunk(state, streamText) {
    // Only remove thinking/typing/searching indicators once we have real visible content
    if (state.container && streamText.trim().length > 0) {
      state.container.querySelectorAll('.thinking, .typing, .searching-indicator').forEach((el) => el.remove());
    }
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

  // --- Planner UI helpers ---

  function renderPlannerTasks(container, plan) {
    container.innerHTML = '';
    const header = document.createElement('div');
    header.className = 'planner-header';
    header.textContent = plan.summary || '生成方案';
    container.appendChild(header);
    const list = document.createElement('div');
    list.className = 'planner-task-list';
    (plan.tasks || []).forEach((task, i) => {
      const item = document.createElement('div');
      item.className = 'planner-task pending';
      item.setAttribute('data-task-id', task.id);
      item.innerHTML =
        '<span class="planner-task-index">' + (i + 1) + '</span>' +
        '<span class="planner-task-desc">' + escapeHtml(task.description) + '</span>' +
        '<span class="planner-task-status">等待中</span>';
      list.appendChild(item);
    });
    container.appendChild(list);
  }

  function updatePlannerTask(container, taskId, status, index, total) {
    const item = container.querySelector('[data-task-id="' + taskId + '"]');
    if (!item) return;
    item.className = 'planner-task ' + status;
    const statusEl = item.querySelector('.planner-task-status');
    if (statusEl) {
      if (status === 'running') statusEl.textContent = '生成中…';
      else if (status === 'done') statusEl.textContent = '完成';
      else if (status === 'error') statusEl.textContent = '失败';
    }
  }

  function renderSubTaskWidget(container, taskId, widgetCode) {
    const wrap = document.createElement('div');
    wrap.className = 'widget-wrap subtask-widget';
    wrap.setAttribute('data-subtask-id', taskId);
    const iframe = document.createElement('iframe');
    iframe.sandbox = 'allow-scripts allow-same-origin';
    iframe.title = taskId;
    iframe.srcdoc = buildWidgetDoc(widgetCode);
    wrap.appendChild(iframe);
    container.appendChild(wrap);
  }

  function removeSubTaskWidgets(container) {
    container.querySelectorAll('.subtask-widget').forEach(el => el.remove());
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      form.requestSubmit();
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const message = input.value.trim();
    if (!message) return;
    await submitUserMessage(message);
  });

  providerSelect.addEventListener('change', () => {
    const session = getCurrentSession();
    if (!session) return;
    session.provider = providerSelect.value;
    fillModelSelect(session.provider);
    session.model = modelSelect.value;
    saveSessions();
  });

  modelSelect.addEventListener('change', () => {
    const session = getCurrentSession();
    if (!session) return;
    session.model = modelSelect.value;
    saveSessions();
  });

  btnNewChat.addEventListener('click', () => {
    const newSession = createSession();
    switchSession(newSession.id);
  });

  // --- Settings Modal ---
  const settingsOverlay = document.getElementById('settingsOverlay');
  const btnSettings = document.getElementById('btnSettings');
  const btnCloseSettings = document.getElementById('btnCloseSettings');
  const btnSaveSettings = document.getElementById('btnSaveSettings');
  const btnAddCustom = document.getElementById('btnAddCustom');
  const tabPresetEl = document.getElementById('tabPreset');
  const tabCustomEl = document.getElementById('tabCustom');
  const tabEnvfileEl = document.getElementById('tabEnvfile');
  const customListEl = document.getElementById('customList');
  const envEditor = document.getElementById('envEditor');
  const btnSaveEnv = document.getElementById('btnSaveEnv');
  const envSaveStatus = document.getElementById('envSaveStatus');

  let settingsPresets = [];
  let settingsCustom = [];
  let settingsEnvCustom = [];
  let settingsKeys = {};

  function openSettings() {
    settingsOverlay.hidden = false;
    loadSettingsData();
  }

  function closeSettings() {
    settingsOverlay.hidden = true;
  }

  async function loadSettingsData() {
    try {
      const res = await fetch('/api/all-providers');
      const data = await res.json();
      settingsPresets = data.presets || [];
      settingsCustom = data.custom || [];
      settingsEnvCustom = data.envCustom || [];
      // Load saved keys
      const customRes = await fetch('/api/custom-providers');
      const customData = await customRes.json();
      settingsKeys = customData.keys || {};
      renderPresetTab();
      renderCustomList();
    } catch (err) {
      tabPresetEl.innerHTML = '<p style="color:var(--text-secondary)">加载失败</p>';
    }
  }

  function renderPresetTab() {
    tabPresetEl.innerHTML = '';
    settingsPresets.forEach((p) => {
      const card = document.createElement('div');
      card.className = 'provider-card';

      const header = document.createElement('div');
      header.className = 'provider-card-header';
      const name = document.createElement('span');
      name.className = 'provider-card-name';
      name.textContent = p.name;
      header.appendChild(name);

      if (p.hasEnvKey) {
        const badge = document.createElement('span');
        badge.className = 'provider-card-badge env';
        badge.textContent = '.env 已配置';
        header.appendChild(badge);
      } else if (p.hasSavedKey) {
        const badge = document.createElement('span');
        badge.className = 'provider-card-badge';
        badge.textContent = '已保存 Key';
        header.appendChild(badge);
      }
      card.appendChild(header);

      const row = document.createElement('div');
      row.className = 'provider-card-row';
      const keyInput = document.createElement('input');
      keyInput.type = 'password';
      keyInput.className = 'provider-key-input';
      keyInput.placeholder = p.hasEnvKey ? '已通过 .env 配置，可留空' : '输入 API Key';
      keyInput.value = settingsKeys[p.id] || '';
      keyInput.dataset.providerId = p.id;
      keyInput.addEventListener('input', () => {
        settingsKeys[p.id] = keyInput.value.trim();
      });
      row.appendChild(keyInput);

      const testBtn = document.createElement('button');
      testBtn.type = 'button';
      testBtn.className = 'btn-test';
      testBtn.textContent = 'Test';
      testBtn.addEventListener('click', () => {
        const key = keyInput.value.trim() || (p.hasEnvKey ? '__ENV__' : '');
        if (!key) { resultEl.textContent = '请先输入 API Key'; resultEl.className = 'test-result error'; return; }
        runTest(testBtn, resultEl, {
          type: p.type,
          baseUrl: p.baseUrl || '',
          apiKey: key,
          model: (p.models && p.models[0]) || '',
          providerId: p.id,
        });
      });
      row.appendChild(testBtn);
      card.appendChild(row);

      const resultEl = document.createElement('div');
      resultEl.className = 'test-result';
      card.appendChild(resultEl);

      tabPresetEl.appendChild(card);
    });
  }

  function renderCustomList() {
    customListEl.innerHTML = '';

    // Render env-driven compat providers first (from .env, read-only)
    settingsEnvCustom.forEach((ep) => {
      const item = document.createElement('div');
      item.className = 'custom-list-item';

      const info = document.createElement('div');
      info.className = 'custom-list-info';
      const nameEl = document.createElement('div');
      nameEl.className = 'custom-list-name';
      nameEl.textContent = ep.name;
      info.appendChild(nameEl);
      const modelsEl = document.createElement('div');
      modelsEl.className = 'custom-list-models';
      modelsEl.textContent = (ep.models || []).join(', ');
      info.appendChild(modelsEl);
      item.appendChild(info);

      const badge = document.createElement('span');
      badge.className = 'provider-card-badge env';
      badge.textContent = '.env';
      badge.style.flexShrink = '0';

      const resultEl = document.createElement('div');
      resultEl.className = 'test-result';
      resultEl.style.marginTop = '0';
      resultEl.style.marginRight = '0.5rem';

      const testBtn = document.createElement('button');
      testBtn.type = 'button';
      testBtn.className = 'btn-test';
      testBtn.textContent = 'Test';
      testBtn.addEventListener('click', () => {
        runTest(testBtn, resultEl, {
          type: ep.type,
          baseUrl: ep.baseUrl,
          apiKey: '__USE_ENV__',
          model: (ep.models && ep.models[0]) || '',
          providerId: ep.id,
        });
      });

      item.appendChild(resultEl);
      item.appendChild(testBtn);
      item.appendChild(badge);
      customListEl.appendChild(item);
    });

    // Render user-added custom providers
    settingsCustom.forEach((cp, idx) => {
      const item = document.createElement('div');
      item.className = 'custom-list-item';

      const info = document.createElement('div');
      info.className = 'custom-list-info';
      const nameEl = document.createElement('div');
      nameEl.className = 'custom-list-name';
      nameEl.textContent = cp.name;
      info.appendChild(nameEl);
      const modelsEl = document.createElement('div');
      modelsEl.className = 'custom-list-models';
      modelsEl.textContent = (cp.models || []).join(', ');
      info.appendChild(modelsEl);
      item.appendChild(info);

      const resultEl = document.createElement('div');
      resultEl.className = 'test-result';
      resultEl.style.marginTop = '0';
      resultEl.style.marginRight = '0.5rem';

      const testBtn = document.createElement('button');
      testBtn.type = 'button';
      testBtn.className = 'btn-test';
      testBtn.textContent = 'Test';
      testBtn.addEventListener('click', () => {
        runTest(testBtn, resultEl, {
          type: cp.type || 'openai',
          baseUrl: cp.baseUrl,
          apiKey: cp.apiKey,
          model: (cp.models && cp.models[0]) || '',
        });
      });

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'btn-delete-custom';
      delBtn.textContent = '删除';
      delBtn.addEventListener('click', () => {
        settingsCustom.splice(idx, 1);
        renderCustomList();
      });

      item.appendChild(resultEl);
      item.appendChild(testBtn);
      item.appendChild(delBtn);
      customListEl.appendChild(item);
    });

    if (!settingsEnvCustom.length && !settingsCustom.length) {
      customListEl.innerHTML = '<p style="color:var(--text-secondary);font-size:0.8rem">暂无自定义 Provider</p>';
    }
  }

  async function runTest(btn, resultEl, params) {
    btn.disabled = true;
    btn.classList.add('testing');
    btn.textContent = '测试中';
    resultEl.textContent = '';
    resultEl.className = 'test-result';

    try {
      const body = {
        type: params.type,
        baseUrl: params.baseUrl,
        apiKey: params.apiKey,
        model: params.model,
      };
      if (params.providerId) body.providerId = params.providerId;
      // For preset providers using .env key, tell server to use env key
      if (params.apiKey === '__ENV__') {
        body.apiKey = '__USE_ENV__';
      }
      const res = await fetch('/api/test-provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.ok) {
        resultEl.className = 'test-result success';
        resultEl.textContent = `✅ 已连通 · ${data.latencyMs}ms`;
        btn.textContent = 'Test ✓';
      } else {
        resultEl.className = 'test-result error';
        resultEl.textContent = `❌ ${data.message || '连接失败'}`;
        btn.textContent = 'Test';
      }
    } catch (err) {
      resultEl.className = 'test-result error';
      resultEl.textContent = `❌ 请求失败`;
      btn.textContent = 'Test';
    } finally {
      btn.disabled = false;
      btn.classList.remove('testing');
    }
  }

  // Tab switching
  const tabMap = { preset: tabPresetEl, custom: tabCustomEl, envfile: tabEnvfileEl };
  document.querySelectorAll('.settings-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.settings-tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      const target = tabMap[tab.dataset.tab];
      if (target) target.classList.add('active');
      if (tab.dataset.tab === 'envfile') loadEnvFile();
    });
  });

  // .env file editor
  async function loadEnvFile() {
    envEditor.value = '';
    envEditor.placeholder = '加载中...';
    envSaveStatus.textContent = '';
    try {
      const res = await fetch('/api/env');
      const data = await res.json();
      envEditor.value = data.content || '';
      envEditor.placeholder = '# 在此编辑 .env 文件内容';
    } catch (err) {
      envEditor.placeholder = '加载失败';
    }
  }

  btnSaveEnv.addEventListener('click', async () => {
    btnSaveEnv.disabled = true;
    btnSaveEnv.textContent = '保存中...';
    envSaveStatus.textContent = '';
    try {
      const res = await fetch('/api/env', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: envEditor.value }),
      });
      const data = await res.json();
      if (data.ok) {
        envSaveStatus.textContent = '已保存，环境变量已热重载';
        envSaveStatus.style.color = '#0f6e56';
        // Refresh providers since env may have changed
        await fetchProviders();
        fillProviderSelect();
        const session = getCurrentSession();
        if (session) syncProviderModelFromSession(session);
      } else {
        envSaveStatus.textContent = '保存失败: ' + (data.error || '');
        envSaveStatus.style.color = '#a32d2d';
      }
    } catch (err) {
      envSaveStatus.textContent = '保存失败';
      envSaveStatus.style.color = '#a32d2d';
    } finally {
      btnSaveEnv.disabled = false;
      btnSaveEnv.textContent = '保存 .env';
    }
  });

  // Add custom provider
  btnAddCustom.addEventListener('click', () => {
    const name = document.getElementById('cfName').value.trim();
    const type = document.getElementById('cfType').value;
    const baseUrl = document.getElementById('cfBaseUrl').value.trim();
    const apiKey = document.getElementById('cfApiKey').value.trim();
    const modelsRaw = document.getElementById('cfModels').value.trim();
    if (!name || !baseUrl || !apiKey || !modelsRaw) {
      alert('请填写所有字段');
      return;
    }
    const models = modelsRaw.split(',').map(s => s.trim()).filter(Boolean);
    const id = 'custom-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
    settingsCustom.push({ id, name, type, baseUrl, apiKey, models });
    renderCustomList();
    // Clear form
    document.getElementById('cfName').value = '';
    document.getElementById('cfBaseUrl').value = '';
    document.getElementById('cfApiKey').value = '';
    document.getElementById('cfModels').value = '';
  });

  // Save settings
  btnSaveSettings.addEventListener('click', async () => {
    btnSaveSettings.disabled = true;
    btnSaveSettings.textContent = '保存中...';
    try {
      // Clean empty keys
      const cleanKeys = {};
      for (const [k, v] of Object.entries(settingsKeys)) {
        if (v && v.trim()) cleanKeys[k] = v.trim();
      }
      await fetch('/api/custom-providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keys: cleanKeys, custom: settingsCustom }),
      });
      // Refresh provider list
      await fetchProviders();
      fillProviderSelect();
      const session = getCurrentSession();
      if (session) syncProviderModelFromSession(session);
      closeSettings();
    } catch (err) {
      alert('保存失败: ' + err.message);
    } finally {
      btnSaveSettings.disabled = false;
      btnSaveSettings.textContent = '保存';
    }
  });

  btnSettings.addEventListener('click', openSettings);
  btnCloseSettings.addEventListener('click', closeSettings);
  settingsOverlay.addEventListener('click', (e) => {
    if (e.target === settingsOverlay) closeSettings();
  });

  (async function init() {
    await fetchProviders();
    fillProviderSelect();
    loadSessions();
    if (!sessions.length) {
      createSession();
    }
    if (!currentSessionId && sessions.length) {
      const latest = [...sessions].sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt))[0];
      currentSessionId = latest.id;
    }
    if (!currentSessionId) {
      const s = createSession();
      currentSessionId = s.id;
    }
    fillModelSelect(getCurrentSession()?.provider);
    syncProviderModelFromSession(getCurrentSession());
    renderSessionList();
    renderMessages(getCurrentSession());
  })();
})();
