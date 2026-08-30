/* ============================================================
 * Yi-朝夕刷题 V3.0 —— 后端服务器
 * 功能：1) 静态文件服务（PWA）  2) 登录认证  3) 云端数据同步  4) AI 代理
 * 零外部依赖，仅使用 Node 内置模块。数据存于 data/db.json。
 *
 * 启动：node server.js
 * 手机/平板与电脑连同一 WiFi，打开打印出的 http://192.168.x.x:8080 即可多端同步。
 * 如需「地铁/家里」真正跨网络同步，把整个文件夹部署到任意免费 Node 平台
 * （Railway / Render / Fly.io），手机打开对应 https 网址即可。
 * ============================================================ */
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const PORT = process.env.PORT || 8080;
const ROOT = __dirname;
const DB_PATH = path.join(__dirname, 'data', 'db.json');
const ZHIPU_API_KEY = process.env.ZHIPU_API_KEY || 'a495b6c8bfd04f1bbd232acfc3ce726c.DJQ4jnBg4R9evPvA';
const ZHIPU_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
const AI_MODEL = process.env.ZHIPU_MODEL || 'glm-4-flash';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.md': 'text/markdown; charset=utf-8'
};

/* ---------------- 数据库（文件 JSON） ---------------- */
function hashPassword(pw, salt) { return crypto.scryptSync(pw, salt, 64).toString('hex'); }

function loadDB() {
  try {
    if (fs.existsSync(DB_PATH)) return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch (e) { /* 忽略损坏，重建 */ }
  return null;
}
function saveDB(db) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}
function initDB() {
  let db = loadDB();
  if (!db) db = { users: {}, data: {}, _secret: null };
  if (!db._secret) db._secret = crypto.randomBytes(32).toString('hex');
  if (!db.users) db.users = {};
  if (!db.data) db.data = {};
  // 内置测试账号 jiu / jiu000
  if (!db.users['jiu']) {
    const salt = crypto.randomBytes(16).toString('hex');
    db.users['jiu'] = { salt: salt, hash: hashPassword('jiu000', salt), nickname: 'jiu', createdAt: new Date().toISOString() };
  }
  saveDB(db);
  return db;
}
const DB = initDB();

/* ---------------- Token（HMAC 签名，30 天有效） ---------------- */
function b64url(s) { return Buffer.from(s).toString('base64url'); }
function signToken(username) {
  const exp = Date.now() + 30 * 24 * 3600 * 1000;
  const payload = b64url(username) + '.' + exp.toString(36);
  const sig = crypto.createHmac('sha256', DB._secret).update(payload).digest('base64url');
  return payload + '.' + sig;
}
function verifyToken(token) {
  if (!token) return null;
  const parts = String(token).split('.');
  if (parts.length !== 3) return null;
  const payload = parts[0] + '.' + parts[1];
  const expect = crypto.createHmac('sha256', DB._secret).update(payload).digest('base64url');
  if (expect !== parts[2]) return null;
  const exp = parseInt(parts[1], 36);
  if (!exp || Date.now() > exp) return null;
  return Buffer.from(parts[0], 'base64url').toString('utf8');
}

/* ---------------- 数据合并（按时间戳，最新优先） ---------------- */
function recKey(r) { return r.id || (r.qid + '|' + r.date + '|' + r.ts); }
function mergeData(base, incoming) {
  base = base || {}; incoming = incoming || {};
  const out = {};

  // 记录：按 id 去重合并
  const recMap = new Map();
  [].concat(base.records || [], incoming.records || []).forEach(r => recMap.set(recKey(r), r));
  out.records = Array.from(recMap.values()).sort((a, b) => (a.ts || 0) - (b.ts || 0));

  // 题目状态：每个 qid 取更新时间较新者
  const qs = {};
  [base.qstate || {}, incoming.qstate || {}].forEach(src => {
    Object.keys(src).forEach(qid => {
      const v = src[qid];
      if (!qs[qid] || (v.ts || 0) >= (qs[qid].ts || 0)) qs[qid] = v;
    });
  });
  out.qstate = qs;

  // 日记：按日期取较新
  const diary = {};
  [base.diary || {}, incoming.diary || {}].forEach(src => {
    Object.keys(src).forEach(date => {
      const v = src[date];
      if (!diary[date] || (v.ts || 0) >= (diary[date].ts || 0)) diary[date] = v;
    });
  });
  out.diary = diary;

  // 每日任务：按日期浅合并（每日任务确定性生成，冲突罕见）
  out.daily = Object.assign({}, base.daily || {}, incoming.daily || {});

  // 起始日期：取最早
  out.firstDate = base.firstDate || incoming.firstDate || null;
  if (base.firstDate && incoming.firstDate && incoming.firstDate < base.firstDate) out.firstDate = incoming.firstDate;

  // 设置：取较新
  const bs = base.settings || {}, is = incoming.settings || {};
  out.settings = (is.ts || 0) >= (bs.ts || 0) ? is : bs;

  // 计划：按 id 合并
  const planMap = new Map();
  [].concat(base.plans || [], incoming.plans || []).forEach(p => planMap.set(p.id, p));
  out.plans = Array.from(planMap.values());

  // AI 对话历史：按题目 id，消息按 (timestamp+role+content) 去重
  const ah = {};
  const qids = new Set([].concat(Object.keys(base.ai_history || {}), Object.keys(incoming.ai_history || {})));
  qids.forEach(qid => {
    const merged = [];
    const seen = new Set();
    [].concat((base.ai_history || {})[qid] || [], (incoming.ai_history || {})[qid] || []).forEach(m => {
      const k = (m.timestamp || '') + '|' + m.role + '|' + (m.content || '');
      if (!seen.has(k)) { seen.add(k); merged.push(m); }
    });
    merged.sort((a, b) => String(a.timestamp || '').localeCompare(String(b.timestamp || '')));
    ah[qid] = merged;
  });
  out.ai_history = ah;

  // AI 生成题目：按 id 合并
  const genMap = new Map();
  [].concat(base.generated || [], incoming.generated || []).forEach(g => genMap.set(g.id, g));
  out.generated = Array.from(genMap.values());

  return out;
}

/* ---------------- HTTP 工具 ---------------- */
function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}
function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise(resolve => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 5e6) req.destroy(); });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}
function auth(req) {
  const h = req.headers['authorization'] || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

/* ---------------- AI 代理 ---------------- */
function aiChat(messages, model) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ model: model || AI_MODEL, messages: messages });
    const r = https.request(ZHIPU_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + ZHIPU_API_KEY,
        'Content-Length': Buffer.byteLength(payload)
      }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(d);
          if (j.choices && j.choices[0]) return resolve(j.choices[0].message.content);
          return reject(new Error((j.error && j.error.message) || 'AI 调用失败'));
        } catch (e) { reject(new Error('AI 响应解析失败')); }
      });
    });
    r.on('error', e => reject(new Error('AI 网络错误: ' + e.message)));
    r.write(payload);
    r.end();
  });
}

/* ---------------- API 路由 ---------------- */
async function handleAPI(req, res, p) {
  try {
    if (p === '/api/auth/login' && req.method === 'POST') {
      const b = await readBody(req);
      const username = String(b.username || '').trim();
      const u = DB.users[username];
      if (!u || u.hash !== hashPassword(String(b.password || ''), u.salt)) {
        return json(res, 401, { ok: false, error: '用户名或密码错误' });
      }
      return json(res, 200, { ok: true, token: signToken(username), user: { username: username, nickname: u.nickname } });
    }

    if (p === '/api/auth/me' && req.method === 'GET') {
      const username = verifyToken(auth(req));
      if (!username) return json(res, 401, { ok: false, error: '未登录或登录已过期' });
      const u = DB.users[username];
      return json(res, 200, { ok: true, user: { username: username, nickname: u ? u.nickname : username } });
    }

    if (p === '/api/sync' && req.method === 'POST') {
      const username = verifyToken(auth(req));
      if (!username) return json(res, 401, { ok: false, error: '未登录或登录已过期' });
      const b = await readBody(req);
      const merged = mergeData(DB.data[username], b.data);
      DB.data[username] = merged;
      saveDB(DB);
      return json(res, 200, { ok: true, data: merged, syncedAt: new Date().toISOString() });
    }

    if (p === '/api/ai/chat' && req.method === 'POST') {
      const b = await readBody(req);
      if (!b.messages || !b.messages.length) return json(res, 400, { ok: false, error: '缺少 messages' });
      try {
        const content = await aiChat(b.messages, b.model);
        return json(res, 200, { ok: true, content: content });
      } catch (e) { return json(res, 502, { ok: false, error: e.message }); }
    }

    return json(res, 404, { ok: false, error: '接口不存在' });
  } catch (e) {
    return json(res, 500, { ok: false, error: e.message });
  }
}

/* ---------------- 静态文件 ---------------- */
function serveStatic(req, res, pathname) {
  let p = decodeURIComponent(pathname);
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end('403'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('404 Not Found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
}

/* ---------------- 启动 ---------------- */
http.createServer((req, res) => {
  setCORS(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) return handleAPI(req, res, url.pathname);
  return serveStatic(req, res, url.pathname);
}).listen(PORT, () => {
  console.log('✅ Yi-朝夕刷题 V3.0 已启动（含登录/同步/AI）');
  console.log('   本机访问:  http://localhost:' + PORT);
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        console.log('   手机/平板同WiFi访问: http://' + net.address + ':' + PORT + '   （账号 jiu / 密码 jiu000）');
      }
    }
  }
  console.log('   云端数据文件: data/db.json');
});
