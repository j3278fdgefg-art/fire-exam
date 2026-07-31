# 消防考試教育系統

消防設備師／消防設備士國考自學系統，純前端網頁，作答紀錄存於瀏覽器 localStorage。

## 使用方式

- **本機**：雙擊桌面「消防考試系統」捷徑（或 `start.bat`），會自動啟動伺服器並開啟瀏覽器；直接雙擊 index.html 也可運作。
- **其他電腦／手機**：開啟 https://j3278fdgefg-art.github.io/fire-exam/ 。程式更新後 `git push` 即自動重新部署。
- **雲端同步**：到「讀書計畫 → 雲端同步」自訂一組同步碼啟用；其他裝置輸入同一組同步碼即自動接續進度（最後寫入者為準，建議一次用一台裝置）。同步後端為 Vercel（fire-exam.vercel.app 的 /api/sync＋私有 Blob）。
- **手動備份**：學習紀錄存在各瀏覽器的 localStorage，「讀書計畫 → 資料備份」可匯出／匯入 JSON。

手動啟動伺服器：

```
python -m http.server 8901 --directory C:\阿喜\AI\fire-exam
```

## 功能

- **題庫測驗**（練習／模擬考／申論題庫／錯題本四模式同頁切換）：
  - 練習模式：106–115 年歷屆測驗題共 2000 題（士四科各 400 題＋師消防法規 400 題），可依科目／年份／未做過／錯過篩選，即時對答案。
  - 模擬考模式：歷屆完整卷或隨機 40 題組卷，計時作答、交卷評分、逐題檢討。
  - 申論題庫：歷屆申論題 296 題（師五科純申論＋士近年申論部分），附作答筆記與自評熟練度。
  - 錯題本／弱點分析：答錯自動收錄，連續答對 2 次移出；依法規統計正確率找弱點。
- **法規閱讀**：四部核心法規逐條閱讀（共 447 條），每條可勾「已讀完」／「不懂，先跳過」，附相關考古題徽章與關鍵字搜尋。每條可寫自己的解釋，儲存後取代原文顯示（原文收合可展開對照），關鍵字搜尋也會搜解釋內容；解釋可對選取文字上色（預設／紅／橘／藍／綠）。每條可點星星標記重要性（1–5 星）。操作按鈕以圖示顯示（✎ 寫解釋／✓ 已讀完／⚠ 先跳過）；點條號可開啟全國法規資料庫該條原文（LawSingle），法規標題旁附全文連結（LawAll）。
- **定時彈題**：開啟後每 N 分鐘自動跳出考古題，優先出「已讀完」條文的相關題，並隨機重排選項作為變題。
- **日曆**：月曆檢視，每天可安排多筆「幾點到幾點做什麼」的讀書行程，可編輯／刪除；標「⭐ 重要」的排程直接顯示在月曆格子上，格子並顯示行程數。
- **讀書計畫**：目標考試日倒數、每日題數目標、連續學習天數、近七日練習量。

## 視覺設計

採用「Serene Path Education」設計系統（Stitch 產出，ADHD 友善）：藍灰主色＋鼠尾草綠＋暖沙色、米白背景、圓角卡片與柔和陰影、低飽和警示色。法規閱讀為左側欄分類＋篩選膠囊版型。字體 Manrope／Plus Jakarta Sans（Google Fonts，離線時退回 Noto Sans TC）。設計規範原始檔在 `C:\Users\長腿叔叔\Downloads\stitch_adhd\`。

## 資料來源與更新

- 試題／答案：考選部考畢試題查詢平臺（wwwq.moex.gov.tw），PDF 存於 `data/pdf/`。
- 法規全文：全國法規資料庫（law.moj.gov.tw）。

新年度試題公布後更新流程：

1. 在 `tools/download_pdfs.py` 的 `EXAM_CODES` 加入新年度考試代碼（至考選部查詢平臺查詢，形如 `116050`）。
2. 依序執行：

```
python tools/download_pdfs.py
python tools/parse_pdfs.py
python tools/fetch_laws.py
python -c "from pathlib import Path; import json; root=Path('C:/阿喜/AI/fire-exam'); (root/'data'/'bank.js').write_text('const BANK = '+(root/'data'/'bank.json').read_text(encoding='utf-8')+';',encoding='utf-8'); (root/'data'/'laws.js').write_text('const LAWS = '+(root/'data'/'laws.json').read_text(encoding='utf-8')+';',encoding='utf-8')"
```

## 檔案結構

```
index.html          主頁面
css/style.css       樣式
js/app.js           全部前端邏輯
data/bank.js(.json) 題庫（測驗題＋申論題）
data/laws.js(.json) 六部法規逐條全文
data/pdf/           歷屆試題原始 PDF（173 檔）
data/manifest.json  PDF 下載清單
tools/              下載與解析腳本
```

## 已知限制

- 師類科除消防法規外為申論題，無官方標準答案，僅提供自評。
- 少數含圖表的題目（如流程圖題）PDF 圖片無法轉為文字，可點「原始考卷」對照。
- 送分題（更正公告一律給分）答案標為 `#`，任選皆算對。
