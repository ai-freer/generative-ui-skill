import 'dotenv/config';
import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const PROMPTS_DIR = join(PROJECT_ROOT, 'prompts');
const GUIDELINES_DIR = join(PROJECT_ROOT, 'prompts', 'guidelines');

const MODULE_FILES = {
  core: ['core.md'],
  diagram: ['color-palette.md', 'svg-setup.md', 'diagram.md'],
  chart: ['ui-components.md', 'color-palette.md', 'chart.md'],
  interactive: ['ui-components.md', 'color-palette.md'],
  mockup: ['ui-components.md', 'color-palette.md'],
  art: ['svg-setup.md', 'art.md'],
};

function loadSystemPrompt(modules = ['core', 'diagram']) {
  const systemPath = join(PROMPTS_DIR, 'system.md');
  let text = readFileSync(systemPath, 'utf8');
  const seen = new Set();
  const modList = Array.isArray(modules) && modules.length ? modules : ['core', 'diagram'];
  if (!modList.includes('core')) modList.unshift('core');
  for (const mod of modList) {
    const files = MODULE_FILES[mod];
    if (!files) continue;
    for (const file of files) {
      if (seen.has(file)) continue;
      seen.add(file);
      const path = join(GUIDELINES_DIR, file);
      try {
        text += '\n\n' + readFileSync(path, 'utf8');
      } catch (_) {
        // skip missing
      }
    }
  }
  return text;
}

const app = express();
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

app.post('/api/chat', async (req, res) => {
  const { message, modules = ['core', 'diagram'] } = req.body;
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message is required' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN is not set' });
  }

  const clientOptions = { apiKey };
  if (process.env.ANTHROPIC_BASE_URL) {
    clientOptions.baseURL = process.env.ANTHROPIC_BASE_URL;
  }
  const anthropic = new Anthropic(clientOptions);
  const systemPrompt = loadSystemPrompt(modules);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
    const stream = await anthropic.messages.stream({
      model,
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: 'user', content: message }],
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
        const chunk = event.delta.text;
        if (chunk) res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
      }
    }
    res.write('data: [DONE]\n\n');
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message || String(err) })}\n\n`);
  } finally {
    res.end();
  }
});

const PORT = process.env.PORT || 3456;
app.listen(PORT, () => {
  console.log(`Playground: http://localhost:${PORT} (set PORT to override)`);
});
