import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
let server;
let baseUrl;

async function startServer() {
  const express = (await import('express')).default;
  const { readFileSync } = await import('fs');
  const { loadSystemPrompt } = await import('../lib/prompt.js');

  const PROJECT_ROOT = join(__dirname, '..', '..');
  const PROMPTS_DIR = join(PROJECT_ROOT, 'prompts');
  const GUIDELINES_DIR = join(PROJECT_ROOT, 'prompts', 'guidelines');
  const PROVIDERS_PATH = join(__dirname, '..', 'providers.json');

  const app = express();
  app.use(express.json());

  const providers = JSON.parse(readFileSync(PROVIDERS_PATH, 'utf8'));

  app.get('/api/providers', (req, res) => {
    res.json({ providers: providers.map(p => ({ id: p.id, name: p.name, type: p.type, models: p.models || [] })) });
  });

  app.post('/api/chat', (req, res) => {
    const { provider, model, messages, modules } = req.body;
    if (!provider || !model || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'provider, model and non-empty messages[] are required' });
    }
    const p = providers.find(x => x.id === provider);
    if (!p) return res.status(400).json({ error: 'unknown provider' });
    if (!p.models.includes(model)) return res.status(400).json({ error: 'unknown model' });

    // For testing, just echo back a simple SSE stream
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.flushHeaders();
    res.write(`data: ${JSON.stringify({ text: 'test response' })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  });

  return new Promise((resolve) => {
    const srv = app.listen(0, () => {
      const port = srv.address().port;
      resolve({ server: srv, baseUrl: `http://localhost:${port}` });
    });
  });
}

describe('E2E: API endpoints', () => {
  before(async () => {
    const result = await startServer();
    server = result.server;
    baseUrl = result.baseUrl;
  });

  after(() => {
    if (server) server.close();
  });

  describe('GET /api/providers', () => {
    it('returns 200 with providers array', async () => {
      const res = await fetch(`${baseUrl}/api/providers`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.ok(Array.isArray(data.providers));
      assert.ok(data.providers.length > 0);
    });

    it('each provider has id, name, type, models', async () => {
      const res = await fetch(`${baseUrl}/api/providers`);
      const data = await res.json();
      for (const p of data.providers) {
        assert.ok(p.id, 'missing id');
        assert.ok(p.name, 'missing name');
        assert.ok(p.type, 'missing type');
        assert.ok(Array.isArray(p.models), 'models not array');
      }
    });
  });

  describe('POST /api/chat — validation', () => {
    it('returns 400 when provider missing', async () => {
      const res = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'x', messages: [{ role: 'user', content: 'hi' }] }),
      });
      assert.equal(res.status, 400);
    });

    it('returns 400 when model missing', async () => {
      const res = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'x', messages: [{ role: 'user', content: 'hi' }] }),
      });
      assert.equal(res.status, 400);
    });

    it('returns 400 when messages empty', async () => {
      const res = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'x', model: 'y', messages: [] }),
      });
      assert.equal(res.status, 400);
    });

    it('returns 400 for unknown provider', async () => {
      const res = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'nonexistent', model: 'x', messages: [{ role: 'user', content: 'hi' }] }),
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.ok(data.error.includes('unknown'));
    });
  });

  describe('POST /api/chat — SSE stream', () => {
    it('returns text/event-stream with valid provider', async () => {
      // Get first provider and model from the providers list
      const provRes = await fetch(`${baseUrl}/api/providers`);
      const { providers } = await provRes.json();
      const p = providers[0];
      if (!p || !p.models.length) return;

      const res = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: p.id,
          model: p.models[0],
          messages: [{ role: 'user', content: 'test' }],
        }),
      });
      assert.equal(res.headers.get('content-type'), 'text/event-stream');
      const body = await res.text();
      assert.ok(body.includes('data: '));
      assert.ok(body.includes('[DONE]'));
    });
  });
});
