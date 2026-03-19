# Generative UI — 安装指南

本文档供 Agent 读取并执行安装操作。

---

## 1. 安装 Skill

将本目录注册为 OpenClaw Skill。选择以下任一方式：

### 方式 A：symlink（推荐，方便 git pull 迭代）

```bash
ln -s <本目录的绝对路径> ~/.openclaw/workspace/skills/generative-ui
```

### 方式 B：extraDirs 配置

在 `~/.openclaw/openclaw.json` 中添加本目录的父目录：

```jsonc
{ "skills": { "load": { "extraDirs": ["<本目录的父目录>"] } } }
```

验证：确认 `SKILL.md` 能被 OpenClaw 加载（skill 列表中出现 `generative-ui`）。

---

## 2. 安装 Playwright 客户端

截图脚本依赖 `playwright-core` 作为 Chrome CDP 客户端 SDK（不含浏览器二进制）。

```bash
cd <本目录>
npm install playwright-core
```

> 前置条件：VPS 上已有 Chrome 实例并开启 CDP（`--remote-debugging-port=9222`）。
> Chrome 的安装和 CDP 端口开放不属于本 Skill 职责。

---

## 3. 配置环境变量

截图脚本通过 `CHROME_CDP_URL` 连接已有的 Chrome 实例。

```bash
# 添加到 ~/.openclaw/.env（推荐）
echo 'CHROME_CDP_URL=http://localhost:9222' >> ~/.openclaw/.env
```

或在 `~/.openclaw/openclaw.json` 中为本 Skill 配置：

```jsonc
{
  "skills": {
    "entries": {
      "generative-ui": {
        "env": { "CHROME_CDP_URL": "http://localhost:9222" }
      }
    }
  }
}
```

验证：

```bash
curl -s http://localhost:9222/json/version
# 应返回 Chrome 版本信息
```

---

## 4. 安装 Plugin Hook（可选，推荐）

`extensions/widget-fence-cleaner/` 是一个 `message_sending` Plugin Hook，在消息发送前将 `show-widget` 围栏替换为 `[📊 title]` 占位符，防止用户看到原始 HTML 代码。

```bash
# 将 plugin 目录复制或 symlink 到 OpenClaw extensions 目录
cp -r <本目录>/extensions/widget-fence-cleaner ~/.openclaw/extensions/widget-fence-cleaner

# 或 symlink
ln -s <本目录>/extensions/widget-fence-cleaner ~/.openclaw/extensions/widget-fence-cleaner
```

验证：重启 OpenClaw 后，plugin 列表中出现 `widget-fence-cleaner`。

---

## 5. 验证安装

```bash
export CHROME_CDP_URL=http://localhost:9222
cd <本目录>

# 验证截图管线
node scripts/widget-screenshot.mjs --file examples/jwt-flow.html --output ./imagine/test.png
ls -la ./imagine/test.png  # 应有文件，大小 > 0

# 验证围栏解析
echo '```show-widget
{"title":"test","widget_code":"<div>hello</div>"}
```' | node scripts/widget-interceptor.mjs
# 预期：{ hasWidget: true, widgets: [...] }

# 验证 drill-down 提取
echo '<rect onclick="window.__widgetSendMessage('"'"'详细介绍'"'"')" />' | node scripts/widget-drilldown.mjs
# 预期：{ count: 1, drillDowns: [...] }
```

全部通过后，在 Telegram/飞书中向 bot 发送可视化请求（如"解释 JWT 认证流程"），确认收到文字 + PNG 图片。
