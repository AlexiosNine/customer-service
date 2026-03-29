import express from "express";
import {
  query,
  unstable_v2_createSession,
  unstable_v2_authenticate,
  PermissionResult,
  CanUseTool
} from "@tencent-ai/agent-sdk";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import { fileURLToPath } from "url";
import * as db from "./db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// ===================== 客服 Agent 系统提示词 =====================

const CUSTOMER_SERVICE_SYSTEM_PROMPT = `你是"小智"——一个专业的智能客服助理，代表公司为用户提供优质服务。

## 核心职责
1. 热情、专业地回答用户问题
2. 准确识别用户意图并归类
3. 基于知识库提供精准解答
4. 判断何时需要转接人工客服

## 意图识别规则
在每次回复时，你必须在回答末尾附加一行 JSON 标记（格式如下，不要放在代码块里）：
[INTENT:{"type":"<类型>","confidence":<0-1>,"shouldTransfer":<true/false>}]

意图类型（type）枚举：
- refund：退款相关（退款申请、退款进度、退款失败等）
- order：订单相关（查询、发货、取消、修改等）
- tech：技术支持（登录问题、支付故障、页面报错等）
- account：账户相关（密码修改、绑定手机、注销等）
- complaint：投诉建议（服务差评、产品问题等）
- general：一般咨询（活动、价格、使用方法等）
- unknown：无法识别

## 转人工条件（shouldTransfer: true）
以下情况必须主动建议转人工：
- 用户明确要求转人工
- 涉及金额较大的退款纠纷（>500元）
- 用户情绪激动、连续表达不满超过2次
- 连续3次无法有效解答同一问题
- 账号安全事件（被盗、异常登录）
- 涉及法律纠纷或投诉升级

## 回复规范
- 开头简短问候，不冗长
- 回答具体、简洁，给出可操作的步骤
- 如果知识库中有相关内容，优先引用
- 语气亲切但专业，不使用网络语
- 遇到不确定的内容，坦诚告知并建议联系人工

## 转人工话术示例
当需要转人工时，在回复中包含：
"[TRANSFER_REQUEST]我已为您整理本次问题详情，正在为您转接专属客服，请稍候..."

注意：[INTENT:...] 标记必须出现在每条回复的最后一行。`;

// ===================== 辅助函数 =====================

interface ParsedIntent {
  type: string;
  confidence: number;
  shouldTransfer: boolean;
}

function extractIntent(text: string): { cleanText: string; intent: ParsedIntent | null; isTransfer: boolean } {
  const intentMatch = text.match(/\[INTENT:\s*(\{[^}]+\})\]/);
  const transferMatch = text.includes('[TRANSFER_REQUEST]');
  
  let intent: ParsedIntent | null = null;
  let cleanText = text;
  
  if (intentMatch) {
    try {
      intent = JSON.parse(intentMatch[1]);
    } catch {
      intent = { type: 'unknown', confidence: 0, shouldTransfer: false };
    }
    cleanText = cleanText.replace(/\[INTENT:\s*\{[^}]+\}\]/g, '').trim();
  }
  
  if (transferMatch) {
    cleanText = cleanText.replace('[TRANSFER_REQUEST]', '').trim();
    if (intent) intent.shouldTransfer = true;
  }
  
  return { cleanText, intent, isTransfer: transferMatch || (intent?.shouldTransfer ?? false) };
}

// ===================== 基础路由 =====================

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// 登录检测
type LoginMethod = 'env' | 'cli' | 'none';
interface LoginStatusResponse {
  isLoggedIn: boolean;
  method?: LoginMethod;
  envConfigured?: boolean;
  cliConfigured?: boolean;
  error?: string;
  apiKey?: string;
  envVars?: { apiKey?: string; authToken?: string; internetEnv?: string; baseUrl?: string };
}

app.get("/api/check-login", async (_req, res) => {
  const response: LoginStatusResponse = { isLoggedIn: false, envConfigured: false, cliConfigured: false, envVars: {} };

  const apiKey = process.env.CODEBUDDY_API_KEY;
  const authToken = process.env.CODEBUDDY_AUTH_TOKEN;
  const internetEnv = process.env.CODEBUDDY_INTERNET_ENVIRONMENT;
  const baseUrl = process.env.CODEBUDDY_BASE_URL;

  if (apiKey || authToken) {
    response.envConfigured = true;
    if (apiKey) { response.envVars!.apiKey = apiKey.slice(0, 8) + '****' + apiKey.slice(-4); response.apiKey = response.envVars!.apiKey; }
    if (authToken) response.envVars!.authToken = authToken.slice(0, 8) + '****' + authToken.slice(-4);
    if (internetEnv) response.envVars!.internetEnv = internetEnv;
    if (baseUrl) response.envVars!.baseUrl = baseUrl;
  }

  try {
    let needsLogin = false;
    const result = await unstable_v2_authenticate({
      environment: 'external',
      onAuthUrl: async () => { needsLogin = true; response.error = '未登录，请先登录 CodeBuddy CLI'; }
    });
    if (!needsLogin && result?.userinfo) {
      response.isLoggedIn = true; response.cliConfigured = true;
      response.method = response.envConfigured ? 'env' : 'cli';
    } else if (!needsLogin) {
      response.isLoggedIn = true; response.cliConfigured = true;
      response.method = response.envConfigured ? 'env' : 'cli';
    }
  } catch (error: any) {
    if (response.envConfigured) { response.isLoggedIn = true; response.method = 'env'; }
    else { response.error = error?.message || String(error); response.method = 'none'; }
  }

  res.json(response);
});

app.post("/api/save-env-config", (req, res) => {
  const { apiKey, authToken, internetEnv, baseUrl } = req.body;
  if (!apiKey && !authToken) return res.status(400).json({ error: '请至少配置 API Key 或 Auth Token' });
  if (apiKey) process.env.CODEBUDDY_API_KEY = apiKey;
  if (authToken) process.env.CODEBUDDY_AUTH_TOKEN = authToken;
  if (internetEnv) process.env.CODEBUDDY_INTERNET_ENVIRONMENT = internetEnv;
  if (baseUrl) process.env.CODEBUDDY_BASE_URL = baseUrl;
  res.json({ success: true, message: '配置已保存', note: '重启服务器后需重新设置' });
});

// 模型列表
let cachedModels: Array<{ modelId: string; name: string }> = [];
const defaultModel = "claude-sonnet-4";

app.get("/api/models", async (_req, res) => {
  try {
    if (cachedModels.length === 0) {
      const session = await unstable_v2_createSession({ cwd: process.cwd() });
      const models = await session.getAvailableModels();
      if (models && Array.isArray(models)) cachedModels = models;
    }
    res.json({ models: cachedModels.length > 0 ? cachedModels : [{ modelId: "claude-sonnet-4", name: "Claude Sonnet 4" }], defaultModel });
  } catch (error: any) {
    res.json({ models: [{ modelId: "claude-sonnet-4", name: "Claude Sonnet 4" }], defaultModel, error: error?.message });
  }
});

// ===================== 会话 API =====================

app.get("/api/sessions", (_req, res) => {
  try {
    const sessions = db.getAllSessions();
    const sessionsWithMessages = sessions.map(session => ({
      ...session,
      messageCount: db.getMessagesBySession(session.id).length
    }));
    res.json({ sessions: sessionsWithMessages });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "获取会话失败" });
  }
});

app.get("/api/sessions/:sessionId", (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = db.getSession(sessionId);
    if (!session) return res.status(404).json({ error: "会话不存在" });
    const messages = db.getMessagesBySession(sessionId).map(msg => ({
      ...msg,
      tool_calls: msg.tool_calls ? JSON.parse(msg.tool_calls) : null
    }));
    res.json({ session, messages });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "获取会话失败" });
  }
});

app.post("/api/sessions", (req, res) => {
  try {
    const { model = defaultModel, title = "新对话" } = req.body;
    const now = new Date().toISOString();
    const session = db.createSession({ id: uuidv4(), title, model, sdk_session_id: null, created_at: now, updated_at: now });
    res.json({ session });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "创建会话失败" });
  }
});

app.patch("/api/sessions/:sessionId", (req, res) => {
  try {
    const { sessionId } = req.params;
    const success = db.updateSession(sessionId, req.body);
    if (!success) return res.status(404).json({ error: "会话不存在" });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "更新会话失败" });
  }
});

app.delete("/api/sessions/:sessionId", (req, res) => {
  try {
    const { sessionId } = req.params;
    const success = db.deleteSession(sessionId);
    if (!success) return res.status(404).json({ error: "会话不存在" });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "删除会话失败" });
  }
});

// ===================== 满意度评分 API =====================

app.post("/api/sessions/:sessionId/satisfaction", (req, res) => {
  try {
    const { sessionId } = req.params;
    const { score, comment } = req.body;
    if (!score || score < 1 || score > 5) return res.status(400).json({ error: "评分必须在1-5之间" });
    const success = db.updateSession(sessionId, {
      satisfaction: score,
      satisfaction_comment: comment || null,
      status: 'resolved'
    });
    if (!success) return res.status(404).json({ error: "会话不存在" });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "评分失败" });
  }
});

// ===================== 转人工 API =====================

app.post("/api/sessions/:sessionId/transfer", (req, res) => {
  try {
    const { sessionId } = req.params;
    const success = db.updateSession(sessionId, {
      status: 'transferred',
      transferred_at: new Date().toISOString()
    });
    if (!success) return res.status(404).json({ error: "会话不存在" });
    
    // 记录系统消息
    db.createMessage({
      id: uuidv4(),
      session_id: sessionId,
      role: 'system',
      content: '已转接人工客服，预计等待时间 2-5 分钟。当前排队人数：3 人。客服工作时间：周一至周日 9:00-21:00。',
      model: null,
      created_at: new Date().toISOString(),
      tool_calls: null
    });
    
    res.json({ success: true, message: '已成功转接人工客服' });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "转接失败" });
  }
});

// ===================== FAQ API =====================

app.get("/api/faq", (_req, res) => {
  try {
    const faqs = db.getAllFaq();
    res.json({ faqs });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "获取 FAQ 失败" });
  }
});

app.get("/api/faq/search", (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json({ faqs: [] });
    const faqs = db.searchFaq(String(q));
    res.json({ faqs });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "FAQ 搜索失败" });
  }
});

app.post("/api/faq", (req, res) => {
  try {
    const { category, question, answer, keywords } = req.body;
    if (!category || !question || !answer || !keywords) return res.status(400).json({ error: "缺少必填字段" });
    const now = new Date().toISOString();
    const faq = db.createFaq({ id: uuidv4(), category, question, answer, keywords, hit_count: 0, created_at: now, updated_at: now });
    res.json({ faq });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "创建 FAQ 失败" });
  }
});

app.put("/api/faq/:faqId", (req, res) => {
  try {
    const { faqId } = req.params;
    const success = db.updateFaq(faqId, req.body);
    if (!success) return res.status(404).json({ error: "FAQ 不存在" });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "更新 FAQ 失败" });
  }
});

app.delete("/api/faq/:faqId", (req, res) => {
  try {
    const { faqId } = req.params;
    const success = db.deleteFaq(faqId);
    if (!success) return res.status(404).json({ error: "FAQ 不存在" });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "删除 FAQ 失败" });
  }
});

// ===================== 管理后台统计 API =====================

app.get("/api/admin/stats", (_req, res) => {
  try {
    const stats = db.getAdminStats();
    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "获取统计失败" });
  }
});

app.get("/api/admin/sessions", (req, res) => {
  try {
    const { status, intent, page = '1', limit = '20' } = req.query;
    const all = db.getAllSessions();
    
    let filtered = all;
    if (status) filtered = filtered.filter(s => s.status === status);
    if (intent) filtered = filtered.filter(s => s.intent === intent);
    
    const pageNum = parseInt(String(page));
    const limitNum = parseInt(String(limit));
    const total = filtered.length;
    const sessions = filtered.slice((pageNum - 1) * limitNum, pageNum * limitNum);
    
    const sessionsWithMessages = sessions.map(s => ({
      ...s,
      messageCount: db.getMessagesBySession(s.id).length
    }));
    
    res.json({ sessions: sessionsWithMessages, total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "获取对话记录失败" });
  }
});

// ===================== 权限请求处理 =====================

interface PendingPermission {
  resolve: (result: PermissionResult) => void;
  reject: (error: Error) => void;
  toolName: string;
  input: Record<string, unknown>;
  sessionId: string;
  timestamp: number;
}
const pendingPermissions = new Map<string, PendingPermission>();
const PERMISSION_TIMEOUT = 5 * 60 * 1000;

app.post("/api/permission-response", (req, res) => {
  const { requestId, behavior, message } = req.body;
  const pending = pendingPermissions.get(requestId);
  if (!pending) return res.status(404).json({ error: "权限请求不存在或已超时" });
  pendingPermissions.delete(requestId);
  if (behavior === 'allow') {
    pending.resolve({ behavior: 'allow', updatedInput: pending.input });
  } else {
    pending.resolve({ behavior: 'deny', message: message || '用户拒绝了此操作' });
  }
  res.json({ success: true });
});

// ===================== 聊天 API（核心） =====================

app.post("/api/chat", async (req, res) => {
  const { sessionId, message, model, permissionMode } = req.body;

  console.log(`\n[Chat] ========== 新请求 ==========`);
  console.log(`[Chat] SessionId: ${sessionId}, Model: ${model}`);
  console.log(`[Chat] Message: ${message?.slice(0, 100)}`);

  if (!message) return res.status(400).json({ error: "消息不能为空" });

  // 获取或创建会话
  let session = sessionId ? db.getSession(sessionId) : null;
  const now = new Date().toISOString();

  if (!session) {
    session = db.createSession({
      id: sessionId || uuidv4(),
      title: message.slice(0, 30) + (message.length > 30 ? '...' : ''),
      model: model || defaultModel,
      sdk_session_id: null,
      created_at: now,
      updated_at: now
    });
  }

  const selectedModel = model || session.model;
  const sdkSessionId = session.sdk_session_id;
  const userMessageId = uuidv4();
  const assistantMessageId = uuidv4();

  // 保存用户消息
  try {
    db.createMessage({ id: userMessageId, session_id: session.id, role: 'user', content: message, model: null, created_at: now, tool_calls: null });
  } catch (err: any) {
    return res.status(500).json({ error: "保存消息失败", detail: err?.message });
  }

  // SSE 响应头
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    // 构建附加 FAQ 上下文的提示词
    const faqResults = db.searchFaq(message);
    let enrichedPrompt = message;
    if (faqResults.length > 0) {
      const faqContext = faqResults.map(f => `Q: ${f.question}\nA: ${f.answer}`).join('\n\n');
      enrichedPrompt = `${message}\n\n[系统知识库参考（仅供你参考，不要直接暴露给用户）]\n${faqContext}`;
      // 增加 FAQ 命中计数
      faqResults.forEach(f => db.incrementFaqHit(f.id));
    }

    const canUseTool: CanUseTool = async (toolName, input, options) => {
      if (permissionMode === 'bypassPermissions') return { behavior: 'allow', updatedInput: input };
      const requestId = uuidv4();
      res.write(`data: ${JSON.stringify({ type: "permission_request", requestId, toolUseId: options.toolUseID, toolName, input, sessionId: session!.id })}\n\n`);
      return new Promise<PermissionResult>((resolve, reject) => {
        pendingPermissions.set(requestId, { resolve, reject, toolName, input, sessionId: session!.id, timestamp: Date.now() });
        setTimeout(() => {
          if (pendingPermissions.has(requestId)) {
            pendingPermissions.delete(requestId);
            resolve({ behavior: 'deny', message: '权限请求超时' });
          }
        }, PERMISSION_TIMEOUT);
      });
    };

    const stream = query({
      prompt: enrichedPrompt,
      options: {
        cwd: process.cwd(),
        model: selectedModel,
        maxTurns: 10,
        systemPrompt: CUSTOMER_SERVICE_SYSTEM_PROMPT,
        permissionMode: permissionMode || 'bypassPermissions',
        canUseTool,
        ...(sdkSessionId ? { resume: sdkSessionId } : {})
      }
    });

    let fullResponse = "";
    let toolCalls: Array<{ id: string; name: string; input?: Record<string, unknown>; status: string; result?: string; isError?: boolean }> = [];
    let newSdkSessionId: string | null = null;
    let currentToolId: string | null = null;

    res.write(`data: ${JSON.stringify({ type: "init", sessionId: session.id, userMessageId, assistantMessageId, model: selectedModel })}\n\n`);

    for await (const msg of stream) {
      if (msg.type === "system" && (msg as any).subtype === "init") {
        newSdkSessionId = (msg as any).session_id;
        if (newSdkSessionId && newSdkSessionId !== sdkSessionId) {
          db.updateSession(session.id, { sdk_session_id: newSdkSessionId });
        }
      } else if (msg.type === "assistant") {
        const content = msg.message.content;
        if (typeof content === "string") {
          fullResponse += content;
          res.write(`data: ${JSON.stringify({ type: "text", content })}\n\n`);
        } else if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === "text") {
              fullResponse += block.text;
              res.write(`data: ${JSON.stringify({ type: "text", content: block.text })}\n\n`);
            } else if (block.type === "tool_use") {
              currentToolId = block.id || uuidv4();
              const toolCall = { id: currentToolId, name: block.name, input: (block as any).input || {}, status: "running" };
              toolCalls.push(toolCall);
              res.write(`data: ${JSON.stringify({ type: "tool", ...toolCall })}\n\n`);
            }
          }
        }
      } else if (msg.type === "tool_result") {
        const msgAny = msg as any;
        const toolId = msgAny.tool_use_id || currentToolId;
        const isError = msgAny.is_error || false;
        const tool = toolCalls.find(t => t.id === toolId) || toolCalls[toolCalls.length - 1];
        if (tool) {
          tool.status = isError ? "error" : "completed";
          tool.isError = isError;
          tool.result = typeof msgAny.content === 'string' ? msgAny.content : JSON.stringify(msgAny.content);
          res.write(`data: ${JSON.stringify({ type: "tool_result", toolId: tool.id, content: tool.result, isError })}\n\n`);
        }
        currentToolId = null;
      } else if (msg.type === "result") {
        toolCalls.forEach(tool => {
          if (tool.status === "running") {
            tool.status = "completed";
            res.write(`data: ${JSON.stringify({ type: "tool_result", toolId: tool.id, content: "已完成" })}\n\n`);
          }
        });
        res.write(`data: ${JSON.stringify({ type: "done", duration: msg.duration, cost: msg.cost })}\n\n`);
      }
    }

    // 解析意图并更新会话
    const { cleanText, intent, isTransfer } = extractIntent(fullResponse);

    // 保存助手消息（去除 intent 标记）
    db.createMessage({
      id: assistantMessageId,
      session_id: session.id,
      role: 'assistant',
      content: cleanText,
      model: selectedModel,
      created_at: new Date().toISOString(),
      tool_calls: toolCalls.length > 0 ? JSON.stringify(toolCalls) : null,
      intent: intent?.type || null,
      is_transfer_trigger: isTransfer ? 1 : 0
    });

    // 更新会话意图
    if (intent && intent.type !== 'unknown') {
      db.updateSession(session.id, { intent: intent.type });
    }

    // 自动转人工
    if (isTransfer && session.status === 'active') {
      db.updateSession(session.id, { status: 'transferred', transferred_at: new Date().toISOString() });
      res.write(`data: ${JSON.stringify({ type: "transfer_triggered", sessionId: session.id })}\n\n`);
    }

    // 发送清理后的完整回复（客户端用来替换流式文本）
    res.write(`data: ${JSON.stringify({ type: "final_text", content: cleanText, intent: intent?.type, shouldTransfer: isTransfer })}\n\n`);

    // 更新会话标题
    const messages = db.getMessagesBySession(session.id);
    if (messages.length <= 2) {
      db.updateSession(session.id, {
        title: message.slice(0, 30) + (message.length > 30 ? '...' : ''),
        model: selectedModel
      });
    }

    res.end();
  } catch (error: any) {
    console.error(`[Chat] Error:`, error?.message);
    res.write(`data: ${JSON.stringify({ type: "error", message: error?.message || "处理请求时发生错误" })}\n\n`);
    res.end();
  }
});

// ===================== 启动服务器 =====================

app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════╗
║                                              ║
║   🤖 智能客服 Agent 后端已启动                ║
║                                              ║
║   地址: http://localhost:${PORT}               ║
║   数据库: SQLite (data/chat.db)              ║
║   FAQ 知识库: 已加载                          ║
║                                              ║
╚══════════════════════════════════════════════╝
  `);
});
