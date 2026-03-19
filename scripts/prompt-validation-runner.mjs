import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');

const BASE_URL = process.env.GU_BASE_URL || 'http://127.0.0.1:3456';
const OUT_DIR = process.env.GU_OUT_DIR || join(REPO_ROOT, 'tests', 'manual-validation', '2026-03-19-gemini-3d-batch');
const REQUEST_TIMEOUT_MS = Number(process.env.GU_REQUEST_TIMEOUT_MS || 180000);

const CASES = [
  { id: '01', name: '流程图生成', prompt: '解释 JWT 认证流程' },
  { id: '02', name: '数据图表', prompt: '展示过去 6 个月的 OpenAI 用户增长趋势' },
  { id: '03', name: '交互组件', prompt: '做一个 BMI 计算器' },
  { id: '04', name: '对比图', prompt: '比较 REST 和 GraphQL' },
  { id: '05', name: '无 widget 场景', prompt: '今天天气怎么样' },
  { id: '06', name: '结构图', prompt: '画一下 Kubernetes 的架构' },
  { id: '07', name: '深色模式兼容', prompt: '解释 JWT 认证流程' },
  { id: '08', name: 'CDN 合规', prompt: '做一个 D3.js 的数据可视化' },
  { id: '09', name: '产品功能设计', prompt: '设计一个电商 App 的商品详情页，包含主要功能模块' },
  { id: '10', name: '算法可视化', prompt: '用可视化的方式演示冒泡排序的过程，最好能一步步操作' },
  { id: '11', name: '品牌世界观设定', prompt: '帮我设计一个赛博朋克风格的虚拟咖啡品牌，包括品牌名、视觉风格和菜单概念' },
  { id: '12', name: '复杂策略流程优化', prompt: '分析一个 SaaS 产品从获客到留存的完整用户生命周期，给出优化建议' },
  { id: '13', name: '纯视觉灵感', prompt: '给我一些日式侘寂风格的室内设计灵感，用视觉方式呈现' },
];

const CASES_3D = [
  { id: '14', name: '3D 空间场景', prompt: '用 3D 模型展示太阳系的运行原理' },
  { id: '15A', name: '3D DNA 双螺旋', prompt: '用 3D 展示 DNA 双螺旋结构' },
  { id: '15B', name: 'DNA 复制过程', prompt: '解释 DNA 复制的过程' },
];

const ALL_MODELS = [
  { provider: 'google', model: 'gemini-3.1-pro-preview' },
  { provider: 'anthropic-compat', model: 'claude-opus-4-6' },
  { provider: 'anthropic-compat', model: 'claude-sonnet-4-6' },
  { provider: 'anthropic-compat', model: 'gpt-5.4' },
  { provider: 'kimi-coding', model: 'kimi-k2.5' },
  { provider: 'zhipu', model: 'glm-5' },
  { provider: 'volcengine', model: 'doubao-seed-2-0-pro-260215' },
];

function slugify(input) {
  return input.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
}

function shouldReuseExisting(existing) {
  if (!existing) return false;
  if (existing.ok) return true;
  return !existing.error;
}

function quickCheck(caseId, text) {
  const hasWidget = text.includes('```show-widget');
  const hasThree = /three(\.min)?\.js|window\.THREE|OrbitControls|<canvas/i.test(text);
  if (caseId === '05') {
    return { pass: !hasWidget, summary: hasWidget ? '误输出 widget' : '纯文本回复' };
  }
  if (caseId === '14' || caseId === '15A') {
    const pass = hasWidget && hasThree;
    return { pass, summary: pass ? '包含 show-widget 与 3D 关键特征' : '缺少 show-widget 或 3D 关键特征' };
  }
  if (caseId === '15B') {
    const pass = hasWidget && !hasThree;
    return { pass, summary: pass ? '包含 widget 且未触发 3D' : '未命中 widget，或错误触发 3D' };
  }
  return { pass: hasWidget, summary: hasWidget ? '包含 show-widget' : '未包含 show-widget' };
}

async function callChat({ provider, model, prompt }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const res = await fetch(`${BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider,
      model,
      messages: [{ role: 'user', content: prompt }],
      searchEnabled: false,
    }),
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout));

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 400)}`);
  }

  const decoder = new TextDecoder();
  let raw = '';
  let text = '';
  let streamStatus = 'unknown';
  let error = null;

  for await (const chunk of res.body) {
    raw += decoder.decode(chunk, { stream: true });
    const events = raw.split('\n\n');
    raw = events.pop() || '';
    for (const event of events) {
      const line = event.split('\n').find((item) => item.startsWith('data: '));
      if (!line) continue;
      const payload = line.slice(6);
      if (payload === '[DONE]') continue;
      let data;
      try {
        data = JSON.parse(payload);
      } catch {
        continue;
      }
      if (data.text) text += data.text;
      if (data.stream_status) streamStatus = data.stream_status;
      if (data.error) error = data.error;
    }
  }

  return { text, streamStatus, error };
}

async function runCase(run, group) {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  try {
    const result = await callChat(run);
    const elapsedMs = Date.now() - t0;
    const check = quickCheck(group.id, result.text);
    return {
      ...run,
      caseId: group.id,
      caseName: group.name,
      startedAt,
      elapsedMs,
      ok: !result.error && check.pass,
      check,
      streamStatus: result.streamStatus,
      error: result.error,
      text: result.text,
    };
  } catch (error) {
    return {
      ...run,
      caseId: group.id,
      caseName: group.name,
      startedAt,
      elapsedMs: Date.now() - t0,
      ok: false,
      check: { pass: false, summary: '请求失败' },
      streamStatus: 'failed',
      error: error.message,
      text: '',
    };
  }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const results = [];

  async function loadExisting(base) {
    const path = join(OUT_DIR, `${base}.json`);
    try {
      await access(path);
      const content = await readFile(path, 'utf8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  for (const group of CASES) {
    const run = { provider: 'google', model: 'gemini-3.1-pro-preview', prompt: group.prompt };
    const base = `${group.id}-${slugify(run.provider)}-${slugify(run.model)}`;
    const existing = await loadExisting(base);
    if (shouldReuseExisting(existing)) {
      results.push(existing);
      console.log(`[phase1] ${group.id} ${group.name} -> SKIP (cached)`);
      continue;
    }
    const result = await runCase(run, group);
    results.push(result);
    await writeFile(join(OUT_DIR, `${base}.md`), result.text, 'utf8');
    await writeFile(join(OUT_DIR, `${base}.json`), JSON.stringify(result, null, 2), 'utf8');
    console.log(`[phase1] ${group.id} ${group.name} -> ${result.ok ? 'PASS' : 'FAIL'} (${result.elapsedMs}ms) ${result.check.summary}${result.error ? ` | ${result.error}` : ''}`);
  }

  for (const modelRun of ALL_MODELS) {
    for (const group of CASES_3D) {
      const base = `${group.id}-${slugify(modelRun.provider)}-${slugify(modelRun.model)}`;
      const existing = await loadExisting(base);
      if (shouldReuseExisting(existing)) {
        results.push(existing);
        console.log(`[phase2] ${modelRun.model} ${group.id} ${group.name} -> SKIP (cached)`);
        continue;
      }
      const result = await runCase({ ...modelRun, prompt: group.prompt }, group);
      results.push(result);
      await writeFile(join(OUT_DIR, `${base}.md`), result.text, 'utf8');
      await writeFile(join(OUT_DIR, `${base}.json`), JSON.stringify(result, null, 2), 'utf8');
      console.log(`[phase2] ${modelRun.model} ${group.id} ${group.name} -> ${result.ok ? 'PASS' : 'FAIL'} (${result.elapsedMs}ms) ${result.check.summary}${result.error ? ` | ${result.error}` : ''}`);
    }
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    outDir: OUT_DIR,
    total: results.length,
    passed: results.filter((item) => item.ok).length,
    failed: results.filter((item) => !item.ok).length,
    results: results.map(({ text, ...rest }) => rest),
  };

  await writeFile(join(OUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2), 'utf8');
  console.log(`SUMMARY ${summary.passed}/${summary.total} passed`);
}

await main();
