// 认证：解析环境变量中的多用户，登录/登出，会话管理（KV 存储）

import type { Env } from './types';

export interface ParsedUser {
  username: string;
  password: string;
}

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 会话有效期 7 天

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

/** 创建会话，返回 token */
export async function createSession(env: Env, username: string): Promise<string> {
  const token = crypto.randomUUID();
  await env.KV.put(`session:${token}`, username, { expirationTtl: SESSION_TTL_SECONDS });
  return token;
}

export async function destroySession(env: Env, token: string): Promise<void> {
  await env.KV.delete(`session:${token}`);
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
  return await env.KV.get(`session:${token}`);
}
