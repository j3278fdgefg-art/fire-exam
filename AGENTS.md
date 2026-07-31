# 給 AI 開發代理的說明

完整的專案脈絡、架構、開發慣例與部署流程都寫在 [CLAUDE.md](CLAUDE.md)，動手前請先完整閱讀該檔案並遵守其中規則。

重點速覽：

- 所有溝通、註解、commit message 一律**繁體中文**。
- 純前端＋localStorage，無建置流程；改 `js/app.js`／`css/style.css` 即生效。
- 修改流程：先 `git pull` → 本機驗證（`python -m http.server 8901`）→ commit → `git push`（自動部署 GitHub Pages）。
- 改到 `api/` 時另需 `vercel deploy --prod`。
- 雲端同步有多條防呆規則（見 CLAUDE.md「雲端同步」節），修改前務必理解，勿破壞。
