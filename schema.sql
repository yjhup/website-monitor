-- 网站监测项目 D1 数据库表结构
-- 手动初始化：npm run db:init
-- GitHub Actions 部署时也会自动执行本文件

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,             -- 与环境变量中的用户名一致
  username TEXT UNIQUE NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS monitors (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,           -- 归属用户
  name TEXT NOT NULL,              -- 显示名称
  url TEXT NOT NULL,               -- 被监测的网址
  selector TEXT,                   -- 可选：CSS 选择器，只监测选中部分
  interval_minutes INTEGER NOT NULL DEFAULT 60,
  last_checked_at INTEGER NOT NULL DEFAULT 0,
  last_change_at INTEGER,          -- 最近一次检测到变化的时间戳
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_monitors_user ON monitors(user_id);
CREATE INDEX IF NOT EXISTS idx_monitors_enabled ON monitors(enabled);

CREATE TABLE IF NOT EXISTS notification_settings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,              -- 'webhook' | 'resend'
  config TEXT NOT NULL,            -- JSON 配置
  created_at INTEGER NOT NULL,
  UNIQUE(user_id, type)
);
