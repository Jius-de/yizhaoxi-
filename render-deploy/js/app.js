/* ===== Yi-朝夕刷题 V3.0 主程序 ===== */
(function () {
  const META = window.YZX_META;
  const S = window.Store;
  const Sync = window.Sync;
  const AI = window.AI;

  // ---- 状态 ----
  const state = {
    tab: 'home',
    dailyView: 'tasks', // tasks | question | wrong | words
    currentTask: null,
    currentQIndex: 0,
    chat: [],           // 全局 AI 对话
    aiBusy: false,
    aiPopup: null,      // { key, context, subtitle, messages, busy }
    reviewList: null,   // 待审核的 AI 生成题目
    reviewTitle: '',
    wordQueue: [],      // 背单词：当前学习队列
    wordIndex: 0,
    wordChat: null,     // { key, word, messages, busy }
    wordResult: null,   // 复习作答结果 { correct } | null
    wordSession: 'mixed' // 'mixed' | 'learned' | 'forgot'
  };

  // ---- 工具 ----
  const $ = (sel) => document.querySelector(sel);
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function nl2br(s) { return esc(s).replace(/\n/g, '<br>'); }
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('show'), 2200);
  }
  function greeting() {
    const h = new Date().getHours();
    if (h < 6) return '夜深了';
    if (h < 9) return '早上好';
    if (h < 12) return '上午好';
    if (h < 14) return '中午好';
    if (h < 18) return '下午好';
    return '晚上好';
  }
  function todayRecord(qid) {
    const rs = S.records().filter(r => r.qid === qid && r.date === S.todayStr());
    return rs.length ? rs[rs.length - 1] : null;
  }

  // ---- 底部导航 ----
  const NAVS = [
    { key: 'home', ico: '🏠', name: '工作台' },
    { key: 'daily', ico: '📝', name: '刷题' },
    { key: 'ai', ico: '🤖', name: 'AI' },
    { key: 'diary', ico: '📖', name: '日记' },
    { key: 'progress', ico: '📊', name: '我的' },
    { key: 'settings', ico: '⚙️', name: '设置' }
  ];

  function buildNav() {
    const nav = $('#bottom-nav');
    nav.innerHTML = NAVS.map(n =>
      '<button class="nav-item" data-tab="' + n.key + '"><span class="ico">' + n.ico + '</span><span>' + n.name + '</span></button>'
    ).join('');
    nav.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });
  }

  function switchTab(tab) {
    if (!Sync.isLoggedIn()) return;
    state.tab = tab;
    if (tab === 'daily') state.dailyView = 'tasks';
    updateNav();
    updateTopbar();
    render();
  }

  function updateNav() {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.tab === state.tab));
  }

  // ---- 顶部栏 ----
  function updateTopbar() {
    const bar = $('#topbar');
    const titles = { home: 'Yi-朝夕刷题', daily: '每日刷题', ai: 'AI 问答', diary: '学习日记', progress: '我的进度', settings: '设置' };
    if (state.tab === 'daily' && state.dailyView === 'question' && state.currentTask) {
      const q = S.getQuestion(state.currentTask.qids[state.currentQIndex]);
      const idx = state.currentQIndex + 1;
      const total = state.currentTask.qids.length;
      bar.innerHTML = '<button class="back" id="btn-back">‹</button><div class="title">' + esc(state.currentTask.label) + ' (' + idx + '/' + total + ')</div><div class="action">' + esc(state.currentTask.source) + '</div>';
      $('#btn-back').addEventListener('click', backFromQuestion);
      return;
    }
    if (state.tab === 'daily' && state.dailyView === 'wrong') {
      bar.innerHTML = '<button class="back" id="btn-back">‹</button><div class="title">错题本</div><div class="action">连对3次移除</div>';
      $('#btn-back').addEventListener('click', () => { state.dailyView = 'tasks'; updateTopbar(); render(); });
      return;
    }
    if (state.tab === 'daily' && state.dailyView === 'words') {
      const wp = S.todayWordPlan();
      const title = state.wordSession === 'forgot' ? '遗忘复习' : (state.wordSession === 'learned' ? '已背复习' : '📖 背单词');
      bar.innerHTML = '<button class="back" id="btn-back">‹</button><div class="title">' + title + '</div><div class="action">已学' + wp.learned + '/' + wp.total + '</div>';
      $('#btn-back').addEventListener('click', () => {
        if (state.wordSession !== 'mixed') { state.wordSession = 'mixed'; state.wordQueue = []; state.dailyView = 'forget'; }
        else { state.dailyView = 'tasks'; }
        updateTopbar(); render();
      });
      return;
    }
    if (state.tab === 'daily' && state.dailyView === 'forget') {
      bar.innerHTML = '<button class="back" id="btn-back">‹</button><div class="title">📕 单词遗忘录</div><div class="action"></div>';
      $('#btn-back').addEventListener('click', () => { state.dailyView = 'words'; updateTopbar(); render(); });
      return;
    }
    let action = '';
    if (state.tab === 'daily') action = '<button class="action" id="btn-wrong">📕 错题本</button>';
    if (state.tab === 'diary') action = '<button class="action" id="btn-diary-search">🔍 搜索</button>';
    bar.innerHTML = '<div class="title">' + titles[state.tab] + '</div>' + action;
    if (state.tab === 'daily') $('#btn-wrong').addEventListener('click', () => { state.dailyView = 'wrong'; updateTopbar(); render(); });
    if (state.tab === 'diary') $('#btn-diary-search').addEventListener('click', diarySearch);
  }

  // ---- 渲染主入口 ----
  function render() {
    if (!Sync.isLoggedIn()) { renderApp(); return; }
    const page = $('#page');
    switch (state.tab) {
      case 'home': page.innerHTML = renderHome(); break;
      case 'daily': page.innerHTML = state.dailyView === 'question' ? renderQuestion() : (state.dailyView === 'wrong' ? renderWrong() : (state.dailyView === 'words' ? renderWords() : (state.dailyView === 'forget' ? renderForgetLog() : renderDaily()))); break;
      case 'ai': page.innerHTML = renderAI(); break;
      case 'diary': page.innerHTML = renderDiary(); break;
      case 'progress': page.innerHTML = renderProgress(); break;
      case 'settings': page.innerHTML = renderSettings(); break;
    }
    afterRender();
  }

  function afterRender() {
    if (state.tab === 'home') bindHome();
    if (state.tab === 'daily' && state.dailyView === 'tasks') bindDaily();
    if (state.tab === 'daily' && state.dailyView === 'question') bindQuestion();
    if (state.tab === 'daily' && state.dailyView === 'wrong') bindWrong();
    if (state.tab === 'daily' && state.dailyView === 'words') bindWords();
    if (state.tab === 'daily' && state.dailyView === 'forget') bindForgetLog();
    if (state.tab === 'ai') bindAI();
    if (state.tab === 'diary') bindDiary();
    if (state.tab === 'progress') bindProgress();
    if (state.tab === 'settings') bindSettings();
  }

  // ==================== 登录门 ====================
  function renderApp() {
    if (Sync.isLoggedIn()) {
      document.body.classList.remove('logged-out');
      buildNav(); updateTopbar(); updateNav(); render();
    } else {
      document.body.classList.add('logged-out');
      renderLogin();
    }
  }

  function renderLogin() {
    $('#topbar').style.display = 'none';
    $('#bottom-nav').style.display = 'none';
    $('#page').innerHTML = `
      <div class="login-wrap">
        <div class="login-logo">📱</div>
        <h2 class="login-title">Yi-朝夕刷题</h2>
        <p class="login-sub">个人学习工作台</p>
        <div class="login-card">
          <div class="login-field"><label>用户名</label>
            <input id="login-username" type="text" value="jiu" placeholder="用户名" autocomplete="username"></div>
          <div class="login-field"><label>密码</label>
            <input id="login-password" type="password" placeholder="密码" autocomplete="current-password"></div>
          <label class="login-remember"><input type="checkbox" id="login-remember" checked> 记住我</label>
          <button class="btn btn-primary btn-block" id="btn-login">登 录</button>
          <div class="login-hint">测试账号：jiu / jiu000<br>手机与平板登录同一账号即可同步学习进度</div>
        </div>
      </div>`;
    bindLogin();
  }

  function bindLogin() {
    const submit = () => {
      const u = $('#login-username').value.trim();
      const p = $('#login-password').value;
      if (!u || !p) { toast('请输入用户名和密码'); return; }
      const btn = $('#btn-login');
      btn.disabled = true; btn.textContent = '登录中...';
      Sync.login(u, p).then(res => {
        btn.disabled = false; btn.textContent = '登 录';
        if (res.ok) {
          if (res.offline) toast('已离线登录（本地模式）');
          else toast('登录成功，数据已同步 ✅');
          $('#topbar').style.display = '';
          $('#bottom-nav').style.display = '';
          renderApp();
        } else {
          toast(res.error || '登录失败');
        }
      });
    };
    $('#btn-login').addEventListener('click', submit);
    $('#login-password').addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
  }

  // ==================== 工作台主页 ====================
  function syncStatusHTML() {
    const mode = Sync.getMode();
    const last = Sync.lastSync();
    if (mode === 'cloud' || mode === 'supabase') {
      return '<span class="sync-dot ok"></span> 云端已同步' + (last ? ' · ' + new Date(last).toLocaleTimeString() : '');
    }
    return '<span class="sync-dot off"></span> 离线模式（仅本地保存）';
  }

  function renderHome() {
    const st = S.stats();
    const days = S.daysUntil(S.getSettings().targetDate);
    const day = S.dayNumber();
    const daily = S.getDaily();
    const mp = S.moduleProgress();
    const todayDiary = S.getDiary();

    const taskRows = daily.tasks.map(t => {
      const p = S.taskProgress(t);
      const done = p.done >= t.qids.length;
      return '<div class="task-card" data-qids=\'' + JSON.stringify(t.qids).replace(/'/g, '&#39;') + '\' data-label="' + esc(t.label) + '" data-source="' + esc(t.source) + '" data-color="' + t.color + '">' +
        '<div class="task-dot" style="background:' + t.color + '22">' + t.icon + '</div>' +
        '<div class="task-info"><div class="t-name">' + esc(t.label) + '</div><div class="t-sub">' + t.count + '题 · ' + esc(t.scene) + '</div></div>' +
        '<div class="task-status ' + (done ? 'st-done' : (p.done > 0 ? 'st-doing' : 'st-pending')) + '">' + (done ? '已完成 ✅' : (p.done > 0 ? p.done + '/' + t.qids.length : '待开始')) + '</div>' +
        '</div>';
    }).join('');

    const mpRows = mp.map(m =>
      '<div class="progress-item" data-key="' + m.key + '" data-modules=\'' + JSON.stringify(m.modules) + '\' data-name="' + esc(m.name) + '">' +
      '<div class="progress-head"><span class="name">' + m.icon + ' ' + esc(m.name) + '</span><span class="val">' + m.done + '/' + m.total + ' · ' + m.pct + '%</span></div>' +
      '<div class="progress"><i style="width:' + m.pct + '%"></i></div></div>'
    ).join('');

    const phase = META.phases.find(p => {
      const now = S.todayStr();
      return now >= p.start && now <= p.end;
    }) || META.phases[0];

    return `
      <div class="card">
        <div class="greeting">🌅 ${greeting()}，今天也要加油哦！</div>
        <div class="subline">📅 距离目标日期还有 <b>${Math.max(days, 0)}</b> 天 <span class="chip">已坚持 ${st.streak} 天 🔥</span></div>
        <div class="subline" id="sync-line" style="margin-top:6px">${syncStatusHTML()}</div>
      </div>
      <div class="stat-row">
        <div class="stat-card"><div class="num">${st.total}</div><div class="lbl">📝 总刷题</div></div>
        <div class="stat-card"><div class="num green">${st.accuracy}%</div><div class="lbl">✅ 正确率</div></div>
        <div class="stat-card"><div class="num red">${S.wrongBook().length}</div><div class="lbl">📕 错题数</div></div>
      </div>
      <div class="card">
        <h3>📋 今日待办 <span class="more" id="go-daily">进入刷题 →</span></h3>
        ${taskRows}
      </div>
      <div class="card" id="phase-card">
        <h3>🎯 当前阶段 <span class="more" id="go-progress">完整计划 →</span></h3>
        <div>📍 ${esc(phase.name)}：${esc(phase.title)}</div>
        <div class="subline">${esc(phase.time)} ｜ 进行中 🟢</div>
        <div class="subline">完成标志：${esc(phase.goal)}</div>
      </div>
      <div class="card">
        <h3>📊 各模块进度 <span class="more" id="go-progress2">全部 →</span></h3>
        ${mpRows}
      </div>
      <div class="card" id="diary-quick">
        <h3>📖 今日学习日记</h3>
        <div class="subline" style="cursor:pointer">✏️ ${todayDiary && todayDiary.learned ? esc(todayDiary.learned.slice(0, 30)) + '…' : '今天学了什么？点击记录...'}</div>
      </div>
    `;
  }

  function bindHome() {
    $('#go-daily').addEventListener('click', () => switchTab('daily'));
    $('#go-progress').addEventListener('click', () => switchTab('progress'));
    $('#go-progress2').addEventListener('click', () => switchTab('progress'));
    $('#diary-quick').addEventListener('click', () => switchTab('diary'));
    $('#phase-card').addEventListener('click', () => switchTab('progress'));
    $('#sync-line').addEventListener('click', () => { Sync.syncNow().then(r => { toast(r.ok ? '已同步 ✅' : '同步失败，请检查网络'); render(); }); });
    document.querySelectorAll('.progress-item').forEach(el => {
      el.addEventListener('click', () => startModulePractice(el.dataset.key, el.dataset.name, JSON.parse(el.dataset.modules)));
    });
    document.querySelectorAll('.task-card').forEach(el => {
      el.addEventListener('click', () => {
        startPractice(el.dataset.label, JSON.parse(el.dataset.qids.replace(/&#39;/g, "'")), el.dataset.source, el.dataset.color, '📝');
      });
    });
  }

  function startModulePractice(key, name, modules) {
    const qs = S.allQuestions().filter(q => modules.indexOf(q.module) >= 0);
    if (!qs.length) { toast('该模块暂无题目，可用「AI 出题」生成'); return; }
    startPractice(name + ' · 全部', qs.map(q => q.id), '自由练习', '#1A365D', '📝');
  }

  function startPractice(label, qids, source, color, icon) {
    state.tab = 'daily';
    updateNav();
    state.dailyView = 'question';
    state.currentTask = { label: label, qids: qids, source: source || '', color: color || '#1A365D', icon: icon || '📝' };
    state.currentQIndex = 0;
    updateTopbar(); render();
  }

  function startWeeklyTest() {
    const qids = S.weeklyQuestionIds(7);
    if (!qids.length) { toast('本周还没有做过题，先刷几道再来检测吧'); return; }
    startPractice('每周检测 · 本周 ' + qids.length + ' 题', qids, '每周检测', '#1A365D', '📝');
  }

  function backFromQuestion() {
    state.dailyView = 'tasks';
    state.currentTask = null;
    updateTopbar(); render();
  }

  // ==================== 每日刷题 ====================
  function renderDaily() {
    const daily = S.getDaily();
    const totalTarget = daily.tasks.reduce((a, t) => a + t.qids.length, 0);
    const tasks = daily.tasks.map(t => {
      const p = S.taskProgress(t);
      const acc = p.done ? Math.round(p.correct / p.done * 100) : 0;
      const done = p.done >= t.qids.length;
      return '<div class="task-card" data-qids=\'' + JSON.stringify(t.qids).replace(/'/g, '&#39;') + '\' data-label="' + esc(t.label) + '" data-source="' + esc(t.source) + '" data-color="' + t.color + '">' +
        '<div class="task-dot" style="background:' + t.color + '22">' + t.icon + '</div>' +
        '<div class="task-info"><div class="t-name">' + esc(t.label) + '</div>' +
        '<div class="t-sub">' + t.count + '道 · ' + esc(t.source) + ' · ' + esc(t.scene) + '</div>' +
        '<div class="t-sub">目标' + t.qids.length + '题｜已完成' + p.done + '题｜正确率' + acc + '%</div></div>' +
        '<div class="task-status ' + (done ? 'st-done' : (p.done > 0 ? 'st-doing' : 'st-pending')) + '">' + (done ? '已完成 ✅' : (p.done > 0 ? '进行中' : '待开始')) + '</div>' +
        '</div>';
    }).join('');

    const moduleChips = META.progressModules.map(m => {
      const cnt = S.allQuestions().filter(q => m.modules.indexOf(q.module) >= 0).length;
      return '<button class="module-chip" data-key="' + m.key + '" data-modules=\'' + JSON.stringify(m.modules) + '\' data-name="' + esc(m.name) + '">' + m.icon + ' ' + esc(m.name) + '<span>' + cnt + '</span></button>';
    }).join('');
    const wordCount = S.words().length;
    const wordPlan = S.todayWordPlan();

    return `
      <div class="card">
        <div style="font-size:17px;font-weight:700">📅 第${S.weekNumber()}周 · Day ${S.dayNumber()}</div>
        <div class="subline">今日目标：完成 <b>${totalTarget}</b> 道题（去程行测 → 午休SQL → 晚间Linux/编程）</div>
      </div>
      <div class="card">
        <h3>🤖 AI 出题</h3>
        <div class="plan-make">
          <input id="make-topic" type="text" placeholder="输入主题，如：TCP三次握手 / 指针">
          <button class="btn btn-accent" id="btn-make">出题</button>
        </div>
        <div class="subline">按主题让 AI 生成新题，扩充你的题库</div>
      </div>
      <div class="card">
        <h3>📚 自由练习</h3>
        <div class="subline">按模块刷题（含导入生成的题），点一下开始</div>
        <div class="module-grid">${moduleChips}</div>
      </div>
      <div class="card" id="weekly-test">
        <h3>📝 每周检测 <span class="more">开始 →</span></h3>
        <div class="subline">检测本周做过的所有题目（各类型混合）</div>
      </div>
      <div class="card" id="go-words">
        <h3>📖 背单词 <span class="more">进入 →</span></h3>
        <div class="subline">${wordCount ? '词库 ' + wordCount + ' 词 · 已学 ' + wordPlan.learned + ' · 今日复习 ' + wordPlan.reviewWords.length : '导入四级词库后在这里背单词'}</div>
      </div>
      <div class="section-title">今日任务</div>
      ${tasks}
      <div class="empty" style="padding:8px">完成全部任务后自动打卡 ✅</div>
    `;
  }

  function bindDaily() {
    document.querySelectorAll('.task-card').forEach(el => {
      el.addEventListener('click', () => {
        startPractice(el.dataset.label, JSON.parse(el.dataset.qids.replace(/&#39;/g, "'")), el.dataset.source, el.dataset.color, '📝');
      });
    });
    const makeBtn = $('#btn-make');
    if (makeBtn) makeBtn.addEventListener('click', () => {
      const topic = $('#make-topic').value.trim();
      if (!topic) { toast('请输入主题'); return; }
      makeQuestions(topic);
    });
    document.querySelectorAll('.module-chip').forEach(b => b.addEventListener('click', () => startModulePractice(b.dataset.key, b.dataset.name, JSON.parse(b.dataset.modules))));
    const goWords = $('#go-words');
    if (goWords) goWords.addEventListener('click', () => enterWordsView());
    const wt = $('#weekly-test');
    if (wt) wt.addEventListener('click', () => startWeeklyTest());
  }

  function makeQuestions(topic) {
    toast('AI 出题中，请稍候...');
    AI.makeQuestions(topic).then(list => {
      if (!list || !list.length) { toast('未生成题目，请重试或换主题'); return; }
      const questions = list.map(q => {
        if (q.type === 'coding') {
          return { type: 'coding', module: q.language === 'C' ? 'c_language' : 'python', question: q.question, answer: q.answer, analysis: q.analysis, tags: [topic] };
        }
        return { type: 'choice', module: guessModule(topic), question: q.question, options: q.options, answer: q.answer, analysis: q.analysis, tags: [topic] };
      });
      renderQuestionReview(questions, 'AI 出题：' + topic);
    }).catch(e => toast('出题失败：' + e.message));
  }

  function guessModule(s) {
    const t = String(s || '').trim();
    const lo = t.toLowerCase();
    if (/sql|数据库|查询|索引|事务|表|join/.test(lo)) return 'sql';
    if (/linux|shell|命令|进程|文件|权限|unix/.test(lo)) return 'linux';
    if (/c语言|\bc\b|指针|内存|结构体|函数/.test(lo)) return 'c_language';
    if (/python|列表|字典|爬虫|flask|装饰器/.test(lo)) return 'python';
    if (/网络|tcp|ip|http|协议|osi|dns|udp/.test(lo)) return 'net';
    if (/行测|言语|逻辑|推理|图形|数列/.test(lo)) return 'xingce_logic';
    if (/联通|运营商|5g|宽带|云|物联网|中国联通/.test(lo)) return 'unicom';
    const ascii = (t.match(/[a-zA-Z]/g) || []).length;
    if (/英语|四级|六级|词汇|单词|语法|阅读|翻译|作文|english|vocab|grammar/.test(lo) || (t.length && ascii / t.length > 0.5)) return 'english';
    return 'other';
  }

  function renderQuestionReview(list, title) {
    state.reviewList = list;
    state.reviewTitle = title;
    const rows = list.map((q, i) => `
      <div class="task-card review-item">
        <label class="review-check"><input type="checkbox" checked data-i="${i}"></label>
        <div class="task-info">
          <div class="t-name">${esc(q.question.slice(0, 48))}${q.question.length > 48 ? '…' : ''}</div>
          <div class="t-sub">${q.type === 'coding' ? '💻 编程题' : '📝 选择题'} · 答案 ${esc(q.answer || '')}</div>
        </div>
      </div>`).join('');
    $('#page').innerHTML = `
      <div class="section-title">${esc(title)} · 勾选要加入题库的题目</div>
      ${rows || '<div class="empty">没有生成题目</div>'}
      <button class="btn btn-accent btn-block" id="btn-import-review">✅ 导入所选题目</button>
      <button class="btn btn-ghost btn-block" id="btn-cancel-review">取消</button>`;
    $('#btn-import-review').addEventListener('click', importReviewed);
    $('#btn-cancel-review').addEventListener('click', () => switchTab('daily'));
  }

  function importReviewed() {
    const selected = [];
    document.querySelectorAll('.review-check input').forEach(cb => { if (cb.checked) selected.push(Number(cb.dataset.i)); });
    if (!selected.length) { toast('请先勾选题目'); return; }
    const list = selected.map(i => state.reviewList[i]);
    S.addGeneratedQuestions(list, null);
    Sync.markDirty();
    toast('已导入 ' + list.length + ' 道题 ✅');
    switchTab('daily');
  }

  // ==================== 刷题页 ====================
  function renderQuestion() {
    const task = state.currentTask;
    const idx = state.currentQIndex;
    const q = S.getQuestion(task.qids[idx]);
    if (!q) return '<div class="empty">暂无题目</div>';

    const rec = todayRecord(q.id);
    const isCoding = q.type === 'coding';

    const pDone = task.qids.filter(id => todayRecord(id)).length;
    const pTotal = task.qids.length;
    const pPct = Math.round(pDone / pTotal * 100);
    const correctCnt = task.qids.filter(id => { const r = todayRecord(id); return r && r.isCorrect; }).length;

    const cols = isCoding ? renderCodingQuestion(q, rec) : renderChoiceQuestion(q, rec);

    return `
      <div class="question-page">
        <div class="q-meta">
          <span class="q-tag">📝 第${idx + 1}题</span>
          <span class="q-tag">难度 ${'★'.repeat(q.difficulty || 1)}</span>
          ${(q.tags || []).map(t => '<span class="q-tag">' + esc(t) + '</span>').join('')}
          ${q.source === 'generated' ? '<span class="q-tag tag-ai">AI生成</span>' : ''}
        </div>
        <div class="q-cols">
          <div class="q-col">${cols.left}</div>
          <div class="q-col">${cols.right}</div>
        </div>
        <div class="q-tools">
          <button class="btn btn-ghost btn-sm" data-learn="${q.id}">📖 先学习知识点</button>
          <button class="btn btn-ghost btn-sm" data-ask="${q.id}">🤖 问 AI</button>
        </div>
        <div class="q-nav">
          <button class="btn btn-ghost" id="btn-prev" ${idx === 0 ? 'disabled' : ''}>‹ 上一题</button>
          <button class="btn btn-ghost" id="btn-next" ${idx === task.qids.length - 1 ? 'disabled' : ''}>下一题 ›</button>
        </div>
        <div class="q-progress">
          <div class="progress-head"><span>进度</span><span>${pDone}/${pTotal}</span></div>
          <div class="progress"><i class="orange" style="width:${pPct}%"></i></div>
        </div>
        <div class="q-stats">已答 ${pDone} 题 ｜ 正确 ${correctCnt} 题 ｜ 正确率 ${pDone ? Math.round(correctCnt / pDone * 100) : 0}%</div>
      </div>
    `;
  }

  function renderChoiceQuestion(q, rec) {
    const answered = !!rec;
    const selected = rec ? rec.answer : null;
    const optionsHtml = q.options.map(o => {
      const letter = o.charAt(0);
      let cls = 'q-option';
      if (answered) {
        if (letter === q.answer) cls += ' q-option-correct';
        else if (letter === selected) cls += ' q-option-wrong';
      }
      return '<button class="' + cls + '" data-letter="' + letter + '" ' + (answered ? 'disabled' : '') + '>' + esc(o) + '</button>';
    }).join('');

    const left = '<div class="q-text">' + nl2br(q.question) + '</div>' +
      '<div class="q-options">' + optionsHtml + '</div>' +
      (answered ? '' : '<div class="q-hint">点击选项 → 即时判分并自动记录</div>');

    let right;
    if (answered) {
      right = rec.isCorrect
        ? feedbackCard(true, '回答正确！', q.analysis)
        : feedbackCard(false, '回答错误，正确答案是 ' + q.answer, q.analysis);
    } else {
      right = '<div class="q-side-hint">🤔 先自己作答，答完后这里自动显示解析</div>';
    }
    return { left: left, right: right };
  }

  function renderCodingQuestion(q, rec) {
    const lang = q.module === 'python' ? 'Python' : 'C';
    let result = '';
    if (rec) {
      result = rec.isCorrect
        ? feedbackCard(true, 'AI 评判：正确！', rec.explanation || '')
        : feedbackCard(false, 'AI 评判：有误', rec.explanation || '');
    }
    const left = '<div class="q-text">' + nl2br(q.question) + '</div>' +
      '<button class="btn btn-ghost btn-block btn-sm" id="btn-ref-toggle">查看参考答案 🔒</button>' +
      '<div class="answer-box" id="ref-box" style="display:none"><pre class="code-ref">' + esc(q.answer) + '</pre>' +
      '<div class="answer-analysis">📖 思路：' + esc(q.analysis) + '</div></div>';

    const right = '<div class="code-editor">' +
      '<div class="code-head"><span>💻 代码编辑器</span><span class="code-lang">' + lang + '</span></div>' +
      '<textarea id="code-input" class="code-input" rows="9" placeholder="在此编写 ' + lang + ' 代码..." spellcheck="false">' + (rec && rec.code ? esc(rec.code) : '') + '</textarea>' +
      '<button class="btn btn-primary btn-block" id="btn-submit-code">🚀 提交代码，AI 评判</button>' +
      '<div id="code-result">' + result + '</div></div>';
    return { left: left, right: right };
  }

  function feedbackCard(ok, title, analysis) {
    return `<div class="q-feedback ${ok ? 'q-feedback-ok' : 'q-feedback-err'}">
      <div class="qf-title">${ok ? '✅' : '❌'} ${title}</div>
      <div class="qf-analysis">📖 解析：${esc(analysis || '')}</div>
    </div>`;
  }

  function bindQuestion() {
    const q = S.getQuestion(state.currentTask.qids[state.currentQIndex]);
    if (!q) return;

    // 选择题：点击选项即时反馈
    document.querySelectorAll('.q-option').forEach(btn => {
      btn.addEventListener('click', () => {
        if (todayRecord(q.id)) return;
        const letter = btn.dataset.letter;
        const isCorrect = (letter === q.answer);
        S.addRecord(q.id, isCorrect, null, { type: 'choice', answer: letter });
        Sync.markDirty();
        toast(isCorrect ? '✅ 回答正确！' : '❌ 回答错误');
        render();
      });
    });

    // 代码题：提交评判
    const submitBtn = $('#btn-submit-code');
    if (submitBtn) submitBtn.addEventListener('click', () => {
      const code = $('#code-input').value.trim();
      if (!code) { toast('请先编写代码'); return; }
      if (todayRecord(q.id)) { toast('本题今日已作答'); return; }
      submitCode(q, code);
    });
    const refToggle = $('#btn-ref-toggle');
    if (refToggle) refToggle.addEventListener('click', () => {
      const box = $('#ref-box');
      box.style.display = box.style.display === 'none' ? 'block' : 'none';
    });

    // 先学 / 问 AI
    document.querySelectorAll('[data-learn]').forEach(b => b.addEventListener('click', () => openAIPopup(b.dataset.learn, 'learn')));
    document.querySelectorAll('[data-ask]').forEach(b => b.addEventListener('click', () => openAIPopup(b.dataset.ask, 'ask')));

    $('#btn-prev').addEventListener('click', () => { if (state.currentQIndex > 0) { state.currentQIndex--; updateTopbar(); render(); } });
    $('#btn-next').addEventListener('click', () => { if (state.currentQIndex < state.currentTask.qids.length - 1) { state.currentQIndex++; updateTopbar(); render(); } });
  }

  function submitCode(q, code) {
    const btn = $('#btn-submit-code');
    btn.disabled = true; btn.textContent = '⏳ AI 评判中...';
    AI.judge(q.question, q.answer, code).then(res => {
      const isCorrect = res.correct === true;
      S.addRecord(q.id, isCorrect, null, { type: 'coding', code: code, explanation: res.explanation || '' });
      Sync.markDirty();
      toast(isCorrect ? 'AI 判定：正确 ✅' : 'AI 判定：有误 ❌');
      render();
    }).catch(e => {
      toast('AI 评判失败：' + e.message);
      btn.disabled = false; btn.textContent = '🚀 提交代码，AI 评判';
    });
  }

  // ---- 错题本 ----
  function renderWrong() {
    const wb = S.wrongBook();
    if (!wb.length) return '<div class="card"><div class="empty">🎉 暂无错题，继续保持！</div></div>';
    return `
      <div class="section-title">共 ${wb.length} 道错题</div>
      ${wb.map(w => '<div class="task-card" data-qid="' + w.id + '" data-label="错题重练" data-source="错题本">' +
        '<div class="task-dot" style="background:#FC818122">🔴</div>' +
        '<div class="task-info"><div class="t-name">' + esc(w.question.slice(0, 40)) + (w.question.length > 40 ? '…' : '') + '</div>' +
        '<div class="t-sub">错' + w.wrongCount + '次 · ' + (w.correctStreak || 0) + '连对</div></div>' +
        '<div class="task-status st-pending">重练</div></div>').join('')}
      <button class="btn btn-accent btn-block" id="btn-wrong-all" data-qids='${JSON.stringify(wb.map(w => w.id))}'>开始错题重练（${wb.length} 题）</button>
    `;
  }

  function bindWrong() {
    const btn = $('#btn-wrong-all');
    if (btn) btn.addEventListener('click', () => startPractice('错题重练', JSON.parse(btn.dataset.qids.replace(/&#39;/g, "'")), '错题本', '#FC8181', '🔴'));
    document.querySelectorAll('[data-qid]').forEach(el => {
      el.addEventListener('click', () => startPractice('错题重练', [el.dataset.qid], '错题本', '#FC8181', '🔴'));
    });
  }

  // ==================== AI 弹窗（题目内联 + 先学后练） ====================
  function buildQuestionContext(q) {
    let s = '【题目】' + q.question;
    if (q.options) s += '\n【选项】' + q.options.join(' ');
    s += '\n【正确答案】' + q.answer;
    return s;
  }

  function openAIPopup(qid, mode) {
    const q = S.getQuestion(qid);
    if (!q) return;
    const hist = S.getAIHistory(qid) || [];
    state.aiPopup = { key: qid, context: buildQuestionContext(q), subtitle: q.question, messages: hist.slice(), busy: false };
    renderAIPopup();
    if (mode === 'learn') {
      seedLearn(q);
    }
  }

  function buildWordContext(w) {
    return '【单词/短语】' + w.word + (w.pos ? '（' + w.pos + '）' : '') + '\n【释义】' + w.meaning + '\n\n请针对这个单词/短语，解答我下面关于它的问题（用法、例句、近义词、辨析、固定搭配等）。';
  }

  function openWordPopup(w) {
    const key = 'word:' + w.word;
    const hist = S.getAIHistory(key) || [];
    state.aiPopup = { key: key, context: buildWordContext(w), subtitle: w.word + (w.pos ? ' ' + w.pos : '') + ' — ' + w.meaning, messages: hist.slice(), busy: false };
    renderAIPopup();
  }

  function seedLearn(q) {
    const topic = (q.tags && q.tags.length ? q.tags.join('、') : (META.modules[q.module] ? META.modules[q.module].name : q.module));
    state.aiPopup.busy = true;
    setPopupTyping(true);
    appendPopupMsg('user', '📖 我想先学习这道题的知识点：' + topic);
    AI.knowledge(topic, q.question).then(content => {
      appendPopupMsg('assistant', content);
    }).catch(e => {
      appendPopupMsg('assistant', '⚠️ ' + e.message);
    }).finally(() => {
      state.aiPopup.busy = false;
      setPopupTyping(false);
    });
  }

  function renderAIPopup() {
    const ap = state.aiPopup;
    if (!ap) { closeAIPopup(); return; }
    const el = $('#ai-popup');
    const bubbles = ap.messages.map(m => '<div class="bubble ' + (m.role === 'user' ? 'user' : 'ai') + '">' + nl2br(m.content) + '</div>').join('');
    el.innerHTML = `
      <div class="ai-popup">
        <div class="ap-head"><div class="ap-title">🤖 问 AI</div><button class="ap-close" id="ap-close">✕</button></div>
        <div class="ap-context">📌 ${esc(ap.subtitle.slice(0, 48))}${ap.subtitle.length > 48 ? '…' : ''}</div>
        <div class="ap-scroll" id="ap-scroll">${bubbles || '<div class="empty">问我关于它的任何问题～</div>'}</div>
        <div class="ap-input"><input id="ap-input" type="text" placeholder="输入你的问题..."><button class="send" id="ap-send">➤</button></div>
      </div>`;
    el.classList.add('show');
    $('#ap-close').addEventListener('click', closeAIPopup);
    const input = $('#ap-input');
    const send = () => { const v = input.value.trim(); if (v) { input.value = ''; sendPopup(v); } };
    $('#ap-send').addEventListener('click', send);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') send(); });
    scrollPopup();
  }

  function appendPopupMsg(role, content) {
    const ap = state.aiPopup;
    if (!ap) return;
    ap.messages.push({ role: role, content: content, timestamp: new Date().toISOString() });
    S.saveAIHistory(ap.key, ap.messages);
    const scroll = $('#ap-scroll');
    if (scroll) {
      const bubble = document.createElement('div');
      bubble.className = 'bubble ' + (role === 'user' ? 'user' : 'ai');
      bubble.innerHTML = nl2br(content);
      scroll.appendChild(bubble);
      scrollPopup();
    }
  }

  function setPopupTyping(on) {
    let t = $('#ap-typing');
    if (on) {
      if (!t) {
        t = document.createElement('div');
        t.id = 'ap-typing'; t.className = 'typing';
        t.innerHTML = '<i></i><i></i><i></i>';
        const scroll = $('#ap-scroll');
        if (scroll) scroll.appendChild(t);
      }
      scrollPopup();
    } else if (t) { t.remove(); }
  }

  function sendPopup(text) {
    const ap = state.aiPopup;
    if (!ap || !text || ap.busy) return;
    appendPopupMsg('user', text);
    ap.busy = true;
    setPopupTyping(true);
    const msgs = [{ role: 'system', content: META.systemPrompt }, { role: 'user', content: ap.context }];
    ap.messages.forEach(m => msgs.push({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }));
    AI.chat(msgs).then(content => {
      appendPopupMsg('assistant', content);
    }).catch(e => {
      appendPopupMsg('assistant', '⚠️ ' + e.message);
    }).finally(() => {
      ap.busy = false;
      setPopupTyping(false);
    });
  }

  function scrollPopup() {
    const el = $('#ap-scroll');
    if (el) el.scrollTop = el.scrollHeight;
  }

  function closeAIPopup() {
    state.aiPopup = null;
    const el = $('#ai-popup');
    if (el) el.classList.remove('show');
  }

  // ==================== 全局 AI 问答 ====================
  function renderAI() {
    const bubbles = state.chat.map(c =>
      '<div class="bubble ' + (c.role === 'user' ? 'user' : 'ai') + '">' + nl2br(c.content) + '</div>'
    ).join('');
    return `
      <div class="chat-wrap">
        <div class="quick-asks">${META.quickAsks.map(q => '<button data-q="' + esc(q) + '">' + esc(q) + '</button>').join('')}</div>
        <div class="chat-scroll" id="chat-scroll">
          ${bubbles || '<div class="empty">🤖 学习中遇到问题，随时问我～<br>（C语言/Python/SQL/Linux/网络/行测）</div>'}
          <div class="typing hidden" id="typing"><i></i><i></i><i></i></div>
        </div>
        <div class="chat-input">
          <input id="chat-input" type="text" placeholder="输入你的学习问题..." />
          <button class="send" id="chat-send">➤</button>
        </div>
      </div>
    `;
  }

  function bindAI() {
    document.querySelectorAll('.quick-asks button').forEach(b => b.addEventListener('click', () => askAI(b.dataset.q)));
    const input = $('#chat-input');
    const send = () => { const v = input.value.trim(); if (v) { input.value = ''; askAI(v); } };
    $('#chat-send').addEventListener('click', send);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') send(); });
    scrollChat();
  }

  function scrollChat() {
    const el = $('#chat-scroll');
    if (el) el.scrollTop = el.scrollHeight;
  }

  function pushChat(role, content) {
    state.chat.push({ role: role, content: content });
    if (state.chat.length > 10) state.chat = state.chat.slice(state.chat.length - 10);
  }

  function askAI(text) {
    if (state.aiBusy) return;
    pushChat('user', text);
    render();
    state.aiBusy = true;
    $('#typing').classList.remove('hidden');
    scrollChat();
    const messages = [{ role: 'system', content: META.systemPrompt }]
      .concat(state.chat.slice(-10).map(c => ({ role: c.role === 'user' ? 'user' : 'assistant', content: c.content })));
    AI.chat(messages).then(content => {
      pushChat('ai', content);
    }).catch(e => {
      pushChat('ai', '⚠️ ' + e.message);
    }).finally(() => {
      state.aiBusy = false;
      $('#typing').classList.add('hidden');
      render();
      scrollChat();
      $('#chat-input').focus();
    });
  }

  // ==================== 学习日记 ====================
  function renderDiary() {
    const today = S.todayStr();
    const d = S.getDiary(today) || { date: today, day: S.dayNumber(), mood: '', learned: '', problems: '', tomorrow_plan: '', study_time: S.todayStudyTime(), questions_count: 0, accuracy: 0 };
    const st = S.stats();
    const todayCnt = S.records().filter(r => r.date === today).length;
    const todayCorrect = S.records().filter(r => r.date === today && r.isCorrect).length;

    const moodHtml = META.moods.map(m =>
      '<button class="mood-tag" data-mood="' + m.key + '">' + m.icon + ' ' + m.key + '</button>'
    ).join('');

    const history = S.allDiaries().slice(0, 30).map(dd =>
      '<div class="diary-entry"><div class="d-head"><span>📅 ' + dd.date + '</span><span>Day ' + dd.day + '</span><span class="d-mood">' + (META.moods.find(m => m.key === dd.mood) ? META.moods.find(m => m.key === dd.mood).icon : '') + '</span></div>' +
      '<div class="d-body"><div class="d-line">📌 ' + esc(dd.learned || '（无）') + '</div>' +
      (dd.problems ? '<div class="d-line">❓ ' + esc(dd.problems) + '</div>' : '') +
      (dd.tomorrow_plan ? '<div class="d-line">🎯 明日：' + esc(dd.tomorrow_plan) + '</div>' : '') +
      '<div class="d-line muted">刷题' + dd.questions_count + '题 · 正确率' + dd.accuracy + '% · 时长' + dd.study_time + 'h</div></div></div>'
    ).join('');

    return `
      <div class="card">
        <h3>✏️ 今天的学习记录</h3>
        <div class="diary-field"><label>今天学了什么？有什么收获？</label>
          <textarea id="d-learned" rows="2" placeholder="如：搞懂了链表插入、掌握了ls/grep命令...">${esc(d.learned)}</textarea></div>
        <div class="diary-field"><label>遇到什么不懂的问题？</label>
          <textarea id="d-problems" rows="2" placeholder="如：TCP三次握手还没完全理解">${esc(d.problems)}</textarea></div>
        <div class="diary-field"><label>明天的学习重点是什么？</label>
          <textarea id="d-tomorrow" rows="2" placeholder="如：继续SQL + Linux命令">${esc(d.tomorrow_plan)}</textarea></div>
        <div class="diary-field"><label>📊 今日学习数据</label>
          <div class="subline">刷题 ${todayCnt} 题 ｜ 正确率 ${todayCnt ? Math.round(todayCorrect / todayCnt * 100) : 0}% ｜ 时长 ${S.todayStudyTime()}h</div></div>
        <div class="diary-field"><label>🏷️ 今日心情标签</label>
          <div class="mood-tags">${moodHtml}</div></div>
        <button class="btn btn-primary btn-block" id="btn-save-diary">💾 保存今日记录</button>
      </div>
      <div class="section-title">📜 历史记录</div>
      ${history || '<div class="empty">还没有历史日记，从今天开始记录吧～</div>'}
      <div class="empty">总记录 ${S.allDiaries().length} 天 ｜ 最长连续 ${st.streak} 天 🔥</div>
    `;
  }

  function bindDiary() {
    document.querySelectorAll('.mood-tag').forEach(b => b.addEventListener('click', () => {
      document.querySelectorAll('.mood-tag').forEach(x => x.classList.remove('selected'));
      b.classList.add('selected');
    }));
    $('#btn-save-diary').addEventListener('click', saveDiary);
  }

  function saveDiary() {
    const today = S.todayStr();
    const moodEl = document.querySelector('.mood-tag.selected');
    const todayCnt = S.records().filter(r => r.date === today).length;
    const todayCorrect = S.records().filter(r => r.date === today && r.isCorrect).length;
    const d = {
      date: today,
      day: S.dayNumber(),
      mood: moodEl ? moodEl.dataset.mood : '',
      learned: $('#d-learned').value.trim(),
      problems: $('#d-problems').value.trim(),
      tomorrow_plan: $('#d-tomorrow').value.trim(),
      study_time: S.todayStudyTime(),
      questions_count: todayCnt,
      accuracy: todayCnt ? Math.round(todayCorrect / todayCnt * 100) : 0
    };
    S.saveDiary(d);
    Sync.markDirty();
    toast('已保存 ✅');
    render();
  }

  function diarySearch() {
    const kw = prompt('输入关键词搜索历史日记：', '');
    if (kw === null) return;
    const list = S.allDiaries().filter(d => (d.learned + d.problems + d.tomorrow_plan).indexOf(kw) >= 0);
    const html = list.map(d => '<div class="diary-entry"><div class="d-head"><span>📅 ' + d.date + '</span><span>Day ' + d.day + '</span></div><div class="d-body"><div class="d-line">' + esc(d.learned) + '</div><div class="d-line">' + esc(d.problems || '') + '</div></div></div>').join('');
    const page = $('#page');
    page.innerHTML = '<div class="card"><h3>🔍 搜索结果（' + list.length + '）</h3></div>' + (html || '<div class="empty">没有匹配的记录</div>');
  }

  // ==================== 我的进度 + 学习计划 ====================
  function renderProgress() {
    const st = S.stats();
    const days = S.daysUntil(S.getSettings().targetDate);
    const mp = S.moduleProgress();
    const totalQ = S.allQuestions().length;
    const overallPct = Math.round(st.uniqueAnswered / totalQ * 100);
    const month = S.todayStr().slice(0, 7);
    const monthDays = Object.keys(S.records().reduce((a, r) => { if (r.date.indexOf(month) === 0) a[r.date] = 1; return a; }, {})).length;

    const mpRows = mp.map(m =>
      '<div class="progress-item" data-key="' + m.key + '" data-modules=\'' + JSON.stringify(m.modules) + '\' data-name="' + esc(m.name) + '">' +
      '<div class="progress-head"><span class="name">' + m.icon + ' ' + esc(m.name) + '</span><span class="val">' + m.done + '/' + m.total + ' · ' + m.pct + '%</span></div>' +
      '<div class="progress"><i style="width:' + m.pct + '%"></i></div></div>').join('');

    const phases = META.phases.map(p => {
      const now = S.todayStr();
      const isDone = now > p.end;
      const isCurrent = now >= p.start && now <= p.end;
      const daysTo = S.daysUntil(p.start);
      return '<div class="phase-item ' + (isCurrent ? 'current' : '') + '">' +
        '<div class="p-title">' + (isDone ? '✅' : (isCurrent ? '📍' : '⏳')) + ' ' + esc(p.name) + ': ' + esc(p.time) + ' ' + esc(p.title) + '</div>' +
        '<div class="p-sub">' + (isDone ? '已完成' : (isCurrent ? '进行中' : '距开始还有 ' + Math.max(daysTo, 0) + ' 天')) + '</div>' +
        '<div class="p-sub">完成标志：' + esc(p.goal) + '</div></div>';
    }).join('');

    const plans = S.plans();
    const planRows = plans.length ? plans.map(p =>
      '<div class="phase-item"><div class="p-title">📌 ' + esc(p.name || '学习计划') + '</div><div class="p-sub">' + esc((p.content || '').slice(0, 60)) + '…</div></div>'
    ).join('') : '<div class="empty" style="padding:8px">还没有导入计划</div>';

    return `
      <div class="card">
        <div style="text-align:center">
          <div class="subline">📅 距目标日期还有 <b>${Math.max(days, 0)}</b> 天</div>
          <div style="font-size:26px;font-weight:800;color:var(--primary);margin:6px 0">总目标完成度 ${overallPct}%</div>
          <div class="progress" style="height:12px"><i style="width:${overallPct}%"></i></div>
          <div class="subline" style="margin-top:8px">已连续学习 ${st.streak} 天 🔥 ｜ 本月学习 ${monthDays}/30 天 ｜ 题库 ${totalQ} 题</div>
        </div>
      </div>
      <div class="card">
        <h3>📚 学习统计</h3>
        <div class="stat-row">
          <div class="stat-card"><div class="num">${st.total}</div><div class="lbl">总刷题数</div></div>
          <div class="stat-card"><div class="num green">${st.accuracy}%</div><div class="lbl">正确率</div></div>
          <div class="stat-card"><div class="num red">${S.wrongBook().length}</div><div class="lbl">错题数</div></div>
          <div class="stat-card"><div class="num">${(st.total * 2 / 60).toFixed(1)}h</div><div class="lbl">总学习时</div></div>
        </div>
      </div>
      <div class="card">
        <h3>📋 模块进度</h3>
        ${mpRows}
      </div>
      <div class="card">
        <h3>🎯 10周冲刺计划</h3>
        ${phases}
      </div>
      <div class="card">
        <h3>📥 导入资料出题 <span class="more" id="btn-import-plan">导入文件</span></h3>
        <div class="subline">导入 .txt/.md/.docx（学习计划、四级词汇、真题等），AI 自动出题；PDF 请复制文字后用「粘贴文本」</div>
        <input type="file" id="plan-file" accept=".txt,.md,.markdown,.docx" style="display:none">
        <button class="btn btn-ghost btn-block btn-sm" id="btn-paste-text" style="margin-top:8px">📋 粘贴文本（如 PDF 复制的内容）</button>
        ${planRows}
      </div>
    `;
  }

  function bindProgress() {
    document.querySelectorAll('.progress-item').forEach(el => {
      el.addEventListener('click', () => startModulePractice(el.dataset.key, el.dataset.name, JSON.parse(el.dataset.modules)));
    });
    const impBtn = $('#btn-import-plan');
    if (impBtn) impBtn.addEventListener('click', () => $('#plan-file').click());
    const pasteBtn = $('#btn-paste-text');
    if (pasteBtn) pasteBtn.addEventListener('click', () => renderPlanImport(''));
    const file = $('#plan-file');
    if (file) file.addEventListener('change', () => {
      const f = file.files && file.files[0];
      if (!f) return;
      const name = (f.name || '').toLowerCase();
      if (name.endsWith('.docx')) {
        extractDocxText(f).then(txt => renderPlanImport(txt)).catch(e => toast('docx 解析失败：' + e.message + '（可改用「粘贴文本」）'));
      } else {
        const reader = new FileReader();
        reader.onload = () => renderPlanImport(String(reader.result || ''));
        reader.readAsText(f);
      }
      file.value = '';
    });
  }

  function renderPlanImport(content) {
    state.reviewTitle = '导入生成题目';
    $('#page').innerHTML = `
      <div class="section-title">📥 导入资料 · 生成题目</div>
      <div class="card">
        <div class="diary-field"><label>资料内容（可编辑）</label>
          <textarea id="plan-content" rows="9">${esc(content)}</textarea></div>
        <button class="btn btn-accent btn-block" id="btn-gen-plan">🤖 生成题目（少量，约6-10题，快）</button>
        <button class="btn btn-outline btn-block" id="btn-gen-batch">🤖 批量生成（整份，更多题，较慢）</button>
        <button class="btn btn-ghost btn-block" id="btn-extract-words">📖 提取单词 → 背单词计划</button>
        <button class="btn btn-ghost btn-block" id="btn-cancel-plan">取消</button>
        <div class="subline" id="gen-status" style="margin-top:8px"></div>
      </div>`;

    const getContent = () => $('#plan-content').value.trim();

    $('#btn-gen-plan').addEventListener('click', () => {
      const content = getContent();
      if (!content) { toast('请先粘贴内容'); return; }
      const btn = $('#btn-gen-plan');
      btn.disabled = true; btn.textContent = '⏳ 生成中...';
      AI.generate(content).then(topics => finishGen(content, topics)).catch(e => {
        toast('生成失败：' + e.message);
        btn.disabled = false; btn.textContent = '🤖 生成题目（少量）';
      });
    });

    $('#btn-gen-batch').addEventListener('click', () => {
      const content = getContent();
      if (!content) { toast('请先粘贴内容'); return; }
      const btn = $('#btn-gen-batch');
      btn.disabled = true; btn.textContent = '⏳ 分批生成中...';
      batchGenerate(content, (done, total) => {
        $('#gen-status').textContent = '正在生成第 ' + done + '/' + total + ' 批...';
      }).then(allTopics => finishGen(content, allTopics)).catch(e => {
        toast('生成失败：' + e.message);
        btn.disabled = false; btn.textContent = '🤖 批量生成';
      });
    });

    $('#btn-extract-words').addEventListener('click', () => {
      const content = getContent();
      if (!content) { toast('请先粘贴内容'); return; }
      const btn = $('#btn-extract-words');
      const dedup = (list) => {
        const seen = {}; const out = [];
        (list || []).forEach(w => { const k = String(w.word).toLowerCase(); if (k && !seen[k]) { seen[k] = 1; out.push(w); } });
        return out;
      };
      const goWords = (list) => {
        S.addWords(list);
        Sync.markDirty();
        toast('已识别 ' + list.length + ' 个词/短语 ✅');
        state.tab = 'daily'; updateNav();
        enterWordsView();
      };
      // 先本地快速识别（瞬间，支持「序号. 单词 → 释义」格式）
      const quick = dedup(extractWords(content));
      if (quick.length >= 5) { goWords(quick); return; }
      // 本地识别不到，再用 AI 精确识别（含不规则格式）
      btn.disabled = true; btn.textContent = '⏳ AI 识别单词中...';
      batchExtractWords(content, (done, total) => {
        $('#gen-status').textContent = '正在识别第 ' + done + '/' + total + ' 批...';
      }).then(all => {
        const list = dedup(all);
        if (list.length) goWords(list);
        else if (quick.length) goWords(quick);
        else { toast('没有识别到单词，请确认文件内容'); btn.disabled = false; btn.textContent = '📖 提取单词 → 背单词计划'; }
      }).catch(() => {
        if (quick.length) goWords(quick);
        else { toast('识别失败，请重试'); btn.disabled = false; btn.textContent = '📖 提取单词 → 背单词计划'; }
      });
    });

    $('#btn-cancel-plan').addEventListener('click', () => switchTab('progress'));
  }

  function topicsToQuestions(topics) {
    const out = [];
    topics.forEach(t => {
      (t.choice_questions || []).forEach(cq => {
        out.push(Object.assign({ type: 'choice', module: guessModule(t.name) }, cq));
      });
      if (t.coding_question) {
        const cq = t.coding_question;
        out.push({ type: 'coding', module: cq.language === 'C' ? 'c_language' : 'python', question: cq.question, answer: cq.answer, analysis: cq.analysis });
      }
    });
    return out;
  }

  // ---- 批量生成 / 背单词 ----
  function chunkText(text, size) {
    const lines = String(text || '').split(/\r?\n/);
    const chunks = [];
    let cur = '';
    lines.forEach(line => {
      if ((cur + line).length > size && cur) { chunks.push(cur); cur = line; }
      else cur += (cur ? '\n' : '') + line;
    });
    if (cur.trim()) chunks.push(cur);
    return chunks;
  }

  function batchGenerate(content, onProgress) {
    const chunks = chunkText(content, 1500);
    const results = [];
    let i = 0;
    function step() {
      if (i >= chunks.length) return Promise.resolve(results);
      onProgress(i + 1, chunks.length);
      return AI.generate(chunks[i]).then(topics => {
        results.push.apply(results, topics || []);
        i++;
        return step();
      }).catch(() => { i++; return step(); });
    }
    return step();
  }

  function batchExtractWords(content, onProgress) {
    const chunks = chunkText(content, 1200);
    const results = [];
    let i = 0;
    function step() {
      if (i >= chunks.length) return Promise.resolve(results);
      onProgress(i + 1, chunks.length);
      return AI.extractWords(chunks[i]).then(ws => {
        results.push.apply(results, ws || []);
        i++;
        return step();
      }).catch(() => { i++; return step(); });
    }
    return step();
  }

  function finishGen(content, topics) {
    if (!topics || !topics.length) { toast('解析失败，请重试'); return; }
    S.addPlan({ name: (content.split('\n')[0] || '学习资料').slice(0, 20), content: content });
    renderQuestionReview(topicsToQuestions(topics), '导入生成题目');
  }

  function extractWords(text) {
    const lines = String(text || '').split(/\r?\n/);
    const out = [];
    let currentPos = '';
    lines.forEach(line => {
      const t = line.trim();
      if (!t) return;
      // 分类标题（# 开头）：从标题识别词性
      if (/^#{1,3}\s/.test(t)) {
        if (/短语/.test(t)) currentPos = 'phr.';
        else if (/形容词/.test(t)) currentPos = 'adj.';
        else if (/副词/.test(t)) currentPos = 'adv.';
        else if (/动词/.test(t)) currentPos = 'v.';
        else if (/名词/.test(t)) currentPos = 'n.';
        else currentPos = '';
        return;
      }
      // 格式1：序号. 单词/短语 → 中文释义 → 例句（如四级.txt）
      let m = t.match(/^\d+[\.、）)]\s*([^→\n]+?)\s*→\s*([^→\n]+?)(?:\s*→\s*.*)?$/);
      if (m && /[A-Za-z]/.test(m[1]) && /[一-鿿]/.test(m[2])) {
        out.push({ word: m[1].trim(), meaning: m[2].trim(), pos: currentPos });
        return;
      }
      // 格式2：单词/短语 + 空格 + 中文释义
      m = t.match(/^([A-Za-z][^\r\n]{0,40}?)\s{1,}([一-鿿][^\r\n]{0,80})$/);
      if (m) out.push({ word: m[1].trim().replace(/\s+[a-z]{1,3}\.?$/i, ''), meaning: m[2].trim(), pos: currentPos });
    });
    return out;
  }

  function decodeXml(s) {
    return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
  }

  // 解析 docx（本质是 zip），提取正文文本，零依赖
  async function extractDocxText(file) {
    const buf = new Uint8Array(await file.arrayBuffer());
    const dv = new DataView(buf.buffer);
    const te = new TextDecoder();
    const u16 = o => dv.getUint16(o, true);
    const u32 = o => dv.getUint32(o, true);

    let eocd = -1;
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65536); i--) {
      if (u32(i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('不是有效的 docx 文件');

    const count = u16(eocd + 10);
    let cd = u32(eocd + 16);
    let off = -1, size = -1, method = -1;
    for (let i = 0; i < count; i++) {
      if (u32(cd) !== 0x02014b50) break;
      method = u16(cd + 10);
      const csize = u32(cd + 20);
      const nlen = u16(cd + 28);
      const elen = u16(cd + 30);
      const clen = u16(cd + 32);
      const loff = u32(cd + 42);
      const name = te.decode(buf.subarray(cd + 46, cd + 46 + nlen));
      if (name === 'word/document.xml') { off = loff; size = csize; break; }
      cd += 46 + nlen + elen + clen;
    }
    if (off < 0) throw new Error('docx 中找不到正文');

    const nlen2 = u16(off + 26);
    const elen2 = u16(off + 28);
    const dataStart = off + 30 + nlen2 + elen2;
    const comp = buf.subarray(dataStart, dataStart + size);

    let xml;
    if (method === 8) {
      const ds = new DecompressionStream('deflate-raw');
      const stream = new Blob([comp]).stream().pipeThrough(ds);
      const out = await new Response(stream).arrayBuffer();
      xml = te.decode(out);
    } else if (method === 0) {
      xml = te.decode(comp);
    } else {
      throw new Error('docx 压缩方式不支持');
    }

    const lines = [];
    const paras = xml.split(/<\/w:p>/);
    paras.forEach(p => {
      let s = '';
      const re = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;
      let m;
      while ((m = re.exec(p)) !== null) s += m[1];
      if (s.trim()) lines.push(decodeXml(s));
    });
    return lines.join('\n');
  }

  function matchMeaning(input, meaning) {
    const norm = s => String(s || '').trim().toLowerCase().replace(/\s+/g, '');
    const a = norm(input), b = norm(meaning);
    if (!a || !b) return false;
    if (a === b) return true;
    if (a.length >= 2 && b.indexOf(a) >= 0) return true;
    return false;
  }

  function recallCardHtml(w) {
    const r = state.wordResult;
    let resultHtml = '';
    if (r) {
      resultHtml = r.correct
        ? '<div class="q-feedback q-feedback-ok"><div class="qf-title">✅ 正确！</div></div>'
        : '<div class="q-feedback q-feedback-err"><div class="qf-title">❌ 错误</div><div class="qf-analysis">正确答案：' + esc(w.pos || '—') + ' · ' + esc(w.meaning) + '</div></div>';
    }
    return `
      <div class="card word-flash">
        <div class="wf-tag">🔁 回忆式复习 · 作答词性和翻译</div>
        <div class="wf-word">${esc(w.word)}</div>
        <div class="wf-answer-form">
          <select id="wf-pos-input">
            <option value="">— 词性 —</option>
            <option value="v.">动词 v.</option>
            <option value="n.">名词 n.</option>
            <option value="adj.">形容词 adj.</option>
            <option value="adv.">副词 adv.</option>
            <option value="phr.">短语 phr.</option>
          </select>
          <input id="wf-mean-input" type="text" placeholder="输入中文翻译">
          ${r ? '' : '<button class="btn btn-primary" id="wf-submit">提交</button>'}
        </div>
        ${resultHtml}
        ${r ? '<button class="btn btn-accent btn-block" id="wf-next">下一个</button>' : ''}
      </div>`;
  }

  function startRecall(kind) {
    const plan = S.todayWordPlan();
    state.wordQueue = kind === 'forgot' ? plan.forgottenWords.slice() : plan.learnedWords.slice();
    state.wordIndex = 0;
    state.wordResult = null;
    state.wordSession = kind;
    state.wordChat = null;
    state.dailyView = 'words';
    updateTopbar(); render();
  }

  function applyWordResult(correct) {
    const w = state.wordQueue[state.wordIndex];
    if (!w) return;
    if (correct) {
      if (w.forgotten) S.recallForgottenWord(w.word); else S.reviewWord(w.word, true);
    } else {
      S.reviewWord(w.word, false);
    }
    Sync.markDirty();
  }

  function renderWords() {
    const plan = S.todayWordPlan();
    // 混合模式：首次进入构建队列（新词+到期复习）
    if (state.wordSession === 'mixed' && !state.wordQueue.length) {
      state.wordQueue = plan.newWords.concat(plan.reviewWords);
      state.wordIndex = 0;
      state.wordResult = null;
    }
    if (state.wordIndex >= state.wordQueue.length) {
      state.wordQueue = [];
      state.wordChat = null;
      return renderWordsFinished(plan);
    }
    const w = state.wordQueue[state.wordIndex];
    const isNew = (w.level || 0) === 0;
    const key = 'word:' + w.word;
    state.wordChat = { key: key, word: w, messages: (S.getAIHistory(key) || []).slice(), busy: false };

    const bubbles = state.wordChat.messages.map(m => '<div class="bubble ' + (m.role === 'user' ? 'user' : 'ai') + '">' + nl2br(m.content) + '</div>').join('');
    const learnedPct = plan.total ? Math.round(plan.learned / plan.total * 100) : 0;
    const queueLeft = state.wordQueue.length - state.wordIndex;

    let flashHtml;
    if (isNew && state.wordSession === 'mixed') {
      flashHtml = `
        <div class="card word-flash">
          <div class="wf-tag">🆕 新词</div>
          <div class="wf-word">${esc(w.word)}</div>
          ${w.pos ? '<div class="wf-pos">' + esc(w.pos) + '</div>' : ''}
          <div class="wf-mean">${esc(w.meaning)}</div>
          <div class="wf-actions"><button class="btn btn-success" id="wf-remember">记住了</button></div>
        </div>`;
    } else {
      flashHtml = recallCardHtml(w);
    }

    const sessionLabel = state.wordSession === 'forgot' ? '🔴 遗忘复习' : (state.wordSession === 'learned' ? '✅ 已背复习' : '🆕 新词 ' + plan.batchDone + '/' + plan.batchTotal + ' · 🔁 待复习 ' + plan.reviewWords.length);

    return `
      <div class="card" style="text-align:center">
        <div class="subline">${sessionLabel} · 本组剩 ${queueLeft}</div>
        <div class="progress" style="height:8px;margin:8px 0"><i style="width:${learnedPct}%"></i></div>
        <div class="subline">词库 ${plan.total} 词 · 已学 ${plan.learned} · 已掌握 ${plan.mastered}</div>
      </div>
      ${flashHtml}
      ${state.wordSession === 'mixed' ? `
      <div class="card wf-chat">
        <div class="wf-chat-head">🤖 问 AI（关于「${esc(w.word)}」）</div>
        <div class="ap-scroll" id="wf-scroll">${bubbles || '<div class="empty">问用法、例句、近义词、辨析、固定搭配…</div>'}</div>
        <div class="ap-input"><input id="wf-input" type="text" placeholder="问这个单词..."><button class="send" id="wf-send">➤</button></div>
      </div>
      <button class="btn btn-ghost btn-block" id="btn-forget-log">📕 单词遗忘录（遗忘 ${plan.forgottenWords.length}）</button>` : ''}
    `;
  }

  function renderWordsFinished(plan) {
    const learnedPct = plan.total ? Math.round(plan.learned / plan.total * 100) : 0;
    if (state.wordSession !== 'mixed') {
      return `
        <div class="card" style="text-align:center">
          <div style="font-size:22px;font-weight:800;color:var(--primary)">🎉 复习完成</div>
          <div class="subline">${state.wordSession === 'forgot' ? '遗忘单词已复习完' : '已背单词已复习完'}，继续加油～</div>
        </div>
        <button class="btn btn-accent btn-block" id="btn-back-words">← 返回背单词</button>
      `;
    }
    return `
      <div class="card" style="text-align:center">
        <div style="font-size:22px;font-weight:800;color:var(--primary)">📖 背单词</div>
        <div class="subline">词库 ${plan.total} 词 · 已学 ${plan.learned} 词 · 已掌握 ${plan.mastered} 词</div>
        <div class="progress" style="height:10px;margin:8px 0"><i style="width:${learnedPct}%"></i></div>
      </div>
      ${plan.hasMore ? '<button class="btn btn-accent btn-block" id="btn-next-batch">📚 再学 20 个新词</button>' : ''}
      <button class="btn btn-ghost btn-block" id="btn-forget-log">📕 单词遗忘录（遗忘 ${plan.forgottenWords.length}）</button>
      <div class="card"><div class="empty">${plan.total ? '🎉 今日单词都复习完啦！明天再来～' : '还没有词库。去「我的 → 导入资料出题」导入四级词汇，点「提取单词」即可。'}</div></div>
    `;
  }

  function bindWords() {
    const rem = $('#wf-remember');
    if (rem) rem.addEventListener('click', () => answerWord());
    const submit = $('#wf-submit');
    if (submit) submit.addEventListener('click', () => {
      const w = state.wordQueue[state.wordIndex];
      if (!w) return;
      const posInput = $('#wf-pos-input').value;
      const meanInput = $('#wf-mean-input').value.trim();
      if (!meanInput) { toast('请输入翻译'); return; }
      const posOk = !w.pos || (posInput === w.pos);
      const meanOk = matchMeaning(meanInput, w.meaning);
      state.wordResult = { correct: posOk && meanOk };
      render();
    });
    const next = $('#wf-next');
    if (next) next.addEventListener('click', () => {
      const correct = state.wordResult ? state.wordResult.correct : false;
      applyWordResult(correct);
      toast(correct ? '正确 ✅' : '错误，已进入遗忘录 📕');
      state.wordIndex++;
      state.wordResult = null;
      render();
    });
    const input = $('#wf-input');
    const send = () => { const v = input.value.trim(); if (v) { input.value = ''; askWord(v); } };
    const sendBtn = $('#wf-send');
    if (sendBtn) sendBtn.addEventListener('click', send);
    if (input) input.addEventListener('keydown', e => { if (e.key === 'Enter') send(); });
    scrollWordChat();
    const nb = $('#btn-next-batch');
    if (nb) nb.addEventListener('click', () => {
      const n = S.openNextWordBatch();
      toast(n ? '已加入 ' + n + ' 个新词 ✅' : '没有更多新词了');
      render();
    });
    const fl = $('#btn-forget-log');
    if (fl) fl.addEventListener('click', () => { state.dailyView = 'forget'; updateTopbar(); render(); });
    const bw = $('#btn-back-words');
    if (bw) bw.addEventListener('click', () => enterWordsView());
  }

  function answerWord() {
    const w = state.wordQueue[state.wordIndex];
    if (!w) return;
    S.learnWord(w.word);
    Sync.markDirty();
    toast('记住了 ✅');
    state.wordIndex++;
    state.wordResult = null;
    render();
  }

  function renderForgetLog() {
    const plan = S.todayWordPlan();
    return `
      <div class="section-title">📕 单词遗忘录</div>
      <div class="card" id="go-recall-forgot">
        <div class="forget-entry">
          <div class="fe-ico">🔴</div>
          <div class="fe-info"><div class="fe-name">遗忘单词</div><div class="fe-sub">${plan.forgottenWords.length} 个 · 回忆式复习，记住了回到已背</div></div>
          <div class="fe-arrow">›</div>
        </div>
      </div>
      <div class="card" id="go-recall-learned">
        <div class="forget-entry">
          <div class="fe-ico">✅</div>
          <div class="fe-info"><div class="fe-name">已背单词</div><div class="fe-sub">${plan.learnedWords.length} 个 · 科学复习，回忆词性和翻译</div></div>
          <div class="fe-arrow">›</div>
        </div>
      </div>
    `;
  }

  function bindForgetLog() {
    const f = $('#go-recall-forgot');
    if (f) f.addEventListener('click', () => startRecall('forgot'));
    const l = $('#go-recall-learned');
    if (l) l.addEventListener('click', () => startRecall('learned'));
  }

  function askWord(text) {
    const wc = state.wordChat;
    if (!wc || wc.busy) return;
    wc.messages.push({ role: 'user', content: text, timestamp: new Date().toISOString() });
    S.saveAIHistory(wc.key, wc.messages);
    appendWordBubble('user', text);
    wc.busy = true;
    setWordTyping(true);
    const msgs = [{ role: 'system', content: META.systemPrompt }, { role: 'user', content: buildWordContext(wc.word) }];
    wc.messages.forEach(m => msgs.push({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }));
    AI.chat(msgs).then(content => {
      wc.messages.push({ role: 'assistant', content: content, timestamp: new Date().toISOString() });
      S.saveAIHistory(wc.key, wc.messages);
      appendWordBubble('assistant', content);
    }).catch(e => {
      appendWordBubble('assistant', '⚠️ ' + e.message);
    }).finally(() => {
      wc.busy = false;
      setWordTyping(false);
    });
  }

  function appendWordBubble(role, content) {
    const scroll = $('#wf-scroll');
    if (!scroll) return;
    const bubble = document.createElement('div');
    bubble.className = 'bubble ' + (role === 'user' ? 'user' : 'ai');
    bubble.innerHTML = nl2br(content);
    scroll.appendChild(bubble);
    scrollWordChat();
  }

  function setWordTyping(on) {
    let t = $('#wf-typing');
    if (on) {
      if (!t) {
        t = document.createElement('div');
        t.id = 'wf-typing'; t.className = 'typing';
        t.innerHTML = '<i></i><i></i><i></i>';
        const scroll = $('#wf-scroll');
        if (scroll) scroll.appendChild(t);
      }
      scrollWordChat();
    } else if (t) { t.remove(); }
  }

  function scrollWordChat() {
    const el = $('#wf-scroll');
    if (el) el.scrollTop = el.scrollHeight;
  }

  function enterWordsView() {
    state.wordQueue = [];
    state.wordIndex = 0;
    state.wordChat = null;
    state.wordResult = null;
    state.wordSession = 'mixed';
    state.dailyView = 'words';
    updateTopbar();
    render();
  }

  // ==================== 设置 ====================
  function renderSettings() {
    const s = S.getSettings();
    const r = s.reminders;
    const user = Sync.getUser();
    const mode = Sync.getMode();
    return `
      <div class="card">
        <h3>👤 账号</h3>
        <div class="setting-item"><div class="s-info"><div class="s-name">当前用户</div><div class="s-desc">${esc(user ? user.username : '')}（${mode === 'supabase' || mode === 'cloud' ? '☁️ 云端同步' : '📴 本地模式'}）</div></div></div>
        <button class="btn btn-primary btn-block btn-sm" id="btn-sync-now">☁️ 立即同步</button>
        <button class="btn btn-danger btn-block btn-sm" id="btn-logout" style="margin-top:8px">🚪 退出登录</button>
      </div>
      <div class="card">
        <h3>🔔 每日提醒</h3>
        <div class="setting-item"><div class="s-info"><div class="s-name">开启每日提醒</div><div class="s-desc">需要允许浏览器通知</div></div>
          <label class="switch"><input type="checkbox" data-r="enabled" ${r.enabled ? 'checked' : ''}><span class="slider"></span></label></div>
        <div class="setting-item"><div class="s-info"><div class="s-name">去程通勤 (8:00)</div><div class="s-desc">🌅 行测言语10道</div></div>
          <label class="switch"><input type="checkbox" data-r="morning" ${r.morning ? 'checked' : ''}><span class="slider"></span></label></div>
        <div class="setting-item"><div class="s-info"><div class="s-name">午休 (12:40)</div><div class="s-desc">☕️ SQL 2-3道</div></div>
          <label class="switch"><input type="checkbox" data-r="noon" ${r.noon ? 'checked' : ''}><span class="slider"></span></label></div>
        <div class="setting-item"><div class="s-info"><div class="s-name">晚间 (20:00)</div><div class="s-desc">🌙 Linux + 编程</div></div>
          <label class="switch"><input type="checkbox" data-r="evening" ${r.evening ? 'checked' : ''}><span class="slider"></span></label></div>
        <div class="setting-item"><div class="s-info"><div class="s-name">周末提醒</div><div class="s-desc">默认关闭</div></div>
          <label class="switch"><input type="checkbox" data-r="weekend" ${r.weekend ? 'checked' : ''}><span class="slider"></span></label></div>
        <button class="btn btn-ghost btn-block btn-sm" id="btn-test-notify">🔔 发送测试通知</button>
      </div>
      <div class="card">
        <h3>🤖 智谱 AI 设置</h3>
        <div class="diary-field"><label>API Key（直连兜底用，云端模式走服务器代理）</label>
          <input id="set-apikey" type="text" value="${esc(s.apiKey)}" placeholder="输入智谱 API Key"></div>
        <div class="diary-field"><label>模型</label>
          <select id="set-model" style="width:100%;border:1.5px solid var(--border);border-radius:11px;padding:10px;font-size:14px">
            <option ${s.apiModel === 'glm-4-flash' ? 'selected' : ''}>glm-4-flash</option>
            <option ${s.apiModel === 'glm-4-plus' ? 'selected' : ''}>glm-4-plus</option>
          </select></div>
        <button class="btn btn-primary btn-block btn-sm" id="btn-save-api">💾 保存 API 设置</button>
      </div>
      <div class="card">
        <h3>🎯 目标日期</h3>
        <div class="diary-field"><label>目标日期</label>
          <input id="set-target" type="date" value="${esc(s.targetDate)}"></div>
        <button class="btn btn-primary btn-block btn-sm" id="btn-save-target">保存目标日期</button>
      </div>
      <div class="card">
        <h3>⚙️ 其他</h3>
        <div class="setting-item"><div class="s-info"><div class="s-name">清除缓存</div><div class="s-desc">重置题库已用标记</div></div>
          <button class="btn btn-ghost btn-sm" id="btn-clear-cache">清除</button></div>
        <div class="setting-item"><div class="s-info"><div class="s-name">重置数据</div><div class="s-desc">清空所有学习记录（不可恢复）</div></div>
          <button class="btn btn-danger btn-sm" id="btn-reset">重置</button></div>
      </div>
      <div class="card">
        <h3>ℹ️ 关于</h3>
        <div class="subline">Yi-朝夕刷题 ${META.version}</div>
        <div class="subline">个人学习工作台 · 题库对齐你的学习计划</div>
      </div>
    `;
  }

  function bindSettings() {
    document.querySelectorAll('input[data-r]').forEach(cb => {
      cb.addEventListener('change', () => {
        const r = S.getSettings().reminders;
        r[cb.dataset.r] = cb.checked;
        S.saveSettings({ reminders: r });
        if (cb.dataset.r === 'enabled' && cb.checked) requestNotify();
        toast('已更新提醒设置');
      });
    });
    $('#btn-test-notify').addEventListener('click', () => requestNotify(() => notify('Yi-朝夕刷题', '这是一条测试通知 ✅')));
    $('#btn-save-api').addEventListener('click', () => {
      S.saveSettings({ apiKey: $('#set-apikey').value.trim(), apiModel: $('#set-model').value });
      toast('API 设置已保存 ✅');
    });
    $('#btn-save-target').addEventListener('click', () => {
      S.saveSettings({ targetDate: $('#set-target').value });
      toast('目标日期已保存 ✅');
    });
    $('#btn-sync-now').addEventListener('click', () => {
      Sync.syncNow().then(r => toast(r.ok ? '已同步 ✅' : '同步失败，请检查网络'));
    });
    $('#btn-logout').addEventListener('click', () => {
      showModal('确认退出登录？', '本地数据会保留，退出后可在设置重新登录。', [
        { label: '取消', cls: 'btn-ghost' },
        { label: '退出', cls: 'btn-danger', act: () => { Sync.logout(); renderApp(); } }
      ]);
    });
    $('#btn-clear-cache').addEventListener('click', () => { S.clearCache(); toast('缓存已清除'); });
    $('#btn-reset').addEventListener('click', showResetDialog);
  }

  // ---- 弹窗 ----
  function showModal(title, body, buttons) {
    $('#modal-title').textContent = title;
    $('#modal-body').textContent = body;
    const actions = $('#modal-actions');
    actions.innerHTML = '';
    buttons.forEach(b => {
      const btn = document.createElement('button');
      btn.className = 'btn ' + b.cls;
      btn.textContent = b.label;
      btn.addEventListener('click', () => { hideModal(); if (b.act) b.act(); });
      actions.appendChild(btn);
    });
    $('#modal-mask').classList.add('show');
  }
  function hideModal() { $('#modal-mask').classList.remove('show'); }

  function showResetDialog() {
    const options = [
      { key: 'records', label: '刷题记录 + 错题本 + 题目进度' },
      { key: 'wordProgress', label: '背单词进度（保留词库，清零记忆等级）' },
      { key: 'words', label: '删除整个词库' },
      { key: 'diary', label: '学习日记' },
      { key: 'plans', label: '学习计划' },
      { key: 'generated', label: 'AI 生成的题目' },
      { key: 'aiHistory', label: 'AI 对话历史' },
      { key: 'settings', label: '设置' }
    ];
    const checks = options.map(o => '<label class="reset-opt"><input type="checkbox" data-k="' + o.key + '"> <span>' + esc(o.label) + '</span></label>').join('');
    $('#modal-title').textContent = '选择要重置的数据';
    $('#modal-body').innerHTML = '<div class="subline" style="margin-bottom:8px">勾选要清除的类型（可多选），清除后不可恢复</div><div class="reset-opts">' + checks + '</div>';
    const actions = $('#modal-actions');
    actions.innerHTML = '';
    const add = (label, cls, act) => {
      const b = document.createElement('button');
      b.className = 'btn ' + cls;
      b.textContent = label;
      b.addEventListener('click', () => { hideModal(); if (act) act(); });
      actions.appendChild(b);
    };
    add('取消', 'btn-ghost');
    add('全部重置', 'btn-danger', () => { S.resetAll(); location.reload(); });
    add('重置所选', 'btn-accent', () => {
      const picked = Array.from(document.querySelectorAll('.reset-opt input:checked')).map(cb => cb.dataset.k);
      if (!picked.length) { toast('请先勾选要重置的类型'); return; }
      doReset(picked);
    });
    $('#modal-mask').classList.add('show');
  }

  function doReset(keys) {
    keys.forEach(k => {
      if (k === 'records') S.resetRecords();
      else if (k === 'wordProgress') S.resetWordProgress();
      else if (k === 'words') S.deleteWords();
      else if (k === 'diary') S.resetDiary();
      else if (k === 'plans') S.resetPlans();
      else if (k === 'generated') S.resetGenerated();
      else if (k === 'aiHistory') S.resetAIHistory();
      else if (k === 'settings') S.resetSettings();
    });
    Sync.markDirty();
    toast('已重置所选数据 ✅');
    render();
  }

  // ==================== 通知 ====================
  function notify(title, body) {
    if (!('Notification' in window)) { toast('当前浏览器不支持通知'); return; }
    if (Notification.permission !== 'granted') { toast('请先允许通知权限'); return; }
    try {
      if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.ready.then(reg => reg.showNotification(title, { body: body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png' }));
      } else {
        new Notification(title, { body: body, icon: 'icons/icon-192.png' });
      }
    } catch (e) { try { new Notification(title, { body: body }); } catch (e2) { toast('通知发送失败'); } }
  }

  function requestNotify(cb) {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') { if (cb) cb(); return; }
    Notification.requestPermission().then(p => { if (p === 'granted' && cb) cb(); });
  }

  const fired = {};
  function checkReminders() {
    if (!Sync.isLoggedIn()) return;
    const s = S.getSettings();
    if (!s.reminders.enabled || !('Notification' in window) || Notification.permission !== 'granted') return;
    const now = new Date();
    const dow = now.getDay();
    if (!s.reminders.weekend && (dow === 0 || dow === 6)) return;
    const key = S.todayStr();
    const slots = [
      { k: 'morning', h: 8, m: 0, txt: META.reminders.morning },
      { k: 'noon', h: 12, m: 40, txt: META.reminders.noon },
      { k: 'evening', h: 20, m: 0, txt: META.reminders.evening },
      { k: 'diary', h: 21, m: 30, txt: META.reminders.diary }
    ];
    slots.forEach(sl => {
      if (!s.reminders[sl.k]) return;
      const t = now.getHours() * 60 + now.getMinutes();
      const target = sl.h * 60 + sl.m;
      if (t >= target && t < target + 3 && !fired[key + sl.k]) {
        fired[key + sl.k] = true;
        notify('Yi-朝夕刷题', sl.txt);
      }
    });
  }

  // ==================== 初始化 ====================
  function init() {
    Sync.init();
    document.getElementById('modal-mask').addEventListener('click', e => { if (e.target.id === 'modal-mask') hideModal(); });
    document.getElementById('ai-popup').addEventListener('click', e => { if (e.target.id === 'ai-popup') closeAIPopup(); });

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }

    Sync.autoLogin().then(loggedIn => {
      if (loggedIn && (Sync.getMode() === 'cloud' || Sync.getMode() === 'supabase')) Sync.syncNow();
      renderApp();
    });

    checkReminders();
    setInterval(checkReminders, 60000);
    if (S.getSettings().reminders.enabled) requestNotify();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
