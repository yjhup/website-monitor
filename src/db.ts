// 数据库初始化与常用查询（所有数据均存于 D1，不使用 KV）

import type { Env } from './types';

const g = globalThis as typeof globalThis & { __wmDbReady?: boolean };

/**
 * 确保表结构与迁移执行（幂等）。
 * 仅在每个 Worker 隔离（isolate）首次调用时真正执行一次，
 * 避免每个请求都重复跑 DDL 白白消耗 D1 写入额度。
 */
export async function initDb(env: Env): Promise<void> {
  if (g.__wmDbReady) return;
  await ensureSchema(env);
  g.__wmDbReady = true;
}

async function ensureSchema(env: Env): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        created_at INTEGER NOT NULL
      )`
    ),
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS monitors (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        url TEXT NOT NULL,
        selector TEXT,
        interval_minutes INTEGER NOT NULL DEFAULT 60,
        last_checked_at INTEGER NOT NULL DEFAULT 0,
        last_change_at INTEGER,
        last_hash TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL
      )`
    ),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_monitors_user ON monitors(user_id)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_monitors_enabled ON monitors(enabled)'),
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS notification_settings (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL,
        config TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        UNIQUE(user_id, type)
      )`
    ),
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      )`
    ),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at)'),
  ]);

  // 迁移：旧版本数据库的 monitors 表没有 last_hash 列，需补列
  const cols = await env.DB.prepare('PRAGMA table_info(monitors)').all<{ name: string }>();
  if (!cols.results?.some((c) => c.name === 'last_hash')) {
    await env.DB.prepare('ALTER TABLE monitors ADD COLUMN last_hash TEXT').run();
  }

  await env.DB.prepare(
    `INSERT OR IGNORE INTO users (id, username, created_at) VALUES (?, ?, ?)`
  )
    .bind('_all', '_all', Date.now())
    .run();
}

/** 确保某个用户存在于 users 表 */
export async function ensureUser(env: Env, username: string): Promise<void> {
  await env.DB.prepare(
    `INSERT OR IGNORE INTO users (id, username, created_at) VALUES (?, ?, ?)`
  )
    .bind(username, username, Date.now())
    .run();
}

/** 清理已过期的会话（定时任务中调用） */
export async function cleanupExpiredSessions(env: Env): Promise<void> {
  await env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(Date.now()).run();
}
