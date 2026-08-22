// 认证：解析环境变量中的多用户，登录/登出，会话管理（D1 存储）

import type { Env } from './types';
import { sha256Hex } from './hash';

export interface ParsedUser {
  username: string;
  password: string;
}

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 会话有效期 7 天

/** 解析 USERS 环境变量，形如 "alice:pass1,bob:pass2" */
export function parseUsers(env: Env): ParsedUser[] {
  return (env.USERS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((part) => {
      const idx = part.indexOf(':');
      if (idx <= 0) return { username: '', password: '' };
      return {
        username: part.slice(0, idx).trim(),
        password: part.slice(idx + 1),
      };
    })
    .filter((u) => u.username);
}

export function findUser(env: Env, username: string): ParsedUser | undefined {
  return parseUsers(env).find((u) => u.username === username);
}

/** 常数时间字符串比较，避免时序攻击 */
function safeEqual(a: string, b: string): boolean {
  const ba = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  if (ba.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ba.length; i++) diff |= ba[i] ^ bb[i];
  return diff === 0;
}

export function verifyPassword(user: ParsedUser, password: string): boolean {
  return safeEqual(user.password, password);
}

/**
 * 创建会话，返回明文 token（写入 Cookie）。
 * 数据库里只保存 token 的 SHA-256，避免明文泄露风险。
 */
export async function createSession(env: Env, username: string): Promise<string> {
  const token = crypto.randomUUID();
  const tokenHash = await sha256Hex(token);
  // 顺手清理该用户的过期会话
  await env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND expires_at < ?')
    .bind(username, Date.now())
    .run();
  await env.DB.prepare(
    'INSERT OR REPLACE INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)'
  )
    .bind(tokenHash, username, Date.now() + SESSION_TTL_MS)
    .run();
  return token;
}

export async function destroySession(env: Env, token: string): Promise<void> {
  const tokenHash = await sha256Hex(token);
  await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
}

/** 从请求 Cookie 中取出 token */
export function getTokenFromCookie(req: Request): string | null {
  const cookie = req.headers.get('cookie') || '';
  const m = cookie.match(/(?:^|;\s*)auth_token=([^;]+)/);
  return m ? m[1] : null;
}

/** 根据请求解析当前登录用户，未登录返回 null */
export async function getCurrentUser(env: Env, req: Request): Promise<string | null> {
  const token = getTokenFromCookie(req);
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const { results } = await env.DB.prepare(
    'SELECT user_id FROM sessions WHERE token_hash = ? AND expires_at > ?'
  )
    .bind(tokenHash, Date.now())
    .all<{ user_id: string }>();
  return results?.[0]?.user_id ?? null;
}
