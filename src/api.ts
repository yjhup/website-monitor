// 受保护的业务 API：监测目标 CRUD + 手动检查 + 通知设置

import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import type { AppEnv, MonitorRow, NotificationRow, ResendConfig, WebhookConfig } from './types';
import { getCurrentUser } from './auth';
import { checkMonitor, sendTestNotification } from './checker';

export const api = new Hono<AppEnv>();

// ---------- 认证中间件 ----------
async function authMiddleware(c: Context<AppEnv>, next: Next) {
  const user = await getCurrentUser(c.env, c.req.raw);
  if (!user) return c.json({ error: '未登录或会话已过期' }, 401);
  c.set('user', user);
  await next();
}

api.use('*', authMiddleware);

// ---------- 当前用户 ----------
api.get('/me', (c) => c.json({ username: c.get('user') }));

// ---------- 监测目标 CRUD ----------
api.get('/monitors', async (c) => {
  const user = c.get('user');
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM monitors WHERE user_id = ? ORDER BY created_at DESC'
  )
    .bind(user)
    .all<MonitorRow>();
  return c.json({ monitors: results ?? [] });
});

api.post('/monitors', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: '请求体无效' }, 400);

  const name = String(body.name || '').trim();
  const url = String(body.url || '').trim();
  const selector = body.selector ? String(body.selector).trim() : null;
  const interval = Math.max(1, Math.min(10080, Math.round(Number(body.interval_minutes) || 60)));

  if (!name) return c.json({ error: '请填写显示名称' }, 400);
  if (!/^https?:\/\/.+/i.test(url)) return c.json({ error: '网址必须以 http:// 或 https:// 开头' }, 400);

  const id = crypto.randomUUID();
  const now = Date.now();
  await c.env.DB.prepare(
    `INSERT INTO monitors (id, user_id, name, url, selector, interval_minutes, last_checked_at, enabled, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, 1, ?)`
  )
    .bind(id, user, name, url, selector, interval, now)
    .run();

  const { results } = await c.env.DB.prepare('SELECT * FROM monitors WHERE id = ?').bind(id).all<MonitorRow>();
  return c.json({ monitor: results?.[0] });
});

api.put('/monitors/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const { results } = await c.env.DB.prepare('SELECT * FROM monitors WHERE id = ? AND user_id = ?')
    .bind(id, user)
    .all<MonitorRow>();
  const existing = results?.[0];
  if (!existing) return c.json({ error: '监测目标不存在' }, 404);

  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: '请求体无效' }, 400);

  const name = String(body.name ?? existing.name).trim();
  const url = String(body.url ?? existing.url).trim();
  const selector = body.selector === undefined ? existing.selector : (String(body.selector).trim() || null);
  const interval = Math.max(1, Math.min(10080, Math.round(Number(body.interval_minutes) || existing.interval_minutes)));
  const enabled = body.enabled === undefined ? existing.enabled : (body.enabled ? 1 : 0);

  if (!name) return c.json({ error: '请填写显示名称' }, 400);
  if (!/^https?:\/\/.+/i.test(url)) return c.json({ error: '网址必须以 http:// 或 https:// 开头' }, 400);

  await c.env.DB.prepare(
    `UPDATE monitors SET name = ?, url = ?, selector = ?, interval_minutes = ?, enabled = ? WHERE id = ?`
  )
    .bind(name, url, selector, interval, enabled, id)
    .run();

  const { results: updated } = await c.env.DB.prepare('SELECT * FROM monitors WHERE id = ?').bind(id).all<MonitorRow>();
  return c.json({ monitor: updated?.[0] });
});

api.delete('/monitors/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const res = await c.env.DB.prepare('DELETE FROM monitors WHERE id = ? AND user_id = ?')
    .bind(id, user)
    .run();
  if (res.meta.changes === 0) return c.json({ error: '监测目标不存在' }, 404);
  return c.json({ ok: true });
});

// ---------- 手动立即检查 ----------
api.post('/monitors/:id/check', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const { results } = await c.env.DB.prepare('SELECT * FROM monitors WHERE id = ? AND user_id = ?')
    .bind(id, user)
    .all<MonitorRow>();
  const monitor = results?.[0];
  if (!monitor) return c.json({ error: '监测目标不存在' }, 404);

  const result = await checkMonitor(c.env, monitor);
  return c.json({ changed: result.changed, error: result.error ?? null });
});

// ---------- 通知设置 ----------
api.get('/notifications', async (c) => {
  const user = c.get('user');
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM notification_settings WHERE user_id = ?'
  )
    .bind(user)
    .all<NotificationRow>();

  let webhook: { url: string; method: string; headers: string; template: string } | null = null;
  let resend: { from: string; to: string; hasKey: boolean; keyMasked: string } | null = null;

  for (const row of results ?? []) {
    const cfg = JSON.parse(row.config);
    if (row.type === 'webhook' && cfg.url) {
      webhook = {
        url: cfg.url,
        method: cfg.method || 'POST',
        headers: cfg.headers || '',
        template: cfg.template || '',
      };
    }
    if (row.type === 'resend') {
      resend = {
        from: cfg.from || '',
        to: cfg.to || '',
        hasKey: Boolean(cfg.apiKey),
        keyMasked: cfg.apiKey ? maskKey(cfg.apiKey) : '',
      };
    }
  }
  return c.json({ webhook, resend });
});

api.put('/notifications', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: '请求体无效' }, 400);
  const now = Date.now();

  // Webhook（URL / 请求方法 / 自定义请求头 / 消息模板）
  const webhookUrl = body.webhook?.url ? String(body.webhook.url).trim() : '';
  const webhookMethod = body.webhook?.method ? String(body.webhook.method).trim().toUpperCase() : 'POST';
  const WEBHOOK_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
  if (!WEBHOOK_METHODS.includes(webhookMethod)) {
    return c.json({ error: `请求方法必须是 ${WEBHOOK_METHODS.join(' / ')}` }, 400);
  }
  const webhookHeaders = body.webhook?.headers ? String(body.webhook.headers).trim() : '';
  const webhookTemplate = body.webhook?.template ? String(body.webhook.template).trim() : '';
  if (webhookHeaders) {
    try {
      const h = JSON.parse(webhookHeaders);
      if (!h || typeof h !== 'object' || Array.isArray(h)) throw new Error();
    } catch {
      return c.json({ error: '自定义请求头必须是 JSON 对象，例如 {"Authorization": "Bearer xxx"}' }, 400);
    }
  }
  if (webhookUrl) {
    if (!/^https?:\/\/.+/i.test(webhookUrl)) return c.json({ error: 'Webhook 地址必须以 http:// 或 https:// 开头' }, 400);
    await upsertNotification(c, user, 'webhook', JSON.stringify({
      url: webhookUrl,
      method: webhookMethod,
      headers: webhookHeaders || null,
      template: webhookTemplate || null,
    }), now);
  } else if (body.webhook && body.webhook.url === '') {
    await c.env.DB.prepare('DELETE FROM notification_settings WHERE user_id = ? AND type = ?')
      .bind(user, 'webhook')
      .run();
  }

  // Resend：仅当提交了非空配置时才写入；apiKey 留空则保留原值
  if (body.resend) {
    const { results: existing } = await c.env.DB.prepare(
      'SELECT * FROM notification_settings WHERE user_id = ? AND type = ?'
    )
      .bind(user, 'resend')
      .all<NotificationRow>();
    const prev = existing?.[0] ? (JSON.parse(existing[0].config) as Partial<ResendConfig>) : null;

    const apiKey = body.resend.apiKey ? String(body.resend.apiKey).trim() : (prev?.apiKey || '');
    const from = body.resend.from ? String(body.resend.from).trim() : (prev?.from || '');
    const to = body.resend.to ? String(body.resend.to).trim() : (prev?.to || '');

    if (apiKey || from || to) {
      if (!apiKey) return c.json({ error: '请填写 Resend API Key' }, 400);
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(from)) return c.json({ error: '发件邮箱格式不正确' }, 400);
      const toList = to.split(',').map((s) => s.trim()).filter(Boolean);
      if (toList.length === 0) return c.json({ error: '请至少填写一个收件邮箱' }, 400);
      for (const t of toList) {
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(t)) return c.json({ error: `收件邮箱格式不正确：${t}` }, 400);
      }
      await upsertNotification(c, user, 'resend', JSON.stringify({ apiKey, from, to }), now);
    } else if (body.resend.apiKey === '' && body.resend.from === '' && body.resend.to === '') {
      await c.env.DB.prepare('DELETE FROM notification_settings WHERE user_id = ? AND type = ?')
        .bind(user, 'resend')
        .run();
    }
  }

  return c.json({ ok: true });
});

// ---------- 通知测试 ----------
api.post('/notifications/test', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: '请求体无效' }, 400);
  const type = String(body.type || '');
  if (type !== 'webhook' && type !== 'resend') {
    return c.json({ error: 'type 必须是 webhook 或 resend' }, 400);
  }

  // 读取已保存的配置，用于补全表单中留空/掩码的字段
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM notification_settings WHERE user_id = ?'
  )
    .bind(user)
    .all<NotificationRow>();
  let savedWebhook: WebhookConfig | null = null;
  let savedResend: ResendConfig | null = null;
  for (const row of results ?? []) {
    const cfg = JSON.parse(row.config);
    if (row.type === 'webhook') savedWebhook = cfg;
    if (row.type === 'resend') savedResend = cfg;
  }

  let webhook: WebhookConfig | undefined;
  let resend: ResendConfig | undefined;
  if (type === 'webhook') {
    const url = body.webhook?.url ? String(body.webhook.url).trim() : (savedWebhook?.url || '');
    if (!url) return c.json({ error: '请先填写 Webhook 地址' }, 400);
    const method = body.webhook?.method ? String(body.webhook.method).trim().toUpperCase() : (savedWebhook?.method || 'POST');
    const headers = body.webhook?.headers !== undefined ? String(body.webhook.headers).trim() : (savedWebhook?.headers || '');
    const template = body.webhook?.template !== undefined ? String(body.webhook.template).trim() : (savedWebhook?.template || '');
    webhook = { url, method, headers, template };
  } else {
    const from = body.resend?.from ? String(body.resend.from).trim() : (savedResend?.from || '');
    const to = body.resend?.to ? String(body.resend.to).trim() : (savedResend?.to || '');
    let apiKey = body.resend?.apiKey ? String(body.resend.apiKey).trim() : (savedResend?.apiKey || '');
    // 掩码值（含 *）视为未填写，回退到已保存的 key
    if (apiKey.includes('*')) apiKey = savedResend?.apiKey || '';
    resend = { apiKey, from, to };
  }

  const result = await sendTestNotification(type, { webhook, resend });
  if (!result.ok) return c.json({ ok: false, error: result.error }, 400);
  return c.json({ ok: true });
});

async function upsertNotification(c: Context<AppEnv>, user: string, type: string, config: string, now: number) {
  await c.env.DB.prepare(
    `INSERT INTO notification_settings (id, user_id, type, config, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id, type) DO UPDATE SET config = excluded.config`
  )
    .bind(crypto.randomUUID(), user, type, config, now)
    .run();
}

function maskKey(key: string): string {
  if (key.length <= 8) return '****';
  return `${key.slice(0, 3)}****${key.slice(-4)}`;
}
