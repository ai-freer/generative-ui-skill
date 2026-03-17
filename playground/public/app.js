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
          if (eventType === 'modules') {
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

      // Try each candidate ``` as the closing fence; pick the first one that yields valid JSON
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
          // This ``` is inside the JSON string, try the next one
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

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
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

  function inlineFmt(s) {
    return s
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/~~(.+?)~~/g, '<del>$1</del>')
      .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>')
      .replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
  }

  function blockMarkdown(text) {
    var lines = text.split('<br>');
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

      // Try each candidate ``` as the closing fence; pick the first one that yields valid JSON
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
          // This ``` is inside the JSON string, try the next one
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

  (async function init() {
    await fetchProviders();
    fillProviderSelect();
    loadSessions();
    if (!sessions.length) {
      createSession();
    }
    if (!currentSessionId && sessions.length) {
      currentSessionId = sessions[0].id;
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
