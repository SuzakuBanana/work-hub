# 🌿 浩倫工作站（work-hub）

個人用的工作網站：待辦與進度、筆記（類 Notion）、局處資料彙整、案由／致詞稿範本庫、會議行事曆。

- 🌐 **網站：https://suzakubanana.github.io/work-hub/**
- 📦 程式碼：https://github.com/SuzakuBanana/work-hub
- 🗄️ 資料庫後台：https://supabase.com/dashboard/project/ogghvvfumnnavfbpzdfa

## 架構：程式與資料分開
| 部分 | 放在哪 | 說明 |
|---|---|---|
| 資料 | Supabase 專案 `work-hub`（東京，免費方案） | 雲端 Postgres 資料庫，每筆資料都綁定登入者，只有本人能讀寫（Row Level Security）。 |
| 網站 | `dist/` 靜態檔案 | 純 HTML/CSS/JS，可放任何靜態主機（GitHub Pages、Vercel、Netlify…）。 |

**更新網站＝只換 `dist/` 裡的檔案，資料庫完全不動，所以資料不會消失。**

設定只有一個檔案：`src/config.js`（Supabase 網址與 publishable key）。publishable key 本來就是給前端公開用的；**絕對不要**把 `service_role` / secret key 放進前端。

## 本機開發
```bash
npm install
npm run dev      # 開發模式 http://localhost:5173
npm run build    # 產生 dist/
npm run preview  # 預覽 dist/
```

## 更新流程（自動部署）
1. 修改程式（`src/` 內）→ `npm run build` 本機確認沒問題。
2. `git commit` 後 `git push` 到 `main` 分支。
3. GitHub Actions（`.github/workflows/deploy.yml`）會自動建置並發佈到 GitHub Pages，約 1–2 分鐘後網站更新。
4. **資料庫不會被動到**：部署只換網站檔案，資料都在 Supabase。

`vite.config.js` 的 `base` 設為 `/work-hub/`（對應 Pages 子路徑）；網站使用 `#/` 路由，重新整理不會 404。若改放其他主機的根目錄，建置時設 `VITE_BASE=/`。

## Supabase 登入網址設定
後台 → Authentication → URL Configuration：
- **Site URL**：`https://suzakubanana.github.io/work-hub/`
- **Redirect URLs**：`https://suzakubanana.github.io/work-hub/**`、`http://localhost:5173/**`

## 資料庫規則（很重要）
1. **資料表結構只能透過 migration 變更**（程式更新走 git push；資料庫變更走 migration，兩者分開）。所有資料表結構變更都要寫成 migration（`supabase/migrations/` 內，並用 Supabase 的 migration 機制套用），不要在後台手動改表。
2. **只能「新增」欄位或資料表，不可 `DROP TABLE`、不可刪除欄位、不可 `TRUNCATE`**。要改名或改型別時，先新增新欄位→搬資料→前端改用新欄位，舊欄位保留。
3. 新資料表一律開啟 RLS，政策比照現有表：`(select auth.uid()) = user_id`。
4. 變更後執行 Supabase Security Advisor 檢查。

## 資料表
- `tasks` 待辦：title, description, status(待辦/進行中/完成), priority(高/中/低), due_date, progress(0–100), tags
- `pages` 筆記：title, icon, parent_id（巢狀子頁面）, content（區塊 JSON）, sort_order
- `bureau_submissions` 局處彙整：bureau, topic, period, item, value, unit, status(未繳/已繳/已彙整), submitted_at, note
- `templates` 範本：category(案由/致詞稿/其他), title, body, tags
- `events` 行事曆：title, start_at, end_at, location, note, related_task_id

## 使用小技巧
- 待辦：輸入框打「標題 #標籤」按 Enter 快速新增；看板可拖曳卡片改狀態。
- 筆記：行首打 `# ` `## ` `### ` 變標題、`- ` 項目符號、`1. ` 編號、`[] ` 核取清單、`> ` 引言；空白行打 `/` 叫出區塊選單；自動儲存。
- 範本：內文用 `{{日期}}`、`{{活動名稱}}` 當變數，按「複製」時會讓你填入。
- 局處彙整：點儲存格直接改；「匯出 CSV」會依目前篩選匯出，Excel 開啟不亂碼。

## 備份
Supabase 免費方案沒有自動每日備份可還原，建議定期：局處彙整用「匯出 CSV」，或請管理者用 `pg_dump` 匯出。免費專案若 7 天沒有使用會被暫停（資料仍在，到後台按 Restore 即可恢復）。
