# Playground

本地 Chat 测试页面，用于验证 Generative UI Skill 的 prompt 与 widget 渲染。支持官方 Anthropic API 或兼容 Anthropic 的第三方 API。

## 使用

```bash
npm install
cp .env.example .env
# 编辑 .env，填入 ANTHROPIC_API_KEY；第三方 API 可设 ANTHROPIC_BASE_URL
npm start
```

浏览器打开 http://localhost:3456 ，选择 guidelines 模块，输入测试 prompt（如「解释 JWT 认证流程」）即可。
