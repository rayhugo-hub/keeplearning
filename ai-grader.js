/**
 * ai-grader.js — AI 评分引擎 v2
 * 
 * 用法：在课程 HTML 中嵌入 LESSON_ANSWERS 数据后引用本脚本：
 * 
 *   <script>
 *   window.LESSON_ANSWERS = {
 *     lessonId: 'lesson01',
 *     title: '...',
 *     feynman: [
 *       { q: 1, ref: '参考答案文字' },
 *       { q: 2, ref: '参考答案文字' },
 *       { q: 3, ref: '参考答案文字' }
 *     ],
 *     mcq: { mc1: 'B', mc2: 'B', mc3: 'C' }
 *   };
 *   </script>
 *   <script src="../ai-grader.js"></script>
 *
 * v2 改进：不依赖 AI API 也可完成选择题本地即时评分，
 * AI 评分作为可选升级（需配置 API Key）。
 */

(function () {
  'use strict';

  // ====== 默认配置 ======
  const PROVIDERS = {
    deepseek: {
      endpoint: 'https://api.deepseek.com/v1/chat/completions',
      model: 'deepseek-chat',
      label: 'DeepSeek'
    },
    openai: {
      endpoint: 'https://api.openai.com/v1/chat/completions',
      model: 'gpt-4o-mini',
      label: 'OpenAI'
    },
    ollama: {
      endpoint: 'http://localhost:11434/v1/chat/completions',
      model: 'qwen2.5:7b',
      label: 'Ollama（本地）'
    },
    openrouter: {
      endpoint: 'https://openrouter.ai/api/v1/chat/completions',
      model: 'deepseek/deepseek-chat',
      label: 'OpenRouter'
    }
  };

  const STORAGE_PREFIX = 'teachme_grader_';
  const DEFAULT_PROVIDER = 'deepseek';

  let config = loadConfig();

  function loadConfig() {
    return {
      provider: localStorage.getItem(STORAGE_PREFIX + 'provider') || DEFAULT_PROVIDER,
      apiKey: localStorage.getItem(STORAGE_PREFIX + 'apiKey') || '',
      endpoint: localStorage.getItem(STORAGE_PREFIX + 'endpoint') || '',
      model: localStorage.getItem(STORAGE_PREFIX + 'model') || ''
    };
  }

  function saveConfig() {
    localStorage.setItem(STORAGE_PREFIX + 'provider', config.provider);
    localStorage.setItem(STORAGE_PREFIX + 'apiKey', config.apiKey);
    localStorage.setItem(STORAGE_PREFIX + 'endpoint', config.endpoint);
    localStorage.setItem(STORAGE_PREFIX + 'model', config.model);
  }

  function getEffectiveConfig() {
    const p = PROVIDERS[config.provider];
    if (!p) return null;
    return {
      endpoint: config.endpoint || p.endpoint,
      model: config.model || p.model,
      apiKey: config.apiKey,
      providerLabel: p.label
    };
  }

  // ====== 注入 UI ======
  function injectAll() {
    if (!document.querySelector('.btn-group')) return;

    injectButtons();
    injectConfigPanel();
    injectResultsPanel();
    addStyles();
  }

  function addStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .ag-btn { padding: .45rem 1.2rem; border-radius: 8px; font-size: .875rem; font-weight: 600; border: none; cursor: pointer; transition: all .15s; }
      .ag-btn-primary { background: #4f6ef7; color: #fff; }
      .ag-btn-primary:hover { background: #3d5bd9; }
      .ag-btn-primary:disabled { background: #a0b4f7; cursor: not-allowed; }
      .ag-btn-outline { background: transparent; color: #4f6ef7; border: 1.5px solid #4f6ef7; }
      .ag-btn-outline:hover { background: #f0f4ff; }
      .ag-btn-success { background: #10b981; color: #fff; }
      .ag-btn-success:hover { background: #059669; }
      .ag-panel { margin: 1rem 0; padding: 1rem 1.2rem; border-radius: 10px; font-size: .9rem; }
      .ag-loading { text-align: center; padding: 2rem; }
      .ag-loading-spinner { display: inline-block; width: 2rem; height: 2rem; border: 3px solid #e5e7eb; border-top-color: #4f6ef7; border-radius: 50%; animation: ag-spin .6s linear infinite; }
      @keyframes ag-spin { to { transform: rotate(360deg); } }
      .ag-loading-text { margin-top: .8rem; font-size: .9rem; color: #666; }
      .ag-loading-sub { font-size: .8rem; color: #999; margin-top: .3rem; }
      .ag-error { padding: .8rem 1rem; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #dc2626; font-size: .85rem; }
      .ag-card { margin-bottom: .8rem; padding: .8rem 1rem; background: #fff; border-radius: 8px; border: 1px solid #e5e7eb; }
      .ag-card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: .3rem; }
      .ag-card-title { font-weight: 600; font-size: .9rem; }
      .ag-card-score { font-size: 1.1rem; font-weight: 700; }
      .ag-card-dims { display: flex; gap: .8rem; font-size: .78rem; color: #666; margin-bottom: .3rem; }
      .ag-card-feedback { font-size: .85rem; color: #444; line-height: 1.6; }
      .ag-total { text-align: center; padding: .8rem; background: #fff; border-radius: 8px; border: 2px solid #4f6ef7; margin-top: .5rem; }
      .ag-total-label { font-size: .85rem; color: #666; }
      .ag-total-score { font-size: 2rem; font-weight: 700; color: #4f6ef7; }
      .ag-total-max { font-size: .85rem; color: #666; }
      .ag-summary { padding: .8rem 1rem; background: #f0f4ff; border-radius: 8px; font-size: .85rem; line-height: 1.7; color: #444; margin-top: .5rem; }
      .ag-summary strong { color: #4f6ef7; }
      .ag-toast { position: fixed; bottom: 2rem; left: 50%; transform: translateX(-50%); background: #1a1a2e; color: #fff; padding: .6rem 1.2rem; border-radius: 8px; font-size: .85rem; z-index: 9999; box-shadow: 0 4px 12px rgba(0,0,0,.2); }
      /* 本地评分样式 */
      .ag-mcq-local { margin-top: .5rem; }
      .ag-mcq-local-item { font-size: .85rem; padding: .2rem 0; }
      .ag-mcq-correct { color: #2e7d32; font-weight: 500; }
      .ag-mcq-wrong { color: #c62828; font-weight: 500; }
      .ag-local-score { margin: .8rem 0; padding: .6rem 1rem; background: #e8f5e9; border-radius: 8px; font-size: .9rem; font-weight: 500; border-left: 4px solid #4caf50; }
      .ag-feynman-copy { background: #f4f4f8; border-radius: 8px; padding: .8rem 1rem; margin: .8rem 0; font-size: .85rem; white-space: pre-wrap; line-height: 1.5; }
      .ag-ai-hint { margin: .5rem 0; padding: .6rem 1rem; background: #fff8e1; border-radius: 8px; font-size: .9rem; border-left: 4px solid #ffc107; }
    `;
    document.head.appendChild(style);
  }

  function injectButtons() {
    const btnGroup = document.querySelector('.btn-group');
    if (!btnGroup) return;

    // 避免二次注入
    if (document.getElementById('agGradeBtn')) return;

    // 移除旧的"提交评分"按钮，由 startGrading 替代
    btnGroup.querySelectorAll('button').forEach(b => {
      if (b.textContent.includes('评分') && !b.textContent.includes('AI')) {
        b.remove();
      }
    });

    // 主提交评分按钮
    const gradeBtn = document.createElement('button');
    gradeBtn.className = 'ag-btn ag-btn-primary';
    gradeBtn.id = 'agGradeBtn';
    gradeBtn.textContent = '📝 提交评分';
    gradeBtn.onclick = startGrading;
    btnGroup.appendChild(gradeBtn);

    // 标准答案按钮（如果没有）
    if (!btnGroup.querySelector('[href*="答案.html"]')) {
      const ansBtn = document.createElement('a');
      ansBtn.className = 'ag-btn ag-btn-outline';
      ansBtn.href = '答案.html';
      ansBtn.textContent = '📖 标准答案';
      ansBtn.style.textDecoration = 'none';
      ansBtn.style.display = 'inline-flex';
      ansBtn.style.alignItems = 'center';
      btnGroup.appendChild(ansBtn);
    }

    // 配置按钮
    const cfgBtn = document.createElement('button');
    cfgBtn.className = 'ag-btn ag-btn-outline';
    cfgBtn.id = 'agConfigBtn';
    cfgBtn.textContent = '⚙️ 配置';
    cfgBtn.onclick = toggleConfig;
    btnGroup.appendChild(cfgBtn);
  }

  function injectConfigPanel() {
    if (document.getElementById('agConfigPanel')) return;

    const panel = document.createElement('div');
    panel.id = 'agConfigPanel';
    panel.className = 'ag-panel';
    panel.style.cssText = 'display:none;background:#f5f3ff;border:1px solid #ddd6fe';

    const provOptions = Object.entries(PROVIDERS).map(([key, p]) =>
      `<option value="${key}" ${key === config.provider ? 'selected' : ''}>${p.label}</option>`
    ).join('');

    const prov = PROVIDERS[config.provider];

    panel.innerHTML = `
      <div style="font-weight:600;margin-bottom:.6rem;font-size:.95rem">⚙️ AI 评分设置</div>
      <div style="font-size:.82rem;color:#666;margin-bottom:.7rem">
        💡 选择题已自动本地评分，无需配置。<br>
        配置 API Key 后可同时获得<strong>费曼题 AI 自动评分</strong>。
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:.6rem;margin-bottom:.6rem">
        <div>
          <label style="font-size:.8rem;color:#555;display:block;margin-bottom:.2rem">API 提供商</label>
          <select id="agProvider" style="width:100%;padding:.4rem .5rem;border:1px solid #d4d4de;border-radius:6px;font-size:.85rem">
            ${provOptions}
          </select>
        </div>
        <div>
          <label style="font-size:.8rem;color:#555;display:block;margin-bottom:.2rem">模型（可选，留空用默认）</label>
          <input type="text" id="agModel" placeholder="${prov ? prov.model : ''}" value="${config.model}"
            style="width:100%;padding:.4rem .5rem;border:1px solid #d4d4de;border-radius:6px;font-size:.85rem">
        </div>
      </div>

      <div style="margin-bottom:.6rem">
        <label style="font-size:.8rem;color:#555;display:block;margin-bottom:.2rem">API Key</label>
        <div style="display:flex;gap:.5rem">
          <input type="password" id="agApiKey" placeholder="sk-..." value="${config.apiKey}"
            style="flex:1;padding:.4rem .5rem;border:1px solid #d4d4de;border-radius:6px;font-size:.85rem">
          <button id="agSaveKey" class="ag-btn ag-btn-primary" style="padding:.4rem .9rem;font-size:.82rem">保存</button>
        </div>
      </div>

      <div style="margin-bottom:.6rem;display:none" id="agCustomEndpointWrap">
        <label style="font-size:.8rem;color:#555;display:block;margin-bottom:.2rem">自定义 Endpoint</label>
        <input type="text" id="agEndpoint" placeholder="https://..." value="${config.endpoint}"
          style="width:100%;padding:.4rem .5rem;border:1px solid #d4d4de;border-radius:6px;font-size:.85rem">
      </div>

      <div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.6rem;font-size:.8rem;color:#888">
        <span>💡 选 DeepSeek → <a href="https://platform.deepseek.com/api_keys" target="_blank" style="color:#4f6ef7">获取 Key</a></span>
        <span>🦙 选 Ollama → 不用 Key，填模型名如 qwen2.5:7b</span>
      </div>
    `;

    // 插入到 btn-group 后面
    const btnGroup = document.querySelector('.btn-group');
    if (btnGroup) {
      btnGroup.parentNode.insertBefore(panel, btnGroup.nextSibling);
    }

    document.getElementById('agSaveKey').onclick = saveConfigFromUI;
    document.getElementById('agProvider').onchange = onProviderChange;
    document.getElementById('agModel').oninput = onModelChange;
    document.getElementById('agEndpoint').oninput = onEndpointChange;
    onProviderChange();
  }

  function injectResultsPanel() {
    if (document.getElementById('agResultsPanel')) return;

    const panel = document.createElement('div');
    panel.id = 'agResultsPanel';
    panel.style.cssText = 'display:none;margin-top:1.5rem';

    panel.innerHTML = `
      <div id="agLocalMCQ" class="ag-local-score" style="display:none"></div>
      <div id="agFeynmanCopy" class="ag-feynman-copy" style="display:none"></div>
      <div id="agAIHint" class="ag-ai-hint" style="display:none"></div>
      <div id="agLoading" class="ag-loading" style="display:none">
        <div class="ag-loading-spinner"></div>
        <div class="ag-loading-text">AI 评分中...</div>
        <div class="ag-loading-sub">正在分析你的费曼题答案，请稍候</div>
      </div>
      <div id="agError" class="ag-error" style="display:none"></div>
      <div id="agFeynmanResults" style="display:none"></div>
      <div id="agSummary" style="display:none"></div>
      <div id="agTotal" style="display:none"></div>
    `;

    const btnGroup = document.querySelector('.btn-group');
    if (btnGroup) {
      btnGroup.parentNode.insertBefore(panel, btnGroup.nextSibling);
    }
  }

  // ====== UI 交互 ======

  function toggleConfig() {
    const panel = document.getElementById('agConfigPanel');
    if (panel) panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  }

  function onProviderChange() {
    const prov = document.getElementById('agProvider').value;
    const p = PROVIDERS[prov];
    const endpointWrap = document.getElementById('agCustomEndpointWrap');
    const endpointInput = document.getElementById('agEndpoint');
    const keyInput = document.getElementById('agApiKey');

    if (prov === 'ollama') {
      keyInput.placeholder = '（不需要 Key）';
      keyInput.disabled = true;
      endpointWrap.style.display = 'block';
      endpointInput.placeholder = p.endpoint;
      if (!endpointInput.value) endpointInput.value = 'http://localhost:11434/v1/chat/completions';
    } else {
      keyInput.placeholder = 'sk-...';
      keyInput.disabled = false;
      endpointWrap.style.display = 'none';
    }

    const modelInput = document.getElementById('agModel');
    if (!modelInput.value) modelInput.placeholder = p.model;
  }

  function onModelChange() {
    config.model = document.getElementById('agModel').value.trim();
    saveConfig();
  }

  function onEndpointChange() {
    config.endpoint = document.getElementById('agEndpoint').value.trim();
    saveConfig();
  }

  function saveConfigFromUI() {
    config.provider = document.getElementById('agProvider').value;
    config.apiKey = document.getElementById('agApiKey').value.trim();
    config.model = document.getElementById('agModel').value.trim();
    config.endpoint = document.getElementById('agEndpoint').value.trim();
    saveConfig();
    toast('设置已保存');
  }

  // ====== 核心评分逻辑 ======

  /**
   * 本地选择题评分（无需 API）
   * 返回 { correctCount, totalCount, details }
   */
  function gradeMCQLocal() {
    const refs = window.LESSON_ANSWERS?.mcq || {};
    const names = Object.keys(refs);
    let correctCount = 0;
    const details = [];

    for (const name of names) {
      const correct = refs[name];
      const selected = document.querySelector(`input[name="${name}"]:checked`);
      const studentAns = selected ? selected.value : '(未选)';
      const isCorrect = selected && selected.value === correct;
      if (isCorrect) correctCount++;
      details.push({ name, studentAns, correctAns: correct, isCorrect });
    }

    return { correctCount, totalCount: names.length, details };
  }

  /**
   * 显示本地评分结果
   */
  function displayLocalMCQResult(result, skipAI) {
    const localMCQEl = document.getElementById('agLocalMCQ');
    const feynmanCopyEl = document.getElementById('agFeynmanCopy');
    const aiHintEl = document.getElementById('agAIHint');
    const panel = document.getElementById('agResultsPanel');

    panel.style.display = 'block';

    // 选择题结果
    localMCQEl.style.display = 'block';
    let html = `📊 选择题得分：<strong>${result.correctCount}/${result.totalCount}</strong>`;
    html += '<div class="ag-mcq-local">';
    result.details.forEach(d => {
      const icon = d.isCorrect ? '✅' : '❌';
      const cls = d.isCorrect ? 'ag-mcq-correct' : 'ag-mcq-wrong';
      html += `<div class="ag-mcq-local-item ${cls}">${icon} ${d.name}：你选了 <strong>${d.studentAns}</strong>，正确答案 <strong>${d.correctAns}</strong></div>`;
    });
    html += '</div>';
    localMCQEl.innerHTML = html;

    // 费曼题答案展示
    const refs = window.LESSON_ANSWERS?.feynman || [];
    let feynmanText = '';
    refs.forEach((f, i) => {
      const textarea = document.querySelectorAll('textarea')[i];
      const answer = textarea ? textarea.value.trim() : '(未填写)';
      feynmanText += `【费曼题 Q${f.q}】\n${answer || '（未作答）'}\n\n`;
    });
    feynmanCopyEl.style.display = 'block';
    feynmanCopyEl.textContent = feynmanText.trim();

    // 判断是否有 AI Key
    const hasApiKey = config.provider === 'ollama' || config.apiKey;
    if (skipAI) {
      // 费曼题没作答：不调用 AI（模型只会返回空的 feynman 数组）
      aiHintEl.style.display = 'block';
      aiHintEl.innerHTML = '💡 <strong>费曼题未作答</strong>，本次只评选择题。填写费曼题后再次提交即可获得 AI 评分。';
    } else if (hasApiKey) {
      aiHintEl.style.display = 'none';
      // 有 API Key，继续做 AI 评分
      doAIGrading();
    } else {
      aiHintEl.style.display = 'block';
      aiHintEl.innerHTML = '💡 <strong>想给费曼题自动打分？</strong>点击「⚙️ 配置」设置 API Key 后重新提交，AI 会自动评分。';
    }

    panel.scrollIntoView({ behavior: 'smooth' });
  }

  /**
   * AI 评分（费曼题）- 仅在配置了 API Key 时调用
   */
  async function doAIGrading() {
    const loadingEl = document.getElementById('agLoading');
    const errorEl = document.getElementById('agError');
    const feynmanEl = document.getElementById('agFeynmanResults');
    const summaryEl = document.getElementById('agSummary');
    const totalEl = document.getElementById('agTotal');
    const btn = document.getElementById('agGradeBtn');

    errorEl.style.display = 'none';
    feynmanEl.style.display = 'none';
    summaryEl.style.display = 'none';
    totalEl.style.display = 'none';
    loadingEl.style.display = 'block';

    btn.disabled = true;
    btn.textContent = '评分中...';

    try {
      const answers = collectAnswers();
      const prompt = buildPrompt(answers);
      const result = await callAPI(prompt);
      displayAIResults(result);
    } catch (err) {
      loadingEl.style.display = 'none';
      errorEl.style.display = 'block';
      const msg = String(err && err.message || '');
      const isParseErr = /JSON|Unexpected|Eof/i.test(msg);
      const isAuthErr = /401|403|Insufficient|Balance|Invalid|无权限|Unauthorized/i.test(msg);
      let hint;
      if (isParseErr) {
        hint = '💡 模型返回的格式不符合要求（不是纯评分 JSON），已自动重试一次仍未成功。可再点一次「提交评分」，或 <a href="javascript:toggleConfig()" style="color:#4f6ef7">更换提供商／模型</a>';
      } else if (isAuthErr) {
        hint = '💡 检查 API Key 是否正确、余额是否充足，或 <a href="javascript:toggleConfig()" style="color:#4f6ef7">更换提供商</a>';
      } else {
        hint = '💡 检查网络与 API 配置，或 <a href="javascript:toggleConfig()" style="color:#4f6ef7">更换提供商</a>';
      }
      errorEl.innerHTML = `❌ <strong>AI 评分失败</strong><br>
        <span style="font-size:.82rem">${escapeHtml(msg)}</span>
        <div style="margin-top:.5rem;font-size:.8rem;color:#999">
          ${hint}
        </div>`;
    } finally {
      btn.disabled = false;
      btn.textContent = '📝 提交评分';
    }
  }

  function collectAnswers() {
    const qs = document.querySelectorAll('textarea');
    const feynman = [];
    for (let i = 0; i < qs.length; i++) {
      feynman.push({ q: i + 1, answer: qs[i]?.value?.trim() || '(未填写)' });
    }

    const mcq = {};
    const mcqKeys = window.LESSON_ANSWERS?.mcq || {};
    for (const name of Object.keys(mcqKeys)) {
      const sel = document.querySelector(`input[name="${name}"]:checked`);
      mcq[name] = sel ? sel.value : '(未选)';
    }

    return { feynman, mcq };
  }

  function buildPrompt(answers) {
    const { feynman, mcq } = answers;
    const refs = window.LESSON_ANSWERS || { feynman: [], mcq: {} };
    const totalMCQ = Object.keys(refs.mcq || {}).length;
    const totalFeynman = feynman.length;
    const maxFeynmanScore = totalFeynman * 10;
    const maxMCQScore = totalMCQ;
    const maxTotal = maxFeynmanScore + maxMCQScore;

    let feynmanSection = feynman.map((f, i) => {
      const ref = refs.feynman?.[i];
      const refText = ref?.ref || '(无参考)';
      return `### 费曼题 Q${f.q}\n学生回答：${f.answer}\n参考答案：${refText}`;
    }).join('\n\n');

    let mcqSection = Object.entries(mcq).map(([name, answer]) => {
      const correct = refs.mcq?.[name] || '?';
      return `### 选择题 ${name}\n学生选择：${answer}\n正确答案：${correct}`;
    }).join('\n\n');

    return `你是一位严格但友善的课程评分助教。请根据参考答案对学生的回答评分。

## 评分规则

### 费曼题（每题满分 10 分）
- 理解准确度（0-5 分）：核心概念是否正确，有没有理解偏差
- 表达通俗度（0-3 分）：是否用自己的话讲清楚，没有堆砌术语
- 逻辑完整性（0-2 分）：是否覆盖了问题的关键点

评分标准参考：
- 9-10 分：理解完全正确，表达极其通俗易懂，逻辑完整
- 7-8 分：理解正确，表达较通俗，覆盖大部分关键点
- 5-6 分：理解基本正确，但表达不够通俗或遗漏部分要点
- 3-4 分：理解有偏差，或者表达不清
- 0-2 分：未作答或完全错误

### 选择题（每题 1 分，共 ${totalMCQ} 分）
- 正确得 1 分，错误得 0 分

### 总分
满分 = 费曼题得分(${maxFeynmanScore}) + 选择题得分(${maxMCQScore}) = ${maxTotal} 分

## 学生答案

${feynmanSection}

${mcqSection}

## 输出要求

请严格按以下 JSON 格式输出，只输出 JSON，不要包含任何其他文字：

{
  "feynman": [
    {
      "q": 1,
      "score": <0-10>,
      "accuracy": <0-5>,
      "simplicity": <0-3>,
      "completeness": <0-2>,
      "feedback": "<一两句具体评语，指出哪里好、哪里可以改进>"
    }
  ],
  "mcq": [
    {
      "q": 1,
      "name": "mc1",
      "correct": true/false,
      "studentAnswer": "A",
      "correctAnswer": "B"
    }
  ],
  "totalScore": <总分>,
  "maxScore": ${maxTotal},
  "summary": "<一段鼓励性的总结评语>"
}`;
  }

  /**
   * 大括号配对扫描：从任意文本里抽出所有顶层 JSON 对象（字符串/转义感知）。
   * 处理「JSON 后面又跟了文字或第二个 JSON」这类会导致
   * "Unexpected non-whitespace character after JSON" 的返回。
   */
  function extractJsonObjects(text) {
    const out = [];
    let i = 0;
    while (i < text.length) {
      const start = text.indexOf('{', i);
      if (start < 0) break;
      let depth = 0, inStr = false, esc = false, end = -1;
      for (let j = start; j < text.length; j++) {
        const ch = text[j];
        if (inStr) {
          if (esc) esc = false;
          else if (ch === '\\') esc = true;
          else if (ch === '"') inStr = false;
          continue;
        }
        if (ch === '"') { inStr = true; continue; }
        if (ch === '{') depth++;
        else if (ch === '}') { depth--; if (depth === 0) { end = j; break; } }
      }
      if (end < 0) { out.push(text.slice(start) + '}'.repeat(Math.max(depth, 0))); break; } // 被 max_tokens 截断：补右括号再试
      out.push(text.slice(start, end + 1));
      i = end + 1;
    }
    return out;
  }

  /** 越像「评分结果」得分越高，用于在多个候选对象里挑正确的那个 */
  function scoreShape(obj) {
    if (!obj || typeof obj !== 'object') return -1;
    let s = 0;
    if (Array.isArray(obj.feynman) && obj.feynman.length) {
      s += 4;
      s += Math.min(obj.feynman.filter(f => f && typeof f.score === 'number').length, 3);
    }
    if (obj.mcq && typeof obj.mcq === 'object') s += 1;
    if (typeof obj.totalScore === 'number') s += 2;
    if (typeof obj.summary === 'string' && obj.summary) s += 2;
    return s;
  }

  /**
   * 稳健解析模型返回：直解 → 去 markdown 围栏 → 抽 JSON 对象挑最像评分结果的。
   * 全部失败时抛出带「原始返回开头」的错误，便于在页面上直接定位。
   */
  function parseAIContent(content) {
    const raw = String(content).replace(/^\uFEFF/, '').trim();
    const fenced = raw.replace(/```[a-zA-Z]*/g, '').replace(/```/g, '').trim();

    // 候选顺序：整体直解 → 去围栏后整体 → 逐个抽出的 JSON 对象
    const candidates = [raw];
    if (fenced !== raw) candidates.push(fenced);
    for (const obj of extractJsonObjects(fenced)) candidates.push(obj);

    // 注意：不能「能解析就直接返回」——{"feynman":[],"mcq":[]} 是合法 JSON 但没有任何评分，
    // 必须用 scoreShape 判断它到底是不是一份评分结果，否则页面会静默什么都不显示。
    let best = null, bestScore = 0;
    for (const cand of candidates) {
      let obj;
      try { obj = JSON.parse(cand); } catch (e) { continue; }
      const sc = scoreShape(obj);
      if (sc > bestScore) { bestScore = sc; best = obj; }
    }
    if (best && bestScore >= 3) return best;

    console.warn('[ai-grader] 模型返回无法解析为评分 JSON，原始返回：', content);
    const head = raw.replace(/\s+/g, ' ').slice(0, 300);
    if (best) {
      // 能解出 JSON，但里面没有评分项（模型返回了空骨架，例如 {"feynman":[],"mcq":[]}）
      throw new Error(`模型返回的评分 JSON 里没有评分内容（feynman 为空，可能是未收到有效答案）。原始返回开头：${head}`);
    }
    throw new Error(`模型返回的不是可解析的评分 JSON（已尝试直解／去代码围栏／提取 JSON 对象）。原始返回开头：${head}`);
  }

  /**
   * 调用一次 API；解析失败时自动用更强约束重试一次（strict=true）。
   */
  async function callAPI(prompt) {
    try {
      return await requestOnce(prompt, false);
    } catch (err) {
      const msg = String(err && err.message || '');
      const isParseErr = /JSON|Unexpected|Eof/i.test(msg);
      if (!isParseErr) throw err;
      console.warn('[ai-grader] 首次返回解析失败，自动重试一次：', msg);
      return await requestOnce(prompt, true);
    }
  }

  async function requestOnce(prompt, strict) {
    const cfg = getEffectiveConfig();
    if (!cfg) throw new Error('无效的 API 配置');

    const body = {
      model: cfg.model,
      messages: [
        { role: 'system', content: strict
          ? '你是专业的课程评分助教。只输出一个 JSON 对象：不要输出任何解释性文字，不要使用 markdown 代码围栏，不要在 JSON 前后添加任何内容。'
          : '你是专业的课程评分助教。只输出 JSON 格式的评分结果。' },
        { role: 'user', content: prompt }
      ],
      temperature: strict ? 0.1 : 0.2,
      max_tokens: 3000
    };

    body.response_format = { type: 'json_object' };

    const headers = {
      'Content-Type': 'application/json'
    };

    if (config.provider !== 'ollama' && cfg.apiKey) {
      headers['Authorization'] = `Bearer ${cfg.apiKey}`;
    }

    const response = await fetch(cfg.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      let errMsg = `HTTP ${response.status}`;
      try {
        const err = await response.json();
        errMsg = err.error?.message || JSON.stringify(err);
      } catch (e) {
        errMsg = response.statusText || errMsg;
      }
      throw new Error(`API 请求失败 (${response.status}): ${errMsg}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('AI 返回内容为空');

    window.__lastAIGradingRaw = content;   // 排查用：控制台执行 __lastAIGradingRaw 可看模型原始返回
    return parseAIContent(content);
  }

  function displayAIResults(result) {
    const loadingEl = document.getElementById('agLoading');
    const errorEl = document.getElementById('agError');
    const feynmanEl = document.getElementById('agFeynmanResults');
    const summaryEl = document.getElementById('agSummary');
    const totalEl = document.getElementById('agTotal');

    loadingEl.style.display = 'none';
    errorEl.style.display = 'none';

    // 费曼题结果
    if (result.feynman && result.feynman.length > 0) {
      feynmanEl.style.display = 'block';
      let html = '<h3 style="margin:0 0 .5rem;font-size:1rem;color:#1a1a2e">📝 费曼题评分</h3>';
      result.feynman.forEach(f => {
        const color = f.score >= 8 ? '#16a34a' : f.score >= 5 ? '#ca8a04' : '#dc2626';
        html += `<div class="ag-card" style="border-left:4px solid ${color}">
          <div class="ag-card-header">
            <div class="ag-card-title">📝 费曼题 Q${f.q}</div>
            <div class="ag-card-score" style="color:${color}">${f.score}/10</div>
          </div>
          <div class="ag-card-dims">
            <span>理解准确度 ${f.accuracy}/5</span>
            <span>· 表达通俗度 ${f.simplicity}/3</span>
            <span>· 逻辑完整性 ${f.completeness}/2</span>
          </div>
          <div class="ag-card-feedback">${f.feedback}</div>
        </div>`;
      });
      feynmanEl.innerHTML = html;
    }

    // 总评
    if (result.summary) {
      summaryEl.style.display = 'block';
      summaryEl.className = 'ag-summary';
      summaryEl.innerHTML = `<strong>📌 总评</strong><br>${result.summary}`;
    }

    // 总分
    totalEl.style.display = 'block';
    totalEl.className = 'ag-total';
    totalEl.innerHTML = `
      <div class="ag-total-label">总分</div>
      <div class="ag-total-score">${result.totalScore ?? 0}</div>
      <div class="ag-total-max">/ ${result.maxScore ?? 33} 分</div>
    `;
    totalEl.scrollIntoView({ behavior: 'smooth' });
  }

  /**
   * startGrading — 入口函数（绑定到"提交评分"按钮）
   * 第一步：本地选择题即时评分（无需 API）
   * 第二步：如果有 API Key，自动进行费曼题 AI 评分
   */
  function startGrading() {
    // 检查是否有 LESSON_ANSWERS
    if (!window.LESSON_ANSWERS) {
      toast('错误：找不到课程答案数据（LESSON_ANSWERS）');
      return;
    }

    // 检查用户是否写了费曼题
    const qs = document.querySelectorAll('textarea');
    const allEmpty = Array.from(qs).every(t => !t.value.trim());
    const noMCQSelected = !document.querySelector('input[type="radio"]:checked');

    // 本地选择题评分
    const mcqResult = gradeMCQLocal();

    // 费曼题全部空白：AI 没有内容可评（模型会返回空骨架 {"feynman":[],"mcq":[]} 并附带说明文字，
    // 这正是 2026-09-19 那次「AI 评分失败 Unexpected non-whitespace character ...」的成因），
    // 因此直接只给选择题结果，既避免报错也省一次 API 调用。
    if (allEmpty) {
      displayLocalMCQResult(mcqResult, true);
      toast(noMCQSelected
        ? '请至少填写答案后再提交可获更准确评分'
        : '费曼题未作答，本次只评选择题；填完费曼题再提交即可获得 AI 评分');
      return;
    }

    // 显示本地评分结果
    displayLocalMCQResult(mcqResult);
  }

  // ====== 工具函数 ======

  function toast(msg) {
    const el = document.createElement('div');
    el.className = 'ag-toast';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ====== 启动 ======
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectAll);
  } else {
    injectAll();
  }
})();
