// 变化检测与通知发送（Webhook / Resend 邮件）

import { parse } from 'node-html-parser';
import type { Env, MonitorRow, NotificationRow, WebhookConfig, ResendConfig } from './types';
import { sha256Hex } from './hash';

export interface CheckResult {
  changed: boolean;
  hash: string;
  error?: string;
}

export interface TestResult {
  ok: boolean;
  error?: string;
}

/** 发送一条“测试通知”，校验 Webhook / Resend 配置是否可用（返回详细错误） */
export async function sendTestNotification(
  type: 'webhook' | 'resend',
  cfg: { webhook?: WebhookConfig; resend?: ResendConfig }
): Promise<TestResult> {
  try {
    if (type === 'webhook') {
      const url = cfg.webhook?.url;
      if (!url) return { ok: false, error: '请先填写 Webhook 地址' };
      const payload = {
        event: 'test',
        message: '这是一条测试通知，说明你的 Webhook 配置正确。',
        changedAt: new Date().toISOString(),
      };
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'WebsiteMonitor/1.0' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        return { ok: false, error: `Webhook 返回 HTTP ${res.status}${body ? '：' + body.slice(0, 200) : ''}` };
      }
      return { ok: true };
    }

    if (type === 'resend') {
      const { apiKey, from, to } = cfg.resend ?? {};
      if (!apiKey) return { ok: false, error: '请先填写 Resend API Key' };
      if (!from || !to) return { ok: false, error: '请先填写发件邮箱与收件邮箱' };
      const toList = to.split(',').map((s) => s.trim()).filter(Boolean);
      if (toList.length === 0) return { ok: false, error: '请至少填写一个收件邮箱' };

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from,
          to: toList,
          subject: '【网站监测】测试通知',
          html: `
            <div style="font-family:-apple-system,'Segoe UI',Roboto,'PingFang SC','Microsoft YaHei',sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f6f8fa;border-radius:8px;">
              <h2 style="color:#1f6feb;margin-top:0;">🛎️ 这是一封测试邮件</h2>
              <p>如果你收到这封邮件，说明你的 <strong>Resend 通知配置正确</strong>，网站内容发生变化时就会收到此类提醒。</p>
              <p style="color:#57606a;font-size:13px;">本邮件由 Website Monitor 自动发送，请勿直接回复。</p>
            </div>`,
        }),
      });
      const text = await res.text().catch(() => '');
      if (!res.ok) {
        let msg = `Resend 返回 HTTP ${res.status}`;
        try {
          const j = JSON.parse(text);
          if (j.message) msg += '：' + String(j.message).slice(0, 300);
        } catch {
          /* 忽略非 JSON 响应 */
        }
        return { ok: false, error: msg };
      }
      return { ok: true };
    }

    return { ok: false, error: '未知的通知类型' };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 去除 script/style 等噪声后取纯文本，并压缩空白 */
function normalizeText(html: string): string {
  const root = parse(html);
  root.querySelectorAll('script, style, noscript, svg, canvas, template, iframe').forEach((el) => el.remove());
  return root.text.replace(/\s+/g, ' ').trim();
}

/** 按 CSS 选择器提取目标内容（只监测这一部分的变化） */
function extractSelector(html: string, selector: string): string {
  const root = parse(html);
  const els = root.querySelectorAll(selector);
  if (els.length === 0) return '';
  return els.map((el) => el.text.replace(/\s+/g, ' ').trim()).join('\n').trim();
}

/**
 * 检查单个监测目标。
 * 首次检查只建立基线（不通知）；之后内容哈希发生变化时触发通知。
 */
export async function checkMonitor(env: Env, monitor: MonitorRow): Promise<CheckResult> {
  try {
    const res = await fetch(monitor.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; WebsiteMonitor/1.0)',
        Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
      },
      redirect: 'follow',
    });

    if (!res.ok) {
      await env.DB.prepare('UPDATE monitors SET last_checked_at = ? WHERE id = ?')
        .bind(Date.now(), monitor.id)
        .run();
      return { changed: false, hash: '', error: `HTTP ${res.status}` };
    }

    const html = await res.text();
    const content = monitor.selector ? extractSelector(html, monitor.selector) : normalizeText(html);
    const hash = await sha256Hex(content);
    // 基线哈希直接存在 D1 的 monitors.last_hash，不使用 KV
    const prev = monitor.last_hash;

    let changed = false;
    if (prev && prev !== hash) {
      changed = true;
      await notifyAll(env, monitor);
      await env.DB.prepare(
        'UPDATE monitors SET last_checked_at = ?, last_change_at = ?, last_hash = ? WHERE id = ?'
      )
        .bind(Date.now(), Date.now(), hash, monitor.id)
        .run();
    } else {
      await env.DB.prepare(
        'UPDATE monitors SET last_checked_at = ?, last_hash = ? WHERE id = ?'
      )
        .bind(Date.now(), hash, monitor.id)
        .run();
    }

    return { changed, hash };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // 失败时也更新检查时间，避免每分钟重复尝试同一失败目标
    await env.DB.prepare('UPDATE monitors SET last_checked_at = ? WHERE id = ?')
      .bind(Date.now(), monitor.id)
      .run();
    return { changed: false, hash: '', error: msg };
  }
}

/** 遍历所有启用的监测目标，仅对“到间隔”的目标执行检查 */
export async function checkDueMonitors(env: Env): Promise<void> {
  const now = Date.now();
  const { results } = await env.DB.prepare('SELECT * FROM monitors WHERE enabled = 1').all<MonitorRow>();
  for (const m of results ?? []) {
    if (now - m.last_checked_at >= m.interval_minutes * 60_000) {
      try {
        await checkMonitor(env, m);
      } catch (e) {
        console.error(`check monitor ${m.id} failed`, e);
      }
    }
  }
}

async function notifyAll(env: Env, monitor: MonitorRow): Promise<void> {
  const { results } = await env.DB.prepare(
    'SELECT * FROM notification_settings WHERE user_id = ?'
  ).bind(monitor.user_id).all<NotificationRow>();

  for (const row of results ?? []) {
    try {
      const cfg = JSON.parse(row.config);
      if (row.type === 'webhook') await sendWebhook(cfg as WebhookConfig, monitor);
      if (row.type === 'resend') await sendResend(cfg as ResendConfig, monitor);
    } catch (e) {
      console.error(`send ${row.type} notification failed for monitor ${monitor.id}`, e);
    }
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!
  );
}

/** Webhook：POST JSON 到用户配置的 URL */
async function sendWebhook(cfg: WebhookConfig, monitor: MonitorRow): Promise<void> {
  if (!cfg.url) return;
  const payload = {
    event: 'website_changed',
    monitor: {
      id: monitor.id,
      name: monitor.name,
      url: monitor.url,
      selector: monitor.selector,
    },
    changedAt: new Date().toISOString(),
  };
  await fetch(cfg.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'WebsiteMonitor/1.0' },
    body: JSON.stringify(payload),
  });
}

/** Resend：发送 HTML 邮件 */
async function sendResend(cfg: ResendConfig, monitor: MonitorRow): Promise<void> {
  if (!cfg.apiKey || !cfg.from || !cfg.to) return;
  const toList = cfg.to
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (toList.length === 0) return;

  const subject = `【网站监测】「${monitor.name}」检测到更新`;
  const html = `
    <div style="font-family:-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,'PingFang SC','Microsoft YaHei',sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f6f8fa;border-radius:8px;">
      <h2 style="color:#1f6feb;margin-top:0;">🛎️ 网站更新提醒</h2>
      <p>你监测的网站 <strong>${escapeHtml(monitor.name)}</strong> 检测到内容更新：</p>
      <p style="padding:12px 16px;background:#fff;border:1px solid #e1e4e8;border-radius:6px;">
        📄 地址：<a href="${escapeHtml(monitor.url)}" style="color:#1f6feb;">${escapeHtml(monitor.url)}</a>
      </p>
      <p style="color:#57606a;font-size:13px;">检测时间：${new Date().toISOString()}</p>
      <p style="color:#57606a;font-size:12px;">本邮件由 Website Monitor 自动发送，请勿直接回复。</p>
    </div>
  `;

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: cfg.from,
      to: toList,
      subject,
      html,
    }),
  });
}
