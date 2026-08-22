// 数据库初始化与常用查询

import type { Env } from './types';

/** 确保表存在（幂等）。Worker 启动或首次访问时调用。 */
export async function initDb(env: Env): Promise<void> {
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
  ]);
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
