export const APP_CONFIG = {
  name: '智能客服',
  nameInitial: '客',
  description: '您好！我是智能客服小智，很高兴为您服务 😊',
  version: '1.0.0',
};

export const INTENT_LABELS: Record<string, string> = {
  refund: '退款问题',
  order: '订单查询',
  tech: '技术支持',
  account: '账户服务',
  complaint: '投诉建议',
  general: '一般咨询',
  unknown: '未分类',
};

export const INTENT_COLORS: Record<string, string> = {
  refund: '#ff7875',
  order: '#69b1ff',
  tech: '#b37feb',
  account: '#5cdbd3',
  complaint: '#ffa940',
  general: '#95de64',
  unknown: '#bfbfbf',
};

export const STATUS_LABELS: Record<string, string> = {
  active: '服务中',
  transferred: '已转人工',
  resolved: '已解决',
  closed: '已关闭',
};

export default APP_CONFIG;
