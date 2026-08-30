/* ===== 云端同步 / 登录服务 =====
 * 三模式：
 *  - supabase：走 Supabase 云端（登录 + 多设备同步，脱离电脑可用）——默认
 *  - cloud：走本地 server.js（/api/*，同 WiFi 调试用）
 *  - local：网络不可达时退化为本地 localStorage，应用仍可用
 */
window.Sync = (function () {
  const S = window.Store;
  const META = window.YZX_META;
  const SB = META.supabase || {};
  const SB_URL = SB.url || '';
  const SB_ANON = SB.anonKey || '';
  const SB_EMAIL = SB.email || 'jiu@jiu.app';

  let mode = null;        // 'supabase' | 'cloud' | 'local'
  let token = null;       // cloud 模式的服务器 token
  let accessToken = null; // supabase access_token
  let refreshToken = null;
  let user = null;
  let userId = null;
  let syncTimer = null;

  /* ================= 数据合并（客户端权威，按时间戳最新优先） ================= */
  function recKey(r) { return r.id || (r.qid + '|' + r.date + '|' + r.ts); }
  function mergeData(base, incoming) {
    base = base || {}; incoming = incoming || {};
    const out = {};

    const recMap = new Map();
    [].concat(base.records || [], incoming.records || []).forEach(r => recMap.set(recKey(r), r));
    out.records = Array.from(recMap.values()).sort((a, b) => (a.ts || 0) - (b.ts || 0));

    const qs = {};
    [base.qstate || {}, incoming.qstate || {}].forEach(src => {
      Object.keys(src).forEach(qid => {
        const v = src[qid];
        if (!qs[qid] || (v.ts || 0) >= (qs[qid].ts || 0)) qs[qid] = v;
      });
    });
    out.qstate = qs;

    const diary = {};
    [base.diary || {}, incoming.diary || {}].forEach(src => {
      Object.keys(src).forEach(date => {
        const v = src[date];
        if (!diary[date] || (v.ts || 0) >= (diary[date].ts || 0)) diary[date] = v;
      });
    });
    out.diary = diary;

    out.daily = Object.assign({}, base.daily || {}, incoming.daily || {});

    out.firstDate = base.firstDate || incoming.firstDate || null;
    if (base.firstDate && incoming.firstDate && incoming.firstDate < base.firstDate) out.firstDate = incoming.firstDate;

    const bs = base.settings || {}, is = incoming.settings || {};
    out.settings = (is.ts || 0) >= (bs.ts || 0) ? is : bs;

    const planMap = new Map();
    [].concat(base.plans || [], incoming.plans || []).forEach(p => planMap.set(p.id, p));
    out.plans = Array.from(planMap.values());

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

    const genMap = new Map();
    [].concat(base.generated || [], incoming.generated || []).forEach(g => genMap.set(g.id, g));
    out.generated = Array.from(genMap.values());

    // 词库：按 word 去重合并，取记忆等级较高者、下次复习取较早者
    const wmap = new Map();
    [].concat(base.words || [], incoming.words || []).forEach(w => {
      const k = String(w.word || '').toLowerCase();
      if (!wmap.has(k)) wmap.set(k, Object.assign({}, w));
      else {
        const a = wmap.get(k);
        a.level = Math.max(a.level || 0, w.level || 0);
        a.wrong = Math.max(a.wrong || 0, w.wrong || 0);
        if (!a.nextReview) a.nextReview = w.nextReview || null;
        else if (w.nextReview && w.nextReview < a.nextReview) a.nextReview = w.nextReview;
        wmap.set(k, a);
      }
    });
    out.words = Array.from(wmap.values());

    return out;
  }

  /* ================= 本地 server.js（cloud 模式） ================= */
  function api(path, opts) {
    opts = opts || {};
    const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    if (token) headers['Authorization'] = 'Bearer ' + token;
    return fetch(path, { method: opts.method || 'GET', headers: headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
  }

  /* ================= Supabase（REST，无需 CDN） ================= */
  function sbAuth(grant, body) {
    return fetch(SB_URL + '/auth/v1/token?grant_type=' + grant, {
      method: 'POST',
      headers: { 'apikey': SB_ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(r => r.json().then(j => ({ ok: r.ok, status: r.status, j })));
  }
  function sbRest(method, path, body, retried) {
    const headers = {
      'apikey': SB_ANON,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates,return=minimal'
    };
    if (accessToken) headers['Authorization'] = 'Bearer ' + accessToken;
    return fetch(SB_URL + '/rest/v1/' + path, {
      method: method,
      headers: headers,
      body: body ? JSON.stringify(body) : undefined
    }).then(r => r.text().then(t => {
        let j = null;
        if (t) { try { j = JSON.parse(t); } catch (e) { j = null; } }
        return { ok: r.ok, status: r.status, j: j };
      }))
      .then(res => {
        if (res.status === 401 && !retried) return refreshSbToken().then(ok => ok ? sbRest(method, path, body, true) : res);
        return res;
      })
      .catch(() => ({ ok: false, status: 0, j: null }));
  }

  function refreshSbToken() {
    if (!refreshToken) return Promise.resolve(false);
    return sbAuth('refresh_token', { refresh_token: refreshToken }).then(({ ok, j }) => {
      if (ok && j.access_token) {
        accessToken = j.access_token;
        refreshToken = j.refresh_token || refreshToken;
        localStorage.setItem('yzx.sb_token', accessToken);
        localStorage.setItem('yzx.sb_refresh', refreshToken);
        return true;
      }
      return false;
    });
  }

  function saveSupabaseSession(j) {
    accessToken = j.access_token;
    refreshToken = j.refresh_token;
    userId = (j.user && j.user.id) || null;
    user = { username: 'jiu', uid: userId };
    mode = 'supabase';
    localStorage.setItem('yzx.sb_token', accessToken);
    localStorage.setItem('yzx.sb_refresh', refreshToken);
    S.setUser(user);
    S.setToken(null);
    return true;
  }

  /* ================= 对外接口 ================= */
  function isLoggedIn() { return !!user; }
  function getMode() { return mode; }
  function getUser() { return user; }

  function login(username, password) {
    username = (username || '').trim();
    password = password || '';
    if (SB_URL) return loginSupabase(username, password);
    return loginCloud(username, password);
  }

  function loginSupabase(username, password) {
    if (username !== 'jiu') return Promise.resolve({ ok: false, error: '账号仅支持 jiu' });
    return sbAuth('password', { email: SB_EMAIL, password: password })
      .then(({ ok, j }) => {
        if (ok && j.access_token) {
          saveSupabaseSession(j);
          return syncNow().then(() => ({ ok: true }));
        }
        return { ok: false, error: (j && (j.error_description || j.msg)) || '用户名或密码错误' };
      })
      .catch(() => {
        if (username === 'jiu' && password === 'jiu000') {
          mode = 'local'; user = { username: 'jiu', local: true }; S.setUser(user);
          return { ok: true, offline: true };
        }
        return { ok: false, error: '无法连接云端，且账号或密码错误' };
      });
  }

  function loginCloud(username, password) {
    return api('/api/auth/login', { method: 'POST', body: { username: username, password: password } })
      .then(r => r.json().then(j => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (ok && j.token) {
          mode = 'cloud'; token = j.token; user = j.user;
          S.setToken(token); S.setUser(user);
          return syncNow().then(() => ({ ok: true }));
        }
        return { ok: false, error: (j && j.error) || '用户名或密码错误' };
      })
      .catch(() => {
        if (username === 'jiu' && password === 'jiu000') {
          mode = 'local'; user = { username: 'jiu', local: true }; S.setUser(user);
          return { ok: true, offline: true };
        }
        return { ok: false, error: '无法连接服务器，且账号或密码错误' };
      });
  }

  function autoLogin() {
    const u = S.getUser();
    if (SB_URL) return autoLoginSupabase(u);
    const t = S.getToken();
    if (t) {
      token = t; user = u;
      return api('/api/auth/me').then(r => r.json()).then(j => {
        if (j.ok) { mode = 'cloud'; user = j.user || u; S.setUser(user); return true; }
        S.clearAuth(); mode = null; token = null; user = null; return false;
      }).catch(() => { mode = 'local'; user = u; return true; });
    } else if (u) {
      mode = 'local'; user = u; return Promise.resolve(true);
    }
    return Promise.resolve(false);
  }

  function autoLoginSupabase(u) {
    const ref = localStorage.getItem('yzx.sb_refresh');
    const acc = localStorage.getItem('yzx.sb_token');
    if (!ref && !acc) {
      if (u && u.local) { mode = 'local'; user = u; return Promise.resolve(true); }
      return Promise.resolve(false);
    }
    accessToken = acc;
    refreshToken = ref;
    if (!ref) { // 只有 access token，尝试解析 userId 直接用（可能已过期，交给后续刷新）
      userId = u && u.uid ? u.uid : null;
      mode = 'supabase'; user = u; return Promise.resolve(true);
    }
    return sbAuth('refresh_token', { refresh_token: ref }).then(({ ok, j }) => {
      if (ok && j.access_token) { saveSupabaseSession(j); return true; }
      // 刷新失败 → 本地模式
      if (u) { mode = 'local'; user = u; return true; }
      return false;
    }).catch(() => {
      if (u) { mode = 'local'; user = u; return true; }
      return false;
    });
  }

  function logout() {
    S.clearAuth();
    ['yzx.sb_token', 'yzx.sb_refresh'].forEach(k => localStorage.removeItem(k));
    mode = null; token = null; accessToken = null; refreshToken = null; user = null; userId = null;
  }

  function syncNow() {
    if (mode === 'supabase') return syncSupabase();
    if (mode === 'cloud') return syncCloud();
    return Promise.resolve({ ok: true, skipped: true });
  }

  function syncSupabase() {
    if (!userId || !accessToken) return Promise.resolve({ ok: false });
    const local = S.getSyncData();
    return sbRest('GET', 'sync_state?select=data&id=eq.' + encodeURIComponent(userId))
      .then(({ ok, j }) => {
        let remote = {};
        if (ok && Array.isArray(j) && j.length) remote = j[0].data || {};
        const localRev = local.rev || 0;
        const remoteRev = remote.rev || 0;
        if (localRev >= remoteRev) {
          // 本地更新（含重置/删除）→ 覆盖云端
          return sbRest('POST', 'sync_state', { id: userId, data: local, updated_at: new Date().toISOString() })
            .then(({ ok: ok2 }) => {
              if (ok2) { localStorage.setItem('yzx.last_sync', Date.now()); return { ok: true }; }
              return { ok: false };
            });
        } else {
          // 云端更新 → 拉取到本地
          S.applySyncData(remote);
          localStorage.setItem('yzx.last_sync', Date.now());
          return { ok: true };
        }
      })
      .catch(() => ({ ok: false }));
  }

  function syncCloud() {
    const data = S.getSyncData();
    return api('/api/sync', { method: 'POST', body: { data: data } })
      .then(r => r.json().then(j => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (ok && j.data) { S.applySyncData(j.data); localStorage.setItem('yzx.last_sync', Date.now()); }
        return { ok };
      })
      .catch(() => ({ ok: false }));
  }

  function markDirty() {
    if (mode !== 'supabase' && mode !== 'cloud') return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => syncNow(), 1500);
  }

  function lastSync() {
    const v = localStorage.getItem('yzx.last_sync');
    return v ? Number(v) : null;
  }

  function init() {
    window.addEventListener('online', () => { if (mode === 'supabase' || mode === 'cloud') syncNow(); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden && (mode === 'supabase' || mode === 'cloud')) syncNow(); });
    setInterval(() => { if (mode === 'supabase' || mode === 'cloud') syncNow(); }, 60000);
  }

  return { login, autoLogin, logout, isLoggedIn, getMode, getUser, syncNow, markDirty, lastSync, init };
})();
