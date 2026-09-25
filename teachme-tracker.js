/**
 * teachme-tracker.js — 学习进度追踪 v3.1
 * 
 * 引用在所有 课程.html 和 答案.html 中，自动添加"标记已学"按钮。
 * 完成状态存储在 localStorage（key: teachme_complete_lesson{NN}）。
 * 自含样式，无需依赖 ai-grader.js。
 * 
 * v3.1: normalizeLessonId() 统一 lessonId 写法（55 / '55' / 'lesson55' → 'lesson55'），
 *       修复 L43+ 课程"标记已学"后目录页不显示完成状态的问题。
 * v3: 自含 ag-btn 样式 + 更健壮的 lessonId 检测 + 向后兼容。
 */
(function() {
  'use strict';

  const STORAGE_PREFIX = 'teachme_complete_';

  // ====== 自含按钮样式（不依赖 ai-grader.js）======
  function injectStyles() {
    if (document.getElementById('teachme-tracker-styles')) return;
    const style = document.createElement('style');
    style.id = 'teachme-tracker-styles';
    style.textContent = `
      .tm-btn { padding: .45rem 1.2rem; border-radius: 8px; font-size: .875rem; font-weight: 600; border: none; cursor: pointer; transition: all .15s; display: inline-flex; align-items: center; }
      .tm-btn-outline { background: transparent; color: #4f6ef7; border: 1.5px solid #4f6ef7; }
      .tm-btn-outline:hover { background: #f0f4ff; }
      .tm-btn-success { background: #10b981; color: #fff; }
      .tm-btn-success:hover { background: #059669; }
      .tm-btn-back { display: inline-flex; align-items: center; gap: .4rem; margin-top: 1.5rem; padding: .5rem 1rem; background: #4f6ef7; color: #fff; border-radius: 8px; text-decoration: none; font-size: .875rem; font-weight: 500; transition: background .15s; }
      .tm-btn-back:hover { background: #3d5ce5; }
    `;
    document.head.appendChild(style);
  }

  // 统一 lessonId 写法：55 / '55' / 'lesson55' → 'lesson55'
  // （目录页用 data-lesson="lessonNN" 读取同一 localStorage 键，格式必须一致）
  function normalizeLessonId(raw) {
    if (raw === null || raw === undefined || raw === '') return null;
    const s = String(raw).trim();
    if (/^\d+$/.test(s)) return 'lesson' + s.padStart(2, '0');
    return s;
  }

  function getLessonId() {
    // 1) 优先从 LESSON_ANSWERS 获取
    if (window.LESSON_ANSWERS && window.LESSON_ANSWERS.lessonId) {
      return normalizeLessonId(window.LESSON_ANSWERS.lessonId);
    }
    // 2) 从 localStorage 的 teachme_lesson{NN} 键推断
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('teachme_lesson')) {
        return normalizeLessonId(key.replace('teachme_lesson', 'lesson'));
      }
    }
    // 3) 从页面 title 或 URL 推断
    const title = document.title || '';
    const m = title.match(/[Ll]esson\s*(\d+)/);
    if (m) return normalizeLessonId(m[1]);
    return null;
  }

  function getStorageKey() {
    const id = getLessonId();
    if (!id) return null;
    return STORAGE_PREFIX + id;
  }

  function isCompleted() {
    const key = getStorageKey();
    if (!key) return false;
    return localStorage.getItem(key) !== null;
  }

  function markCompleted() {
    const key = getStorageKey();
    if (key) {
      localStorage.setItem(key, new Date().toLocaleString('zh-CN'));
    }
  }

  function unmarkCompleted() {
    const key = getStorageKey();
    if (key) {
      localStorage.removeItem(key);
    }
  }

  function injectCompleteBtn() {
    const lessonId = getLessonId();
    if (!lessonId) return;

    // 先注入自含样式
    injectStyles();

    // 找到按钮组容器
    const btnGroup = document.querySelector('.btn-group');
    if (!btnGroup) return;

    // 避免重复注入
    if (document.getElementById('teachme-complete-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'teachme-complete-btn';

    if (isCompleted()) {
      btn.className = 'tm-btn tm-btn-success';
      btn.textContent = '✅ 已学';
      btn.title = '点击取消已学标记';
      btn.onclick = function() {
        if (confirm('取消"已学"标记？')) {
          unmarkCompleted();
          btn.className = 'tm-btn tm-btn-outline';
          btn.textContent = '📖 标记已学';
          btn.title = '标记本节课为已学';
        }
      };
    } else {
      btn.className = 'tm-btn tm-btn-outline';
      btn.textContent = '📖 标记已学';
      btn.title = '标记本节课为已学';
      btn.onclick = function() {
        markCompleted();
        btn.className = 'tm-btn tm-btn-success';
        btn.textContent = '✅ 已学';
        btn.title = '点击取消已学标记';
      };
    }

    btnGroup.appendChild(btn);
  }

  // ====== 底部"← 目录"按钮 ======
  function injectBottomNav() {
    injectStyles();
    const container = document.querySelector('.container');
    if (!container) return;
    // 避免重复
    if (document.getElementById('teachme-bottom-nav')) return;
    
    const nav = document.createElement('div');
    nav.id = 'teachme-bottom-nav';
    nav.style.cssText = 'margin-top:1.5rem;padding-top:1rem;border-top:1px solid #e8e8ee;text-align:center';
    nav.innerHTML = '<a href="../Content of Lessons.html" class="tm-btn-back">☰ 返回目录</a>';
    container.appendChild(nav);
  }

  // ====== 初始化 ======
  function init() {
    injectCompleteBtn();
    injectBottomNav();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
