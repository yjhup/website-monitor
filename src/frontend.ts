// 前端页面（内嵌单文件，由 Worker 直接返回）
export const FRONTEND_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>网站监测</title>
<style>
  :root {
    --bg: #f4f6f8;
    --card: #ffffff;
    --text: #1f2328;
    --muted: #6e7781;
    --border: #d8dee4;
    --primary: #1f6feb;
    --primary-dark: #1158c7;
    --danger: #d1242f;
    --success: #1a7f37;
    --radius: 10px;
    --shadow: 0 1px 3px rgba(31,35,40,.08);
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; font-family: -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "PingFang SC", "Microsoft YaHei", sans-serif;
    background: var(--bg); color: var(--text); font-size: 14px; line-height: 1.5;
  }
  .container { max-width: 860px; margin: 0 auto; padding: 24px 16px 60px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .sub { color: var(--muted); margin: 0 0 20px; }
  .card { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); padding: 20px; margin-bottom: 20px; }
  .card h2 { font-size: 16px; margin: 0 0 14px; }
  label { display: block; font-weight: 600; margin: 12px 0 4px; font-size: 13px; }
  input[type=text], input[type=password], input[type=number], input[type=url], input[type=email], select {
    width: 100%; padding: 8px 10px; border: 1px solid var(--border); border-radius: 6px; font-size: 14px; background: #fff;
  }
  textarea {
    width: 100%; padding: 8px 10px; border: 1px solid var(--border); border-radius: 6px; font-size: 13px; background: #fff;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace; resize: vertical; line-height: 1.5;
  }
  input:focus { outline: 2px solid var(--primary); outline-offset: -1px; border-color: transparent; }
  button {
    background: var(--primary); color: #fff; border: 0; border-radius: 6px; padding: 8px 16px; font-size: 14px; cursor: pointer; font-weight: 600;
  }
  button:hover { background: var(--primary-dark); }
  button.secondary { background: #eef1f4; color: var(--text); }
  button.secondary:hover { background: #dde3e9; }
  button.danger { background: #fff; color: var(--danger); border: 1px solid var(--danger); }
  button.danger:hover { background: var(--danger); color: #fff; }
  button:disabled { opacity: .5; cursor: not-allowed; }
  .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .grow { flex: 1; }
  .err { background: #ffebe9; border: 1px solid #ffc1b8; color: var(--danger); border-radius: 6px; padding: 8px 12px; margin: 10px 0; }
  .ok { background: #dafbe1; border: 1px solid #aceebb; color: var(--success); border-radius: 6px; padding: 8px 12px; margin: 10px 0; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 10px 8px; border-bottom: 1px solid var(--border); vertical-align: top; }
  th { font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: .03em; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: 600; }
  .badge.on { background: #dafbe1; color: var(--success); }
  .badge.off { background: #eaeef2; color: var(--muted); }
  .muted { color: var(--muted); font-size: 12px; }
  .empty { color: var(--muted); text-align: center; padding: 30px 0; }
  .modal-mask { position: fixed; inset: 0; background: rgba(0,0,0,.4); display: none; align-items: flex-start; justify-content: center; padding: 60px 16px; z-index: 50; overflow: auto; }
  .modal-mask.show { display: flex; }
  .modal { background: #fff; border-radius: var(--radius); max-width: 480px; width: 100%; padding: 20px; box-shadow: 0 12px 40px rgba(0,0,0,.2); }
  .modal h2 { margin: 0 0 4px; font-size: 18px; }
  .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
  .header h1 { margin: 0; }
  .tabs { display: flex; gap: 6px; margin-bottom: 16px; }
  .tab { padding: 8px 14px; border-radius: 8px; cursor: pointer; font-weight: 600; color: var(--muted); background: transparent; border: 1px solid transparent; }
  .tab.active { color: var(--primary); background: #e6f0ff; border-color: #b6d4ff; }
  .seg { display: flex; gap: 8px; flex-wrap: wrap; }
  .seg button { background: #fff; color: var(--text); border: 1px solid var(--border); }
  .seg button.active { background: var(--primary); color: #fff; border-color: var(--primary); }
  .inline-tip { color: var(--muted); font-size: 12px; margin-top: 6px; }
  a { color: var(--primary); word-break: break-all; }
  /* 可折叠的“数据格式”说明 */
  details.tip-box { margin-top: 10px; border: 1px solid var(--border); border-radius: 6px; padding: 8px 12px; background: #f6f8fa; }
  details.tip-box summary { cursor: pointer; font-size: 13px; font-weight: 600; color: var(--muted); }
  details.tip-box pre { background: #0d1117; color: #e6edf3; border-radius: 6px; padding: 10px 12px; overflow-x: auto; font-size: 12px; margin: 8px 0 0; white-space: pre; }
  /* 手机端适配：表格在卡片内横向滚动，避免撑破页面 */
  .table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  .table-wrap table { min-width: 560px; }
  @media (max-width: 640px) {
    .container { padding: 16px 10px 48px; }
    .card { padding: 14px; }
    .header { flex-wrap: wrap; row-gap: 8px; }
    h1 { font-size: 20px; }
    .tabs { overflow-x: auto; white-space: nowrap; }
    .modal-mask { padding: 20px 10px; }
    button { padding: 8px 12px; }
    th, td { padding: 8px 6px; }
    details.tip-box pre { font-size: 11px; }
  }
</style>
</head>
<body>
<div class="container" id="app"></div>

<div class="modal-mask" id="modal">
  <div class="modal" id="modal-box"></div>
</div>

<script>
const $ = (sel, el=document) => el.querySelector(sel);
const api = (path, opts={}) => fetch('/api'+path, { headers: {'Content-Type':'application/json'}, credentials:'same-origin', ...opts });

async function init() {
  try {
    const r = await api('/me');
    if (r.ok) { const d = await r.json(); renderApp(d.username); }
    else renderLogin();
  } catch { renderLogin(); }
}

// ---------- 登录 ----------
function renderLogin() {
  $('#app').innerHTML = \`
    <div style="max-width:360px;margin:8vh auto;">
      <div class="card">
        <h1 style="margin-bottom:4px;">网站监测</h1>
        <p class="sub" style="margin-bottom:16px;">登录以管理你的监测目标与通知方式</p>
        <label>用户名</label>
        <input type="text" id="login-user" autocomplete="username" />
        <label>密码</label>
        <input type="password" id="login-pass" autocomplete="current-password" />
        <div id="login-msg"></div>
        <div style="margin-top:16px;"><button id="login-btn" style="width:100%;">登 录</button></div>
      </div>
    </div>\`;
  const doLogin = async () => {
    const msg = $('#login-msg'); msg.innerHTML = '';
    const r = await api('/login', { method:'POST', body: JSON.stringify({ username:$('#login-user').value, password:$('#login-pass').value }) });
    if (!r.ok) { const d = await r.json().catch(()=>({})); msg.innerHTML = '<div class="err">' + (d.error||'登录失败') + '</div>'; return; }
    const d = await r.json(); renderApp(d.username);
  };
  $('#login-btn').onclick = doLogin;
  $('#login-pass').addEventListener('keydown', e => { if (e.key==='Enter') doLogin(); });
}

// ---------- 主界面 ----------
let state = { user:'', tab:'monitors', monitors:[], notify:{} };

function renderApp(username) {
  state.user = username;
  $('#app').innerHTML = \`
    <div class="header">
      <h1>网站监测</h1>
      <div class="row">
        <span class="muted">👤 \${esc(username)}</span>
        <button class="secondary" id="logout">退出</button>
      </div>
    </div>
    <div class="tabs">
      <button class="tab active" data-tab="monitors">监测目标</button>
      <button class="tab" data-tab="notify">通知设置</button>
    </div>
    <div id="main"></div>\`;
  $('#logout').onclick = async () => { await api('/logout', { method:'POST' }); renderLogin(); };
  document.querySelectorAll('.tab').forEach(t => t.onclick = () => { switchTab(t.dataset.tab); });
  loadAll();
}

async function loadAll() {
  const [m, n] = await Promise.all([ api('/monitors').then(r=>r.json()), api('/notifications').then(r=>r.json()) ]);
  state.monitors = m.monitors || [];
  state.notify = n;
  renderTab();
}

function switchTab(tab) {
  state.tab = tab;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab===tab));
  renderTab();
}

function renderTab() {
  const main = $('#main');
  if (state.tab==='monitors') main.innerHTML = renderMonitors();
  else main.innerHTML = renderNotify();
  bindTab();
}

function renderMonitors() {
  const rows = state.monitors.map(m => \`
    <tr>
      <td style="min-width:130px;">
        <div><strong>\${esc(m.name)}</strong></div>
        <div class="muted"><a href="\${esc(m.url)}" target="_blank" rel="noopener">\${esc(m.url)}</a></div>
        \${m.selector ? '<div class="muted">选择器：' + esc(m.selector) + '</div>' : ''}
      </td>
      <td>\${m.interval_minutes} 分钟</td>
      <td>\${m.last_checked_at ? new Date(m.last_checked_at).toLocaleString('zh-CN') : '—'}</td>
      <td>\${m.last_change_at ? new Date(m.last_change_at).toLocaleString('zh-CN') : '—'}</td>
      <td><span class="badge \${m.enabled ? 'on' : 'off'}">\${m.enabled ? '监测中' : '已暂停'}</span></td>
      <td style="white-space:nowrap;">
        <button class="secondary" data-act="check" data-id="\${m.id}">检查</button>
        <button class="secondary" data-act="edit" data-id="\${m.id}">编辑</button>
        <button class="danger" data-act="del" data-id="\${m.id}">删除</button>
      </td>
    </tr>\`).join('');

  return \`
    <div class="card">
      <div class="row" style="justify-content:space-between;">
        <h2 style="margin:0;">监测目标（\${state.monitors.length}）</h2>
        <button id="add-monitor">＋ 添加监测</button>
      </div>
      <div class="table-wrap" style="margin-top:14px;">
        <table>
          <thead><tr><th>目标</th><th>间隔</th><th>最近检查</th><th>最近变化</th><th>状态</th><th></th></tr></thead>
          <tbody>\${rows || '<tr><td colspan="6" class="empty">还没有监测目标，点击右上角添加。</td></tr>'}</tbody>
        </table>
      </div>
      <p class="inline-tip">💡 定时任务每分钟触发一次，只有到“间隔”的目标才会被实际抓取检查。选择器留空时监测整页文本；填写 CSS 选择器（如 <code>.notice-list</code>）可只监测某一部分，减少误报。</p>
    </div>\`;
}

function renderNotify() {
  const w = state.notify.webhook || {};
  const r = state.notify.resend || {};
  const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
  const wm = (w.method || 'POST').toUpperCase();
  return \`
    <div class="card">
      <h2>Webhook 通知</h2>
      <label>Webhook 通知 URL</label>
      <input type="url" id="wh-url" placeholder="https://example.com/hooks/xxx" value="\${esc(w.url || '')}" />
      <div class="row" style="align-items:flex-end;gap:12px;">
        <div style="flex:0 0 170px;">
          <label>请求方法</label>
          <select id="wh-method">\${METHODS.map(m => '<option' + (wm === m ? ' selected' : '') + '>' + m + '</option>').join('')}</select>
        </div>
        <p class="inline-tip" style="flex:1;margin:0 0 4px;">GET/HEAD 不发送请求体；其余方法发送下面的消息体。</p>
      </div>
      <label>自定义请求头（JSON 格式，可选）</label>
      <textarea id="wh-headers" rows="3" placeholder='{"Authorization": "Bearer xxx", "X-Custom": "1"}'>\${esc(w.headers || '')}</textarea>
      <label>消息模板（JSON 格式，可选）</label>
      <textarea id="wh-template" rows="6" placeholder='{"text": "「{{title}}」检测到更新，请查看：{{url}}"}'>\${esc(w.template || '')}</textarea>
      <p class="inline-tip">模板支持占位符：<code>{{event}}</code> <code>{{url}}</code> <code>{{title}}</code> <code>{{selector}}</code> <code>{{changedAt}}</code> <code>{{previousHash}}</code> <code>{{newHash}}</code>，发送前自动替换。留空则使用下方默认格式。</p>
      <details class="tip-box">
        <summary>查看本工具发送的数据格式（未填写模板时）</summary>
        <pre>{
  "event": "website_changed",
  "monitor": { "id": "...", "name": "学校教务处通知", "url": "https://..." },
  "changedAt": "2026-08-22T08:00:00.000Z",
  "previousHash": "旧内容哈希",
  "newHash": "新内容哈希"
}</pre>
        <p class="muted">点击「发送测试」时 event 为 "test"，并按当前请求方法 / 请求头 / 模板发送。</p>
      </details>
      <div class="row" style="justify-content:flex-end;margin-top:10px;">
        <button class="secondary" id="wh-test">发送测试</button>
      </div>
      <div id="wh-test-msg"></div>
    </div>
    <div class="card">
      <h2>Resend 邮件通知</h2>
      <label>Resend API Key</label>
      <input type="password" id="re-key" placeholder="re_xxxxxxxx" value="" />
      \${r.hasKey ? '<p class="inline-tip">✅ 已配置（' + esc(r.keyMasked) + '），留空则保持不变。</p>' : '<p class="inline-tip">在 <a href="https://resend.com" target="_blank" rel="noopener">resend.com</a> 创建 API Key，例如 re_xxxxxxxx。</p>'}
      <label>发件邮箱（需在 Resend 中验证域名）</label>
      <input type="email" id="re-from" placeholder="monitor@example.com" value="\${esc(r.from || '')}" />
      <label>收件邮箱（多个用英文逗号分隔）</label>
      <input type="email" id="re-to" placeholder="me@example.com, friend@example.com" value="\${esc(r.to || '')}" />
      <div class="row" style="justify-content:flex-end;margin-top:10px;">
        <button class="secondary" id="re-test">发送测试</button>
      </div>
      <div id="re-test-msg"></div>
    </div>
    <button id="save-notify" style="width:100%;">保存通知设置</button>
    <div id="notify-msg"></div>\`;
}

function bindTab() {
  const main = $('#main');
  if (state.tab==='monitors') {
    const addBtn = $('#add-monitor');
    if (addBtn) addBtn.onclick = () => openModal(null);
    main.querySelectorAll('[data-act]').forEach(b => b.onclick = async () => {
      const m = state.monitors.find(x => x.id === b.dataset.id);
      if (!m) return;
      if (b.dataset.act === 'edit') openModal(m);
      else if (b.dataset.act === 'del') {
        if (!confirm('确定删除「' + m.name + '」？')) return;
        await api('/monitors/' + m.id, { method:'DELETE' });
        loadAll();
      } else if (b.dataset.act === 'check') {
        b.disabled = true; b.textContent = '检查中…';
        const r = await api('/monitors/' + m.id + '/check', { method:'POST' });
        const d = await r.json().catch(()=>({}));
        alert(d.error ? ('检查失败：' + d.error) : (d.changed ? '检测到变化，已发送通知 ✅' : '内容无变化'));
        b.disabled = false; b.textContent = '检查';
        loadAll();
      }
    });
  } else {
    const saveBtn = $('#save-notify');
    if (saveBtn) saveBtn.onclick = async () => {
      const msg = $('#notify-msg'); msg.innerHTML = '';
      const body = {
        webhook: {
          url: $('#wh-url').value.trim(),
          method: $('#wh-method').value,
          headers: $('#wh-headers').value.trim(),
          template: $('#wh-template').value.trim(),
        },
        resend: { apiKey: $('#re-key').value.trim(), from: $('#re-from').value.trim(), to: $('#re-to').value.trim() },
      };
      const r = await api('/notifications', { method:'PUT', body: JSON.stringify(body) });
      if (!r.ok) { const d = await r.json().catch(()=>({})); msg.innerHTML = '<div class="err">' + (d.error||'保存失败') + '</div>'; return; }
      msg.innerHTML = '<div class="ok">保存成功 ✅</div>';
      loadAll();
    };

    // 通知测试按钮（webhook / resend）
    const runTest = (btnSel, msgSel, type) => {
      const btn = $(btnSel), msg = $(msgSel);
      if (!btn) return;
      btn.onclick = async () => {
        msg.innerHTML = '';
        btn.disabled = true; btn.textContent = '测试中…';
        const body = {
          type,
          webhook: {
            url: $('#wh-url').value.trim(),
            method: $('#wh-method').value,
            headers: $('#wh-headers').value.trim(),
            template: $('#wh-template').value.trim(),
          },
          resend: { apiKey: $('#re-key').value.trim(), from: $('#re-from').value.trim(), to: $('#re-to').value.trim() },
        };
        const r = await api('/notifications/test', { method:'POST', body: JSON.stringify(body) });
        const d = await r.json().catch(()=>({}));
        btn.disabled = false; btn.textContent = '发送测试';
        msg.innerHTML = d.ok ? '<div class="ok">测试成功 ✅</div>' : '<div class="err">' + esc(d.error || '测试失败') + '</div>';
      };
    };
    runTest('#wh-test', '#wh-test-msg', 'webhook');
    runTest('#re-test', '#re-test-msg', 'resend');
  }
}

function openModal(m) {
  const editing = !!m;
  $('#modal-box').innerHTML = \`
    <h2>\${editing ? '编辑监测目标' : '添加监测目标'}</h2>
    <label>显示名称</label>
    <input type="text" id="f-name" placeholder="例如：学校教务处通知" value="\${esc(m ? m.name : '')}" />
    <label>网站地址</label>
    <input type="url" id="f-url" placeholder="https://jwc.example.edu.cn/notice" value="\${esc(m ? m.url : '')}" />
    <label>CSS 选择器（可选，留空监测整页）</label>
    <input type="text" id="f-selector" placeholder="例如：.notice-list" value="\${esc(m ? m.selector || '' : '')}" />
    <label>检查间隔</label>
    <div class="seg" id="f-seg">
      \${[5,15,30,60,180,720].map(v => '<button data-v="'+v+'" class="'+((m?m.interval_minutes:v)===v?'active':'')+'">'+v+' 分钟</button>').join('')}
      <button data-v="custom">自定义</button>
    </div>
    <input type="number" id="f-interval" min="1" max="10080" style="margin-top:8px;display:\${m && ![5,15,30,60,180,720].includes(m.interval_minutes) ? 'block' : 'none'};" value="\${m ? m.interval_minutes : 60}" />
    <div id="modal-msg"></div>
    <div class="row" style="justify-content:flex-end;margin-top:16px;">
      <button class="secondary" id="m-cancel">取消</button>
      <button id="m-save">\${editing ? '保存' : '添加'}</button>
    </div>\`;

  let interval = m ? m.interval_minutes : 60;
  const seg = $('#f-seg');
  seg.querySelectorAll('button').forEach(b => b.onclick = () => {
    seg.querySelectorAll('button').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    if (b.dataset.v === 'custom') { $('#f-interval').style.display = 'block'; }
    else { $('#f-interval').style.display = 'none'; interval = Number(b.dataset.v); $('#f-interval').value = interval; }
  });
  $('#f-interval').oninput = () => { interval = Number($('#f-interval').value) || 60; };

  $('#m-cancel').onclick = () => hideModal();
  $('#m-save').onclick = async () => {
    const msg = $('#modal-msg'); msg.innerHTML = '';
    const body = { name:$('#f-name').value.trim(), url:$('#f-url').value.trim(), selector:$('#f-selector').value.trim(), interval_minutes: interval };
    const r = editing
      ? await api('/monitors/' + m.id, { method:'PUT', body: JSON.stringify(body) })
      : await api('/monitors', { method:'POST', body: JSON.stringify(body) });
    if (!r.ok) { const d = await r.json().catch(()=>({})); msg.innerHTML = '<div class="err">' + (d.error||'保存失败') + '</div>'; return; }
    hideModal(); loadAll();
  };
  $('#modal').classList.add('show');
}

function hideModal() { $('#modal').classList.remove('show'); $('#modal-box').innerHTML = ''; }
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') hideModal(); });

function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

init();
</script>
</body>
</html>`;
