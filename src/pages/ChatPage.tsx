import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Model, Session, PermissionMode, CustomAgent, PermissionRequest } from '../types';
import { NewChatView } from '../components/NewChatView';
import { ChatMessages } from '../components/ChatMessages';
import { ChatInput } from '../components/ChatInput';
import { Button, Tag, Rate, Textarea, Dialog, NotificationPlugin, Upload, Card, Space, Popconfirm, Loading } from 'tdesign-react';
import { ServiceIcon, StarIcon, CheckCircleIcon, FileIcon, UploadIcon, DeleteIcon } from 'tdesign-icons-react';

const CustomerServiceIcon = ServiceIcon;

interface ChatPageProps {
  currentSession: Session | undefined;
  models: Model[];
  selectedModel: string;
  agents: CustomAgent[];
  isLoading: boolean;
  inputValue: string;
  permissionRequest: PermissionRequest | null;
  permissionMode: PermissionMode;
  transferTriggered: boolean;
  currentIntent: string | null;
  onSendMessage: (message: string, newChatOptions?: NewChatOptions, onNavigate?: (path: string) => void) => void;
  onStop: () => void;
  onInputChange: (value: string) => void;
  onModelChange: (modelId: string) => void;
  onPermissionAllow: () => void;
  onPermissionDeny: () => void;
  onPermissionModeChange: (mode: PermissionMode) => void;
  onSubmitSatisfaction: (sessionId: string, score: number, comment?: string) => Promise<void>;
  onTriggerTransfer: (sessionId: string) => Promise<void>;
}

interface NewChatOptions {
  agentId: string;
  cwd: string;
  permissionMode: PermissionMode;
}

const INTENT_LABELS: Record<string, { label: string; color: string }> = {
  refund: { label: '退款', color: '#f6685e' },
  order: { label: '订单', color: '#2196f3' },
  tech: { label: '技术支持', color: '#ff9800' },
  account: { label: '账户', color: '#9c27b0' },
  complaint: { label: '投诉', color: '#e91e63' },
  general: { label: '一般咨询', color: '#4caf50' },
  unknown: { label: '未识别', color: '#9e9e9e' },
};

export function ChatPage({
  currentSession,
  models,
  selectedModel,
  agents,
  isLoading,
  inputValue,
  permissionRequest,
  permissionMode,
  transferTriggered,
  currentIntent,
  onSendMessage,
  onStop,
  onInputChange,
  onModelChange,
  onPermissionAllow,
  onPermissionDeny,
  onPermissionModeChange,
  onSubmitSatisfaction,
  onTriggerTransfer,
}: ChatPageProps) {
  const navigate = useNavigate();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // 新对话页面状态
  const [newChatAgentId, setNewChatAgentId] = useState('default');
  const [newChatCwd, setNewChatCwd] = useState('');

  // 满意度评价弹窗
  const [showSatisfaction, setShowSatisfaction] = useState(false);
  const [satisfactionScore, setSatisfactionScore] = useState(5);
  const [satisfactionComment, setSatisfactionComment] = useState('');
  const [satisfactionSubmitted, setSatisfactionSubmitted] = useState(false);

  // 知识库管理
  const [showKnowledgeBase, setShowKnowledgeBase] = useState(false);
  const [knowledgeFiles, setKnowledgeFiles] = useState<any[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);

  // 获取知识库文件列表
  const fetchKnowledgeFiles = useCallback(async () => {
    try {
      const sessionId = currentSession?.id || 'default';
      const res = await fetch(`/api/knowledge/list?sessionId=${sessionId}`);
      const data = await res.json();
      setKnowledgeFiles(data.files || []);
    } catch (err) {
      console.error('获取知识库文件失败:', err);
    }
  }, [currentSession?.id]);

  // 上传文件
  const handleUploadFile = useCallback(async (file: File) => {
    if (!currentSession) {
      NotificationPlugin.warning({ title: '请先创建对话', duration: 2000, placement: 'top-right' });
      return;
    }
    setUploadingFile(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('sessionId', currentSession.id);
      const res = await fetch('/api/knowledge/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        NotificationPlugin.success({ title: '文件上传成功', duration: 2000, placement: 'top-right' });
        fetchKnowledgeFiles();
      } else {
        NotificationPlugin.error({ title: data.error || '上传失败', duration: 2000, placement: 'top-right' });
      }
    } catch (err) {
      NotificationPlugin.error({ title: '上传失败', duration: 2000, placement: 'top-right' });
    } finally {
      setUploadingFile(false);
    }
  }, [currentSession, fetchKnowledgeFiles]);

  // 删除文件
  const handleDeleteFile = useCallback(async (filePath: string) => {
    try {
      const res = await fetch(`/api/knowledge/file?path=${encodeURIComponent(filePath)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        NotificationPlugin.success({ title: '文件已删除', duration: 2000, placement: 'top-right' });
        fetchKnowledgeFiles();
      }
    } catch (err) {
      NotificationPlugin.error({ title: '删除失败', duration: 2000, placement: 'top-right' });
    }
  }, [fetchKnowledgeFiles]);

  // 打开知识库面板时获取文件列表
  useEffect(() => {
    if (showKnowledgeBase) {
      fetchKnowledgeFiles();
    }
  }, [showKnowledgeBase, fetchKnowledgeFiles]);

  // 当会话切换时，重置满意度状态
  useEffect(() => {
    setSatisfactionSubmitted(!!currentSession?.satisfaction);
    setSatisfactionScore(currentSession?.satisfaction || 5);
    setSatisfactionComment(currentSession?.satisfactionComment || '');
    setShowSatisfaction(false);
  }, [currentSession?.id]);

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentSession?.messages]);

  // 处理发送消息
  const handleSend = useCallback((message: string) => {
    if (!currentSession) {
      onSendMessage(message, {
        agentId: newChatAgentId,
        cwd: newChatCwd,
        permissionMode: permissionMode,
      }, (path) => {
        setNewChatAgentId('default');
        setNewChatCwd('');
        navigate(path);
      });
    } else {
      onSendMessage(message);
    }
  }, [currentSession, newChatAgentId, newChatCwd, permissionMode, onSendMessage, navigate]);

  // 提交满意度
  const handleSubmitSatisfaction = useCallback(async () => {
    if (!currentSession) return;
    await onSubmitSatisfaction(currentSession.id, satisfactionScore, satisfactionComment || undefined);
    setSatisfactionSubmitted(true);
    setShowSatisfaction(false);
    NotificationPlugin.success({ title: '感谢您的评价！', content: '您的反馈将帮助我们持续改进服务。', duration: 3000, placement: 'top-right' });
  }, [currentSession, satisfactionScore, satisfactionComment, onSubmitSatisfaction]);

  // 手动转人工
  const handleTransfer = useCallback(async () => {
    if (!currentSession) return;
    await onTriggerTransfer(currentSession.id);
  }, [currentSession, onTriggerTransfer]);

  const showNewChatView = !currentSession || currentSession.messages.length === 0;
  const isTransferred = currentSession?.status === 'transferred' || transferTriggered;
  const isResolved = currentSession?.status === 'resolved';
  const intentInfo = (currentIntent || currentSession?.intent) ? INTENT_LABELS[currentIntent || currentSession?.intent || 'unknown'] : null;

  return (
    <>
      {/* 消息区域 */}
      <div className="flex-1 overflow-y-auto p-6">
        {showNewChatView ? (
          <NewChatView
            agents={agents}
            models={models}
            selectedModel={selectedModel}
            newChatAgentId={newChatAgentId}
            newChatCwd={newChatCwd}
            newChatPermissionMode={permissionMode}
            onSelectModel={onModelChange}
            onSelectAgent={setNewChatAgentId}
            onSetCwd={setNewChatCwd}
            onSetPermissionMode={onPermissionModeChange}
          />
        ) : (
          <>
            {/* 意图标签 + 转人工按钮 */}
            {currentSession && (
              <div className="flex items-center gap-2 mb-3">
                {intentInfo && (
                  <Tag
                    style={{ backgroundColor: intentInfo.color + '20', color: intentInfo.color, borderColor: intentInfo.color + '40' }}
                    variant="outline"
                    size="small"
                  >
                    意图：{intentInfo.label}
                  </Tag>
                )}
                {!isTransferred && !isResolved && (
                  <Button
                    size="small"
                    variant="outline"
                    theme="warning"
                    icon={<CustomerServiceIcon />}
                    onClick={handleTransfer}
                  >
                    转人工
                  </Button>
                )}
                {isResolved && !satisfactionSubmitted && (
                  <Button
                    size="small"
                    variant="outline"
                    theme="success"
                    icon={<StarIcon />}
                    onClick={() => setShowSatisfaction(true)}
                  >
                    评价服务
                  </Button>
                )}
                {satisfactionSubmitted && (
                  <Tag theme="success" variant="light" size="small" icon={<CheckCircleIcon />}>
                    已评分 {currentSession.satisfaction}★
                  </Tag>
                )}
                {/* 知识库管理按钮 */}
                <Button
                  size="small"
                  variant="outline"
                  theme="primary"
                  icon={<FileIcon />}
                  onClick={() => setShowKnowledgeBase(true)}
                >
                  知识库
                </Button>
              </div>
            )}

            {/* 转人工提示横幅 */}
            {isTransferred && (
              <div
                className="mb-4 p-4 rounded-xl flex items-start gap-3"
                style={{ backgroundColor: '#fff7e6', border: '1px solid #ffa940' }}
              >
                <CustomerServiceIcon style={{ color: '#fa8c16', fontSize: '20px', marginTop: 1 }} />
                <div className="flex-1">
                  <div className="font-medium text-sm" style={{ color: '#ad4e00' }}>
                    已转接人工客服
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: '#d46b08' }}>
                    预计等待时间 2-5 分钟 · 客服工作时间：周一至周日 9:00-21:00
                  </div>
                  <div className="mt-2 flex gap-2">
                    <Button
                      size="small"
                      theme="warning"
                      variant="outline"
                      onClick={() => setShowSatisfaction(true)}
                    >
                      结束并评价
                    </Button>
                  </div>
                </div>
              </div>
            )}

            <ChatMessages
              messages={currentSession!.messages}
              models={models}
              messagesEndRef={messagesEndRef}
              permissionRequest={permissionRequest}
              onPermissionAllow={onPermissionAllow}
              onPermissionDeny={onPermissionDeny}
            />
          </>
        )}
      </div>

      {/* 输入区域 */}
      <ChatInput
        inputValue={inputValue}
        selectedModel={selectedModel}
        models={models}
        isLoading={isLoading}
        permissionMode={permissionMode}
        onSend={handleSend}
        onStop={onStop}
        onChange={onInputChange}
        onModelChange={onModelChange}
        onPermissionModeChange={onPermissionModeChange}
      />

      {/* 满意度评价弹窗 */}
      <Dialog
        header="服务评价"
        visible={showSatisfaction}
        onClose={() => setShowSatisfaction(false)}
        onConfirm={handleSubmitSatisfaction}
        confirmBtn="提交评价"
        cancelBtn="稍后评价"
        width={420}
      >
        <div className="py-2 space-y-4">
          <div className="text-center">
            <p className="text-sm mb-3" style={{ color: 'var(--td-text-color-secondary)' }}>
              请对本次客服服务做出评价
            </p>
            <Rate
              value={satisfactionScore}
              onChange={(val) => setSatisfactionScore(val as number)}
              color="#faad14"
              count={5}
            />
            <p className="text-xs mt-2" style={{ color: 'var(--td-text-color-placeholder)' }}>
              {['', '非常不满意', '不满意', '一般', '满意', '非常满意'][satisfactionScore]}
            </p>
          </div>
          <div>
            <p className="text-sm mb-2" style={{ color: 'var(--td-text-color-primary)' }}>
              评价说明（选填）
            </p>
            <Textarea
              placeholder="请描述您的服务体验..."
              value={satisfactionComment}
              onChange={(val) => setSatisfactionComment(val as string)}
              autosize={{ minRows: 3, maxRows: 5 }}
            />
          </div>
        </div>
      </Dialog>

      {/* 知识库管理弹窗 */}
      <Dialog
        header="知识库管理"
        visible={showKnowledgeBase}
        onClose={() => setShowKnowledgeBase(false)}
        width={600}
        footer={false}
      >
        <div className="py-2 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm" style={{ color: 'var(--td-text-color-secondary)' }}>
              上传文件供 Agent 检索，支持 .md, .txt, .json 等文本文件
            </p>
          </div>
          
          {/* 上传区域 */}
          <Upload
            draggable
            accept=".md,.txt,.json,.html,.xml"
            disabled={uploadingFile}
            showUploadProgress
            onSelectChange={(files) => {
              if (files && files.length > 0) {
                handleUploadFile(files[0] as any);
              }
            }}
          >
            <div className="p-8 text-center">
              {uploadingFile ? (
                <Loading />
              ) : (
                <>
                  <UploadIcon size="32px" style={{ color: 'var(--td-text-color-placeholder)' }} />
                  <p className="mt-2 text-sm" style={{ color: 'var(--td-text-color-secondary)' }}>
                    点击或拖拽文件到此处上传
                  </p>
                </>
              )}
            </div>
          </Upload>

          {/* 文件列表 */}
          {knowledgeFiles.length > 0 ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">已上传文件 ({knowledgeFiles.length})</p>
              {knowledgeFiles.map((file, idx) => (
                <Card key={idx} size="small" bordered className="flex items-center justify-between">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <FileIcon />
                    <span className="truncate">{file.path.split('/').pop()}</span>
                  </div>
                  <Popconfirm
                    content="确认删除该文件？"
                    onConfirm={() => handleDeleteFile(file.path)}
                  >
                    <Button size="small" variant="text" theme="danger" icon={<DeleteIcon />}>
                      删除
                    </Button>
                  </Popconfirm>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-4 text-sm" style={{ color: 'var(--td-text-color-placeholder)' }}>
              暂无上传文件
            </div>
          )}
        </div>
      </Dialog>
    </>
  );
}
