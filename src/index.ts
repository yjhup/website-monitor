// Cloudflare Worker 入口：Hono 应用 + 定时检查

import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import type { AppEnv, Env } from './types';
import { api } from './api';
import { verifyPassword, findUser, createSession, destroySession, getTokenFromCookie } from './auth';
import { initDb } from './db';
import { checkDueMonitors } from './checker';
import { FRONTEND_HTML } from './frontend';

const app = new Hono<AppEnv>();

// 兜底初始化数据库（幂等）
app.use('*', async (c, next) => {
  await initDb(c.env);
  await next();
});

// ---------- 公开接口：登录 / 登出 ----------
app.post('/api/login', async (c) => {
  const body = await c.req.json().catch(() => null);
  const username = body?.username ? String(body.username).trim() : '';
  const password = body?.password ? String(body.password) : '';

  const user = findUser(c.env, username);
  if (!user || !verifyPassword(user, password)) {
    return c.json({ error: '用户名或密码错误' }, 401);
  }

  const token = await createSession(c.env, user.username);
  return c.json(
    { username: user.username },
    200,
    {
      'Set-Cookie': `auth_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`,
    }
  );
});

app.post('/api/logout', async (c) => {
  const token = getTokenFromCookie(c.req.raw);
  if (token) await destroySession(c.env, token);
  return c.json(
    { ok: true },
    200,
    {
      'Set-Cookie': 'auth_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
    }
  );
});

// ---------- 业务 API ----------
app.route('/api', api);

// ---------- 前端静态页面 ----------
app.get('*', (c) => c.html(FRONTEND_HTML));

// 404 for other API routes
app.notFound((c) => c.json({ error: 'Not Found' }, 404));

// ---------- Cron 定时任务：每分钟触发，按各目标间隔执行检查 ----------
async function scheduled(env: Env): Promise<void> {
  await initDb(env);
  await checkDueMonitors(env);
}

export default {
  fetch: app.fetch,
  scheduled: async (event: ScheduledController, env: Env, ctx: ExecutionContext) => {
    ctx.waitUntil(scheduled(env));
  },
} satisfies ExportedHandler<Env>;
