/* ===== 数据持久化层：题库 / 刷题记录 / 日记 / 设置 / 每日任务 / 计划 / AI历史 ===== */
window.Store = (function () {
  const META = window.YZX_META;

  function read(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch (e) { return fallback; }
  }
  const SYNC_REV_KEYS = ['yzx.records', 'yzx.qstate', 'yzx.diary', 'yzx.daily', 'yzx.firstDate', 'yzx.settings', 'yzx.plans', 'yzx.ai_history', 'yzx.generated', 'yzx.words'];
  function bumpRev() { localStorage.setItem('yzx.rev', JSON.stringify(Date.now())); }
  function write(key, val) {
    localStorage.setItem(key, JSON.stringify(val));
    if (SYNC_REV_KEYS.indexOf(key) >= 0) bumpRev();
  }
  function uid() { return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

  // ---- 基础数据 ----
  function allQuestions() {
    return [].concat(
      window.C_QUESTIONS || [], window.PY_QUESTIONS || [], window.XC_QUESTIONS || [],
      window.SQL_QUESTIONS || [], window.LINUX_QUESTIONS || [],
      window.NET_QUESTIONS || [], window.UNICOM_QUESTIONS || [],
      generated()
    );
  }

  function qstateMap() { return read('yzx.qstate', {}); }
  function saveQState(m) { write('yzx.qstate', m); }

  function getQState(qid) {
    const m = qstateMap();
    if (!m[qid]) m[qid] = { used: false, wrongCount: 0, lastWrongDate: null, correctStreak: 0, answeredDates: [], ts: 0 };
    return m[qid];
  }
  function setQState(qid, patch) {
    const m = qstateMap();
    const s = m[qid] || { used: false, wrongCount: 0, lastWrongDate: null, correctStreak: 0, answeredDates: [], ts: 0 };
    Object.assign(s, patch);
    s.ts = Date.now();
    m[qid] = s;
    saveQState(m);
  }

  function getQuestion(id) {
    return allQuestions().find(q => q.id === id) || null;
  }
  function questionWithState(q) {
    const s = getQState(q.id);
    return Object.assign({}, q, s);
  }
  function questionsOf(module, type) {
    return allQuestions().filter(q => q.module === module && (!type || q.type === type));
  }

  // ---- 记录 ----
  function records() { return read('yzx.records', []); }
  // extra: { answer, code, type } 用于记录用户答案/代码/题型
  function addRecord(qid, isCorrect, dateStr, extra) {
    const r = records();
    const date = dateStr || todayStr();
    const rec = { id: uid(), qid: qid, date: date, isCorrect: !!isCorrect, ts: Date.now() };
    if (extra) Object.assign(rec, extra);
    r.push(rec);
    write('yzx.records', r);

    const s = getQState(qid);
    if (!s.answeredDates) s.answeredDates = [];
    if (s.answeredDates.indexOf(date) < 0) s.answeredDates.push(date);
    if (isCorrect) {
      s.correctStreak = (s.correctStreak || 0) + 1;
      if (s.correctStreak >= 3) { s.wrongCount = 0; s.lastWrongDate = null; }
    } else {
      s.correctStreak = 0;
      s.wrongCount = (s.wrongCount || 0) + 1;
      s.lastWrongDate = date;
    }
    setQState(qid, s);
    return r;
  }

  function wrongBook() {
    const m = qstateMap();
    const ids = Object.keys(m).filter(id => m[id].wrongCount > 0);
    return ids.map(getQuestion).filter(Boolean).map(questionWithState);
  }

  // ---- 日期 ----
  function todayStr() {
    const d = new Date();
    return fmtDate(d);
  }
  function fmtDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }
  function firstDate() {
    let d = read('yzx.firstDate', null);
    if (!d) { d = todayStr(); write('yzx.firstDate', d); }
    return d;
  }
  function dayNumber() {
    const f = new Date(firstDate() + 'T00:00:00');
    const t = new Date(todayStr() + 'T00:00:00');
    return Math.floor((t - f) / 86400000) + 1;
  }
  function weekNumber() { return Math.floor((dayNumber() - 1) / 7) + 1; }

  function daysUntil(target) {
    const t = new Date(target + 'T00:00:00');
    const now = new Date(todayStr() + 'T00:00:00');
    return Math.ceil((t - now) / 86400000);
  }

  // ---- 每日任务 ----
  function dailyMap() { return read('yzx.daily', {}); }
  function getDaily(dateStr) {
    const date = dateStr || todayStr();
    const dm = dailyMap();
    if (dm[date]) return dm[date];
    const tasks = META.dailyTemplate.map(function (tpl) {
      let pool = questionsOf(tpl.module, tpl.type).filter(q => !getQState(q.id).used);
      if (pool.length < tpl.count) {
        questionsOf(tpl.module, tpl.type).forEach(q => setQState(q.id, { used: false }));
        pool = questionsOf(tpl.module, tpl.type);
      }
      const pick = pool.slice(0, tpl.count);
      pick.forEach(q => setQState(q.id, { used: true }));
      return { tplId: tpl.id, label: tpl.label, module: tpl.module, type: tpl.type, count: tpl.count, source: tpl.source, scene: tpl.scene, color: tpl.color, icon: tpl.icon, qids: pick.map(q => q.id) };
    });
    dm[date] = { date: date, tasks: tasks, ts: Date.now() };
    write('yzx.daily', dm);
    return dm[date];
  }

  function taskProgress(task, dateStr) {
    const date = dateStr || todayStr();
    const rs = records().filter(r => r.date === date && task.qids.indexOf(r.qid) >= 0);
    const lastByQid = {};
    rs.forEach(r => { if (!lastByQid[r.qid] || r.ts >= lastByQid[r.qid].ts) lastByQid[r.qid] = r; });
    const done = Object.keys(lastByQid).length;
    const correct = Object.keys(lastByQid).filter(id => lastByQid[id].isCorrect).length;
    return { done: done, total: task.qids.length, correct: correct };
  }

  // ---- 日记 ----
  function diaryMap() { return read('yzx.diary', {}); }
  function getDiary(dateStr) { return diaryMap()[dateStr || todayStr()] || null; }
  function saveDiary(d) {
    const dm = diaryMap();
    d.ts = Date.now();
    dm[d.date] = d;
    write('yzx.diary', dm);
  }
  function allDiaries() {
    const dm = diaryMap();
    return Object.keys(dm).map(k => dm[k]).sort((a, b) => (a.date < b.date ? 1 : -1));
  }

  // ---- 设置 ----
  function getSettings() {
    return Object.assign({}, META.defaultSettings, read('yzx.settings', {}));
  }
  function saveSettings(s) {
    const merged = Object.assign({}, read('yzx.settings', {}), s);
    merged.ts = Date.now();
    write('yzx.settings', merged);
  }

  // ---- 登录态 ----
  function getUser() { return read('yzx.user', null); }
  function setUser(u) { write('yzx.user', u); }
  function getToken() { return read('yzx.token', null); }
  function setToken(t) { write('yzx.token', t); }
  function clearAuth() { localStorage.removeItem('yzx.user'); localStorage.removeItem('yzx.token'); }

  // ---- 学习计划 ----
  function plans() { return read('yzx.plans', []); }
  function savePlans(arr) { write('yzx.plans', arr); }
  function addPlan(p) {
    const arr = plans();
    p.id = uid();
    p.createdAt = Date.now();
    arr.push(p);
    savePlans(arr);
    return p;
  }

  // ---- AI 对话历史（按题目 ID） ----
  function aiHistory() { return read('yzx.ai_history', {}); }
  function getAIHistory(qid) { return aiHistory()[qid] || null; }
  function saveAIHistory(qid, messages) {
    const m = aiHistory();
    m[qid] = messages;
    write('yzx.ai_history', m);
  }

  // ---- AI 生成的题目 ----
  function generated() { return read('yzx.generated', []); }
  function saveGenerated(arr) { write('yzx.generated', arr); }
  function addGeneratedQuestions(list, planId) {
    const arr = generated();
    const now = Date.now();
    list.forEach(function (q) {
      q.id = 'GEN_' + uid();
      q.source = 'generated';
      q.plan_id = planId || null;
      q.createdAt = now;
      arr.push(q);
    });
    saveGenerated(arr);
    return arr;
  }

  // ---- 背单词词库（艾宾浩斯间隔复习） ----
  const WORD_INTERVALS = [1, 2, 4, 7, 15]; // level 1..5 的复习间隔（天）
  function words() { return read('yzx.words', []); }
  function saveWords(arr) { write('yzx.words', arr); }
  function addDays(dateStr, n) {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return fmtDate(d);
  }
  function addWords(list) {
    const arr = words();
    const existing = {};
    arr.forEach(w => { existing[String(w.word || '').toLowerCase()] = true; });
    list.forEach(w => {
      const key = String(w.word || '').trim().toLowerCase();
      if (key && !existing[key]) { arr.push({ word: String(w.word).trim(), meaning: String(w.meaning || '').trim(), pos: String(w.pos || '').trim(), level: 0, nextReview: null, wrong: 0, forgotten: false }); existing[key] = true; }
    });
    saveWords(arr);
    return arr.length;
  }
  // 每日计划：新词（每天最多20个）+ 到期复习
  function getDailyWordBatches() {
    const today = todayStr();
    const store = read('yzx.daily_words', {});
    if (store.date === today && Array.isArray(store.batches)) return store.batches;
    const all = words();
    const first = all.filter(w => (w.level || 0) === 0).slice(0, 20).map(w => String(w.word));
    const batches = [first];
    write('yzx.daily_words', { date: today, batches: batches });
    return batches;
  }
  function openNextWordBatch() {
    const today = todayStr();
    const store = read('yzx.daily_words', {});
    const batches = (store.date === today && Array.isArray(store.batches)) ? store.batches : [];
    const assigned = {};
    batches.forEach(b => b.forEach(w => { assigned[String(w).toLowerCase()] = true; }));
    const all = words();
    const next = all.filter(w => (w.level || 0) === 0 && !assigned[String(w.word).toLowerCase()]).slice(0, 20).map(w => String(w.word));
    if (next.length) { batches.push(next); write('yzx.daily_words', { date: today, batches: batches }); }
    return next.length;
  }
  function todayWordPlan() {
    const all = words();
    const today = todayStr();
    const batches = getDailyWordBatches();
    const batchSet = {};
    batches.forEach(b => b.forEach(w => { batchSet[String(w).toLowerCase()] = true; }));
    // 今日新词 = 今日已分配各批里还没学的（固定，不随学习滑动补新）
    const newWords = all.filter(w => batchSet[String(w.word).toLowerCase()] && (w.level || 0) === 0 && !w.forgotten);
    const reviewWords = all.filter(w => {
      const lv = w.level || 0;
      return lv >= 1 && lv < 6 && !w.forgotten && w.nextReview && w.nextReview <= today;
    });
    const forgottenWords = all.filter(w => w.forgotten);
    const learnedWords = all.filter(w => (w.level || 0) >= 1 && (w.level || 0) < 6 && !w.forgotten);
    const learned = all.filter(w => (w.level || 0) >= 1).length;
    const mastered = all.filter(w => (w.level || 0) >= 6).length;
    const batchTotal = batches.reduce((a, b) => a + b.length, 0);
    const batchDone = batchTotal - newWords.length;
    const hasMore = all.some(w => (w.level || 0) === 0 && !batchSet[String(w.word).toLowerCase()]);
    return { newWords, reviewWords, forgottenWords, learnedWords, total: all.length, learned, mastered, batchTotal, batchDone, hasMore };
  }
  // 学新词：只留「记住了」
  function learnWord(word) {
    const arr = words();
    const w = arr.find(x => x.word === word);
    if (!w) return arr;
    w.level = 1;
    w.nextReview = addDays(todayStr(), 1);
    w.forgotten = false;
    saveWords(arr);
    return arr;
  }
  // 复习：记住→升级间隔；忘了→进遗忘录
  function reviewWord(word, remembered) {
    const arr = words();
    const w = arr.find(x => x.word === word);
    if (!w) return arr;
    const today = todayStr();
    w.wrong = w.wrong || 0;
    if (remembered) {
      w.level = Math.min(6, (w.level || 0) + 1);
      w.nextReview = w.level >= 6 ? null : addDays(today, WORD_INTERVALS[w.level - 1] || 1);
      w.forgotten = false;
    } else {
      w.wrong++;
      w.level = 1;
      w.nextReview = today;
      w.forgotten = true;
    }
    saveWords(arr);
    return arr;
  }
  // 遗忘录里记住了 → 回到已背，重新参与复习
  function recallForgottenWord(word) {
    const arr = words();
    const w = arr.find(x => x.word === word);
    if (!w) return arr;
    w.forgotten = false;
    w.level = 1;
    w.nextReview = addDays(todayStr(), 1);
    saveWords(arr);
    return arr;
  }
  // 本周做过题目的 id（用于每周检测）
  function weeklyQuestionIds(days) {
    days = days || 7;
    const today = todayStr();
    const cutoff = addDays(today, -days);
    const seen = {};
    records().forEach(r => { if (r.date >= cutoff && r.date <= today) seen[r.qid] = true; });
    return Object.keys(seen);
  }

  // ---- 统计 ----
  function stats() {
    const rs = records();
    const correct = rs.filter(r => r.isCorrect).length;
    const wrong = rs.length - correct;
    const answeredQids = {};
    rs.forEach(r => { answeredQids[r.qid] = true; });
    const uniqueAnswered = Object.keys(answeredQids).length;
    const dates = {};
    rs.forEach(r => { dates[r.date] = true; });
    const distinctDays = Object.keys(dates).length;
    return {
      total: rs.length,
      correct: correct,
      wrong: wrong,
      accuracy: rs.length ? Math.round(correct / rs.length * 100) : 0,
      uniqueAnswered: uniqueAnswered,
      distinctDays: distinctDays,
      streak: streak()
    };
  }

  function streak() {
    const dates = {};
    records().forEach(r => { dates[r.date] = true; });
    const dm = diaryMap();
    Object.keys(dm).forEach(d => { if (dm[d] && dm[d].learned) dates[d] = true; });
    let n = 0;
    let cur = new Date(todayStr() + 'T00:00:00');
    while (true) {
      const key = fmtDate(cur);
      if (dates[key]) { n++; }
      else if (n === 0 && key === todayStr()) { /* 今天还没学，看昨天 */ }
      else break;
      cur = new Date(cur.getTime() - 86400000);
    }
    return n;
  }

  function moduleProgress() {
    return META.progressModules.map(function (pm) {
      let total = 0, done = 0;
      if (pm.key === 'mianshi') {
        total = pm.extra || 50; done = 0;
      } else {
        const qs = allQuestions().filter(q => pm.modules.indexOf(q.module) >= 0);
        total = qs.length;
        const answered = {};
        records().forEach(r => { answered[r.qid] = true; });
        done = qs.filter(q => answered[q.id]).length;
      }
      return { key: pm.key, name: pm.name, icon: pm.icon, color: pm.color, total: total, done: done, pct: total ? Math.round(done / total * 100) : 0 };
    });
  }

  function todayStudyTime() {
    const today = todayStr();
    const cnt = records().filter(r => r.date === today).length;
    return +(cnt * 2 / 60).toFixed(1);
  }

  // ---- 云同步：导出 / 导入 ----
  function getSyncData() {
    return {
      records: records(),
      qstate: qstateMap(),
      diary: diaryMap(),
      daily: dailyMap(),
      firstDate: read('yzx.firstDate', null),
      settings: read('yzx.settings', {}),
      plans: plans(),
      ai_history: aiHistory(),
      generated: generated(),
      words: words(),
      rev: read('yzx.rev', 0)
    };
  }
  function applySyncData(data) {
    if (!data) return;
    if (data.records != null) write('yzx.records', data.records);
    if (data.qstate != null) write('yzx.qstate', data.qstate);
    if (data.diary != null) write('yzx.diary', data.diary);
    if (data.daily != null) write('yzx.daily', data.daily);
    if (data.firstDate) write('yzx.firstDate', data.firstDate);
    if (data.settings != null) write('yzx.settings', data.settings);
    if (data.plans != null) write('yzx.plans', data.plans);
    if (data.ai_history != null) write('yzx.ai_history', data.ai_history);
    if (data.generated != null) write('yzx.generated', data.generated);
    if (data.words != null) write('yzx.words', data.words);
    if (data.rev != null) localStorage.setItem('yzx.rev', JSON.stringify(data.rev));
  }

  // ---- 重置 ----
  function resetAll() {
    ['yzx.qstate', 'yzx.records', 'yzx.diary', 'yzx.daily', 'yzx.firstDate', 'yzx.settings',
     'yzx.plans', 'yzx.ai_history', 'yzx.generated', 'yzx.words', 'yzx.daily_words'].forEach(k => localStorage.removeItem(k));
    bumpRev();
  }
  function clearCache() {
    write('yzx.qstate', {});
  }
  // 分类重置
  function resetRecords() { ['yzx.records', 'yzx.qstate', 'yzx.daily', 'yzx.firstDate'].forEach(k => localStorage.removeItem(k)); bumpRev(); }
  function resetWordProgress() {
    const arr = words();
    arr.forEach(w => { w.level = 0; w.nextReview = null; w.wrong = 0; w.forgotten = false; });
    saveWords(arr);
    localStorage.removeItem('yzx.daily_words');
  }
  function deleteWords() { localStorage.removeItem('yzx.words'); localStorage.removeItem('yzx.daily_words'); bumpRev(); }
  function resetDiary() { localStorage.removeItem('yzx.diary'); bumpRev(); }
  function resetPlans() { localStorage.removeItem('yzx.plans'); bumpRev(); }
  function resetGenerated() { localStorage.removeItem('yzx.generated'); bumpRev(); }
  function resetAIHistory() { localStorage.removeItem('yzx.ai_history'); bumpRev(); }
  function resetSettings() { localStorage.removeItem('yzx.settings'); bumpRev(); }

  return {
    allQuestions, getQuestion, questionWithState, questionsOf,
    records, addRecord, wrongBook,
    todayStr, fmtDate, firstDate, dayNumber, weekNumber, daysUntil,
    getDaily, taskProgress,
    getDiary, saveDiary, allDiaries,
    getSettings, saveSettings,
    getUser, setUser, getToken, setToken, clearAuth,
    plans, savePlans, addPlan,
    aiHistory, getAIHistory, saveAIHistory,
    generated, saveGenerated, addGeneratedQuestions,
    words, saveWords, addWords, todayWordPlan, learnWord, reviewWord, recallForgottenWord, openNextWordBatch, weeklyQuestionIds,
    getSyncData, applySyncData,
    stats, moduleProgress, todayStudyTime, streak,
    resetAll, clearCache,
    resetRecords, resetWordProgress, deleteWords, resetDiary, resetPlans, resetGenerated, resetAIHistory, resetSettings
  };
})();
