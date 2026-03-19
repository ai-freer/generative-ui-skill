// Planner module: detects truncated widgets and orchestrates multi-step generation.
// Provider-agnostic — accepts a `callModel(messages, system)` function that returns
// the full assistant text (non-streaming, used for planning/assembly).

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLANNER_PROMPT_PATH = join(__dirname, '..', '..', 'prompts', 'planner.md');

let _plannerPrompt = null;
function getPlannerPrompt() {
  if (!_plannerPrompt) {
    try { _plannerPrompt = readFileSync(PLANNER_PROMPT_PATH, 'utf8'); }
    catch (_) { _plannerPrompt = FALLBACK_PLANNER_PROMPT; }
  }
  return _plannerPrompt;
}

const FALLBACK_PLANNER_PROMPT = `You are a widget planner. Your job is to decompose a complex widget request into smaller sub-tasks that can each be generated independently and then assembled.`;
const THREE_JS_RE = /<canvas[\s>]|THREE\.|three(?:\.min)?\.js|OrbitControls/i;

// --- Detection ---

/**
 * Check if streamed text contains an unclosed show-widget fence (truncated widget).
 */
export function detectTruncation(streamedText) {
  return analyzeTruncation(streamedText).truncated;
}

function extractJsonStringValue(text, key) {
  const keyIdx = text.indexOf(`"${key}"`);
  if (keyIdx === -1) return null;
  let pos = keyIdx + key.length + 2;
  while (pos < text.length && (text[pos] === ' ' || text[pos] === ':')) pos++;
  if (pos >= text.length || text[pos] !== '"') return null;
  pos++;
  let result = '';
  while (pos < text.length) {
    const ch = text[pos];
    if (ch === '\\' && pos + 1 < text.length) {
      const next = text[pos + 1];
      if (next === '"') { result += '"'; pos += 2; }
      else if (next === '\\') { result += '\\'; pos += 2; }
      else if (next === 'n') { result += '\n'; pos += 2; }
      else if (next === 't') { result += '\t'; pos += 2; }
      else if (next === '/') { result += '/'; pos += 2; }
      else if (next === 'r') { result += '\r'; pos += 2; }
      else if (next === 'u' && pos + 5 < text.length) {
        const hex = text.slice(pos + 2, pos + 6);
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

export function analyzeTruncation(streamedText) {
  const fenceRe = /```(?:show-widget|show_widget)/gi;
  let lastFenceStart = -1;
  let m;
  while ((m = fenceRe.exec(streamedText)) !== null) lastFenceStart = m.index;
  if (lastFenceStart === -1) {
    return { truncated: false, widgetCode: null, is3D: false };
  }

  // Check if there's a valid closing fence after the last opening
  const afterFence = streamedText.slice(lastFenceStart + 3);
  const nl = afterFence.indexOf('\n');
  const bodyStart = lastFenceStart + 3 + (nl === -1 ? afterFence.length : nl + 1);
  const closeRe = /```/g;
  closeRe.lastIndex = bodyStart;
  while ((m = closeRe.exec(streamedText)) !== null) {
    const body = streamedText.slice(bodyStart, m.index).trim();
    try {
      const obj = JSON.parse(body);
      if (obj && typeof obj.widget_code === 'string') {
        return {
          truncated: false,
          widgetCode: obj.widget_code,
          is3D: THREE_JS_RE.test(obj.widget_code),
        };
      }
    } catch (_) { continue; }
  }
  const partialBody = nl === -1 ? '' : afterFence.slice(nl + 1);
  const widgetCode = extractJsonStringValue(partialBody, 'widget_code');
  return {
    truncated: true,
    widgetCode,
    is3D: widgetCode ? THREE_JS_RE.test(widgetCode) : THREE_JS_RE.test(partialBody),
  };
}

// --- Phase 1: Plan ---

const PLAN_SYSTEM_SUFFIX = `

IMPORTANT: You are now in PLANNER MODE. Do NOT generate any widget code.

The previous attempt to generate a widget was truncated because the output was too long.
You must decompose the original request into smaller sub-tasks.

Respond with ONLY a JSON object (no markdown, no explanation):
{
  "summary": "Brief description of the overall widget",
  "tasks": [
    {
      "id": "unique-kebab-case-id",
      "description": "What this sub-task should generate",
      "type": "svg|html",
      "estimated_lines": 50
    }
  ],
  "assembly": "merge|separate",
  "layout": "vertical|grid|tabs",
  "shared_state": ["variableName"]
}

Rules:
- Each task should produce a widget_code fragment of ≤150 lines
- "assembly": "merge" when sub-tasks need shared JS state or cross-references; "separate" when they are independent
- "layout": how to arrange the fragments — "vertical" (stacked), "grid" (side by side), "tabs" (tabbed view)
- "shared_state": JS variable names that multiple fragments need to read/write (empty array if separate)
- Keep tasks to 2-5 items. Fewer is better.
- Each task description must be specific enough that a model can generate it independently
`;

const PROGRESSIVE_3D_PLAN_SUFFIX = `

IMPORTANT: The truncated widget is a Three.js 3D scene and must be recovered in a progressive-rendering-friendly shape.

Additional 3D planning rules:
- Task 1 MUST be the 3D shell only: canvas, controls container, CDN scripts, global shared vars, init(), animate(), and the first init() call
- The shell task must end immediately after the first \`if (window.THREE && THREE.OrbitControls) init();\`
- Later tasks must generate scene-construction fragments that append AFTER the shell as top-level statements
- Do NOT put the full scene assembly inside init()
- Prefer 3-5 tasks for complex architecture/mechanical scenes: shell, terrain/base, primary structures, secondary structures/details, labels/interactions
- Use "assembly": "merge" for 3D scenes
- Include shared_state for global vars used across fragments (for example: scene, camera, renderer, controls, clickTargets, updateLabels)
`;

/**
 * Ask the model to decompose the request into sub-tasks.
 * @param {Function} callModel - async (messages, systemPrompt) => string
 * @param {string} systemPrompt - the original widget system prompt
 * @param {Array} originalMessages - the conversation messages
 * @param {string} truncatedText - the truncated output from the first attempt
 * @returns {Object} plan - { summary, tasks, assembly, layout, shared_state }
 */
export async function planTasks(callModel, systemPrompt, originalMessages, truncatedText, options = {}) {
  const planSystem =
    systemPrompt +
    PLAN_SYSTEM_SUFFIX +
    (options.plannerMode === 'progressive3d' ? PROGRESSIVE_3D_PLAN_SUFFIX : '');

  // Build messages: original conversation + info about the truncation
  const messages = [
    ...originalMessages,
    {
      role: 'assistant',
      content: truncatedText,
    },
    {
      role: 'user',
      content: 'The widget output above was truncated — it was too long to generate in one pass. Please decompose this into smaller sub-tasks that can each be generated independently. Respond with the JSON plan only.',
    },
  ];

  const response = await callModel(messages, planSystem);

  // Extract JSON from response (model might wrap in ```json ... ```)
  const jsonStr = response.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  const plan = JSON.parse(jsonStr);

  // Validate
  if (!Array.isArray(plan.tasks) || plan.tasks.length === 0) {
    throw new Error('Planner returned no tasks');
  }
  if (!plan.assembly) plan.assembly = 'merge';
  if (!plan.layout) plan.layout = 'vertical';
  if (!plan.shared_state) plan.shared_state = [];

  return plan;
}

// --- Phase 2: Execute sub-tasks ---

function buildSubTaskPrompt(task, plan, userRequest, options = {}) {
  const taskText = `${task.id} ${task.description}`.toLowerCase();
  const is3D = options.plannerMode === 'progressive3d';
  const isShellTask = is3D && /(shell|bootstrap|base-scene|scene-shell)/.test(taskText);
  const modeRules = !is3D ? '' : isShellTask ? `

3D SHELL RULES:
- Generate only the runnable shell
- Stop immediately after the first \`if (window.THREE && THREE.OrbitControls) init();\`
- Do NOT include heavy \`scene.add(...)\` content beyond minimal lights/camera/controls inside init()
- Define shared globals at top level so later fragments can append to them
` : `

3D FRAGMENT RULES:
- Generate only scene-construction code that belongs after the shell
- Assume \`scene\`, \`camera\`, \`renderer\`, \`controls\` and shared_state globals already exist
- Do NOT emit duplicate CDN scripts or a second init()
- Prefer adding visible geometry early in the fragment instead of deferring all \`scene.add(...)\` calls to the very end
`;
  return `You are generating ONE fragment of a larger widget. Here is the overall plan:

Overall goal: ${plan.summary}
Your task: ${task.description} (id: "${task.id}", type: ${task.type})
Layout: The fragments will be assembled in "${plan.layout}" layout.
Assembly: "${plan.assembly}"${plan.shared_state.length ? `\nShared state variables: ${plan.shared_state.join(', ')}` : ''}

Other tasks in this plan (for context, do NOT generate these):
${plan.tasks.filter(t => t.id !== task.id).map(t => `- ${t.id}: ${t.description}`).join('\n')}

RULES:
- Generate ONLY the widget_code for YOUR task — a self-contained HTML/SVG fragment
- Use the standard show-widget code fence format
- Keep output under 150 lines of HTML/SVG
- Do NOT wrap in DOCTYPE, html, head, or body tags
- If assembly is "merge" and shared_state is defined, reference those variables (they will exist in the assembled scope)
- For "merge" assembly: do NOT include <style> blocks that could conflict — use inline styles or unique class prefixes (use your task id as prefix, e.g. ".${task.id}-card")
- For "separate" assembly: you may include <style> blocks freely
${modeRules}

Original user request: "${userRequest}"`;
}

/**
 * Execute a single sub-task. Streams the result via onChunk callback.
 * @param {Function} callModelStream - async (messages, system, onChunk) => fullText
 * @param {string} systemPrompt - the original widget system prompt
 * @param {Object} task - { id, description, type }
 * @param {Object} plan - the full plan object
 * @param {string} userRequest - the original user message
 * @returns {Object} { id, widget_code, fullText }
 */
export async function executeSubTask(callModelStream, systemPrompt, task, plan, userRequest, options = {}) {
  const subTaskInstruction = buildSubTaskPrompt(task, plan, userRequest, options);
  const system = systemPrompt + '\n\n' + subTaskInstruction;

  const messages = [
    { role: 'user', content: userRequest },
  ];

  const fullText = await callModelStream(messages, system);

  // Extract widget_code from the response
  const widget_code = extractWidgetCode(fullText);

  return { id: task.id, widget_code, fullText };
}

/**
 * Extract widget_code from a model response containing a show-widget fence.
 * Falls back to extracting partial code if the fence is incomplete.
 */
function extractWidgetCode(text) {
  // Try complete fence first
  const fenceRe = /```(?:show-widget|show_widget)\s*\n([\s\S]*?)```/i;
  const match = text.match(fenceRe);
  if (match) {
    const body = match[1].trim();
    try {
      const obj = JSON.parse(body);
      if (obj && typeof obj.widget_code === 'string') return obj.widget_code;
    } catch (_) {}
  }

  // Try partial extraction
  return extractJsonStringValue(text, 'widget_code');
}

// --- Phase 3: Assemble ---

function buildAssemblePrompt(plan, fragments, options = {}) {
  const fragmentList = fragments.map(f => {
    return `### Fragment: ${f.id}\n\`\`\`html\n${f.widget_code}\n\`\`\``;
  }).join('\n\n');
  const modeRules = options.plannerMode !== 'progressive3d' ? '' : `
- Preserve the shell fragment first, with the first \`if (window.THREE && THREE.OrbitControls) init();\` kept near the top
- Append later 3D fragments after that shell boundary as top-level statements
- Do NOT move scene-building code back inside init()
- Keep visible geometry additions early in the merged scene code when possible
`;

  return `You are assembling multiple widget fragments into one final widget.

Plan summary: ${plan.summary}
Layout: ${plan.layout}
Shared state: ${plan.shared_state.length ? plan.shared_state.join(', ') : 'none'}

Here are the fragments to assemble:

${fragmentList}

RULES:
- Combine all fragments into a single widget_code using the show-widget code fence format
- Layout "${plan.layout}":
  - "vertical": stack fragments top to bottom with 16px gap
  - "grid": use CSS grid, 2 columns on wide screens, 1 on narrow
  - "tabs": create a tab bar at the top, each fragment is a tab panel
- If shared_state variables are listed, ensure they are declared once at the top of the <script> and all fragments reference them
- Deduplicate any shared <style> rules
- Keep the wrapper minimal — don't re-generate the fragment content, just wrap and connect them
- The final output must be a single show-widget code fence with valid JSON
- Do NOT add explanatory text — output ONLY the code fence
${modeRules}`;
}

/**
 * Assemble sub-task fragments into a final combined widget.
 * @param {Function} callModel - async (messages, system) => string
 * @param {string} systemPrompt - the original widget system prompt
 * @param {Object} plan - the plan object
 * @param {Array} fragments - [{ id, widget_code }]
 * @returns {string} assembled widget_code
 */
export async function assembleWidgets(callModel, systemPrompt, plan, fragments, options = {}) {
  const assembleInstruction = buildAssemblePrompt(plan, fragments, options);
  const system = systemPrompt + '\n\n' + assembleInstruction;

  const messages = [
    { role: 'user', content: 'Assemble the widget fragments into the final combined widget.' },
  ];

  const response = await callModel(messages, system);
  const widget_code = extractWidgetCode(response);

  if (!widget_code) {
    // Fallback: simple vertical concatenation
    return fragments.map(f => f.widget_code).join('\n<hr style="border:none;border-top:1px solid var(--color-border-tertiary);margin:16px 0">\n');
  }

  return widget_code;
}

// --- Orchestrator ---

/**
 * Run the full planner pipeline: plan → execute sub-tasks → assemble.
 * Emits progress events via the sendEvent callback.
 *
 * @param {Object} opts
 * @param {Function} opts.callModel - async (messages, system) => string (non-streaming)
 * @param {Function} opts.callModelStream - async (messages, system, onChunk?) => string (streaming, onChunk optional)
 * @param {string} opts.systemPrompt
 * @param {Array} opts.originalMessages - conversation history
 * @param {string} opts.truncatedText - the truncated output
 * @param {string} opts.userRequest - the last user message
 * @param {Function} opts.sendEvent - (obj) => void, sends SSE event to frontend
 * @param {Function} opts.log - logging function
 * @returns {string} final widget content (text + widget fences) to save in session
 */
export async function runPlanner(opts) {
  const {
    callModel, callModelStream, systemPrompt, originalMessages,
    truncatedText, userRequest, sendEvent, log, plannerMode = 'default',
  } = opts;

  // Phase 1: Plan
  sendEvent({ planning: true });
  log('[planner] Phase 1: planning tasks');

  let plan;
  try {
    plan = await planTasks(callModel, systemPrompt, originalMessages, truncatedText, { plannerMode });
  } catch (err) {
    log('[planner] planning failed:', err.message);
    sendEvent({ planning_failed: err.message });
    return null;
  }

  log(`[planner] plan: ${plan.tasks.length} tasks, assembly=${plan.assembly}, layout=${plan.layout}`);
  sendEvent({ plan: { summary: plan.summary, tasks: plan.tasks.map(t => ({ id: t.id, description: t.description })), assembly: plan.assembly, layout: plan.layout } });

  // Phase 2: Execute sub-tasks
  const fragments = [];
  for (let i = 0; i < plan.tasks.length; i++) {
    const task = plan.tasks[i];
    sendEvent({ subtask_start: { id: task.id, description: task.description, index: i, total: plan.tasks.length } });
    log(`[planner] Phase 2: executing task ${i + 1}/${plan.tasks.length} — ${task.id}`);

    try {
      const result = await executeSubTask(callModelStream, systemPrompt, task, plan, userRequest, { plannerMode });
      if (result.widget_code) {
        fragments.push({ id: task.id, widget_code: result.widget_code });
        sendEvent({ subtask_done: { id: task.id, widget_code: result.widget_code } });
        log(`[planner] task ${task.id} done, widget_code length=${result.widget_code.length}`);
      } else {
        log(`[planner] task ${task.id} produced no widget_code`);
        sendEvent({ subtask_done: { id: task.id, widget_code: null, error: 'No widget code generated' } });
      }
    } catch (err) {
      log(`[planner] task ${task.id} failed:`, err.message);
      sendEvent({ subtask_done: { id: task.id, widget_code: null, error: err.message } });
    }
  }

  if (fragments.length === 0) {
    log('[planner] no fragments produced');
    return null;
  }

  // Phase 3: Assemble (if merge mode and multiple fragments)
  let finalWidgetCode;
  if (plan.assembly === 'separate' || fragments.length === 1) {
    // No assembly needed — each fragment is independent
    finalWidgetCode = null; // frontend renders them separately
    log('[planner] separate mode, skipping assembly');
  } else {
    sendEvent({ assembling: true });
    log('[planner] Phase 3: assembling fragments');
    try {
      finalWidgetCode = await assembleWidgets(callModel, systemPrompt, plan, fragments, { plannerMode });
      sendEvent({ assembled: { widget_code: finalWidgetCode } });
      log(`[planner] assembly done, final length=${finalWidgetCode.length}`);
    } catch (err) {
      log('[planner] assembly failed:', err.message);
      // Fallback: send fragments as separate widgets
      finalWidgetCode = fragments.map(f => f.widget_code).join('\n');
      sendEvent({ assembled: { widget_code: finalWidgetCode, fallback: true } });
    }
  }

  // Build the content string to save in session
  // Extract any text before the truncated fence from the original output
  const fenceRe = /```(?:show-widget|show_widget)/gi;
  let lastFenceStart = -1;
  let m;
  while ((m = fenceRe.exec(truncatedText)) !== null) lastFenceStart = m.index;
  const textBefore = lastFenceStart > 0 ? truncatedText.slice(0, lastFenceStart) : '';

  if (finalWidgetCode) {
    // Merged: one widget fence
    const fenceJson = JSON.stringify({ title: 'widget', widget_code: finalWidgetCode });
    return textBefore + '```show-widget\n' + fenceJson + '\n```';
  } else {
    // Separate: multiple widget fences
    let content = textBefore;
    for (const f of fragments) {
      const fenceJson = JSON.stringify({ title: f.id, widget_code: f.widget_code });
      content += '```show-widget\n' + fenceJson + '\n```\n\n';
    }
    return content.trim();
  }
}
