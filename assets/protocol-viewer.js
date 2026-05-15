(function () {
  const storageKeys = {
    sampleIndex: "agent-protocol-viewer:selected-sample"
  };

  const samples = [
    { label: "Claude Code 中文会话", path: "claude-code/session_zh.json", kind: "claude-code" },
    { label: "Claude Code 英文会话", path: "claude-code/session_en.json", kind: "claude-code" },
    { label: "VS Code Copilot 中文会话", path: "vs-code-copilot/session_zh.json", kind: "copilot" },
    { label: "VS Code Copilot 英文会话", path: "vs-code-copilot/session_en.json", kind: "copilot" },
    { label: "Anthropic 样本 01", path: "other/anthropic_01.json", kind: "anthropic" },
    { label: "Anthropic 样本 02", path: "other/anthropic_02.json", kind: "anthropic" },
    { label: "Anthropic 样本 03", path: "other/anthropic_03.json", kind: "anthropic" },
    { label: "Anthropic 样本 04", path: "other/anthropic_04.json", kind: "anthropic" }
  ];

  const typeLabels = {
    config: "配置",
    system: "系统",
    text: "文本",
    thinking: "思考",
    tool_definition: "工具声明",
    tool_call: "工具调用",
    tool_result: "工具返回",
    mcp: "MCP",
    skill: "Skill",
    agent: "Agent",
    raw: "Raw"
  };

  const state = {
    raw: null,
    sourceFile: "",
    meta: {},
    events: [],
    selectedId: null,
    activeTab: "text",
    query: "",
    loadError: "",
    rawScope: "event",
    viewMode: "timeline"
  };

  const els = {};

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    cacheElements();
    updateLayoutMetrics();
    renderSampleOptions();
    bindEvents();
    const initialIndex = getStoredSampleIndex();
    els.sampleSelect.value = String(initialIndex);
    loadSample(samples[initialIndex]);
    window.addEventListener("resize", updateLayoutMetrics);
  }

  function cacheElements() {
    els.topbar = document.getElementById("topbar");
    els.sampleSelect = document.getElementById("sampleSelect");
    els.fileInput = document.getElementById("fileInput");
    els.viewRootJson = document.getElementById("viewRootJson");
    els.workspace = document.getElementById("workspace");
    els.rootJsonView = document.getElementById("rootJsonView");
    els.rootJsonContent = document.getElementById("rootJsonContent");
    els.timeline = document.getElementById("timeline");
    els.timelineHint = document.getElementById("timelineHint");
    els.toolsList = document.getElementById("toolsList");
    els.toolsHint = document.getElementById("toolsHint");
    els.detail = document.getElementById("detail");
    els.copySelectedPath = document.getElementById("copySelectedPath");
    els.tabs = Array.from(document.querySelectorAll(".tab"));
  }

  function bindEvents() {
    els.sampleSelect.addEventListener("change", () => {
      const index = Number(els.sampleSelect.value);
      localStorage.setItem(storageKeys.sampleIndex, String(index));
      const sample = samples[index];
      loadSample(sample);
    });

    els.fileInput.addEventListener("change", async (event) => {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      const text = await file.text();
      loadText(text, file.name);
    });

    els.viewRootJson.addEventListener("click", () => {
      state.viewMode = state.viewMode === "root-json" ? "timeline" : "root-json";
      renderViewMode();
    });

    els.copySelectedPath.addEventListener("click", async () => {
      const event = getSelectedEvent();
      if (!event) return;
      await navigator.clipboard.writeText(event.path || "");
      els.copySelectedPath.textContent = "已复制";
      window.setTimeout(() => {
        els.copySelectedPath.textContent = "复制 JSONPath";
      }, 900);
    });

    els.tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        state.activeTab = tab.dataset.tab;
        if (state.activeTab !== "raw") state.rawScope = "event";
        renderTabs();
        renderDetail();
      });
    });
  }

  function renderSampleOptions() {
    els.sampleSelect.innerHTML = samples
      .map((sample, index) => `<option value="${index}">${escapeHtml(sample.label)}</option>`)
      .join("");
  }

  function updateLayoutMetrics() {
    if (!els.topbar) return;
    const height = Math.ceil(els.topbar.getBoundingClientRect().height);
    document.documentElement.style.setProperty("--topbar-height", `${height}px`);
  }

  function getStoredSampleIndex() {
    const value = Number(localStorage.getItem(storageKeys.sampleIndex));
    if (Number.isInteger(value) && value >= 0 && value < samples.length) return value;
    return 0;
  }

  async function loadSample(sample) {
    try {
      const response = await fetch(sample.path, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      loadText(text, sample.path);
    } catch (error) {
      state.raw = null;
      state.sourceFile = sample.path;
      state.loadError = `无法读取内置样本：${sample.path}。请通过本地静态服务打开页面，或使用“选择 JSON”手动加载。错误：${error.message}`;
      state.meta = {
        provider: sample.kind,
        protocol: "未加载",
        error: state.loadError
      };
      state.events = [];
      state.selectedId = null;
      renderAll();
    }
  }

  function loadText(text, sourceFile) {
    try {
      const raw = JSON.parse(text);
      state.raw = raw;
      state.sourceFile = sourceFile;
      state.loadError = "";
      state.rawScope = "event";
      state.viewMode = "timeline";
      state.meta = detectProtocol(raw, text, sourceFile);
      state.events = normalizeCapture(raw, sourceFile, state.meta);
      state.selectedId = state.events[0] ? state.events[0].id : null;
      renderAll();
    } catch (error) {
      state.raw = null;
      state.sourceFile = sourceFile;
      state.loadError = `JSON 解析失败：${error.message}`;
      state.meta = { provider: "unknown", protocol: "解析失败", error: error.message };
      state.events = [];
      state.selectedId = null;
      renderAll();
    }
  }

  function detectProtocol(raw, text, sourceFile) {
    const compact = text.slice(0, 120000).toLowerCase();
    const hasMessages = Array.isArray(raw.messages);
    const hasInput = Array.isArray(raw.input);
    const hasTools = Array.isArray(raw.tools);
    const model = raw.model || "";
    let provider = "unknown";
    let protocol = "unknown";
    const reasons = [];

    if (hasInput) {
      protocol = "responses";
      reasons.push("根对象包含 input 数组");
    }

    if (hasMessages) {
      protocol = "messages";
      reasons.push("根对象包含 messages 数组");
    }

    if (compact.includes("github copilot") || compact.includes("vscode") || compact.includes("vs code")) {
      provider = "copilot";
      reasons.push("文本中出现 GitHub Copilot / VS Code 标记");
    }

    if (compact.includes("x-anthropic-billing-header") || compact.includes("claude code")) {
      provider = "claude-code";
      protocol = "anthropic-messages";
      reasons.push("文本中出现 Claude Code 客户端标记");
    }

    if (provider === "unknown" && (hasMessages || hasTools) && compact.includes("anthropic")) {
      provider = "anthropic";
      protocol = "anthropic-messages";
      reasons.push("Anthropic 风格 messages/tools 结构");
    }

    if (provider === "unknown" && hasInput) {
      provider = "openai";
      reasons.push("OpenAI Responses 风格 input 结构");
    }

    if (provider === "unknown" && hasMessages && compact.includes("tool_calls")) {
      provider = "openai";
      reasons.push("OpenAI chat tool_calls 结构");
    }

    if (sourceFile.includes("claude-code")) {
      provider = "claude-code";
      protocol = "anthropic-messages";
      reasons.push("文件路径位于 claude-code/");
    }

    if (sourceFile.includes("vs-code-copilot")) {
      provider = "copilot";
      protocol = hasInput ? "responses" : protocol;
      reasons.push("文件路径位于 vs-code-copilot/");
    }

    if (sourceFile.includes("anthropic")) {
      provider = provider === "unknown" ? "anthropic" : provider;
      protocol = protocol === "unknown" ? "anthropic-messages" : protocol;
      reasons.push("文件名包含 anthropic");
    }

    return {
      provider,
      protocol,
      model,
      stream: raw.stream,
      temperature: raw.temperature,
      maxTokens: raw.max_tokens || raw.max_completion_tokens,
      hasTools,
      reasons
    };
  }

  function normalizeCapture(raw, sourceFile, meta) {
    const events = [];
    let order = 0;

    function add(event) {
      order += 1;
      const normalized = {
        id: `event_${String(order).padStart(4, "0")}`,
        sourceFile,
        provider: meta.provider,
        protocol: meta.protocol,
        role: event.role || "unknown",
        type: event.type || "raw",
        title: event.title || "未命名事件",
        summary: event.summary || "",
        path: event.path || "$",
        order,
        text: event.text || "",
        raw: event.raw,
        links: event.links || [],
        meta: event.meta || {}
      };
      events.push(normalized);
      return normalized;
    }

    extractSystem(raw, add);
    extractTools(raw, add);
    extractMessages(raw, add);
    linkToolEvents(events);

    return events;
  }

  function extractSystem(raw, add) {
    if (raw.system === undefined) return;

    if (Array.isArray(raw.system)) {
      raw.system.forEach((block, index) => {
        processContentBlock(block, "system", `$.system[${index}]`, add);
      });
      return;
    }

    addTextLikeEvent({
      add,
      role: "system",
      path: "$.system",
      raw: raw.system,
      text: stringifyText(raw.system),
      title: "System Prompt",
      type: "system"
    });
  }

  function extractTools(raw, add) {
    if (!Array.isArray(raw.tools)) return;

    raw.tools.forEach((tool, index) => {
      const name = getToolName(tool);
      const mcp = splitMcpName(name);
      const event = add({
        role: "config",
        type: mcp ? "mcp" : "tool_definition",
        title: mcp ? `MCP 工具声明：${mcp.server}.${mcp.tool}` : `工具声明：${name || "unknown"}`,
        summary: summarizeTool(tool),
        path: `$.tools[${index}]`,
        raw: tool,
        text: tool.description || tool.function?.description || "",
        meta: {
          toolName: name,
          mcpServer: mcp && mcp.server
        }
      });

      if (String(name).toLowerCase() === "agent") {
        add({
          role: "config",
          type: "agent",
          title: "Agent 工具",
          summary: "客户端向模型暴露的 agent / subagent 调度入口。",
          path: `$.tools[${index}]`,
          raw: tool,
          text: tool.description || "",
          meta: {
            toolName: name
          },
          links: [{ kind: "derived_from_tool", targetId: event.id, via: name }]
        });
        extractAgentTypes(tool.description || "", `$.tools[${index}].description`, add);
      }
    });
  }

  function extractMessages(raw, add) {
    if (Array.isArray(raw.messages)) {
      raw.messages.forEach((message, index) => {
        processMessage(message, `$.messages[${index}]`, add);
      });
    }

    if (Array.isArray(raw.input)) {
      raw.input.forEach((message, index) => {
        processMessage(message, `$.input[${index}]`, add);
      });
    }
  }

  function processMessage(message, path, add) {
    const role = message.role || "unknown";

    if (Array.isArray(message.content)) {
      message.content.forEach((block, index) => {
        processContentBlock(block, role, `${path}.content[${index}]`, add);
      });
    } else if (message.content !== undefined) {
      addTextLikeEvent({
        add,
        role,
        path: `${path}.content`,
        raw: message.content,
        text: stringifyText(message.content),
        title: `${role} 文本`,
        type: role === "system" ? "system" : "text"
      });
    } else if (message.tool_calls) {
      // Handled below.
    } else {
      add({
        role,
        type: "raw",
        title: `${role} 消息`,
        summary: "没有标准 content 字段，保留为 raw 事件。",
        path,
        raw: message
      });
    }

    if (Array.isArray(message.tool_calls)) {
      message.tool_calls.forEach((call, index) => {
        addToolCall(call, role, `${path}.tool_calls[${index}]`, add);
      });
    }

    if (role === "tool") {
      add({
        role: "tool",
        type: "tool_result",
        title: `工具返回：${message.name || message.tool_call_id || "unknown"}`,
        summary: clip(stringifyText(message.content), 180),
        path,
        raw: message,
        text: stringifyText(message.content),
        meta: {
          toolName: message.name || "",
          toolUseId: message.tool_call_id || ""
        }
      });
    }
  }

  function processContentBlock(block, role, path, add) {
    if (typeof block === "string") {
      addTextLikeEvent({ add, role, path, raw: block, text: block, title: `${role} 文本`, type: role === "system" ? "system" : "text" });
      return;
    }

    if (!block || typeof block !== "object") {
      add({ role, type: "raw", title: `${role} 原始内容`, summary: String(block), path, raw: block });
      return;
    }

    const type = block.type || inferBlockType(block, role);

    if (type === "text" || type === "input_text" || type === "output_text") {
      addTextLikeEvent({
        add,
        role,
        path,
        raw: block,
        text: block.text || "",
        title: `${role} 文本`,
        type: role === "system" ? "system" : "text"
      });
      return;
    }

    if (type === "thinking" || type === "reasoning") {
      add({
        role,
        type: "thinking",
        title: "Thinking / Reasoning",
        summary: clip(block.thinking || block.text || block.summary || "", 180),
        path,
        raw: block,
        text: block.thinking || block.text || block.summary || ""
      });
      return;
    }

    if (type === "tool_use" || type === "tool_call" || type === "function_call") {
      addToolCall(block, role, path, add);
      return;
    }

    if (type === "tool_result" || block.tool_use_id) {
      add({
        role,
        type: "tool_result",
        title: `工具返回：${block.tool_use_id || block.name || "unknown"}`,
        summary: clip(stringifyText(block.content || block.output || block.text), 180),
        path,
        raw: block,
        text: stringifyText(block.content || block.output || block.text),
        meta: {
          toolName: block.name || "",
          toolUseId: block.tool_use_id || block.call_id || ""
        }
      });
      return;
    }

    add({
      role,
      type: "raw",
      title: `${role} ${type || "raw"}`,
      summary: clip(JSON.stringify(block), 180),
      path,
      raw: block,
      text: stringifyText(block.text || block.content || "")
    });
  }

  function addToolCall(call, role, path, add) {
    const name = call.name || call.function?.name || call.tool_name || "unknown";
    const id = call.id || call.tool_use_id || call.call_id || "";
    const mcp = splitMcpName(name);
    add({
      role,
      type: mcp ? "mcp" : "tool_call",
      title: mcp ? `MCP 调用：${mcp.server}.${mcp.tool}` : `工具调用：${name}`,
      summary: summarizeToolInput(call.input || call.arguments || call.function?.arguments),
      path,
      raw: call,
      text: stringifyText(call.input || call.arguments || call.function?.arguments || ""),
      meta: {
        toolName: name,
        toolUseId: id,
        mcpServer: mcp && mcp.server
      }
    });
  }

  function addTextLikeEvent({ add, role, path, raw, text, title, type }) {
    const event = add({
      role,
      type,
      title,
      summary: clip(text, 180),
      path,
      raw,
      text
    });

    extractEmbeddedSections(text, path, add, event.id);
  }

  function extractEmbeddedSections(text, path, add, parentId) {
    if (!text || typeof text !== "string") return;

    const sectionPatterns = [
      { tag: "skills", type: "skill", title: "Skills 注入区块" },
      { tag: "agents", type: "agent", title: "Agents 注入区块" },
      { tag: "instructions", type: "system", title: "Instructions 注入区块" },
      { tag: "coding_agent_instructions", type: "system", title: "Coding Agent Instructions" }
    ];

    sectionPatterns.forEach(({ tag, type, title }) => {
      const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
      let match;
      while ((match = regex.exec(text))) {
        const content = match[1].trim();
        add({
          role: "config",
          type,
          title,
          summary: clip(content, 180),
          path: `${path}#${tag}`,
          raw: content,
          text: content,
          links: [{ kind: "embedded_in_text", targetId: parentId, via: tag }]
        });

        if (tag === "skills") extractSkillItems(content, `${path}#skills`, add, parentId);
        if (tag === "agents") extractAgentTypes(content, `${path}#agents`, add, parentId);
      }
    });

    extractSkillItems(text, path, add, parentId);
  }

  function extractSkillItems(text, path, add, parentId) {
    const xmlSkill = /<skill>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<description>([\s\S]*?)<\/description>[\s\S]*?(?:<file>([\s\S]*?)<\/file>)?[\s\S]*?<\/skill>/gi;
    let match;
    while ((match = xmlSkill.exec(text))) {
      add({
        role: "config",
        type: "skill",
        title: `Skill：${cleanText(match[1])}`,
        summary: clip(cleanText(match[2]), 180),
        path,
        raw: match[0],
        text: cleanText(match[2]),
        links: [{ kind: "embedded_in_text", targetId: parentId, via: "skill" }],
        meta: {
          skillName: cleanText(match[1]),
          skillFile: cleanText(match[3] || "")
        }
      });
    }

    const pathSkill = /([A-Za-z0-9_.:-]+)[^\n\r]{0,120}SKILL\.md/gi;
    while ((match = pathSkill.exec(text))) {
      add({
        role: "config",
        type: "skill",
        title: `Skill 文件引用：${cleanText(match[1])}`,
        summary: clip(match[0], 180),
        path,
        raw: match[0],
        text: match[0],
        links: [{ kind: "embedded_in_text", targetId: parentId, via: "SKILL.md" }],
        meta: {
          skillName: cleanText(match[1])
        }
      });
    }
  }

  function extractAgentTypes(text, path, add, parentId) {
    if (!text) return;
    const bullet = /^\s*-\s*([^:：\n]+)[:：]\s*([^\n]+)/gm;
    let match;
    while ((match = bullet.exec(text))) {
      const name = cleanText(match[1]);
      if (!name || name.length > 80) continue;
      add({
        role: "config",
        type: "agent",
        title: `Subagent：${name}`,
        summary: clip(cleanText(match[2]), 180),
        path,
        raw: match[0],
        text: match[0],
        links: parentId ? [{ kind: "embedded_in_text", targetId: parentId, via: "agent" }] : [],
        meta: {
          agentType: name
        }
      });
    }
  }

  function linkToolEvents(events) {
    const callsById = new Map();
    events.forEach((event) => {
      if ((event.type === "tool_call" || event.type === "mcp") && event.meta.toolUseId) {
        callsById.set(event.meta.toolUseId, event);
      }
    });

    events.forEach((event) => {
      if (event.type !== "tool_result" || !event.meta.toolUseId) return;
      const call = callsById.get(event.meta.toolUseId);
      if (!call) return;
      call.links.push({ kind: "tool_call_to_result", targetId: event.id, via: event.meta.toolUseId });
      event.links.push({ kind: "tool_result_from_call", targetId: call.id, via: event.meta.toolUseId });
    });
  }

  function renderAll() {
    renderViewMode();
    renderTimeline();
    renderToolsPanel();
    renderTabs();
    renderDetail();
  }

  function renderViewMode() {
    const rootMode = state.viewMode === "root-json";
    els.workspace.classList.toggle("hidden", rootMode);
    els.rootJsonView.classList.toggle("hidden", !rootMode);
    els.viewRootJson.textContent = rootMode ? "事件时间线" : "原始JSON";

    if (!rootMode) return;

    els.rootJsonContent.textContent = state.raw
      ? JSON.stringify(state.raw, null, 2)
      : state.loadError || "暂无原始 JSON。";
  }

  function renderStats() {
    const counts = {
      事件: state.events.length,
      工具: countUnique(state.events, "toolName", (event) => event.type === "tool_definition" || event.type === "tool_call"),
      MCP: countUnique(state.events, "mcpServer", (event) => event.meta.mcpServer),
      Skill: countUnique(state.events, "skillName", (event) => event.type === "skill"),
      Agent: countUnique(state.events, "agentType", (event) => event.type === "agent"),
      返回: state.events.filter((event) => event.type === "tool_result").length
    };

    return `<div class="stats-grid">${Object.entries(counts)
      .map(([label, value]) => `<div class="stat"><strong>${value}</strong><span>${escapeHtml(label)}</span></div>`)
      .join("")}</div>`;
  }

  function renderTimeline() {
    const visible = getVisibleEvents();
    els.timelineHint.textContent = `当前显示 ${visible.length} / ${state.events.length} 个事件，排序为：系统信息 → 用户/助手信息 → 工具/MCP/Skill/Agent。`;

    if (!visible.length) {
      els.timeline.innerHTML = `<div class="empty">${escapeHtml(state.loadError || "没有匹配的事件。")}</div>`;
      return;
    }

    els.timelineHint.textContent = `当前显示 ${visible.length} / ${state.events.length} 个事件，按抓包中的原始对话顺序展示。`;

    els.timeline.innerHTML = groupTimelineEvents(visible)
      .map((item) => item.events ? renderEventGroup(item) : renderEventCard(item))
      .join("");

    els.timeline.querySelectorAll(".event-card").forEach((card) => {
      card.addEventListener("click", () => {
        state.selectedId = card.dataset.id;
        state.rawScope = "event";
        renderTimeline();
        renderDetail();
      });
    });
  }

  function renderToolsPanel() {
    const tools = getToolListEvents();
    if (!els.toolsList || !els.toolsHint) return;

    els.toolsHint.textContent = tools.length
      ? `共 ${tools.length} 个工具定义，点击可查看原始 JSON 和描述。`
      : "当前请求没有 tools 工具定义。";

    if (!tools.length) {
      els.toolsList.innerHTML = `<div class="empty">没有工具定义。</div>`;
      return;
    }

    els.toolsList.innerHTML = tools.map(renderToolItem).join("");

    els.toolsList.querySelectorAll(".tool-item").forEach((item) => {
      item.addEventListener("click", () => {
        state.selectedId = item.dataset.id;
        state.rawScope = "event";
        renderTimeline();
        renderToolsPanel();
        renderDetail();
      });
    });
  }

  function renderToolItem(event) {
    const active = event.id === state.selectedId ? " active" : "";
    const name = event.meta.toolName || event.meta.agentType || event.meta.mcpServer || getEventDisplayTitle(event);
    const summary = getEventDisplaySummary(event);

    return `
      <article class="tool-item type-${escapeHtml(event.type)}${active}" data-id="${escapeHtml(event.id)}">
        <div class="tool-item-head">
          <span class="tool-name">${escapeHtml(name || "unknown")}</span>
          <span class="badge badge-type">${escapeHtml(typeLabels[event.type] || event.type)}</span>
        </div>
        <div class="tool-summary">${escapeHtml(summary || event.text || "无描述")}</div>
        <div class="event-path">${escapeHtml(event.path)}</div>
      </article>
    `;
  }

  function groupTimelineEvents(events) {
    const groups = [];

    events.forEach((event) => {
      const key = getMessageGroupKey(event);
      const last = groups[groups.length - 1];

      if (key && last && last.key === key) {
        last.events.push(event);
        return;
      }

      if (key) {
        groups.push({ key, role: event.role, events: [event] });
        return;
      }

      groups.push(event);
    });

    return groups.map((group) => {
      if (!group.events || group.events.length === 1) return group.events ? group.events[0] : group;
      return group;
    });
  }

  function getMessageGroupKey(event) {
    const match = String(event.path || "").match(/^(\$\.(?:messages|input)\[\d+\])(?:\.(?:content|tool_calls)(?:\[\d+\])?)?/);
    return match ? match[1] : "";
  }

  function renderEventGroup(group) {
    const label = `${group.role || "message"} message`;
    return `
      <section class="event-group">
        <div class="event-group-head">
          <span>${escapeHtml(label)}</span>
          <code>${escapeHtml(group.key)}</code>
          <b>${group.events.length} blocks</b>
        </div>
        <div class="event-group-body">
          ${group.events.map(renderEventCard).join("")}
        </div>
      </section>
    `;
  }

  function renderEventCard(event) {
    const active = event.id === state.selectedId ? " active" : "";
    const roleClass = event.role === "user" ? " role-user" : "";
    const importance = getEventImportance(event);
    const title = getEventDisplayTitle(event);
    const summary = getEventDisplaySummary(event);

    return `
      <article class="event-card type-${escapeHtml(event.type)}${roleClass} importance-${importance}${active}" data-id="${escapeHtml(event.id)}">
        <div class="event-rail">
          <div class="event-index">${String(event.order).padStart(2, "0")}</div>
          <div class="event-dot"></div>
        </div>
        <div class="event-main">
          <div class="event-title-row">
            <span class="event-title">${escapeHtml(title)}</span>
            <span class="badge">${escapeHtml(event.role)}</span>
            <span class="badge badge-type">${escapeHtml(typeLabels[event.type] || event.type)}</span>
          </div>
          <div class="event-summary">${escapeHtml(summary || "无摘要")}</div>
          <div class="event-path">${escapeHtml(event.path)}</div>
        </div>
      </article>
    `;
  }

  function getEventImportance(event) {
    const text = `${event.title} ${event.summary} ${event.text}`.toLowerCase();

    if (text.includes("<system-reminder>") || text.includes("system-reminder")) return "context";
    if (event.type === "tool_definition" || event.type === "skill" || event.type === "agent") return "secondary";
    if (event.role === "system" || event.type === "system" || event.type === "config") return "secondary";
    if (event.type === "tool_call" || event.type === "tool_result" || event.type === "mcp") return "primary";
    if (event.role === "user" || event.role === "assistant") return "primary";
    return "secondary";
  }

  function getEventDisplayTitle(event) {
    const text = `${event.title} ${event.summary} ${event.text}`.toLowerCase();
    if (text.includes("<system-reminder>") || text.includes("system-reminder")) return "上下文提醒";
    if (event.type === "tool_definition") return `工具声明：${event.meta.toolName || "unknown"}`;
    if (event.type === "tool_call") return `工具调用：${event.meta.toolName || "unknown"}`;
    if (event.type === "tool_result") return "工具结果回填";
    if (event.type === "skill") return event.title.replace(/^Skill[：:]\s*/, "Skill：");
    if (event.type === "agent") return event.title;
    return event.title;
  }

  function getEventDisplaySummary(event) {
    const summary = event.summary || event.text || "";
    return summary
      .replace(/<\/?system-reminder>/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function renderTabs() {
    els.tabs.forEach((tab) => {
      tab.classList.toggle("active", tab.dataset.tab === state.activeTab);
    });
  }

  function renderDetail() {
    const event = getSelectedEvent();
    if (!event) {
      els.detail.innerHTML = `<div class="empty">${escapeHtml(state.loadError || "暂无事件。")}</div>`;
      return;
    }

    if (state.activeTab === "config") {
      els.detail.innerHTML = renderRequestStructure();
      return;
    }

    if (state.activeTab === "raw") {
      const raw = state.rawScope === "root" ? state.raw : event.raw;
      const title = state.rawScope === "root" ? "完整原始 JSON" : "当前事件 Raw JSON";
      els.detail.innerHTML = `
        <div class="request-json-head">
          <strong>${escapeHtml(title)}</strong>
          <span>${escapeHtml(state.rawScope === "root" ? "$" : event.path)}</span>
        </div>
        <pre>${escapeHtml(JSON.stringify(raw, null, 2))}</pre>
      `;
      return;
    }

    if (state.activeTab === "text") {
      els.detail.innerHTML = renderText(event);
      return;
    }

    if (state.activeTab === "stats") {
      els.detail.innerHTML = renderStats();
      return;
    }
  }

  function renderRequestStructure() {
    if (!state.raw) {
      return `<div class="empty">暂无请求数据。</div>`;
    }

    return `
      <div class="request-json-head">
        <strong>请求配置示意</strong>
        <span>${escapeHtml(state.sourceFile || "")}</span>
      </div>
      <pre>${escapeHtml(buildRequestExampleCode(state.raw, state.meta))}</pre>
    `;
  }

  function buildRequestExampleCode(raw, meta) {
    if (meta.provider === "copilot" || meta.protocol === "responses" || Array.isArray(raw.input)) {
      return buildResponsesRequestExample(raw);
    }

    return buildAnthropicRequestExample(raw);
  }

  function buildAnthropicRequestExample(raw) {
    const lines = [
      "const response = await this.client.create({",
      `  model: ${exampleScalar(raw.model, "\"claude-sonnet-4-5\"")},`,
      `  max_tokens: ${exampleScalar(raw.max_tokens, "4096")},`,
      `  temperature: ${exampleScalar(raw.temperature, "0.2")},`,
      "  system: [",
      `    ${exampleContentBlock("text", systemExample(raw))},`,
      `    ${exampleContentBlock("text", "可用工具、MCP、skill、agent 规则会在这里注入。")},`,
      "  ],",
      "  messages: [",
      `    ${exampleMessage("user", userExample(raw))},`,
      `    ${exampleMessage("assistant", assistantExample(raw))},`,
      `    ${exampleToolResult(raw)},`,
      "  ],",
      "  tools: [",
      `    ${exampleTool(raw)},`,
      "  ],",
      "  tool_choice: { type: \"auto\" },",
      "});"
    ];

    return lines.join("\n");
  }

  function buildResponsesRequestExample(raw) {
    const lines = [
      "const response = await this.client.responses.create({",
      `  model: ${exampleScalar(raw.model, "\"gpt-5.4\"")},`,
      "  input: [",
      `    ${exampleMessage("system", systemExample(raw))},`,
      `    ${exampleMessage("user", userExample(raw))},`,
      `    ${exampleMessage("assistant", assistantExample(raw))},`,
      "  ],",
      "  tools: [",
      `    ${exampleTool(raw)},`,
      "  ],",
      "  tool_choice: \"auto\",",
      "});"
    ];

    return lines.join("\n");
  }

  function exampleScalar(value, fallback) {
    return value === undefined ? fallback : JSON.stringify(value);
  }

  function exampleContentBlock(type, text) {
    return `{ type: ${JSON.stringify(type)}, text: ${JSON.stringify(clip(text, 90))} }`;
  }

  function exampleMessage(role, text) {
    return `{ role: ${JSON.stringify(role)}, content: [${exampleContentBlock("text", text)}] }`;
  }

  function exampleToolResult(raw) {
    const toolResult = state.events.find((event) => event.type === "tool_result");
    const text = toolResult ? toolResult.text || toolResult.summary : "工具执行结果会作为 tool_result 回填给模型。";
    return `{ role: "user", content: [{ type: "tool_result", tool_use_id: "call_xxx", content: ${JSON.stringify(clip(text, 70))} }] }`;
  }

  function exampleTool(raw) {
    const tool = Array.isArray(raw.tools) && raw.tools[0] ? raw.tools[0] : null;
    const name = tool ? getToolName(tool) : "read_file";
    const description = tool ? tool.description || tool.function?.description || "工具描述" : "模型可调用的工具";
    return `{ name: ${JSON.stringify(name)}, description: ${JSON.stringify(clip(description, 70))}, input_schema: { type: "object" } }`;
  }

  function systemExample(raw) {
    return previewFromValue(raw.system) || "你是一个 AI 编程助手，遵守系统规则，并根据工具结果完成任务。";
  }

  function userExample(raw) {
    const message = firstMessageByRole(raw, "user");
    return previewFromValue(message && message.content) || "用户提出问题，例如：帮我分析这个抓包里的对话协议。";
  }

  function assistantExample(raw) {
    const message = firstMessageByRole(raw, "assistant");
    return previewFromValue(message && message.content) || "模型可以先回复用户，也可以决定调用工具。";
  }

  function firstMessageByRole(raw, role) {
    const list = Array.isArray(raw.messages) ? raw.messages : Array.isArray(raw.input) ? raw.input : [];
    return list.find((message) => message && message.role === role);
  }

  function previewFromValue(value) {
    if (value === undefined || value === null) return "";
    if (Array.isArray(value)) {
      const textBlock = value.find((item) => item && typeof item === "object" && typeof item.text === "string");
      if (textBlock) return cleanText(textBlock.text);
      return cleanText(value.map(stringifyText).join(" "));
    }

    return cleanText(stringifyText(value));
  }

  function renderText(event) {
    const text = normalizeDisplayText(extractEventContentText(event));
    const rendered = renderReadableMarkdown(text);
    return `
      <div class="content-markdown">${rendered || "无 content 内容"}</div>
    `;
  }

  function renderReadableMarkdown(text) {
    if (!text) return "";
    if (!window.marked) return escapeHtml(text).replace(/\r?\n/g, "<br>\n");

    return window.marked.parse(escapeMarkdownHtml(text), {
      breaks: true,
      gfm: true
    });
  }

  function escapeMarkdownHtml(value) {
    return String(value ?? "").replace(/</g, "&lt;");
  }

  function normalizeDisplayText(text) {
    return String(text || "")
      .replace(/\\r\\n/g, "\n")
      .replace(/\\n/g, "\n")
      .replace(/\\t/g, "  ");
  }

  function extractEventContentText(event) {
    const raw = event.raw;

    if (raw && typeof raw === "object") {
      if (typeof raw.content === "string") return raw.content;
      if (typeof raw.text === "string") return raw.text;
      if (typeof raw.thinking === "string") return raw.thinking;
      if (raw.content !== undefined) return stringifyText(raw.content);
      if (raw.input !== undefined) return stringifyText(raw.input);
      if (raw.arguments !== undefined) return stringifyText(raw.arguments);
    }

    return event.text || "";
  }

  function getVisibleEvents() {
    return state.events
      .filter((event) => !isToolListEvent(event))
      .slice()
      .sort((a, b) => a.order - b.order);
  }

  function getToolListEvents() {
    return state.events
      .filter(isToolListEvent)
      .slice()
      .sort((a, b) => a.order - b.order);
  }

  function isToolListEvent(event) {
    return String(event.path || "").startsWith("$.tools[");
  }

  function getSelectedEvent() {
    return state.events.find((event) => event.id === state.selectedId) || null;
  }

  function getToolName(tool) {
    return tool.name || tool.function?.name || tool.tool_name || tool.title || "unknown";
  }

  function summarizeTool(tool) {
    return clip(tool.description || tool.function?.description || JSON.stringify(tool.input_schema || tool.parameters || {}), 180);
  }

  function summarizeToolInput(input) {
    if (input === undefined || input === null || input === "") return "无参数或未提供参数。";
    return clip(typeof input === "string" ? input : JSON.stringify(input), 180);
  }

  function inferBlockType(block, role) {
    if (block.tool_use_id) return "tool_result";
    if (block.name && (block.input || block.arguments)) return "tool_use";
    if (block.text) return "text";
    if (role === "tool") return "tool_result";
    return "raw";
  }

  function splitMcpName(name) {
    if (!name || !String(name).includes("__")) return null;
    const [server, ...rest] = String(name).split("__");
    if (!server || !rest.length) return null;
    return { server, tool: rest.join("__") };
  }

  function countUnique(events, metaKey, predicate) {
    const values = new Set();
    events.forEach((event) => {
      if (!predicate(event)) return;
      const value = event.meta[metaKey];
      if (value) values.add(value);
    });
    return values.size;
  }

  function hasRole(raw, role) {
    const list = Array.isArray(raw.messages) ? raw.messages : Array.isArray(raw.input) ? raw.input : [];
    return list.some((item) => item && item.role === role);
  }

  function hasString(raw, needle) {
    try {
      return JSON.stringify(raw).includes(needle);
    } catch (_error) {
      return false;
    }
  }

  function hasToolNamed(raw, name) {
    return Array.isArray(raw.tools) && raw.tools.some((tool) => getToolName(tool) === name);
  }

  function hasMcpName(raw) {
    return Array.isArray(raw.tools) && raw.tools.some((tool) => splitMcpName(getToolName(tool)));
  }

  function stringifyText(value) {
    if (value === undefined || value === null) return "";
    if (typeof value === "string") return value;
    if (Array.isArray(value)) return value.map(stringifyText).join("\n");
    if (typeof value === "object") {
      if (typeof value.text === "string") return value.text;
      if (typeof value.content === "string") return value.content;
      return JSON.stringify(value, null, 2);
    }
    return String(value);
  }

  function cleanText(value) {
    return stringifyText(value).replace(/\s+/g, " ").trim();
  }

  function clip(value, max) {
    const text = cleanText(value);
    if (text.length <= max) return text;
    return `${text.slice(0, max - 1)}…`;
  }

  function repairMojibake(text) {
    if (!text || !/[浣犳槸涓]|锛|绛|鍦|鏄/.test(text)) return "";
    try {
      const bytes = Uint8Array.from(Array.from(text), (char) => char.charCodeAt(0) & 0xff);
      return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    } catch (_error) {
      return "";
    }
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
})();
