import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Table,
  Card,
  Tag,
  Button,
  Select,
  Statistic,
  Loading,
  Dialog,
  Rate,
  Tabs,
  Form,
  Input,
  Textarea,
  NotificationPlugin,
  Popconfirm,
  Space,
} from 'tdesign-react';

const { TabPanel } = Tabs;
const { FormItem } = Form;
import {
  RefreshIcon,
  UserIcon,
  ServiceIcon,
  CheckCircleIcon,
  StarIcon,
  AddIcon,
  EditIcon,
  DeleteIcon,
  BookOpenIcon,
} from 'tdesign-icons-react';

const CustomerServiceIcon = ServiceIcon;
import { AdminStats, FaqItem } from '../types';

interface AdminSession {
  id: string;
  title: string;
  model: string;
  intent?: string;
  status?: string;
  satisfaction?: number | null;
  satisfaction_comment?: string | null;
  created_at: string;
  updated_at: string;
  transferred_at?: string | null;
  resolved_at?: string | null;
  messageCount?: number;
}

const STATUS_MAP: Record<string, { text: string; theme: 'default' | 'primary' | 'warning' | 'danger' | 'success' }> = {
  active: { text: '进行中', theme: 'primary' },
  transferred: { text: '已转人工', theme: 'warning' },
  resolved: { text: '已解决', theme: 'success' },
  closed: { text: '已关闭', theme: 'default' },
};

const INTENT_MAP: Record<string, string> = {
  refund: '退款',
  order: '订单',
  tech: '技术支持',
  account: '账户',
  complaint: '投诉',
  general: '一般咨询',
  unknown: '未识别',
};

const CATEGORY_OPTIONS = [
  { label: '退款', value: 'refund' },
  { label: '订单', value: 'order' },
  { label: '技术支持', value: 'tech' },
  { label: '账户', value: 'account' },
  { label: '投诉', value: 'complaint' },
  { label: '一般咨询', value: 'general' },
];

// ===== FAQ 编辑弹窗 =====
interface FaqFormData {
  category: string;
  question: string;
  answer: string;
  keywords: string;
}

interface FaqDialogProps {
  visible: boolean;
  faq: FaqItem | null; // null = 新增
  onClose: () => void;
  onSaved: () => void;
}

function FaqDialog({ visible, faq, onClose, onSaved }: FaqDialogProps) {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const isEdit = !!faq;

  useEffect(() => {
    if (visible) {
      if (faq) {
        form.setFieldsValue({
          category: faq.category,
          question: faq.question,
          answer: faq.answer,
          keywords: faq.keywords,
        });
      } else {
        form.reset();
      }
    }
  }, [visible, faq, form]);

  const handleSubmit = async () => {
    const result = await form.validate();
    if (result !== true) return;

    const values = form.getFieldsValue(true) as FaqFormData;
    setSaving(true);
    try {
      let res;
      if (isEdit) {
        res = await fetch(`/api/faq/${faq!.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(values),
        });
      } else {
        res = await fetch('/api/faq', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(values),
        });
      }
      if (!res.ok) throw new Error(await res.text());
      NotificationPlugin.success({ title: isEdit ? 'FAQ 已更新' : 'FAQ 已添加', duration: 2000, placement: 'top-right' });
      onSaved();
      onClose();
    } catch (e: any) {
      NotificationPlugin.error({ title: '保存失败', content: e?.message, duration: 3000, placement: 'top-right' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      header={isEdit ? '编辑 FAQ' : '新增 FAQ'}
      visible={visible}
      onClose={onClose}
      width={600}
      confirmBtn={
        <Button theme="primary" loading={saving} onClick={handleSubmit}>
          保存
        </Button>
      }
      cancelBtn={<Button variant="outline" onClick={onClose}>取消</Button>}
    >
      <Form form={form} labelAlign="top" colon>
        <FormItem label="分类" name="category" rules={[{ required: true, message: '请选择分类' }]}>
          <Select options={CATEGORY_OPTIONS} placeholder="请选择分类" />
        </FormItem>
        <FormItem label="问题" name="question" rules={[{ required: true, message: '请输入问题' }]}>
          <Input placeholder="例：如何申请退款？" />
        </FormItem>
        <FormItem label="回答" name="answer" rules={[{ required: true, message: '请输入回答' }]}>
          <Textarea placeholder="输入详细回答内容..." autosize={{ minRows: 4, maxRows: 8 }} />
        </FormItem>
        <FormItem
          label="关键词"
          name="keywords"
          rules={[{ required: true, message: '请输入关键词' }]}
          help="多个关键词用逗号分隔，用于用户提问时的匹配检索"
        >
          <Input placeholder="例：退款,申请退款,退钱" />
        </FormItem>
      </Form>
    </Dialog>
  );
}

// ===== 知识库管理面板 =====
function KnowledgeBasePanel() {
  const [faqs, setFaqs] = useState<FaqItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [dialogVisible, setDialogVisible] = useState(false);
  const [editingFaq, setEditingFaq] = useState<FaqItem | null>(null);

  const fetchFaqs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/faq');
      const data = await res.json();
      setFaqs(data.faqs || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchFaqs(); }, [fetchFaqs]);

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/faq/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('删除失败');
      NotificationPlugin.success({ title: 'FAQ 已删除', duration: 2000, placement: 'top-right' });
      fetchFaqs();
    } catch (e: any) {
      NotificationPlugin.error({ title: '删除失败', content: e?.message, duration: 3000, placement: 'top-right' });
    }
  };

  const handleEdit = (faq: FaqItem) => {
    setEditingFaq(faq);
    setDialogVisible(true);
  };

  const handleAdd = () => {
    setEditingFaq(null);
    setDialogVisible(true);
  };

  const filteredFaqs = categoryFilter
    ? faqs.filter(f => f.category === categoryFilter)
    : faqs;

  const columns = [
    {
      colKey: 'category',
      title: '分类',
      width: 100,
      cell: ({ row }: { row: FaqItem }) => (
        <Tag size="small" variant="light" theme="primary">
          {INTENT_MAP[row.category] || row.category}
        </Tag>
      ),
    },
    {
      colKey: 'question',
      title: '问题',
      width: 220,
      ellipsis: true,
      cell: ({ row }: { row: FaqItem }) => (
        <span className="font-medium text-sm" style={{ color: 'var(--td-text-color-primary)' }}>
          {row.question}
        </span>
      ),
    },
    {
      colKey: 'answer',
      title: '回答',
      ellipsis: true,
      cell: ({ row }: { row: FaqItem }) => (
        <span className="text-sm" style={{ color: 'var(--td-text-color-secondary)' }}>
          {row.answer}
        </span>
      ),
    },
    {
      colKey: 'keywords',
      title: '关键词',
      width: 160,
      ellipsis: true,
      cell: ({ row }: { row: FaqItem }) => (
        <span className="text-xs" style={{ color: 'var(--td-text-color-placeholder)' }}>
          {row.keywords}
        </span>
      ),
    },
    {
      colKey: 'hit_count',
      title: '命中',
      width: 70,
      cell: ({ row }: { row: FaqItem }) => (
        <Tag size="small" variant="light" theme={row.hit_count > 10 ? 'success' : 'default'}>
          {row.hit_count}
        </Tag>
      ),
    },
    {
      colKey: 'actions',
      title: '操作',
      width: 120,
      cell: ({ row }: { row: FaqItem }) => (
        <Space>
          <Button
            size="small"
            variant="text"
            icon={<EditIcon />}
            onClick={() => handleEdit(row)}
          >
            编辑
          </Button>
          <Popconfirm
            content="确认删除该 FAQ 条目？"
            theme="danger"
            onConfirm={() => handleDelete(row.id)}
          >
            <Button size="small" variant="text" theme="danger" icon={<DeleteIcon />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {/* 工具栏 */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Select
            placeholder="筛选分类"
            value={categoryFilter}
            onChange={(v) => setCategoryFilter(v as string)}
            clearable
            style={{ width: 140 }}
            options={CATEGORY_OPTIONS}
          />
          <span className="text-sm" style={{ color: 'var(--td-text-color-secondary)' }}>
            共 {filteredFaqs.length} 条
          </span>
        </div>
        <Button theme="primary" icon={<AddIcon />} onClick={handleAdd}>
          新增 FAQ
        </Button>
      </div>

      {/* 表格 */}
      <Table
        data={filteredFaqs}
        columns={columns}
        loading={loading}
        rowKey="id"
        stripe
        hover
        empty="暂无 FAQ 数据"
        pagination={{
          defaultPageSize: 10,
          showJumper: true,
          pageSizeOptions: [10, 20, 50],
        }}
      />

      {/* 编辑/新增弹窗 */}
      <FaqDialog
        visible={dialogVisible}
        faq={editingFaq}
        onClose={() => { setDialogVisible(false); setEditingFaq(null); }}
        onSaved={fetchFaqs}
      />
    </div>
  );
}

// ===== 主页面 =====
export function AdminPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [sessions, setSessions] = useState<AdminSession[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(15);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [intentFilter, setIntentFilter] = useState<string>('');
  const [loadingStats, setLoadingStats] = useState(true);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [selectedSession, setSelectedSession] = useState<AdminSession | null>(null);
  const [sessionMessages, setSessionMessages] = useState<any[]>([]);
  const [showDetail, setShowDetail] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  const fetchStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const res = await fetch('/api/admin/stats');
      const data = await res.json();
      setStats(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingStats(false);
    }
  }, []);

  const fetchSessions = useCallback(async () => {
    setLoadingSessions(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(pageSize),
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(intentFilter ? { intent: intentFilter } : {}),
      });
      const res = await fetch(`/api/admin/sessions?${params}`);
      const data = await res.json();
      setSessions(data.sessions || []);
      setTotal(data.total || 0);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingSessions(false);
    }
  }, [page, pageSize, statusFilter, intentFilter]);

  useEffect(() => { fetchStats(); }, [fetchStats]);
  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  const handleViewDetail = useCallback(async (session: AdminSession) => {
    setSelectedSession(session);
    setShowDetail(true);
    try {
      const res = await fetch(`/api/sessions/${session.id}`);
      const data = await res.json();
      setSessionMessages(data.messages || []);
    } catch (e) {
      setSessionMessages([]);
    }
  }, []);

  const sessionColumns = [
    {
      colKey: 'title',
      title: '对话标题',
      width: 200,
      ellipsis: true,
      cell: ({ row }: { row: AdminSession }) => (
        <span
          className="cursor-pointer hover:underline"
          style={{ color: 'var(--td-brand-color)' }}
          onClick={() => handleViewDetail(row)}
        >
          {row.title}
        </span>
      ),
    },
    {
      colKey: 'intent',
      title: '意图',
      width: 100,
      cell: ({ row }: { row: AdminSession }) => (
        <span>{INTENT_MAP[row.intent || 'unknown'] || row.intent || '-'}</span>
      ),
    },
    {
      colKey: 'status',
      title: '状态',
      width: 110,
      cell: ({ row }: { row: AdminSession }) => {
        const s = STATUS_MAP[row.status || 'active'];
        return <Tag theme={s.theme} variant="light" size="small">{s.text}</Tag>;
      },
    },
    {
      colKey: 'satisfaction',
      title: '满意度',
      width: 100,
      cell: ({ row }: { row: AdminSession }) =>
        row.satisfaction ? (
          <span className="text-yellow-500">{'★'.repeat(row.satisfaction)}{'☆'.repeat(5 - row.satisfaction)}</span>
        ) : (
          <span style={{ color: 'var(--td-text-color-placeholder)' }}>未评价</span>
        ),
    },
    {
      colKey: 'messageCount',
      title: '消息数',
      width: 80,
      cell: ({ row }: { row: AdminSession }) => <span>{row.messageCount || 0}</span>,
    },
    {
      colKey: 'created_at',
      title: '创建时间',
      width: 150,
      cell: ({ row }: { row: AdminSession }) => (
        <span className="text-sm">{new Date(row.created_at).toLocaleString('zh-CN', { hour12: false })}</span>
      ),
    },
    {
      colKey: 'actions',
      title: '操作',
      width: 80,
      cell: ({ row }: { row: AdminSession }) => (
        <Button size="small" variant="text" onClick={() => handleViewDetail(row)}>
          查看
        </Button>
      ),
    },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold" style={{ color: 'var(--td-text-color-primary)' }}>
          管理后台
        </h1>
        <Button
          icon={<RefreshIcon />}
          variant="outline"
          onClick={() => { fetchStats(); fetchSessions(); }}
        >
          刷新
        </Button>
      </div>

      {/* 统计概览卡片（始终显示） */}
      <Loading loading={loadingStats}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card bordered>
            <Statistic
              title="总对话数"
              value={stats?.totalSessions ?? 0}
              prefix={<UserIcon style={{ color: 'var(--td-brand-color)' }} />}
            />
          </Card>
          <Card bordered>
            <Statistic
              title="进行中"
              value={stats?.activeSessions ?? 0}
              color="var(--td-brand-color)"
              prefix={<CustomerServiceIcon style={{ color: 'var(--td-brand-color)' }} />}
            />
          </Card>
          <Card bordered>
            <Statistic
              title="已转人工"
              value={stats?.transferredSessions ?? 0}
              color="#fa8c16"
              prefix={<CustomerServiceIcon style={{ color: '#fa8c16' }} />}
            />
          </Card>
          <Card bordered>
            <Statistic
              title="已解决"
              value={stats?.resolvedSessions ?? 0}
              color="#52c41a"
              prefix={<CheckCircleIcon style={{ color: '#52c41a' }} />}
            />
          </Card>
        </div>
      </Loading>

      {/* Tab 分组 */}
      <Tabs value={activeTab} onChange={(v) => setActiveTab(v as string)}>
        {/* ===== 概览 Tab ===== */}
        <TabPanel value="overview" label="数据概览">
          <div className="pt-4 space-y-4">
            {/* 满意度统计 */}
            {stats && stats.ratedSessions > 0 && (
              <Card title="满意度统计" bordered>
                <div className="flex items-center gap-8 flex-wrap">
                  <div className="text-center">
                    <div className="text-4xl font-bold text-yellow-500">
                      {stats.avgSatisfaction.toFixed(1)}
                    </div>
                    <div className="text-sm mt-1" style={{ color: 'var(--td-text-color-secondary)' }}>
                      平均分（共 {stats.ratedSessions} 条评价）
                    </div>
                    <Rate value={stats.avgSatisfaction} disabled color="#faad14" />
                  </div>
                  <div className="flex-1 space-y-1 min-w-[200px]">
                    {[5, 4, 3, 2, 1].map(score => {
                      const count = stats.satisfactionDist[String(score)] || 0;
                      const pct = stats.ratedSessions > 0 ? Math.round((count / stats.ratedSessions) * 100) : 0;
                      return (
                        <div key={score} className="flex items-center gap-2 text-sm">
                          <span className="w-4 text-right text-yellow-500">{score}★</span>
                          <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden" style={{ backgroundColor: 'var(--td-bg-color-component)' }}>
                            <div
                              className="h-full rounded-full bg-yellow-400 transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="w-8 text-right" style={{ color: 'var(--td-text-color-secondary)' }}>{count}</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* 意图分布 */}
                  <div className="flex-1 min-w-[180px]">
                    <div className="text-sm font-medium mb-2" style={{ color: 'var(--td-text-color-primary)' }}>
                      意图分布
                    </div>
                    <div className="space-y-1.5">
                      {Object.entries(stats.intentDist)
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 6)
                        .map(([intent, count]) => (
                          <div key={intent} className="flex items-center justify-between text-sm">
                            <span style={{ color: 'var(--td-text-color-secondary)' }}>
                              {INTENT_MAP[intent] || intent}
                            </span>
                            <Tag size="small" variant="light" theme="primary">{count}</Tag>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {/* FAQ 热榜 */}
            {stats?.topFaqs && stats.topFaqs.length > 0 && (
              <Card title="FAQ 热榜（按命中次数）" bordered>
                <div className="space-y-2">
                  {stats.topFaqs.map((faq, idx) => (
                    <div
                      key={faq.id}
                      className="flex items-center gap-3 p-3 rounded-lg"
                      style={{ backgroundColor: idx < 3 ? 'var(--td-brand-color-light)' : 'var(--td-bg-color-component)' }}
                    >
                      <span
                        className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                        style={{
                          backgroundColor: idx < 3 ? 'var(--td-brand-color)' : 'var(--td-bg-color-component-disabled)',
                          color: idx < 3 ? 'white' : 'var(--td-text-color-secondary)',
                        }}
                      >
                        {idx + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate" style={{ color: 'var(--td-text-color-primary)' }}>
                          {faq.question}
                        </div>
                        <div className="text-xs mt-0.5" style={{ color: 'var(--td-text-color-secondary)' }}>
                          {INTENT_MAP[faq.category] || faq.category}
                        </div>
                      </div>
                      <Tag size="small" variant="light" theme="primary" icon={<StarIcon />}>
                        {faq.hit_count} 次
                      </Tag>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {stats && stats.ratedSessions === 0 && (
              <div
                className="text-center py-12 text-sm"
                style={{ color: 'var(--td-text-color-placeholder)' }}
              >
                暂无满意度数据，开始使用后将在此展示统计信息
              </div>
            )}
          </div>
        </TabPanel>

        {/* ===== 对话记录 Tab ===== */}
        <TabPanel value="sessions" label="对话记录">
          <div className="pt-4">
            <Card
              bordered
              actions={
                <div className="flex gap-2 items-center">
                  <Select
                    placeholder="筛选状态"
                    value={statusFilter}
                    onChange={(v) => { setStatusFilter(v as string); setPage(1); }}
                    clearable
                    style={{ width: 130 }}
                    options={[
                      { label: '进行中', value: 'active' },
                      { label: '已转人工', value: 'transferred' },
                      { label: '已解决', value: 'resolved' },
                      { label: '已关闭', value: 'closed' },
                    ]}
                  />
                  <Select
                    placeholder="筛选意图"
                    value={intentFilter}
                    onChange={(v) => { setIntentFilter(v as string); setPage(1); }}
                    clearable
                    style={{ width: 130 }}
                    options={Object.entries(INTENT_MAP).map(([value, label]) => ({ label, value }))}
                  />
                </div>
              }
            >
              <Table
                data={sessions}
                columns={sessionColumns}
                loading={loadingSessions}
                rowKey="id"
                pagination={{
                  current: page,
                  pageSize,
                  total,
                  onChange: ({ current }) => setPage(current),
                  showJumper: true,
                }}
                stripe
                hover
                empty="暂无对话记录"
              />
            </Card>
          </div>
        </TabPanel>

        {/* ===== 知识库管理 Tab ===== */}
        <TabPanel value="knowledge" label={<span className="flex items-center gap-1"><BookOpenIcon />知识库管理</span>}>
          <div className="pt-4">
            <KnowledgeBasePanel />
          </div>
        </TabPanel>
      </Tabs>

      {/* 对话详情弹窗 */}
      <Dialog
        header={`对话详情：${selectedSession?.title}`}
        visible={showDetail}
        onClose={() => { setShowDetail(false); setSelectedSession(null); }}
        width={640}
        footer={
          <Button onClick={() => { setShowDetail(false); setSelectedSession(null); }}>
            关闭
          </Button>
        }
      >
        {selectedSession && (
          <div className="space-y-3 max-h-[70vh] overflow-y-auto">
            {/* 元信息 */}
            <div className="flex flex-wrap gap-2 pb-2 border-b" style={{ borderColor: 'var(--td-component-border)' }}>
              <Tag size="small" variant="light">
                {INTENT_MAP[selectedSession.intent || 'unknown'] || '未识别意图'}
              </Tag>
              <Tag size="small" theme={STATUS_MAP[selectedSession.status || 'active'].theme} variant="light">
                {STATUS_MAP[selectedSession.status || 'active'].text}
              </Tag>
              {selectedSession.satisfaction && (
                <Tag size="small" theme="warning" variant="light">
                  评分 {selectedSession.satisfaction}★
                </Tag>
              )}
              <span className="text-xs" style={{ color: 'var(--td-text-color-secondary)' }}>
                {new Date(selectedSession.created_at).toLocaleString('zh-CN', { hour12: false })}
              </span>
            </div>

            {/* 满意度评论 */}
            {selectedSession.satisfaction_comment && (
              <div
                className="p-3 rounded-lg text-sm italic"
                style={{ backgroundColor: 'var(--td-bg-color-component)', color: 'var(--td-text-color-secondary)' }}
              >
                用户评论："{selectedSession.satisfaction_comment}"
              </div>
            )}

            {/* 消息记录 */}
            <div className="space-y-2">
              {sessionMessages.map((msg: any) => (
                <div
                  key={msg.id}
                  className={`p-3 rounded-xl text-sm max-w-[85%] ${
                    msg.role === 'user' ? 'ml-auto' : msg.role === 'system' ? 'mx-auto' : 'mr-auto'
                  }`}
                  style={{
                    backgroundColor:
                      msg.role === 'user'
                        ? 'var(--td-brand-color)'
                        : msg.role === 'system'
                        ? 'var(--td-warning-color-1)'
                        : 'var(--td-bg-color-component)',
                    color:
                      msg.role === 'user'
                        ? 'white'
                        : 'var(--td-text-color-primary)',
                  }}
                >
                  {msg.role === 'system' && (
                    <div className="text-xs font-medium mb-1 opacity-70">系统通知</div>
                  )}
                  <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                  <div
                    className="text-xs mt-1 opacity-60"
                    style={{ color: msg.role === 'user' ? 'rgba(255,255,255,0.7)' : 'inherit' }}
                  >
                    {new Date(msg.created_at).toLocaleTimeString('zh-CN', { hour12: false })}
                  </div>
                </div>
              ))}
              {sessionMessages.length === 0 && (
                <div className="text-center py-4 text-sm" style={{ color: 'var(--td-text-color-placeholder)' }}>
                  暂无消息记录
                </div>
              )}
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
