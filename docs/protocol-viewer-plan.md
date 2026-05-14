# Agent 对话协议可视化预览工具方案

## 目标

构建一个本地可运行的可视化预览工具，用来学习和拆解不同 AI 编程客户端、不同模型厂商的对话协议抓包。

这个工具的核心目标不是简单格式化 JSON，而是帮助理解：

- 请求发送给模型前是如何组装的
- system、developer、user、assistant 消息分别放在哪里
- 工具是如何声明、调用、返回结果的
- MCP 工具是如何被编码进协议的
- skill 是如何被注入、描述或关联的
- agent / subagent 能力是如何暴露给模型的
- OpenAI 风格协议和 Anthropic 风格协议有哪些结构差异

第一版优先服务“学习和解剖协议”，不追求覆盖所有边缘格式。

## 当前样本

仓库里当前已有三组抓包样本：

```text
claude-code/
  session_zh.json
  session_en.json

vs-code-copilot/
  session_zh.json
  session_en.json

other/
  anthropic_01.json
  anthropic_02.json
  anthropic_03.json
  anthropic_04.json
```

预览工具应把这些文件作为内置样本，同时后续支持用户手动选择本地 JSON 文件。

## 产品形态

建议做成零后端的本地静态网页，避免抓包数据离开本机。

推荐文件结构：

```text
viewer.html
assets/
  protocol-viewer.js
  protocol-viewer.css
docs/
  protocol-viewer-plan.md
vendor/
  alpine.min.js
  marked.min.js
```

第一版如果为了快速验证，也可以先写成一个 `viewer.html` 单文件。目标形态仍建议把 UI、解析逻辑和样式拆开。

## 页面结构

### 1. 顶部栏

用途：展示当前选中的抓包文件和协议级元信息。

包含：

- 工具标题：`Agent Protocol Viewer`
- 内置样本选择器
- 本地 JSON 文件选择器
- 自动识别出的协议类型标签
- 模型名称
- 是否流式输出
- temperature、max tokens 等请求参数
- 当前文件路径或文件名

### 2. 左侧栏

用途：样本导航、过滤和统计。

#### 样本区

- Claude Code 中文会话
- Claude Code 英文会话
- VS Code Copilot 中文会话
- VS Code Copilot 英文会话
- Anthropic 原始样本

#### 过滤区

按事件类型过滤：

- system
- user
- assistant
- thinking / reasoning
- tool definition
- tool call
- tool result
- MCP
- skill
- agent
- config

#### 统计区

展示：

- 消息数量
- 工具数量
- MCP server 数量
- skill 数量
- agent 类型数量

### 3. 主时间线

用途：把一次会话按协议事件顺序展开。

每张事件卡片展示：

- 序号
- role
- 事件类型
- 简短标题
- 摘要
- 来源 JSONPath
- 相关 id，例如 `tool_use_id`

推荐颜色规则：

- system / config：中性灰
- user：蓝色
- assistant 文本：绿色
- thinking / reasoning：琥珀色
- tool definition：紫色
- tool call：橙色
- tool result：青绿色
- MCP：青色
- skill：玫红色
- agent / subagent：靛蓝色

### 4. 详情面板

用途：查看选中事件的完整细节。

建议使用标签页：

#### Summary

展示标准化后的事件字段：

- role
- type
- title
- summary
- provider
- protocol
- sourceFile
- JSONPath
- 关联事件

#### Raw JSON

展示：

- 格式化后的原始 JSON
- JSONPath
- 复制按钮

#### Text

用于文本类内容：

- markdown 渲染结果
- 原始文本
- 可选的乱码修复预览

### 5. 关系图谱

用途：让工具、MCP、skill、agent 的关系更直观。

MVP 阶段不一定要做 canvas 图，可以先做结构化列表。

建议分组：

- 工具声明
- 工具调用
- 工具返回
- MCP server 和 MCP tool
- skill 声明和触发说明
- agent 类型和可用工具范围

工具调用链建议展示成：

```text
assistant event -> tool_use id/name -> tool_result -> next assistant event
```

这样能清晰看到模型什么时候决定调用工具，工具结果又是如何回填到下一轮上下文里的。

### 6. 协议对比页

用途：横向比较不同客户端和厂商的协议差异。

建议表格行：

- 请求根结构
- 消息字段名
- system prompt 所在位置
- content block 类型命名
- 工具声明位置
- 工具调用结构
- 工具返回结构
- thinking / reasoning 表示方式
- stream 标记
- cache / ephemeral 控制
- skill 表示方式
- MCP 表示方式
- agent / subagent 表示方式

建议表格列：

- Claude Code 抓包
- VS Code Copilot 抓包
- Anthropic raw 抓包
- OpenAI-compatible 抓包

## 标准化事件模型

解析器应把不同协议统一转换成内部事件模型。

建议结构：

```js
{
  id: "event_0001",
  sourceFile: "claude-code/session_zh.json",
  provider: "anthropic | openai | claude-code | copilot | unknown",
  protocol: "messages | responses | anthropic-messages | unknown",
  role: "system | developer | user | assistant | tool | config | unknown",
  type: "text | thinking | tool_definition | tool_call | tool_result | mcp | skill | agent | config | raw",
  title: "短标题",
  summary: "面向学习者的摘要",
  path: "$.messages[0].content[1]",
  order: 1,
  text: "",
  raw: {},
  links: [
    {
      kind: "tool_call_to_result",
      targetId: "event_0008",
      via: "call_123"
    }
  ],
  meta: {
    model: "",
    toolName: "",
    toolUseId: "",
    mcpServer: "",
    skillName: "",
    agentType: "",
    cacheControl: "",
    stream: false
  }
}
```

这个模型的作用是把不同厂商的 JSON 差异挡在解析层，UI 只消费统一事件。

## 协议识别规则

协议识别应采用启发式规则，并在 UI 中向用户展示识别依据。

### Claude Code

可能信号：

- 根对象包含 `messages`、`system`、`tools`
- `system` 中包含 `x-anthropic-billing-header`
- system 文本中出现 Claude Code 身份说明
- tools 中包含 `Agent`
- content block 使用 Anthropic 风格，例如 `type: "text"`、`type: "tool_use"`

### VS Code Copilot

可能信号：

- 根对象包含 `model` 和 `input`
- `input` 使用 OpenAI Responses 风格 content blocks
- content block 类型包含 `input_text`
- system prompt 中出现 VS Code、GitHub Copilot、coding agent instructions 等文本
- tools 使用 OpenAI function-style 对象

### Anthropic Raw

可能信号：

- 根对象包含 `model`、`messages`、`system`、`tools`
- messages 使用 Anthropic content blocks
- assistant content blocks 中可能出现 `thinking`、`text`、`tool_use`
- 不包含明显 Claude Code 客户端标记

### OpenAI-Compatible

可能信号：

- 根对象包含 `model`、`messages`
- 消息使用 OpenAI chat-style roles
- 工具调用使用 `tool_calls`
- 工具结果使用 role `tool`
- 或根对象包含 `input`，并使用 Responses API 风格 content blocks

## 提取规则

### 消息

从以下位置提取 role-bearing 对象：

- `$.messages[*]`
- `$.input[*]`
- 上述对象内部的 `content[*]`

当 content block 有独立类型时，应拆成单独事件。

### System 和 Instructions

system / instruction 可能出现在：

- `$.system`
- `$.messages[*].role == "system"`
- `$.input[*].role == "system"`
- 嵌入文本中的 XML-like 区块，例如 `<instructions>`、`<skills>`、`<agents>`

工具应尽量区分：

- 协议层 system message
- 客户端注入的 instructions
- skill / agent / MCP 说明片段

### 工具

工具声明可能出现在：

- `$.tools[*]`
- OpenAI function declarations
- Anthropic tool declarations
- system 文本中嵌入的工具说明

工具调用可能出现在：

- content block `type: "tool_use"`
- content block `type: "tool_call"`
- OpenAI `tool_calls`
- function call blocks

工具返回可能出现在：

- role `tool`
- content block `type: "tool_result"`
- 带有 `tool_use_id` 的 user message block

### MCP

MCP 工具可先通过命名模式识别：

```text
server__tool
weather__get_forecast
filesystem__read_file
```

解析规则：

```js
{
  mcpServer: "weather",
  toolName: "get_forecast"
}
```

只在第一个 `__` 处分割。如果没有 `__`，先视作普通工具。

### Skill

skill 引用可能出现在：

- `<skills>...</skills>` XML-like 文本
- markdown 列表
- 工具描述中出现 `Skill`
- 以 `SKILL.md` 结尾的路径

建议提取：

- skill 名称
- skill 描述
- 触发条件
- 文件路径
- 来源 JSONPath

### Agent

agent / subagent 信息可能出现在：

- Claude Code 的 `Agent` 工具 schema
- `<agents>...</agents>` 区块
- subagent 描述列表
- 工具输入中的 `subagent_type`

建议提取：

- Agent 工具定义
- 可用 subagent 类型
- 每种 subagent 的描述
- 可用工具范围
- 使用约束

## 中文乱码处理

当前样本中存在疑似 UTF-8 被错误解码后的中文乱码。

第一版不要修改原始数据，只提供预览辅助：

- 原始文本视图
- 尝试修复后的预览
- 明确标注“修复结果为启发式推断”

可能的启发式：

- 检测高频中文乱码字符
- 尝试按 Latin-1 或 Windows-1252 字节重新解释为 UTF-8
- 低置信度时同时展示原文和修复结果

## MVP 范围

第一版应包含：

- 本地静态页面
- 内置样本选择器
- 手动加载 JSON
- 协议自动识别
- 标准化时间线
- 详情面板和原始 JSON 查看
- 按事件类型过滤
- tool / MCP / skill / agent 汇总面板
- 协议差异对比表

第一版可以暂不做：

- canvas 图谱渲染
- 编辑批注
- 持久化笔记
- 全文索引
- 大文件虚拟滚动

## 实现阶段

### 阶段 1：文档和结构确认

- 定义页面布局
- 定义标准化事件模型
- 定义各类提取规则
- 明确 MVP 边界

### 阶段 2：静态页面壳

- 创建 `viewer.html`
- 加载 `vendor/alpine.min.js`
- 加载 `vendor/marked.min.js`
- 搭建响应式布局
- 增加空状态

### 阶段 3：解析器

- 加载内置样本
- 自动识别协议
- 提取根级元信息
- 标准化 message / content 事件
- 提取工具声明、工具调用、工具返回

### 阶段 4：学习视图

- 时间线
- 详情面板
- 关系汇总
- 协议差异表

### 阶段 5：体验打磨

- 过滤器
- 文本搜索
- 中文乱码修复预览
- 复制 JSONPath
- 复制 raw JSON
- 调整视觉密度

## 设计原则

这是一个分析工具，不是展示型官网。

界面应当紧凑、冷静、适合反复检查：

- 不做大 hero
- 不做营销式介绍区
- 优先使用紧凑面板和表格
- JSONPath 和 raw payload 要容易复制
- 颜色只用于表达事件类型，不做装饰
- 选中不同事件时布局不能明显跳动

## 待确认问题

- 中文乱码修复是否默认开启，还是只作为可选开关？
- 协议对比是对比当前选中文件，还是固定对比所有已知样本？
- 批注是否进入 MVP，还是后续使用 localStorage 实现？
- 大型抓包是否需要后续做分块加载或虚拟滚动？

