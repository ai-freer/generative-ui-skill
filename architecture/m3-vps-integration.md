# M3b VPS 联调操作手册

> 目标：在 VPS 上的 OpenClaw 实例中验证 generative-ui Skill 的截图 + 投递链路
> 前置：M3a 脚本已完成（widget-interceptor / widget-screenshot / widget-drilldown）

---

## Step 1：推送代码

```bash
# 本地 MacBook
git add SKILL.md
git commit -m "fix: SKILL.md exec 指令适配 OpenClaw {baseDir} + host:gateway"
git push origin main
```

---

## Step 2：VPS 上安装 Skill

两种方式任选：

### 方式 A：symlink（推荐，方便迭代）

```bash
cd /opt/skills  # 或任意目录
git clone https://github.com/ai-freer/generative-ui-skill.git
# 后续更新：cd generative-ui-skill && git pull origin main

# symlink 到 OpenClaw skills 目录
ln -s /opt/skills/generative-ui-skill ~/.openclaw/workspace/skills/generative-ui
```

或用 `extraDirs` 配置（不需要 symlink）：

```jsonc
// ~/.openclaw/openclaw.json
{ "skills": { "load": { "extraDirs": ["/opt/skills"] } } }
```

### 方式 B：clawhub（如果已发布到 Hub）

```bash
clawhub install generative-ui
```

---

## Step 3：配置 Chrome CDP

```bash
# 确认 Chrome 已开启 CDP
curl -s http://localhost:9222/json/version

# 如果没有，启动：
google-chrome --headless --remote-debugging-port=9222 --no-sandbox &

# 设置环境变量（加到 ~/.openclaw/.env 或系统 profile）
echo 'CHROME_CDP_URL=http://localhost:9222' >> ~/.openclaw/.env
```

---

## Step 4：安装 Playwright 客户端（仅首次）

Playwright 是连接 Chrome CDP 的 Node.js SDK，不包含浏览器本身。Chrome/Chromium 的安装和 CDP 端口开放是 OpenClaw 运维层面的前置条件，不属于 Skill 职责。

```bash
cd /opt/skills/generative-ui-skill
npm install playwright-core
# playwright-core 只含 CDP 客户端 SDK，不下载浏览器二进制
```

> 前置条件：VPS 上已有 Chrome 实例并开启 CDP（`--remote-debugging-port=9222`）

---

## Step 5：SSH 远程验证（确认 Skill 脚本 + CDP 链路通畅）

通过 SSH 登录 VPS，手动跑脚本确认截图管线正常工作，再进入 Telegram 端到端测试。

```bash
export CHROME_CDP_URL=http://localhost:9222

# 5a. 验证 CDP 连接 + 截图管线
node scripts/widget-screenshot.mjs --file examples/jwt-flow.html --output /tmp/test.png
ls -la /tmp/test.png  # 应有文件，大小 > 0

# 5b. 验证围栏解析
echo '```show-widget
{"title":"test","widget_code":"<div>hello</div>"}
```' | node scripts/widget-interceptor.mjs
# 预期输出：{ hasWidget: true, widgets: [...], plainText: "" }

# 5c. 验证 drill-down 提取
echo '<rect onclick="window.__widgetSendMessage('"'"'详细介绍'"'"')" />' | node scripts/widget-drilldown.mjs
# 预期输出：{ count: 1, drillDowns: [...], telegram: [...], feishu: {...} }
```

> 如果 Step 5 全部通过，说明 Skill 脚本和 CDP 链路正常，可以进入 Telegram 端到端测试。

---

## Step 6：Telegram 端到端测试

在 Telegram 中向 bot 发送以下消息，观察结果：

| # | 输入 | 预期结果 | 状态 |
|---|------|---------|------|
| 1 | "解释 JWT 认证流程" | 文字回复 + SVG 流程图 PNG | ⬜ |
| 2 | "展示过去 6 个月的用户增长趋势" | 文字回复 + Chart.js 图表 PNG | ⬜ |
| 3 | "比较 REST 和 GraphQL" | 文字回复 + 对比图 PNG + drill-down 按钮 | ⬜ |
| 4 | 普通问题（无 widget） | 正常文字消息，不触发截图 | ⬜ |
| 5 | 一条消息包含多个 widget | 文字 + 多张图片依次发送 | ⬜ |
| 6 | 点击 drill-down 按钮 | 触发追问，agent 生成新回复 | ⬜ |

---

## 故障排查

| 问题 | 排查方法 |
|------|---------|
| exec 找不到脚本 | 检查 `{baseDir}` 是否正确解析：在 agent 对话中让它 `exec: ls {baseDir}/scripts/` |
| CDP 连接失败 | `curl http://localhost:9222/json/version`，确认 Chrome 进程在跑 |
| renderer import 失败 | `packages/renderer/dist/index.js` 已随 git 提交，确认 `git pull` 后文件存在 |
| Playwright 找不到 | `npm ls playwright` 或检查 npx cache |
| 截图空白 / 报错 | 先用 `--file` 模式测试静态 HTML，排除 widget 解析问题 |
| Agent 不调用截图脚本 | 检查 SKILL.md 是否被正确加载到 system prompt（让 agent 复述截图流程） |
| 图片发送失败 | 确认 send action 的 `media` 参数是有效的本地文件路径 |
| 环境变量不可见 | 确认 exec 使用 `host: gateway`（非 sandbox），或在 sandbox docker env 中配置 |

---

## 后续步骤

- [x] Step 5 SSH 远程验证通过
- [x] Step 6 Telegram 端到端通过
- [x] S4b message_sending Plugin Hook（widget-fence-cleaner）
- [x] 飞书截图 + PNG 发送调通
- [ ] M3c Aight WKWebView 集成
