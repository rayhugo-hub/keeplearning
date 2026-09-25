# 保持学习

汽车电子课程自学习应用（PWA），58 节课程，手机端可安装。

## 功能

- 课程阅读 + Mermaid 图表
- 选择题自动判分
- 费曼题（用自己的话复述）
- AI 评分（需自备 API Key，存浏览器本地）
- 学习进度记录（localStorage）
- 离线学习（Service Worker 缓存全部课程）

## 使用

手机浏览器打开后点「添加到桌面」即可安装为应用。首次打开自动缓存全部课程，之后断网也能学。

## 目录结构

- `index.html` — 移动首页（搜索 + 进度 + 课程列表）
- `Lesson01~58/` — 课程内容（课程.html 讲解、答案.html 参考答案）
- `ai-grader.js` — AI 评分
- `teachme-tracker.js` — 进度记录
- `sw.js` / `manifest.webmanifest` — 离线缓存 / PWA 清单
