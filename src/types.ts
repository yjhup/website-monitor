// 全局类型定义

export interface Env {
  DB: D1Database;
  // 多用户列表："alice:password123,bob:secret456"
  USERS: string;
}

export type AppEnv = {
  Bindings: Env;
  Variables: {
    user: string; // 当前登录用户名
  };
};

export interface MonitorRow {
  id: string;
  user_id: string;
  name: string;
  url: string;
  selector: string | null;
  interval_minutes: number;
  last_checked_at: number;
  last_change_at: number | null;
  last_hash: string | null; // 最近一次内容哈希（变化检测基线）
  enabled: number;
  created_at: number;
}

export interface SessionRow {
  token_hash: string; // 会话令牌的 SHA-256（不存明文）
  user_id: string;
  expires_at: number;
}

export interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  config: string;
  created_at: number;
}

export interface WebhookConfig {
  url: string;
}

export interface ResendConfig {
  apiKey: string;
  from: string;
  to: string;
}
