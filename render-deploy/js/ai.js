/* ===== AI 服务：智谱大模型（走 server.js 代理；静态/离线时直连兜底） ===== */
window.AI = (function () {
  const META = window.YZX_META;
  const S = window.Store;
  const ZHIPU_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';

  // 从 AI 返回文本中稳健提取 JSON（容忍 markdown 代码块/前后缀）
  function extractJSON(text) {
    if (!text) return null;
    let s = String(text).trim();
    // 去掉 ```json ... ``` 围栏
    const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) s = fence[1].trim();
    const a = s.indexOf('{');
    const b = s.lastIndexOf('}');
    if (a >= 0 && b > a) s = s.slice(a, b + 1);
    try { return JSON.parse(s); } catch (e) { return null; }
  }

  // 基础调用：messages -> 返回内容字符串
  function chat(messages, model) {
    model = model || S.getSettings().apiModel;
    if (window.Sync.getMode() === 'cloud') {
      // 走后端代理
      const headers = { 'Content-Type': 'application/json' };
      const t = S.getToken();
      if (t) headers['Authorization'] = 'Bearer ' + t;
      return fetch('/api/ai/chat', {
        method: 'POST', headers: headers,
        body: JSON.stringify({ messages: messages, model: model })
      })
        .then(r => r.json().then(j => ({ ok: r.ok, j })))
        .then(({ ok, j }) => {
          if (ok && j.content) return j.content;
          throw new Error((j && j.error) || 'AI 调用失败');
        });
    }
    // 直连兜底
    return fetch(ZHIPU_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + S.getSettings().apiKey
      },
      body: JSON.stringify({ model: model, messages: messages })
    })
      .then(r => r.json().then(j => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (ok && j.choices && j.choices[0]) return j.choices[0].message.content;
        throw new Error((j.error && j.error.message) || 'AI 调用失败');
      });
  }

  function sys(prompt) { return [{ role: 'user', content: prompt }]; }

  // 代码评判
  function judge(question, answer, code) {
    const prompt = META.aiJudgePrompt
      .replace('{question}', question)
      .replace('{answer}', answer)
      .replace('{code}', code);
    return chat(sys(prompt))
      .then(content => {
        const j = extractJSON(content);
        if (j && typeof j.correct === 'boolean') {
          return { correct: j.correct, explanation: j.explanation || '' };
        }
        return { correct: null, explanation: content };
      });
  }

  // 知识点讲解（先学后练）
  function knowledge(topic, question) {
    const prompt = META.aiKnowledgePrompt
      .replace('{topic}', topic)
      .replace('{question}', question || '');
    return chat(sys(prompt));
  }

  // 学习计划/资料 -> 生成题目
  function generate(plan) {
    const prompt = META.aiGeneratePrompt.replace('{plan}', plan);
    return chat(sys(prompt)).then(content => {
      const j = extractJSON(content);
      if (j && Array.isArray(j.topics) && j.topics.length) return j.topics;
      throw new Error('AI 返回内容无法解析（可能输出被截断），请再点一次重试');
    });
  }

  // 主题 -> AI 出题
  function makeQuestions(topic) {
    const prompt = META.aiMakeQuestionsPrompt.replace('{topic}', topic);
    return chat(sys(prompt)).then(content => {
      const j = extractJSON(content);
      return j && j.questions ? j.questions : null;
    });
  }

  // 内容 -> 提取单词/短语
  function extractWords(text) {
    const prompt = META.aiExtractWordsPrompt.replace('{content}', text);
    return chat(sys(prompt)).then(content => {
      const j = extractJSON(content);
      if (j && Array.isArray(j.words)) {
        return j.words.map(w => ({ word: String(w.word || '').trim(), meaning: String(w.meaning || '').trim() })).filter(w => w.word);
      }
      throw new Error('AI 提取结果无法解析');
    });
  }

  return { chat, judge, knowledge, generate, makeQuestions, extractWords };
})();
