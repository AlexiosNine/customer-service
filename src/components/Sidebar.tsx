import { Button, Tooltip, Tag } from 'tdesign-react';
import { AddIcon, DeleteIcon, SettingIcon, DashboardIcon } from 'tdesign-icons-react';
import { Bot } from 'lucide-react';
import { APP_CONFIG } from '../config';
import { Session, Agent } from '../types';
import { ICON_MAP } from '../utils/iconMap';

const STATUS_LABELS: Record<string, { text: string; theme: 'default' | 'primary' | 'warning' | 'danger' | 'success' }> = {
  active: { text: '进行中', theme: 'primary' },
  transferred: { text: '已转人工', theme: 'warning' },
  resolved: { text: '已解决', theme: 'success' },
  closed: { text: '已关闭', theme: 'default' },
};

interface SidebarProps {
  sessions: Session[];
  currentSessionId: string | null;
  isSettingsPage: boolean;
  isAdminPage?: boolean;
  sidebarOpen: boolean;
  agents: Agent[];
  getAgent: (id: string) => Agent | undefined;
  onNewChat: () => void;
  onSelectSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onOpenSettings: () => void;
  onOpenAdmin?: () => void;
}

export function Sidebar({
  sessions,
  currentSessionId,
  isSettingsPage,
  isAdminPage = false,
  sidebarOpen,
  agents,
  getAgent,
  onNewChat,
  onSelectSession,
  onDeleteSession,
  onOpenSettings,
  onOpenAdmin,
}: SidebarProps) {
  const isActivePage = (id: string) => id === currentSessionId && !isSettingsPage && !isAdminPage;

  return (
    <aside 
      className="flex flex-col flex-shrink-0 transition-all duration-300 overflow-hidden"
      style={{ 
        width: sidebarOpen ? 260 : 0,
        backgroundColor: 'var(--td-bg-color-container)'
      }}
    >
      {/* Logo */}
      <div className="h-14 px-4 flex items-center flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div 
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: 'var(--td-brand-color)' }}
          >
            <span className="text-white text-sm font-bold">{APP_CONFIG.nameInitial}</span>
          </div>
          <span 
            className="text-lg font-semibold"
            style={{ color: 'var(--td-text-color-primary)' }}
          >
            {APP_CONFIG.name}
          </span>
        </div>
      </div>

      {/* 新对话按钮 */}
      <div className="p-3">
        <Button 
          icon={<AddIcon />}
          onClick={onNewChat}
          block
          variant="outline"
        >
          新对话
        </Button>
      </div>

      {/* 会话列表 */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {sessions.map(session => {
          const sessionAgent = session.agentId ? getAgent(session.agentId) : getAgent('default');
          const AgentIcon = ICON_MAP[sessionAgent?.icon || 'Bot'] || Bot;
          const statusInfo = session.status ? STATUS_LABELS[session.status] : null;
          return (
            <div 
              key={session.id}
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg cursor-pointer transition-colors duration-200 group"
              style={{
                backgroundColor: isActivePage(session.id)
                  ? 'var(--td-brand-color-light)' 
                  : 'transparent',
                color: isActivePage(session.id)
                  ? 'var(--td-brand-color)' 
                  : 'var(--td-text-color-secondary)'
              }}
              onClick={() => onSelectSession(session.id)}
              onMouseEnter={(e) => {
                if (!isActivePage(session.id)) {
                  e.currentTarget.style.backgroundColor = 'var(--td-bg-color-component-hover)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActivePage(session.id)) {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }
              }}
            >
              <div 
                className="flex-shrink-0 w-5 h-5 rounded flex items-center justify-center"
                style={{ backgroundColor: sessionAgent?.color || 'var(--td-brand-color)' }}
              >
                <AgentIcon size={12} color="white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="truncate text-sm">{session.title}</div>
                {statusInfo && session.status !== 'active' && (
                  <Tag size="small" theme={statusInfo.theme} variant="light" className="mt-0.5 text-xs">
                    {statusInfo.text}
                  </Tag>
                )}
              </div>
              <Tooltip content="删除会话">
                <Button
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                  variant="text"
                  shape="circle"
                  size="medium"
                  icon={<DeleteIcon />}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteSession(session.id);
                  }}
                />
              </Tooltip>
            </div>
          );
        })}
      </div>
      
      {/* 底部按钮区 */}
      <div 
        className="p-3 border-t flex-shrink-0 space-y-2"
        style={{ borderColor: 'var(--td-component-border)' }}
      >
        {onOpenAdmin && (
          <Button 
            icon={<DashboardIcon />}
            onClick={onOpenAdmin}
            block
            variant={isAdminPage ? 'outline' : 'text'}
            theme={isAdminPage ? 'primary' : 'default'}
          >
            管理后台
          </Button>
        )}
        <Button 
          icon={<SettingIcon />}
          onClick={onOpenSettings}
          block
          variant={isSettingsPage ? 'outline' : 'text'}
          theme={isSettingsPage ? 'primary' : 'default'}
        >
          设置
        </Button>
      </div>
    </aside>
  );
}
