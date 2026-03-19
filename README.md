# Generative UI Skill

[English](./README.md) | [中文](./README_CN.md)

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

Make any chatbot response carry interactive UI components such as charts, architecture diagrams, calculators, and data visualizations. No frontend refactor is required. Any model that can output Markdown can drive it.

## Acknowledgements

The inspiration and core technical references for this project come from the following authors and open-source projects:

- **[@op7418](https://github.com/op7418)** - The article [I Recreated Claude's Newly Released Generative UI Interaction](https://mp.weixin.qq.com/s/3IQIs6zP5jfdTwmT5LUJ6g) helped us recognize early that the code-fence-plus-iframe-isolation approach was technically viable, and it gave this project important direction.
- **[pi-generative-ui](https://github.com/Michaelliv/pi-generative-ui)** by [Michaelliv](https://github.com/Michaelliv) under the MIT License - It reverse-engineered Claude.ai's native `show_widget` implementation, extracted the full Anthropic design guidelines (~72 KB), and reproduced the streaming rendering experience in a terminal agent with morphdom and Glimpse. The design guides in `prompts/guidelines/` in this project are adapted from that extracted material. Reverse-engineering article: [Reverse-engineering Claude's generative UI](https://michaellivs.com/blog/reverse-engineering-claude-generative-ui/)

---

## Background

On March 12, 2026, Anthropic launched generative UI interaction on Claude.ai, allowing models to render interactive HTML/SVG components inline in conversations. Soon after, `pi-generative-ui` produced a relatively complete open-source reproduction of the mechanism, and the `CodePilot` article and implementation also provided valuable engineering inspiration.

The goal of this project is to abstract that capability into a **general-purpose skill**, so every chatbot and AI agent managed by OpenClaw can generate rich UI responses.

---

## Current Release Status

This repository is currently published with the following practical status:

- `main` is the deployable Web Playground line, representing the currently usable outcome of **M1 + M2**.
- `m3/channel-adapters` is the dedicated channel-adapter branch. It already contains **M3a prototype scripts**, but it has **not** completed real channel integration and end-to-end validation for Telegram, Feishu, or other outbound channels.

In other words, the project is already usable today as an open-source local Web Playground, while the multi-channel delivery layer is still under active follow-up development.

---

## Core Architecture

The solution is split into three layers: **Prompt Skill -> Rendering Runtime -> Channel Adapter Layer**, with clear separation between them.

```
┌─────────────────────────────────────────────────────────┐
│                     Any LLM Model                        │
│          (Claude / GPT / Kimi / Seed / ...)             │
└────────────────────────┬────────────────────────────────┘
                         │  Inject System Prompt + Guidelines
                         ▼
┌─────────────────────────────────────────────────────────┐
│              ① Prompt Skill (M1)                        │
│                                                         │
│  The model learns to output HTML/SVG widgets inside     │
│  ```show-widget fences                                  │
│  Modular design guides are loaded on demand             │
│  (diagram / chart / art / ...)                          │
└────────────────────────┬────────────────────────────────┘
                         │  The model streams text that contains
                         │  show-widget fences
                         ▼
┌─────────────────────────────────────────────────────────┐
│              ② Rendering Runtime (M2)                   │
│              @generative-ui/renderer                    │
│                                                         │
│  Streaming fence detection -> HTML sanitization ->      │
│  CSS variable bridging -> rendering                     │
│  Three-stage pipeline: streaming DOM preview ->         │
│  sandbox iframe -> interaction bridge                   │
└────────────────────────┬────────────────────────────────┘
                         │  Standardized widget rendering
                         ▼
┌─────────────────────────────────────────────────────────┐
│              ③ Channel Adapter Layer (M3)               │
│                                                         │
│  Rendering strategy is chosen based on channel          │
│  capabilities:                                          │
│  Web / App -> full rendering pipeline                   │
│  Feishu / Telegram / WeChat -> image + button /         │
│  rich text card / H5                                    │
└─────────────────────────────────────────────────────────┘
```

Key design choices:

- **Code fences instead of `tool_use`** - No dependency on a specific SDK. Any model that can emit Markdown can drive the system.
- **Three-stage rendering pipeline** - Streaming preview for live generation, sandbox iframe for safe execution, and an interaction bridge for drill-down follow-up.
- **Modular design guides** - Adapted from Anthropic's original guidance and loaded only when needed to avoid wasting tokens.

---

## Key Deliverables

### Prompt Skill

The system-prompt injection layer is the foundation of the whole approach. Once enabled, the model knows how to output valid HTML/SVG widgets inside ` ```show-widget ` code fences.

Six design-guide modules are built in and can be freely combined:

| Module | Typical Scenarios |
|------|---------|
| **core** | Structured text explanation: concepts, rules, methods, and bullet summaries |
| **diagram** | Relationships, structures, and flow diagrams such as architecture diagrams, sequence diagrams, and user journeys |
| **chart** | Data charts for trends, comparisons, distributions, and composition |
| **interactive** | Interactive content such as clickable, draggable, or parameter-adjustable demos, simulators, and tools |
| **mockup** | Interfaces, prototypes, and high-fidelity page compositions |
| **art** | Stylized visuals such as illustrations, posters, mood boards, and world-building scenes |

Every topic includes at least `core`, then layers on additional perspectives. A single topic can combine 2 to 4 modules to make the output more multidimensional.

### Rendering Runtime

`@generative-ui/renderer` is a framework-agnostic JavaScript library currently in M2 development. Once included in a frontend app, it can render the HTML/SVG contained in show-widget fences. Core capabilities include:

- Streaming fence detection plus partial JSON extraction
- Two-stage HTML sanitization: strip dangerous tags during streaming, then preserve scripts for execution inside the sandbox at the final stage
- CSS variable bridging: the model writes standard variable names and the bridge maps them to host-specific variables
- Dual renderer modes: iframe isolation mode and morphdom performance mode
- Packaging as a Web Component: `<widget-renderer>`

### Playground

The project includes a complete local testing environment in `playground/` so you can experience Generative UI directly:

```bash
cd playground
cp .env.example .env   # Configure your API key
npm install
npm start              # Then visit http://localhost:3456
```

The playground includes:

- An Express backend with SSE streaming proxy support for OpenAI, Anthropic, and compatible APIs
- A chat UI frontend with streaming fence detection, incremental DOM preview, and sandbox iframe rendering
- Six example widgets in `examples/`: a flowchart, a chart, a calculator, a comparison view, a 3D solar-system scene, and a 3D brewing-process scene

The playground also serves as the prototype validation environment for the M2 rendering runtime. `playground/public/app.js` already verifies the full three-stage rendering pipeline, and M2 is being extracted from that implementation into a reusable library.

### How to Use Playground

This project is open-sourced for self-hosted and local use. There is currently no shared hosted demo with centrally managed API keys.

To use the playground yourself:

1. Clone this repository locally.
2. Install dependencies and start the local server.
3. Open `http://localhost:3456` in your browser.
4. Use the Playground settings UI to configure your provider, API key, and model list.
5. Start testing with your own provider credentials.

Example:

```bash
git clone https://github.com/ai-freer/generative-ui-skill.git
cd generative-ui-skill/playground
npm install
npm start
```

For advanced or repeatable setups, you can also preconfigure `playground/.env` manually from `playground/.env.example`, but that is optional rather than the primary path.

If you want to share it inside your own team, the recommended path is to deploy the playground in your own environment and let each team or deployment manage its own API keys through the UI or environment-based configuration.

---

## Channel Adaptation and Usage

Different message containers have very different rendering capabilities. The project defines four rendering strategies and chooses among them based on what the target channel supports:

| Strategy | Applicable Channels | Method |
|------|---------|------|
| Full rendering | Web (iframe), App (WKWebView) | Complete `@generative-ui/renderer` pipeline with streaming preview and JavaScript interaction |
| Static image + buttons | Feishu, Telegram, WeChat | Render the widget headlessly to PNG and map drill-down actions to native buttons |
| Rich text card | Feishu | Map widget structure into Feishu Message Card JSON |
| H5 redirect | Feishu, Telegram, WeChat | Store the widget at a temporary URL and open it in the built-in browser |

### Web Integration

If you already have a web application, you can integrate the rendering runtime directly:

```html
<script src="@generative-ui/renderer"></script>
<widget-renderer stream="..."></widget-renderer>
```

Or you can use `playground/` as a reference and embed the streaming-rendering logic into your own chat UI.

### Build a Custom Channel Adapter

If you need to integrate Feishu, Telegram, WeChat, or other channels, refer to the architecture design in `architecture/m3-channel-adapters.md` and implement your own channel adapter. Each adapter only needs to:

1. Receive `{ title, widget_code }` parsed by the Widget Interceptor
2. Select a rendering strategy based on channel capabilities
3. Call the corresponding rendering service such as the renderer, screenshot service, card builder, or hosting layer
4. Deliver the final result through the channel API

Adding a new channel only requires adding a new adapter. It does not affect the upstream skill or renderer.

---

## Model Compatibility

| Model | Status | Notes |
|------|---------|------|
| Claude Opus 4.6 | ✅ Tested | Best overall stability in the current validation round |
| Claude Sonnet 4.6 | ✅ Tested | Strong balance between quality and cost |
| GPT-5.4 | ✅ Tested | Completed the current validation set with solid overall results |
| Kimi K2.5 | ✅ Tested | Strong visual quality after serial revalidation |
| Seed 2.0 Pro | ✅ Tested with caveats | Good chart/mockup performance, but still weaker on no-widget restraint |
| GLM-5 | ✅ Tested | Improved noticeably after serial revalidation |
| gemini-3.1-pro-preview | ✅ Tested with caveats | Completed the 13-case validation set plus the 3D supplement; the remaining known issue is still the no-widget weather prompt |

The detailed validation record lives in [`tests/prompt-validation.md`](./tests/prompt-validation.md). The current repository workflow has now covered the 13 main validation cases for Gemini and the 3D supplement (`cases 14 / 15A / 15B`) for all tested models.

### Multi-model Adaptation Strategy

Instruction-following ability varies significantly across models, especially in interaction design such as drill-down and follow-up:

- **Stronger models** such as Claude Opus/Sonnet and GPT-4/5 can independently decide which content is worth expanding, proactively add drill-down interactions to key nodes, and generate follow-up guidance. The prompt only needs to define the principles and the model can decide on its own.
- **Mid-tier models** such as Kimi K2.5 and Seed 2.0 Pro can complete basic widget rendering, but they are weaker at judging what deserves interaction and tend to output static charts.

To address that, the system prompt uses a **layered guidance** strategy:

1. Principle layer - defines the criteria for a "meaningful node" such as terminology, data points, process steps, and comparison items, so stronger models can decide autonomously
2. Fallback bias - "When in doubt, prefer clickable over static", giving mid-tier models a clear behavioral bias
3. Minimum guarantee - requires every widget to include at least 2 to 3 follow-up question buttons at the bottom, so users still have a path to continue even if the model cannot create node-level interaction

---

## CDN Allowlist

Inside widgets, `<script src>` may only load from the following CDNs, enforced by CSP:

- **cdnjs.cloudflare.com** - mainstream libraries such as Chart.js and D3
- **cdn.jsdelivr.net** - npm package CDN
- **unpkg.com** - npm package CDN
- **esm.sh** - ESM-focused CDN

---

## Testing

```bash
cd playground

npm test           # Run all tests
npm run test:unit  # Unit tests only (parser / search / prompt / planner)
npm run test:e2e   # E2E tests plus widget rendering checks
```

---

## Milestones

| Phase | Scope | Status |
|------|------|------|
| M0 | Technical analysis, source research, and project planning | ✅ Done |
| M1 | Prompt Skill creation and validation | ✅ Done (pending model validation) |
| M2 | Rendering runtime library `@generative-ui/renderer` | In progress |
| M3 | Channel adapter layer | Not started |

For the detailed development roadmap, see [DEVELOPMENT.md](./DEVELOPMENT.md). For the channel adaptation architecture, see [architecture/m3-channel-adapters.md](./architecture/m3-channel-adapters.md).

---

## References

- Original article by 歸藏: [I Recreated Claude's Newly Released Generative UI Interaction](https://mp.weixin.qq.com/s/3IQIs6zP5jfdTwmT5LUJ6g)
- Reverse-engineering article: [Reverse-engineering Claude's generative UI](https://michaellivs.com/blog/reverse-engineering-claude-generative-ui/)
- pi-generative-ui repository: https://github.com/Michaelliv/pi-generative-ui (MIT License)
- CodePilot repository: https://github.com/op7418/CodePilot (license not declared)

---

## License

This project is open-sourced under the [Apache License 2.0](./LICENSE).

When using this project, please retain the copyright notice and third-party attribution information in [NOTICE](./NOTICE).
