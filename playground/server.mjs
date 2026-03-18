import dotenv from 'dotenv';
import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { searchWeb } from './lib/search.js';
import { loadSystemPrompt, MODULE_FILES } from './lib/prompt.js';
import { detectTruncation, runPlanner } from './lib/planner.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '.env') });
const PROJECT_ROOT = join(__dirname, '..');
const PROMPTS_DIR = join(PROJECT_ROOT, 'prompts');
const GUIDELINES_DIR = join(PROJECT_ROOT, 'prompts', 'guidelines');

function ts() {
  return new Date().toISOString().slice(11, 23);  // HH:mm:ss.SSS
}
function log(...args) {
  console.log(`[${ts()}]`, ...args);
}
const PROVIDERS_PATH = join(__dirname, 'providers.json');
const CUSTOM_PROVIDERS_PATH = join(__dirname, 'custom-providers.json');

function loadCustomProviders() {
  if (!existsSync(CUSTOM_PROVIDERS_PATH)) return { keys: {}, presetModels: {}, custom: [] };
  try {
    const data = JSON.parse(readFileSync(CUSTOM_PROVIDERS_PATH, 'utf8'));
    return {
      keys: data.keys || {},
      presetModels: data.presetModels || {},
      custom: data.custom || [],
    };
  } catch (_) {
    return { keys: {}, presetModels: {}, custom: [] };
  }
}

function saveCustomProviders(data) {
  writeFileSync(CUSTOM_PROVIDERS_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function loadProviders() {
  const raw = readFileSync(PROVIDERS_PATH, 'utf8');
  const providers = JSON.parse(raw);
  const customData = loadCustomProviders();

  // Resolve modelsEnv: providers that read model list from env (e.g. OpenRouter)
  for (const p of providers) {
    if (p.modelsEnv && !p.models) {
      const envVal = process.env[p.modelsEnv];
      p.models = envVal ? envVal.split(',').map(s => s.trim()).filter(Boolean) : [];
    }
    if (customData.presetModels?.[p.id]?.length) {
      p.models = customData.presetModels[p.id];
    }
  }

  // Apply frontend-provided API keys for preset providers
  for (const p of providers) {
    if (customData.keys[p.id]) {
      // Store in process.env so getAvailableProviders() picks it up
      if (!process.env[p.apiKeyEnv]) {
        process.env[p.apiKeyEnv] = customData.keys[p.id];
      }
    }
  }

  // Anthropic-compatible proxy (fully env-driven)
  const acKey = process.env.ANTHROPIC_COMPAT_API_KEY;
  const acUrl = process.env.ANTHROPIC_COMPAT_BASE_URL;
  const acModels = process.env.ANTHROPIC_COMPAT_MODELS;
  if (acKey && acUrl && acModels) {
    providers.push({
      id: 'anthropic-compat',
      name: process.env.ANTHROPIC_COMPAT_NAME || 'Anthropic 兼容',
      type: 'anthropic',
      baseUrl: acUrl,
      apiKeyEnv: 'ANTHROPIC_COMPAT_API_KEY',
      models: acModels.split(',').map(s => s.trim()).filter(Boolean),
    });
  }

  // OpenAI-compatible proxy (fully env-driven)
  const ocKey = process.env.OPENAI_COMPAT_API_KEY;
  const ocUrl = process.env.OPENAI_COMPAT_BASE_URL;
  const ocModels = process.env.OPENAI_COMPAT_MODELS;
  if (ocKey && ocUrl && ocModels) {
    providers.push({
      id: 'openai-compat',
      name: process.env.OPENAI_COMPAT_NAME || 'OpenAI 兼容',
      type: 'openai',
      baseUrl: ocUrl,
      apiKeyEnv: 'OPENAI_COMPAT_API_KEY',
      models: ocModels.split(',').map(s => s.trim()).filter(Boolean),
    });
  }

  // Append user-defined custom providers
  for (const cp of customData.custom || []) {
    providers.push({
      id: cp.id,
      name: cp.name,
      type: cp.type || 'openai',
      baseUrl: cp.baseUrl,
      apiKeyEnv: `__CUSTOM_${cp.id}`,
      models: cp.models || [],
      _customApiKey: cp.apiKey,
    });
    // Inject key into process.env for getAvailableProviders()
    if (cp.apiKey) process.env[`__CUSTOM_${cp.id}`] = cp.apiKey;
  }

  return providers;
}

function getAvailableProviders() {
  const all = loadProviders();
  return all.filter((p) => {
    const key = process.env[p.apiKeyEnv];
    return key && key.trim().length > 0 && p.models && p.models.length > 0;
  });
}

// Provider-specific extra headers (e.g. Kimi Coding requires coding-agent UA)
function getProviderHeaders(providerId) {
  if (providerId === 'kimi-coding') return { 'User-Agent': 'claude-code/1.0' };
  return {};
}

// --- Web Search Tool Schemas ---

const SERPER_API_KEY = process.env.SERPER_API_KEY || '';

const WEB_SEARCH_TOOL_ANTHROPIC = {
  name: 'gu_web_lookup',
  description: 'Search the web for current information. Use this when you need up-to-date facts, product details, news, or any information you are not confident about. Provide a concise search query with key terms, not the full user question.',
  input_schema: {
    type: 'object',
    properties: { query: { type: 'string', description: 'A concise search query with key terms' } },
    required: ['query'],
  },
};

const WEB_SEARCH_TOOL_OPENAI = {
  type: 'function',
  function: {
    name: 'gu_web_lookup',
    description: 'Search the web for current information. Use this when you need up-to-date facts, product details, news, or any information you are not confident about. Provide a concise search query with key terms, not the full user question.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: 'A concise search query with key terms' } },
      required: ['query'],
    },
  },
};

const app = express();
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));
app.use('/lib/renderer', express.static(join(__dirname, '..', 'packages', 'renderer', 'dist')));

app.get('/api/providers', (req, res) => {
  try {
    const available = getAvailableProviders();
    const providers = available.map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      models: p.models || [],
    }));
    res.json({ providers });
  } catch (err) {
    res.status(500).json({ error: err.message || String(err) });
  }
});

// Return ALL preset providers (including those without keys) for settings UI
app.get('/api/all-providers', (req, res) => {
  try {
    const raw = readFileSync(PROVIDERS_PATH, 'utf8');
    const presets = JSON.parse(raw);
    const customData = loadCustomProviders();

    // Resolve modelsEnv for display
    for (const p of presets) {
      if (p.modelsEnv && !p.models) {
        const envVal = process.env[p.modelsEnv];
        p.models = envVal ? envVal.split(',').map(s => s.trim()).filter(Boolean) : [];
      }
    }

    const result = presets.map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      apiKeyEnv: p.apiKeyEnv,
      baseUrl: p.baseUrl || '',
      models: customData.presetModels?.[p.id]?.length ? customData.presetModels[p.id] : (p.models || []),
      hasEnvKey: !!(process.env[p.apiKeyEnv] && process.env[p.apiKeyEnv].trim()),
      hasSavedKey: !!customData.keys[p.id],
    }));

    // Also include env-driven compat providers (Anthropic compat, OpenAI compat)
    const envCompat = [];
    const acKey = process.env.ANTHROPIC_COMPAT_API_KEY;
    const acUrl = process.env.ANTHROPIC_COMPAT_BASE_URL;
    const acModels = process.env.ANTHROPIC_COMPAT_MODELS;
    if (acUrl && acModels) {
      envCompat.push({
        id: 'anthropic-compat',
        name: process.env.ANTHROPIC_COMPAT_NAME || 'Anthropic 兼容',
        type: 'anthropic',
        apiKeyEnv: 'ANTHROPIC_COMPAT_API_KEY',
        baseUrl: acUrl,
        models: acModels.split(',').map(s => s.trim()).filter(Boolean),
        hasEnvKey: !!(acKey && acKey.trim()),
        hasSavedKey: !!customData.keys['anthropic-compat'],
      });
    }
    const ocKey = process.env.OPENAI_COMPAT_API_KEY;
    const ocUrl = process.env.OPENAI_COMPAT_BASE_URL;
    const ocModels = process.env.OPENAI_COMPAT_MODELS;
    if (ocUrl && ocModels) {
      envCompat.push({
        id: 'openai-compat',
        name: process.env.OPENAI_COMPAT_NAME || 'OpenAI 兼容',
        type: 'openai',
        apiKeyEnv: 'OPENAI_COMPAT_API_KEY',
        baseUrl: ocUrl,
        models: ocModels.split(',').map(s => s.trim()).filter(Boolean),
        hasEnvKey: !!(ocKey && ocKey.trim()),
        hasSavedKey: !!customData.keys['openai-compat'],
      });
    }

    res.json({ presets: result, custom: customData.custom || [], envCustom: envCompat });
  } catch (err) {
    res.status(500).json({ error: err.message || String(err) });
  }
});

app.get('/api/custom-providers', (req, res) => {
  try {
    const data = loadCustomProviders();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message || String(err) });
  }
});

app.post('/api/custom-providers', (req, res) => {
  try {
    const { keys, presetModels, custom } = req.body;
    const data = loadCustomProviders();
    if (keys && typeof keys === 'object') data.keys = { ...data.keys, ...keys };
    if (presetModels && typeof presetModels === 'object') data.presetModels = presetModels;
    if (Array.isArray(custom)) data.custom = custom;
    saveCustomProviders(data);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message || String(err) });
  }
});

const ENV_PATH = join(__dirname, '.env');

app.get('/api/env', (req, res) => {
  try {
    const content = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, 'utf8') : '';
    res.json({ content });
  } catch (err) {
    res.status(500).json({ error: err.message || String(err) });
  }
});

app.post('/api/env', (req, res) => {
  try {
    const { content } = req.body;
    if (typeof content !== 'string') {
      return res.status(400).json({ error: 'content must be a string' });
    }
    writeFileSync(ENV_PATH, content, 'utf8');
    // Reload env vars into process.env
    dotenv.config({ path: ENV_PATH, override: true });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message || String(err) });
  }
});

app.post('/api/test-provider', async (req, res) => {
  let { type, baseUrl, apiKey, model, providerId } = req.body;
  if (!model) {
    return res.status(400).json({ ok: false, message: '需要提供模型名称' });
  }
  // Resolve env-based key for preset providers
  if (apiKey === '__USE_ENV__' && providerId) {
    // Search in all providers (including env-driven compat providers)
    const all = loadProviders();
    const provider = all.find(p => p.id === providerId);
    if (provider) {
      const envKey = process.env[provider.apiKeyEnv] || provider._customApiKey;
      if (envKey) {
        apiKey = envKey;
        if (!type) type = provider.type;
        if (!baseUrl && provider.baseUrl) baseUrl = provider.baseUrl;
      } else {
        return res.status(400).json({ ok: false, message: 'ENV 中未找到对应 API Key' });
      }
    } else {
      return res.status(400).json({ ok: false, message: '未找到对应 Provider' });
    }
  }
  if (!apiKey) {
    return res.status(400).json({ ok: false, message: '需要提供 API Key' });
  }
  const start = Date.now();
  try {
    if (type === 'anthropic') {
      const client = new Anthropic(baseUrl ? { apiKey, baseURL: baseUrl } : { apiKey });
      const resp = await client.messages.create({
        model, max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi' }],
      });
      const latencyMs = Date.now() - start;
      const text = resp.content?.map(b => b.text || '').join('') || '';
      res.json({ ok: true, latencyMs, message: `连通正常`, reply: text.slice(0, 50) });
    } else {
      // OpenAI-compatible
      const url = `${(baseUrl || '').replace(/\/$/, '')}/chat/completions`;
      const extraHeaders = providerId ? getProviderHeaders(providerId) : {};
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          ...extraHeaders,
        },
        body: JSON.stringify({
          model, max_tokens: 10,
          messages: [{ role: 'user', content: 'Hi' }],
        }),
      });
      const latencyMs = Date.now() - start;
      if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        throw new Error(`${resp.status} ${errText.slice(0, 200)}`);
      }
      const data = await resp.json();
      const text = data.choices?.[0]?.message?.content || '';
      res.json({ ok: true, latencyMs, message: `连通正常`, reply: text.slice(0, 50) });
    }
  } catch (err) {
    const latencyMs = Date.now() - start;
    const msg = (err.message || String(err))
      .replace(/\b[A-Za-z0-9_-]{20,}\b/g, '[REDACTED]')
      .replace(/\bsk-[A-Za-z0-9_-]+/g, 'sk-[REDACTED]');
    res.json({ ok: false, latencyMs, message: msg.slice(0, 300) });
  }
});

app.post('/api/chat', async (req, res) => {
  const { provider: providerId, model, messages = [], searchEnabled = false } = req.body;
  const modules = Object.keys(MODULE_FILES);
  if (!providerId || !model || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'provider, model and non-empty messages[] are required' });
  }

  const all = loadProviders();
  const provider = all.find((p) => p.id === providerId);
  if (!provider) {
    return res.status(400).json({ error: 'unknown provider' });
  }
  const apiKey = process.env[provider.apiKeyEnv];
  if (!apiKey || !apiKey.trim()) {
    return res.status(500).json({ error: `API key for ${provider.name} is not set (${provider.apiKeyEnv})` });
  }
  if (!provider.models.includes(model)) {
    return res.status(400).json({ error: `model ${model} is not in provider models list` });
  }

  const systemPrompt = loadSystemPrompt(PROMPTS_DIR, GUIDELINES_DIR, modules, { providerId, model });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Disable Nagle algorithm so small SSE chunks are sent immediately
  if (res.socket) res.socket.setNoDelay(true);

  let chunkCount = 0;
  const sendChunk = (text) => {
    if (text) {
      chunkCount++;
      if (chunkCount === 1) log('[stream] first text chunk sent');
      fullStreamedText += text;
      res.write(`data: ${JSON.stringify({ text })}\n\n`);
    }
  };
  const sendEvent = (obj) => {
    res.write(`data: ${JSON.stringify(obj)}\n\n`);
  };
  const redactKeys = (s) => {
    if (typeof s !== 'string') return s;
    return s
      .replace(/\b[A-Za-z0-9_-]{20,}\b/g, '[REDACTED]')
      .replace(/\bsk-[A-Za-z0-9_-]+/g, 'sk-[REDACTED]');
  };
  const sendError = (err) => {
    const msg = redactKeys(err.message || String(err));
    res.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
  };

  // Track all streamed text to detect truncated widget fences
  let fullStreamedText = '';

  try {
    const useSearch = searchEnabled && !!SERPER_API_KEY;

    if (provider.type === 'anthropic') {
      const anthropic = new Anthropic(
        provider.baseUrl ? { apiKey, baseURL: provider.baseUrl } : { apiKey }
      );
      const anthropicMessages = messages.map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      }));

      // Tool-use loop: model may call gu_web_lookup, we execute it and continue
      const MAX_TOOL_ROUNDS = 5;
      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const reqParams = {
          model,
          max_tokens: 32768,
          system: systemPrompt,
          messages: anthropicMessages,
        };
        if (useSearch) reqParams.tools = [WEB_SEARCH_TOOL_ANTHROPIC];

        log(`[anthropic] round=${round} model=${model} useSearch=${useSearch}`);
        const stream = await anthropic.messages.stream(reqParams);

        let stopReason = 'end_turn';
        const assistantContent = [];
        let currentToolInput = '';
        let currentToolId = '';
        let currentToolName = '';
        let currentTextBlock = '';

        for await (const event of stream) {
          if (event.type === 'content_block_start') {
            if (event.content_block?.type === 'tool_use') {
              currentToolId = event.content_block.id;
              currentToolName = event.content_block.name;
              currentToolInput = '';
              log(`[anthropic] tool_use started: ${currentToolName}`);
            } else if (event.content_block?.type === 'text') {
              currentTextBlock = '';
            }
          } else if (event.type === 'content_block_delta') {
            if (event.delta?.type === 'text_delta') {
              sendChunk(event.delta.text);
              currentTextBlock += event.delta.text;
            } else if (event.delta?.type === 'input_json_delta') {
              currentToolInput += event.delta.partial_json || '';
            }
          } else if (event.type === 'content_block_stop') {
            if (currentToolName && currentToolId) {
              let parsedInput = {};
              try { parsedInput = JSON.parse(currentToolInput); } catch (_) {}
              assistantContent.push({
                type: 'tool_use',
                id: currentToolId,
                name: currentToolName,
                input: parsedInput,
              });
              log(`[anthropic] tool_use complete: query="${parsedInput.query}"`);
              currentToolId = '';
              currentToolName = '';
              currentToolInput = '';
            } else if (currentTextBlock) {
              assistantContent.push({ type: 'text', text: currentTextBlock });
              currentTextBlock = '';
            }
          } else if (event.type === 'message_delta') {
            if (event.delta?.stop_reason) stopReason = event.delta.stop_reason;
          }
        }

        log(`[anthropic] round=${round} stopReason=${stopReason} blocks=${assistantContent.length}`);

        if (stopReason === 'tool_use') {
          const toolBlocks = assistantContent.filter(b => b.type === 'tool_use');
          if (!toolBlocks.length) {
            log('[anthropic] stop_reason=tool_use but no tool block found, breaking');
            break;
          }

          // Execute ALL tool calls in parallel and collect results
          toolBlocks.forEach(tb => sendEvent({ searching: tb.input?.query || '' }));
          const toolResults = await Promise.all(toolBlocks.map(async (toolBlock) => {
            const query = toolBlock.input?.query || '';
            log(`[anthropic] searching: "${query}"`);
            let searchResult;
            try {
              searchResult = await searchWeb(query, SERPER_API_KEY);
              log(`[anthropic] search result length: ${searchResult.length}`);
            } catch (err) {
              searchResult = `Search failed: ${err.message}`;
              log(`[anthropic] search error:`, err.message);
            }
            return {
              type: 'tool_result',
              tool_use_id: toolBlock.id,
              content: searchResult,
            };
          }));

          // Append assistant message + ALL tool_results to continue the conversation
          anthropicMessages.push({ role: 'assistant', content: assistantContent });
          anthropicMessages.push({ role: 'user', content: toolResults });
          // Continue loop — but if this is the last round, do a final call without tools
          if (round === MAX_TOOL_ROUNDS - 1) {
            log(`[anthropic] tool loop exhausted (${MAX_TOOL_ROUNDS} rounds), forcing final call without tools`);
            const finalClient = new Anthropic(provider.baseUrl ? { apiKey, baseURL: provider.baseUrl } : { apiKey });
            const finalStream = await finalClient.messages.stream({
              model, max_tokens: 32768, system: systemPrompt, messages: anthropicMessages,
            });
            for await (const event of finalStream) {
              if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
                sendChunk(event.delta.text);
              }
            }
            log(`[anthropic] final (no-tools) done`);
          }
        } else {
          // No tool call or end_turn — we're done
          break;
        }
      }
    } else if (provider.type === 'openai') {
      const openaiMessages = [
        { role: 'system', content: systemPrompt },
        ...messages.map((m) => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content || (m.role === 'assistant' ? '...' : ''),
        })),
      ];
      const baseURL = (provider.baseUrl || '').replace(/\/$/, '');

      // Helper: stream one round of OpenAI-compatible API via SDK
      async function openaiStreamRound(client, msgs, tools) {
        const reqParams = { model, messages: msgs, max_tokens: 32768, stream: true };
        if (tools) reqParams.tools = tools;
        const stream = await client.chat.completions.create(reqParams);
        let assistantText = '';
        let reasoningText = '';
        let toolCallId = '';
        let toolCallName = '';
        let toolCallArgs = '';
        let finishReason = 'stop';
        for await (const chunk of stream) {
          const choice = chunk.choices?.[0];
          if (!choice) continue;
          if (choice.delta?.content) {
            sendChunk(choice.delta.content);
            assistantText += choice.delta.content;
          }
          if (choice.delta?.reasoning_content) {
            reasoningText += choice.delta.reasoning_content;
          }
          const tc = choice.delta?.tool_calls?.[0];
          if (tc) {
            if (tc.id) toolCallId = tc.id;
            if (tc.function?.name) toolCallName = tc.function.name;
            if (tc.function?.arguments) toolCallArgs += tc.function.arguments;
          }
          if (choice.finish_reason) finishReason = choice.finish_reason;
        }
        return { assistantText, reasoningText, toolCallId, toolCallName, toolCallArgs, finishReason };
      }

      // Helper: stream one round via raw fetch (for volcengine etc.)
      async function fetchStreamRound(url, headers, msgs, tools) {
        const body = { model, messages: msgs, max_tokens: 32768, stream: true };
        if (tools) body.tools = tools;
        const resp = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        });
        if (!resp.ok) {
          const errText = await resp.text();
          throw new Error(`API ${resp.status}: ${errText.slice(0, 500)}`);
        }
        const reader = resp.body;
        const dec = new TextDecoder();
        let buf = '';
        let assistantText = '';
        let reasoningText = '';
        let toolCallId = '';
        let toolCallName = '';
        let toolCallArgs = '';
        let finishReason = 'stop';
        for await (const chunk of reader) {
          buf += dec.decode(chunk, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop() || '';
          for (const line of lines) {
            // Support both "data: {...}" and "data:{...}" (no space)
            let payload;
            if (line.startsWith('data: ')) {
              payload = line.slice(6);
            } else if (line.startsWith('data:')) {
              payload = line.slice(5);
            } else {
              continue;
            }
            if (payload === '[DONE]' || payload.trim() === '[DONE]') continue;
            try {
              const data = JSON.parse(payload);
              const choice = data.choices?.[0];
              if (!choice) continue;
              const content = choice.delta?.content;
              if (content) { sendChunk(content); assistantText += content; }
              if (choice.delta?.reasoning_content) {
                reasoningText += choice.delta.reasoning_content;
              }
              const tc = choice.delta?.tool_calls?.[0];
              if (tc) {
                if (tc.id) toolCallId = tc.id;
                if (tc.function?.name) toolCallName = tc.function.name;
                if (tc.function?.arguments) toolCallArgs += tc.function.arguments;
              }
              if (choice.finish_reason) finishReason = choice.finish_reason;
            } catch (_) {}
          }
        }
        return { assistantText, reasoningText, toolCallId, toolCallName, toolCallArgs, finishReason };
      }

      const tools = useSearch ? [WEB_SEARCH_TOOL_OPENAI] : undefined;
      const MAX_TOOL_ROUNDS = 5;

      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        let result;
        if (providerId === 'volcengine' || providerId === 'zhipu') {
          // volcengine and zhipu use raw fetch (zhipu's reasoning_content breaks OpenAI SDK)
          const url = `${baseURL}/chat/completions`;
          const headers = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json', ...getProviderHeaders(providerId) };
          result = await fetchStreamRound(url, headers, openaiMessages, tools);
        } else if (providerId === 'kimi-coding') {
          // Kimi Coding requires coding-agent User-Agent to pass access check
          const url = `${baseURL}/chat/completions`;
          const headers = {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            ...getProviderHeaders(providerId),
          };
          result = await fetchStreamRound(url, headers, openaiMessages, tools);
        } else {
          const openai = new OpenAI({ apiKey, baseURL: baseURL || undefined });
          result = await openaiStreamRound(openai, openaiMessages, tools);
        }

        if (result.finishReason === 'tool_calls' && result.toolCallName === 'gu_web_lookup') {
          log(`[openai] round=${round} tool_call detected, reasoning=${result.reasoningText?.length || 0} text=${result.assistantText?.length || 0}`);
          let parsedArgs = {};
          try { parsedArgs = JSON.parse(result.toolCallArgs); } catch (_) {}
          const query = parsedArgs.query || '';
          sendEvent({ searching: query });

          let searchResult;
          try {
            searchResult = await searchWeb(query, SERPER_API_KEY);
          } catch (err) {
            searchResult = `Search failed: ${err.message}`;
          }

          // Build assistant message with tool_call for conversation history
          const assistantMsg = { role: 'assistant', content: result.assistantText || null };
          if (result.reasoningText) assistantMsg.reasoning_content = result.reasoningText;
          assistantMsg.tool_calls = [{
            id: result.toolCallId,
            type: 'function',
            function: { name: 'gu_web_lookup', arguments: result.toolCallArgs },
          }];
          openaiMessages.push(assistantMsg);
          openaiMessages.push({
            role: 'tool',
            tool_call_id: result.toolCallId,
            content: searchResult,
          });
          // Continue loop — but if this is the last round, do a final call without tools
          if (round === MAX_TOOL_ROUNDS - 1) {
            log(`[openai] tool loop exhausted (${MAX_TOOL_ROUNDS} rounds), forcing final call without tools`);
            let finalResult;
            if (providerId === 'volcengine' || providerId === 'zhipu' || providerId === 'kimi-coding') {
              const url = `${baseURL}/chat/completions`;
              const headers = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json', ...getProviderHeaders(providerId) };
              finalResult = await fetchStreamRound(url, headers, openaiMessages, undefined);
            } else {
              const openai = new OpenAI({ apiKey, baseURL: baseURL || undefined });
              finalResult = await openaiStreamRound(openai, openaiMessages, undefined);
            }
            log(`[openai] final (no-tools) done: finishReason=${finalResult.finishReason} textLen=${finalResult.assistantText?.length || 0}`);
          }
        } else {
          log(`[openai] round=${round} done: finishReason=${result.finishReason} textLen=${result.assistantText?.length || 0} reasoningLen=${result.reasoningText?.length || 0}`);
          break;
        }
      }
    } else {
      sendError(new Error(`unsupported provider type: ${provider.type}`));
    }
    log(`[stream] done, total chunks=${chunkCount}`);

    // Detect truncated widget fences — retry once, then fall back to Planner
    const truncated = fullStreamedText && detectTruncation(fullStreamedText);
    log(`[stream] truncation check: ${truncated ? 'TRUNCATED' : 'OK — no truncation'}`);
    sendEvent({ stream_status: truncated ? 'truncated' : 'complete' });

    if (truncated) {
      // --- Retry once before Planner (network flakes are cheap to retry) ---
      log('[stream] attempting retry before planner fallback');
      sendEvent({ retrying: true });

      let retryText = '';
      let retryTruncated = true;
      try {
        const retryMessages = messages.map((m) => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content,
        }));
        if (provider.type === 'anthropic') {
          const rc = new Anthropic(provider.baseUrl ? { apiKey, baseURL: provider.baseUrl } : { apiKey });
          const rs = await rc.messages.stream({
            model, max_tokens: 32768, system: systemPrompt, messages: retryMessages,
          });
          for await (const ev of rs) {
            if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
              retryText += ev.delta.text;
            }
          }
        } else {
          // OpenAI-compatible: use raw fetch for providers needing custom headers or non-standard SSE
          const baseURL = (provider.baseUrl || '').replace(/\/$/, '');
          const fetchHeaders = {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            ...getProviderHeaders(providerId),
          };
          const retryMsgs = [{ role: 'system', content: systemPrompt }, ...retryMessages];
          const resp = await fetch(`${baseURL}/chat/completions`, {
            method: 'POST',
            headers: fetchHeaders,
            body: JSON.stringify({ model, messages: retryMsgs, max_tokens: 32768, stream: true }),
          });
          if (!resp.ok) {
            const errText = await resp.text();
            throw new Error(`${resp.status} ${errText.slice(0, 300)}`);
          }
          const dec = new TextDecoder();
          let buf = '';
          for await (const chunk of resp.body) {
            buf += dec.decode(chunk, { stream: true });
            const lines = buf.split('\n');
            buf = lines.pop() || '';
            for (const line of lines) {
              let payload;
              if (line.startsWith('data: ')) payload = line.slice(6);
              else if (line.startsWith('data:')) payload = line.slice(5);
              else continue;
              if (payload === '[DONE]' || payload.trim() === '[DONE]') continue;
              try {
                const data = JSON.parse(payload);
                const c = data.choices?.[0]?.delta?.content;
                if (c) retryText += c;
              } catch (_) {}
            }
          }
        }
        retryTruncated = detectTruncation(retryText);
        log(`[stream] retry: ${retryTruncated ? 'still truncated' : 'SUCCESS'}, len=${retryText.length}`);
      } catch (err) {
        log('[stream] retry failed:', err.message);
      }

      if (!retryTruncated && retryText) {
        // Retry succeeded — send complete content to frontend
        log('[stream] retry succeeded, replacing truncated content');
        sendEvent({ retry_success: true, content: retryText });
        fullStreamedText = retryText;
      } else {
        // Retry also truncated — invoke Planner
        log('[stream] retry still truncated, invoking planner');
        sendEvent({ truncated: true });

        const userRequest = messages[messages.length - 1]?.content || '';
        const originalMessages = messages.map((m) => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content,
        }));

        let callModel, callModelStream;

        if (provider.type === 'anthropic') {
          const anthropic = new Anthropic(
            provider.baseUrl ? { apiKey, baseURL: provider.baseUrl } : { apiKey }
          );
          callModel = async (msgs, sys) => {
            const resp = await anthropic.messages.create({
              model, max_tokens: 16384, system: sys, messages: msgs,
            });
            return resp.content.map(b => b.text || '').join('');
          };
          callModelStream = async (msgs, sys) => {
            const stream = await anthropic.messages.stream({
              model, max_tokens: 16384, system: sys, messages: msgs,
            });
            let text = '';
            for await (const event of stream) {
              if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
                text += event.delta.text;
              }
            }
            return text;
          };
        } else {
          // OpenAI-compatible: use raw fetch for custom headers and non-standard SSE
          const baseURL = (provider.baseUrl || '').replace(/\/$/, '');
          const fetchHeaders = {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            ...getProviderHeaders(providerId),
          };
          const parseFetchSSE = async (respBody) => {
            const dec = new TextDecoder();
            let buf = '';
            let text = '';
            for await (const chunk of respBody) {
              buf += dec.decode(chunk, { stream: true });
              const lines = buf.split('\n');
              buf = lines.pop() || '';
              for (const line of lines) {
                let payload;
                if (line.startsWith('data: ')) payload = line.slice(6);
                else if (line.startsWith('data:')) payload = line.slice(5);
                else continue;
                if (payload === '[DONE]' || payload.trim() === '[DONE]') continue;
                try {
                  const data = JSON.parse(payload);
                  const c = data.choices?.[0]?.delta?.content || data.choices?.[0]?.message?.content;
                  if (c) text += c;
                } catch (_) {}
              }
            }
            return text;
          };
          callModel = async (msgs, sys) => {
            const resp = await fetch(`${baseURL}/chat/completions`, {
              method: 'POST', headers: fetchHeaders,
              body: JSON.stringify({ model, max_tokens: 16384, messages: [{ role: 'system', content: sys }, ...msgs] }),
            });
            if (!resp.ok) throw new Error(`${resp.status} ${(await resp.text()).slice(0, 300)}`);
            const data = await resp.json();
            return data.choices?.[0]?.message?.content || '';
          };
          callModelStream = async (msgs, sys) => {
            const resp = await fetch(`${baseURL}/chat/completions`, {
              method: 'POST', headers: fetchHeaders,
              body: JSON.stringify({ model, max_tokens: 16384, stream: true, messages: [{ role: 'system', content: sys }, ...msgs] }),
            });
            if (!resp.ok) throw new Error(`${resp.status} ${(await resp.text()).slice(0, 300)}`);
            return parseFetchSSE(resp.body);
          };
        }

        try {
          const plannerResult = await runPlanner({
            callModel, callModelStream, systemPrompt,
            originalMessages, truncatedText: fullStreamedText,
            userRequest, sendEvent, log,
          });
          if (plannerResult) {
            sendEvent({ planner_content: plannerResult });
          }
        } catch (err) {
          log('[planner] error:', err.message);
          sendEvent({ planner_error: err.message });
        }
      }
    }

    // Detect which guideline modules were actually used in the output.
    // Each detector targets patterns unique to that module's output type.
    const fc = fullStreamedText || '';
    const usedModules = ['core'];
    const hasSvg = /<svg[\s>]/i.test(fc);
    const hasThreeJs = /THREE\.|three\.module|OrbitControls|three(?:\.min)?\.js/i.test(fc);
    const hasChartJs = /new\s+Chart\s*\(|Chart\.js\/[\d.]+\/chart/i.test(fc);
    const hasUiComponents = /var\(--color-|var\(--border-radius|<input[\s>]|<select[\s>]|<textarea[\s>]|type=["']range["']/i.test(fc);
    // Art: SVG with organic shapes / layered fills, no structural diagram markers
    const hasDiagramMarkers = /<rect[\s>]|<line[\s>]|marker-end|<foreignObject/i.test(fc);
    const hasArtMarkers = /<ellipse[\s>]|<circle[\s>]|opacity=["']0\.\d/i.test(fc);
    if (hasSvg && !hasThreeJs && hasDiagramMarkers) usedModules.push('diagram');
    if (hasSvg && !hasThreeJs && hasArtMarkers && !hasDiagramMarkers) usedModules.push('art');
    if (hasChartJs) usedModules.push('chart');
    if (hasUiComponents) usedModules.push('interactive');
    if (hasThreeJs) usedModules.push('3d');
    res.write(`event: modules_used\ndata: ${JSON.stringify([...new Set(usedModules)])}\n\n`);

    res.write('data: [DONE]\n\n');
  } catch (err) {
    log(`[stream] error:`, err.message);
    sendError(err);
  } finally {
    res.end();
  }
});

const PORT = process.env.PORT || 3456;
app.listen(PORT, () => {
  log(`Playground: http://localhost:${PORT} (set PORT to override)`);
});
