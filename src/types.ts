export type PermissionMode = 'default' | 'acceptEdits' | 'plan' | 'bypassPermissions';

export interface Model {
  modelId: string;
  name: string;
  description?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  input?: Record<string, unknown>;
  status: 'running' | 'completed' | 'error';
  result?: string;
  isError?: boolean;
}

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; toolCall: ToolCall };

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  model?: string;
  timestamp: Date;
  isStreaming?: boolean;
  toolCalls?: ToolCall[];
  contentBlocks?: ContentBlock[];
  intent?: string;
  isTransferTrigger?: boolean;
}

export interface Session {
  id: string;
  title: string;
  model: string;
  agentId?: string;
  cwd?: string;
  permissionMode?: PermissionMode;
  createdAt: Date;
  messages: Message[];
  // 客服扩展字段
  intent?: string;
  status?: 'active' | 'transferred' | 'resolved' | 'closed';
  satisfaction?: number | null;
  satisfactionComment?: string | null;
  transferredAt?: string | null;
  resolvedAt?: string | null;
}

export interface CustomAgent {
  id: string;
  name: string;
  description?: string;
  systemPrompt: string;
  icon?: string;
  color?: string;
  permissionMode?: PermissionMode;
  createdAt: Date;
  updatedAt: Date;
}

export type Agent = CustomAgent;

export type Theme = 'light' | 'dark';

export interface PermissionRequest {
  requestId: string;
  toolUseId: string;
  toolName: string;
  input: Record<string, unknown>;
  sessionId: string;
  timestamp: number;
}

export interface PermissionResponse {
  requestId: string;
  behavior: 'allow' | 'deny';
  message?: string;
}

export interface FaqItem {
  id: string;
  category: string;
  question: string;
  answer: string;
  keywords: string;
  hit_count: number;
  created_at: string;
  updated_at: string;
}

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
  topFaqs: FaqItem[];
}
