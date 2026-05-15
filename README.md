# Agent Reverse

Agent Reverse 是一个本地 Agent 协议抓包查看器，用来把 Claude Code、VS Code Copilot、Anthropic Messages、OpenAI Responses / Chat 风格的请求 JSON 拆解成更容易阅读的对话时间线、工具列表和原始结构。

项目当前以静态页面为主，不需要后端服务。打开 `viewer.html` 后，可以选择内置样本，也可以上传自己的 JSON 抓包文件进行分析。

## 功能

- 事件时间线：按原始对话顺序展示 `messages` / `input` 中的用户、助手、系统、工具调用和工具返回。
- 工具列表：从请求的 `tools` 字段提取工具声明，单独展示在时间线下方。
- 详情面板：点击任意事件或工具后查看可读文本、Raw JSON、请求配置示意和统计信息。
- 协议识别：自动判断 Claude Code、VS Code Copilot、Anthropic Messages、OpenAI Responses / Chat 等常见结构。
- 上下文提取：识别 system prompt、tool use / tool result、MCP 工具、Skill、Agent / Subagent 等信息。
- 原始 JSON：可切换查看完整请求 JSON。
- 移动端适配：窄屏下自动切换为单列布局，方便在手机或小窗口中查看。

## 目录结构

```text
.
├── viewer.html                  # 静态查看器入口
├── assets/
│   ├── protocol-viewer.js        # 协议解析、事件归一化和页面渲染逻辑
│   └── protocol-viewer.css       # 页面布局和响应式样式
├── vendor/
│   └── marked.min.js             # Markdown 渲染依赖
├── claude-code/                  # Claude Code 示例抓包
├── vs-code-copilot/              # VS Code Copilot 示例抓包
├── other/                        # Anthropic / 其他格式示例
└── docs/                         # 设计文档和实现说明
```

## 使用方式

建议通过本地静态服务打开，这样内置样本可以正常通过 `fetch` 加载：

```bash
python -m http.server 8765
```

然后访问：

```text
http://127.0.0.1:8765/viewer.html
```

如果不启动本地服务，也可以直接打开 `viewer.html`，再通过页面上的“选择 JSON”上传本地抓包文件。

## 支持的数据结构

查看器主要面向 LLM / Agent 请求 JSON，优先识别这些字段：

- `system`：系统提示词或系统内容块。
- `messages`：Anthropic Messages / OpenAI Chat 风格对话数组。
- `input`：OpenAI Responses 风格输入数组。
- `tools`：工具定义列表。
- `tool_calls`：OpenAI Chat 风格工具调用。
- `tool_use` / `tool_result`：Anthropic 风格工具调用与返回。

工具名称中包含 `__` 时，会按 MCP 工具名进行拆分展示，例如 `server__tool`。

## 抓包来源

仓库内保留了一些样本 JSON，便于对比不同客户端的请求形态：

- `claude-code/session_zh.json`
- `claude-code/session_en.json`
- `vs-code-copilot/session_zh.json`
- `vs-code-copilot/session_en.json`
- `other/anthropic_*.json`

实际抓包可以来自 mitmproxy、浏览器开发者工具、代理日志或客户端调试输出。只要最终能保存为 JSON 文件，就可以通过查看器导入。

## 说明

这个项目关注的是“看清 Agent 请求里到底塞了什么”：模型、系统提示词、上下文注入、工具 schema、MCP、Skill、Agent 调度入口，以及每轮消息和工具结果之间的关系。它不会执行请求，也不会把数据发送到远端。
