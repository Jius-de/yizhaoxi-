/* ===== 元数据：模块配置 / 每日任务模板 / 阶段计划 / 提醒文案 / AI 提示词 =====
 * 已对齐《联通四岗位·完整学习与项目冲刺计划》（2026年8月底 → 11月笔试/面试） */
window.YZX_META = {
  appName: 'Yi-朝夕刷题',
  version: 'V3.0',

  // 模块定义（题目 module 字段 → 显示名）
  modules: {
    xingce_yuyan: { name: '行测·言语理解', icon: '🟡', color: '#ECC94B', source: '粉笔APP' },
    xingce_logic: { name: '行测·逻辑推理', icon: '🟠', color: '#ED8936', source: '粉笔APP/中公题库' },
    c_language:   { name: 'C语言',       icon: '🔵', color: '#4299E1', source: '牛客网' },
    python:       { name: 'Python',      icon: '🟢', color: '#48BB78', source: '牛客网/LeetCode' },
    sql:          { name: 'SQL',         icon: '🟣', color: '#9F7AEA', source: '牛客网SQL篇' },
    linux:        { name: 'Linux/Shell', icon: '🐧', color: '#38B2AC', source: '菜鸟教程/鸟哥' },
    net:          { name: '计算机网络',   icon: '🌐', color: '#3182CE', source: '小林coding/图解TCP/IP' },
    unicom:       { name: '联通企业文化', icon: '🏢', color: '#DD6B20', source: '联通官网/招聘公告' },
    english:      { name: '英语·四级',   icon: '🔤', color: '#ED64A6', source: '自定义导入' },
    other:        { name: '综合/其他',   icon: '📚', color: '#718096', source: '自定义导入' }
  },

  // 进度看板使用的聚合模块
  progressModules: [
    { key: 'xingce', name: '行测', icon: '🟡', color: '#ECC94B', modules: ['xingce_yuyan', 'xingce_logic'] },
    { key: 'c_language', name: 'C语言', icon: '🔵', color: '#4299E1', modules: ['c_language'] },
    { key: 'python', name: 'Python', icon: '🟢', color: '#48BB78', modules: ['python'] },
    { key: 'sql', name: 'SQL', icon: '🟣', color: '#9F7AEA', modules: ['sql'] },
    { key: 'linux', name: 'Linux/Shell', icon: '🐧', color: '#38B2AC', modules: ['linux'] },
    { key: 'net', name: '计算机网络', icon: '🌐', color: '#3182CE', modules: ['net'] },
    { key: 'unicom', name: '联通企业文化', icon: '🏢', color: '#DD6B20', modules: ['unicom'] },
    { key: 'english', name: '英语·四级', icon: '🔤', color: '#ED64A6', modules: ['english'] },
    { key: 'other', name: '综合/其他', icon: '📚', color: '#718096', modules: ['other'] }
  ],

  // 每日任务模板（对齐新计划：去程言语→午休SQL→回程逻辑→晚间Linux/C/Python/编程）
  dailyTemplate: [
    { id: 'xc_yuyan',  label: '行测·言语理解', module: 'xingce_yuyan', type: 'choice', count: 10, source: '粉笔APP',     scene: '去程通勤', color: '#ECC94B', icon: '🟡' },
    { id: 'sql',       label: 'SQL',           module: 'sql',          type: 'choice', count: 3,  source: '牛客网SQL篇', scene: '午休',    color: '#9F7AEA', icon: '🟣' },
    { id: 'xc_logic',  label: '行测·逻辑推理', module: 'xingce_logic', type: 'choice', count: 10, source: '粉笔APP',     scene: '回程通勤', color: '#ED8936', icon: '🟠' },
    { id: 'c_choice',  label: 'C语言选择题',   module: 'c_language',   type: 'choice', count: 10, source: '牛客网',      scene: '晚间',   color: '#4299E1', icon: '🔵' },
    { id: 'linux',     label: 'Linux命令',     module: 'linux',        type: 'choice', count: 5,  source: '菜鸟教程',   scene: '晚间',   color: '#38B2AC', icon: '🐧' },
    { id: 'py_choice', label: 'Python选择题',  module: 'python',       type: 'choice', count: 10, source: '牛客网',      scene: '晚间',   color: '#48BB78', icon: '🟢' },
    { id: 'c_coding',  label: 'C语言编程题',   module: 'c_language',   type: 'coding', count: 1,  source: '牛客网/LeetCode', scene: '晚间', color: '#ED8936', icon: '🟠' },
    { id: 'py_coding', label: 'Python编程题',  module: 'python',       type: 'coding', count: 1,  source: 'LeetCode Easy',  scene: '晚间', color: '#F56565', icon: '🔴' }
  ],

  // 求职冲刺阶段计划（10周 → 4阶段，对齐学习计划第八节）
  phases: [
    { name: '阶段一', time: '9.1 — 9.20', title: '基础夯实 + Linux入门', goal: 'P1监控脚本完成，掌握30+Linux命令', start: '2026-09-01', end: '2026-09-20' },
    { name: '阶段二', time: '9.21 — 10.11', title: '项目实践 + 笔试深化', goal: 'P2指标体系完成，Linux全面掌握', start: '2026-09-21', end: '2026-10-11' },
    { name: '阶段三', time: '10.12 — 11.1', title: '项目收尾 + 笔试冲刺', goal: 'P3方案文档 + P4 AI集成 + 四份简历定稿', start: '2026-10-12', end: '2026-11-01' },
    { name: '阶段四', time: '11.2 — 11.8', title: '全真模拟 + 面试准备', goal: '全套笔试模拟 + 模拟面试 + STAR话术', start: '2026-11-02', end: '2026-11-08' }
  ],

  // 心情标签
  moods: [
    { key: '充实', icon: '😊' },
    { key: '困惑', icon: '🤔' },
    { key: '坚持', icon: '💪' },
    { key: '疲惫', icon: '😴' }
  ],

  // 提醒文案（对齐新计划通勤/午休/晚间安排）
  reminders: {
    morning: '🌅 去程通勤开始，刷10道行测言语理解吧！',
    noon: '☕️ 午休时间，刷2-3道SQL保持手感！',
    evening: '🌙 晚间学习开始：Linux命令 + C/Python编程题练起来！',
    diary: '📖 今天的学习日记还没写哦，花2分钟记录一下吧',
    streak7: '🔥 连续学习7天！你的坚持正在形成习惯！',
    streak14: '🎯 连续学习14天！你已超越90%的人！',
    miss: '📉 昨天没有学习哦，今天补上吧，距离目标还有XXX天',
    wrong: '📌 你有{n}道错题需要复习，本周日记得重练哦'
  },

  // Supabase 云端配置（登录 + 多设备同步；脱离电脑也能用）
  supabase: {
    url: 'https://nzyqhmvbmciymkjsxcpo.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im56eXFobXZibWNpeW1ranN4Y3BvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgwMTMxNjEsImV4cCI6MjEwMzU4OTE2MX0.2NNUDSXph9nX7xklkwqUxwUfZtLIum64wQGrzLK4iaI',
    email: 'jiu@jiu.app'
  },

  // 默认设置（apiKey 作为「离线/静态部署」时直连智谱的兜底；正常走 server.js 后端代理）
  defaultSettings: {
    apiKey: 'a495b6c8bfd04f1bbd232acfc3ce726c.DJQ4jnBg4R9evPvA',
    apiModel: 'glm-4-flash',
    targetDate: '2026-11-08', // 目标日期
    reminders: { enabled: true, morning: true, noon: true, evening: true, weekend: false, diary: true }
  },

  // AI 系统提示词
  systemPrompt: '你是一个学习助手，帮助学生解答：C语言、Python、SQL、Linux/Shell、计算机网络、MQTT/物联网、行测、英语等问题。回答要简洁、准确、易于理解。当用户问题目相关问题时，先给出结论再解释原因。',

  // AI 代码评判提示词（占位符：{question} {answer} {code}）
  aiJudgePrompt: [
    '你是一个代码评判专家。请判断以下用户代码是否正确解决了题目要求。',
    '',
    '【题目】',
    '{question}',
    '',
    '【标准答案参考】',
    '{answer}',
    '',
    '【用户代码】',
    '{code}',
    '',
    '请只以 JSON 格式返回结果（不要包含其他文字）：',
    '{"correct": true/false, "explanation": "简要理由（中文，50字以内）"}'
  ].join('\n'),

  // AI 生成题目提示词（占位符：{plan}）
  aiGeneratePrompt: [
    '请根据下面的学习资料，提炼 3-5 个核心知识点，并为每个知识点出题：',
    '1. 2 道选择题（含 4 个选项 A/B/C/D、正确答案、简短解析，解析控制在 30 字以内）',
    '2. 若该知识点适合出编程题，可加 1 道编程题（C 或 Python）；不适合就省略 coding_question 字段',
    '',
    '学习资料内容：',
    '{plan}',
    '',
    '只输出一个合法且完整的 JSON 对象，不要输出任何其他文字、不要省略字段、不要中途截断：',
    '{"topics":[{"name":"知识点","choice_questions":[{"question":"","options":["A. ","B. ","C. ","D. "],"answer":"A","analysis":""}],"coding_question":{"question":"","answer":"","analysis":"","language":"C"}}]}'
  ].join('\n'),

  // AI 知识点讲解提示词（先学后练，占位符：{topic} {question}）
  aiKnowledgePrompt: [
    '你是一位耐心的老师。请针对下面的知识点做通俗易懂的讲解，帮助学生「先学习、再做题」。要求：',
    '1. 用一句话说清这个知识点是什么',
    '2. 核心概念 / 规则（分点列出）',
    '3. 1 个简单示例（代码或例子）',
    '4. 常见易错点 / 坑',
    '5. 控制在 300 字以内，中文，口语化，像老师讲课',
    '',
    '知识点：{topic}',
    '相关题目：{question}'
  ].join('\n'),

  // AI 出题提示词（占位符：{topic}）
  aiMakeQuestionsPrompt: [
    '请根据以下知识点/主题，生成 3 道选择题和 1 道编程题（编程题语言限 C 或 Python）。',
    '选择题需包含 4 个选项（A/B/C/D）、正确答案、解析；编程题需包含题目、参考答案、解析。',
    '',
    '主题：{topic}',
    '',
    '请只以 JSON 格式返回结果（不要包含其他文字）：',
    '{',
    '  "questions": [',
    '    {"type":"choice","question":"","options":["A. ","B. ","C. ","D. "],"answer":"A","analysis":""},',
    '    {"type":"coding","question":"","answer":"","analysis":"","language":"C"}',
    '  ]',
    '}'
  ].join('\n'),

  // AI 提取单词/短语提示词（占位符：{content}）
  aiExtractWordsPrompt: [
    '请从下面的英语学习内容中，识别并提取所有单词和短语（含多词短语，如 give up、take part in、look forward to、in terms of 等），并给出对应中文释义。',
    '',
    '要求：',
    '1. 保留多词短语，不要把 give up 拆成 give 和 up',
    '2. 跳过纯说明文字、标题、例句、编号',
    '3. 释义准确、简洁',
    '',
    '内容：',
    '{content}',
    '',
    '只返回合法完整的 JSON（不要其他文字、不要截断）：',
    '{"words":[{"word":"give up","meaning":"放弃"},{"word":"abandon","meaning":"放弃"}]}'
  ].join('\n'),

  // AI 快捷提问
  quickAsks: [
    '为什么选这个答案？',
    '这个知识点能再详细解释一下吗？',
    '有没有类似的题目？',
    '帮我总结一下这道题涉及的考点'
  ]
};
