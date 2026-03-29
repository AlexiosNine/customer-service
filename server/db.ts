import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 数据库文件路径
const dbPath = path.join(__dirname, '..', 'data', 'chat.db');

// 确保 data 目录存在
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// 创建数据库连接
const db = new Database(dbPath);

// 启用 WAL 模式以提高性能
db.pragma('journal_mode = WAL');

// 初始化数据库表
db.exec(`
  -- 会话表（扩展客服字段）
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    model TEXT NOT NULL,
    sdk_session_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    -- 客服扩展字段
    intent TEXT DEFAULT 'unknown',
    status TEXT DEFAULT 'active' CHECK(status IN ('active','transferred','resolved','closed')),
    satisfaction INTEGER,
    satisfaction_comment TEXT,
    transferred_at TEXT,
    resolved_at TEXT,
    agent_id TEXT
  );

  -- 消息表
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    model TEXT,
    created_at TEXT NOT NULL,
    tool_calls TEXT,
    intent TEXT,
    is_transfer_trigger INTEGER DEFAULT 0,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
  );

  -- FAQ 知识库
  CREATE TABLE IF NOT EXISTS faq (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    keywords TEXT NOT NULL,
    hit_count INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- 满意度统计（聚合缓存，每日更新）
  CREATE TABLE IF NOT EXISTS satisfaction_stats (
    date TEXT PRIMARY KEY,
    total_sessions INTEGER DEFAULT 0,
    rated_sessions INTEGER DEFAULT 0,
    avg_score REAL DEFAULT 0,
    score_1 INTEGER DEFAULT 0,
    score_2 INTEGER DEFAULT 0,
    score_3 INTEGER DEFAULT 0,
    score_4 INTEGER DEFAULT 0,
    score_5 INTEGER DEFAULT 0,
    transferred_count INTEGER DEFAULT 0,
    resolved_count INTEGER DEFAULT 0
  );

  -- 索引
  CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
  CREATE INDEX IF NOT EXISTS idx_sessions_intent ON sessions(intent);
  CREATE INDEX IF NOT EXISTS idx_faq_category ON faq(category);
`);

// 数据库迁移：兼容旧表结构
try {
  const tableInfo = db.prepare("PRAGMA table_info(sessions)").all() as Array<{ name: string }>;
  const cols = tableInfo.map(c => c.name);
  const migrations: Record<string, string> = {
    sdk_session_id: "ALTER TABLE sessions ADD COLUMN sdk_session_id TEXT",
    intent: "ALTER TABLE sessions ADD COLUMN intent TEXT DEFAULT 'unknown'",
    status: "ALTER TABLE sessions ADD COLUMN status TEXT DEFAULT 'active'",
    satisfaction: "ALTER TABLE sessions ADD COLUMN satisfaction INTEGER",
    satisfaction_comment: "ALTER TABLE sessions ADD COLUMN satisfaction_comment TEXT",
    transferred_at: "ALTER TABLE sessions ADD COLUMN transferred_at TEXT",
    resolved_at: "ALTER TABLE sessions ADD COLUMN resolved_at TEXT",
    agent_id: "ALTER TABLE sessions ADD COLUMN agent_id TEXT",
  };
  for (const [col, sql] of Object.entries(migrations)) {
    if (!cols.includes(col)) {
      db.exec(sql);
      console.log(`[DB] Migration: added column '${col}' to sessions`);
    }
  }
} catch (e) {
  console.error('[DB] Migration error:', e);
}

try {
  const msgInfo = db.prepare("PRAGMA table_info(messages)").all() as Array<{ name: string }>;
  const msgCols = msgInfo.map(c => c.name);
  if (!msgCols.includes('intent')) {
    db.exec("ALTER TABLE messages ADD COLUMN intent TEXT");
    db.exec("ALTER TABLE messages ADD COLUMN is_transfer_trigger INTEGER DEFAULT 0");
  }
} catch (e) { /* ignore */ }

// 预置 FAQ 数据
const faqCount = (db.prepare('SELECT COUNT(*) as c FROM faq').get() as any).c;
if (faqCount === 0) {
  const insertFaq = db.prepare(`
    INSERT INTO faq (id, category, question, answer, keywords, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const now = new Date().toISOString();
  const faqs = [
    // 退款类
    ['faq-001', 'refund', '如何申请退款？', '您可以在订单详情页点击"申请退款"按钮，填写退款原因后提交。审核通过后，款项将在3-5个工作日内退还至原支付账户。', '退款,申请退款,退钱,退货', now, now],
    ['faq-002', 'refund', '退款需要多少天到账？', '退款审核通过后，款项将在3-5个工作日内退还。具体到账时间以银行处理为准，若超过7天未到账请联系客服。', '退款多久,几天到账,退款时间', now, now],
    ['faq-003', 'refund', '退款被拒绝了怎么办？', '退款被拒绝可能因为商品已签收超过7天、二次使用或人为损坏等原因。如您认为处理有误，可提供相关证明联系客服申诉。', '退款拒绝,退款失败,退款不通过', now, now],
    // 订单类
    ['faq-004', 'order', '如何查询我的订单？', '登录账号后，进入"个人中心" > "我的订单"即可查看所有订单。您也可以通过搜索订单号快速定位。', '查订单,订单查询,订单状态', now, now],
    ['faq-005', 'order', '订单什么时候发货？', '付款成功后，商家通常在1-2个工作日内发货。节假日或促销期间可能延迟，具体以商家公告为准。', '发货时间,几天发货,什么时候发', now, now],
    ['faq-006', 'order', '如何修改订单收货地址？', '订单发货前可修改地址：进入订单详情页，点击"修改地址"。若已发货则无法修改，请联系快递公司协商。', '修改地址,换地址,收货地址', now, now],
    ['faq-007', 'order', '如何取消订单？', '未发货的订单可在订单详情页点击"取消订单"。已发货的订单需先拒收，退货到仓后自动退款。', '取消订单,撤销订单', now, now],
    // 技术支持类
    ['faq-008', 'tech', '无法登录账号怎么办？', '请尝试以下步骤：1) 确认账号密码是否正确；2) 点击"忘记密码"重置；3) 清除浏览器缓存；4) 尝试其他浏览器。若仍无法登录请联系客服。', '登录失败,无法登录,登不上去', now, now],
    ['faq-009', 'tech', '支付失败怎么办？', '支付失败可能原因：余额不足、银行卡限额、网络异常。建议：1) 检查余额；2) 联系银行解除限额；3) 换用其他支付方式重试。', '支付失败,付款失败,无法支付', now, now],
    ['faq-010', 'tech', '页面加载缓慢或报错怎么办？', '请尝试：1) 刷新页面；2) 清除浏览器缓存（Ctrl+Shift+Del）；3) 换用Chrome/Edge最新版；4) 检查网络连接。', '加载慢,页面报错,白屏,卡顿', now, now],
    // 账户类
    ['faq-011', 'account', '如何修改密码？', '进入"个人中心" > "账户安全" > "修改密码"，输入原密码和新密码即可。建议使用8位以上含字母数字的组合密码。', '修改密码,改密码,忘记密码', now, now],
    ['faq-012', 'account', '如何绑定手机号？', '进入"个人中心" > "账户安全" > "绑定手机"，输入手机号并验证短信验证码即可完成绑定。', '绑定手机,换手机,手机号', now, now],
  ];
  
  const insertMany = db.transaction(() => {
    for (const faq of faqs) {
      insertFaq.run(...faq);
    }
  });
  insertMany();
  console.log('[DB] Seeded FAQ data:', faqs.length, 'entries');
}

// ==================== 类型定义 ====================

export interface DbSession {
  id: string;
  title: string;
  model: string;
  sdk_session_id: string | null;
  created_at: string;
  updated_at: string;
  intent?: string;
  status?: string;
  satisfaction?: number | null;
  satisfaction_comment?: string | null;
  transferred_at?: string | null;
  resolved_at?: string | null;
  agent_id?: string | null;
}

export interface DbMessage {
  id: string;
  session_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  model: string | null;
  created_at: string;
  tool_calls: string | null;
  intent?: string | null;
  is_transfer_trigger?: number;
}

export interface DbFaq {
  id: string;
  category: string;
  question: string;
  answer: string;
  keywords: string;
  hit_count: number;
  created_at: string;
  updated_at: string;
}

// ==================== 会话操作 ====================

export function getAllSessions(): DbSession[] {
  const stmt = db.prepare('SELECT * FROM sessions ORDER BY updated_at DESC');
  return stmt.all() as DbSession[];
}

export function getSession(id: string): DbSession | undefined {
  const stmt = db.prepare('SELECT * FROM sessions WHERE id = ?');
  return stmt.get(id) as DbSession | undefined;
}

export function createSession(session: DbSession): DbSession {
  const stmt = db.prepare(`
    INSERT INTO sessions (id, title, model, sdk_session_id, intent, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    session.id, session.title, session.model, session.sdk_session_id,
    session.intent || 'unknown', session.status || 'active',
    session.created_at, session.updated_at
  );
  return session;
}

export function updateSession(id: string, updates: Partial<DbSession>): boolean {
  const allowedFields: (keyof DbSession)[] = [
    'title', 'model', 'sdk_session_id', 'intent', 'status',
    'satisfaction', 'satisfaction_comment', 'transferred_at', 'resolved_at', 'agent_id'
  ];
  const fields: string[] = [];
  const values: any[] = [];

  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      fields.push(`${field} = ?`);
      values.push(updates[field]);
    }
  }

  if (fields.length === 0) return false;

  fields.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(id);

  const stmt = db.prepare(`UPDATE sessions SET ${fields.join(', ')} WHERE id = ?`);
  const result = stmt.run(...values);
  return result.changes > 0;
}

export function deleteSession(id: string): boolean {
  const stmt = db.prepare('DELETE FROM sessions WHERE id = ?');
  const result = stmt.run(id);
  return result.changes > 0;
}

// ==================== 消息操作 ====================

export function getMessagesBySession(sessionId: string): DbMessage[] {
  const stmt = db.prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC');
  return stmt.all(sessionId) as DbMessage[];
}

export function createMessage(message: DbMessage): DbMessage {
  const stmt = db.prepare(`
    INSERT INTO messages (id, session_id, role, content, model, created_at, tool_calls, intent, is_transfer_trigger)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    message.id, message.session_id, message.role, message.content,
    message.model, message.created_at, message.tool_calls,
    message.intent || null, message.is_transfer_trigger || 0
  );

  const updateStmt = db.prepare('UPDATE sessions SET updated_at = ? WHERE id = ?');
  updateStmt.run(new Date().toISOString(), message.session_id);

  return message;
}

export function updateMessage(id: string, updates: Partial<Pick<DbMessage, 'content' | 'tool_calls' | 'intent'>>): boolean {
  const fields: string[] = [];
  const values: any[] = [];

  if (updates.content !== undefined) { fields.push('content = ?'); values.push(updates.content); }
  if (updates.tool_calls !== undefined) { fields.push('tool_calls = ?'); values.push(updates.tool_calls); }
  if (updates.intent !== undefined) { fields.push('intent = ?'); values.push(updates.intent); }

  if (fields.length === 0) return false;

  values.push(id);
  const stmt = db.prepare(`UPDATE messages SET ${fields.join(', ')} WHERE id = ?`);
  const result = stmt.run(...values);
  return result.changes > 0;
}

export function deleteMessage(id: string): boolean {
  const stmt = db.prepare('DELETE FROM messages WHERE id = ?');
  const result = stmt.run(id);
  return result.changes > 0;
}

// ==================== FAQ 操作 ====================

export function getAllFaq(): DbFaq[] {
  return db.prepare('SELECT * FROM faq ORDER BY category, hit_count DESC').all() as DbFaq[];
}

export function getFaqByCategory(category: string): DbFaq[] {
  return db.prepare('SELECT * FROM faq WHERE category = ? ORDER BY hit_count DESC').all(category) as DbFaq[];
}

export function searchFaq(query: string): DbFaq[] {
  const keywords = query.toLowerCase().split(/\s+/);
  const all = getAllFaq();
  
  return all
    .map(faq => {
      const text = `${faq.question} ${faq.keywords} ${faq.answer}`.toLowerCase();
      const score = keywords.filter(kw => text.includes(kw)).length;
      return { faq, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ faq }) => faq);
}

export function incrementFaqHit(id: string): void {
  db.prepare('UPDATE faq SET hit_count = hit_count + 1 WHERE id = ?').run(id);
}

export function createFaq(faq: DbFaq): DbFaq {
  db.prepare(`
    INSERT INTO faq (id, category, question, answer, keywords, hit_count, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 0, ?, ?)
  `).run(faq.id, faq.category, faq.question, faq.answer, faq.keywords, faq.created_at, faq.updated_at);
  return faq;
}

export function updateFaq(id: string, updates: Partial<Pick<DbFaq, 'question' | 'answer' | 'keywords' | 'category'>>): boolean {
  const fields: string[] = [];
  const values: any[] = [];
  if (updates.question !== undefined) { fields.push('question = ?'); values.push(updates.question); }
  if (updates.answer !== undefined) { fields.push('answer = ?'); values.push(updates.answer); }
  if (updates.keywords !== undefined) { fields.push('keywords = ?'); values.push(updates.keywords); }
  if (updates.category !== undefined) { fields.push('category = ?'); values.push(updates.category); }
  if (fields.length === 0) return false;
  fields.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(id);
  return (db.prepare(`UPDATE faq SET ${fields.join(', ')} WHERE id = ?`).run(...values) as any).changes > 0;
}

export function deleteFaq(id: string): boolean {
  return (db.prepare('DELETE FROM faq WHERE id = ?').run(id) as any).changes > 0;
}

// ==================== 统计数据 ====================

export interface AdminStats {
  totalSessions: number;
  activeSessions: number;
  transferredSessions: number;
  resolvedSessions: number;
  ratedSessions: number;
  avgSatisfaction: number;
  satisfactionDist: Record<string, number>;
  intentDist: Record<string, number>;
  dailyTrend: Array<{ date: string; count: number; avgScore: number }>;
  topFaqs: DbFaq[];
}

export function getAdminStats(): AdminStats {
  const total = (db.prepare('SELECT COUNT(*) as c FROM sessions').get() as any).c;
  const active = (db.prepare("SELECT COUNT(*) as c FROM sessions WHERE status = 'active'").get() as any).c;
  const transferred = (db.prepare("SELECT COUNT(*) as c FROM sessions WHERE status = 'transferred'").get() as any).c;
  const resolved = (db.prepare("SELECT COUNT(*) as c FROM sessions WHERE status IN ('resolved','closed')").get() as any).c;
  
  const ratingData = db.prepare(
    "SELECT COUNT(*) as c, AVG(satisfaction) as avg FROM sessions WHERE satisfaction IS NOT NULL"
  ).get() as any;
  
  const ratedCount = ratingData.c || 0;
  const avgScore = ratingData.avg ? Math.round(ratingData.avg * 10) / 10 : 0;

  // 满意度分布
  const dist: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
  const distData = db.prepare(
    "SELECT satisfaction, COUNT(*) as c FROM sessions WHERE satisfaction IS NOT NULL GROUP BY satisfaction"
  ).all() as Array<{ satisfaction: number; c: number }>;
  distData.forEach(r => { dist[String(r.satisfaction)] = r.c; });

  // 意图分布
  const intentData = db.prepare(
    "SELECT intent, COUNT(*) as c FROM sessions GROUP BY intent ORDER BY c DESC"
  ).all() as Array<{ intent: string; c: number }>;
  const intentDist: Record<string, number> = {};
  intentData.forEach(r => { intentDist[r.intent || 'unknown'] = r.c; });

  // 最近7天趋势
  const trend = db.prepare(`
    SELECT DATE(created_at) as date, COUNT(*) as count,
           AVG(CASE WHEN satisfaction IS NOT NULL THEN satisfaction ELSE NULL END) as avgScore
    FROM sessions
    WHERE created_at >= DATE('now', '-7 days')
    GROUP BY DATE(created_at)
    ORDER BY date ASC
  `).all() as Array<{ date: string; count: number; avgScore: number | null }>;

  const dailyTrend = trend.map(r => ({
    date: r.date,
    count: r.count,
    avgScore: r.avgScore ? Math.round(r.avgScore * 10) / 10 : 0
  }));

  // 热门 FAQ
  const topFaqs = db.prepare('SELECT * FROM faq ORDER BY hit_count DESC LIMIT 10').all() as DbFaq[];

  return {
    totalSessions: total,
    activeSessions: active,
    transferredSessions: transferred,
    resolvedSessions: resolved,
    ratedSessions: ratedCount,
    avgSatisfaction: avgScore,
    satisfactionDist: dist,
    intentDist,
    dailyTrend,
    topFaqs
  };
}

export function clearAllData(): void {
  db.exec('DELETE FROM messages');
  db.exec('DELETE FROM sessions');
}

export default db;
