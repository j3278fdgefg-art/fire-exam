# 消防設備師士考試教育系統

所有溝通、註解、commit message 一律使用繁體中文。

## 專案概要

純前端網頁＋localStorage，無建置流程、無後端、無相依套件——直接改 HTML/CSS/JS 即生效。
使用者同時準備消防設備師＋士兩種國考。

- 線上版：https://j3278fdgefg-art.github.io/fire-exam/ （GitHub Pages，master 分支根目錄；`git push` 後約一分鐘自動重新部署）
- 本機預覽：`python -m http.server 8901` 或雙擊 start.bat；.claude/launch.json 設定名稱 `fire-exam`

## 檔案結構

- `index.html`　主頁面（導覽列五分頁：總覽／題庫測驗／法規閱讀／日曆／讀書計畫）
- `js/app.js`　　全部前端邏輯（單檔）
- `css/style.css`　Serene Path Education 設計系統（ADHD 友善：藍灰 #446172 主色、鼠尾草綠、暖沙色、低飽和、圓角卡片；設計規範原始檔在使用者 Downloads\stitch_adhd\）
- `data/bank.js(.json)`　題庫：106–115 年測驗題 2000 題＋申論題 296 題
- `data/laws.js(.json)`　四部法規逐條全文 447 條（消防法 act／施行細則 act_detail／設置標準 std／公共危險物品 hazmat，各含 pcode）
- `data/pdf/`　歷屆試題原始 PDF；`tools/`　下載與解析腳本（新年度更新流程見 README）

## 重要實作慣例

- 所有使用者資料存 localStorage key `fireExam`（DEFAULT_STORE 定義欄位：rec 作答、wrong 錯題、lawRead 已讀/跳過、lawNote 條文解釋 HTML、lawStar 星等、schedule 日曆行程、essay、daily）。新增欄位時加進 DEFAULT_STORE 即可（loadStore 會合併舊資料）。
- 「讀書計畫」頁有匯出／匯入 JSON 備份，是跨裝置搬資料的正式管道——改 store 結構時注意相容性。
- 條文解釋為 HTML（contenteditable＋foreColor 上色），儲存與顯示都經 sanitizeNote() 白名單（只留文字/br/字色 span），勿繞過。
- 題庫測驗頁四模式（練習/模擬考/申論/錯題本）共用 #quizBody 容器，由 quizMode 切換；各 render 函式輸出到 quizBody()，不要直接寫 view.innerHTML。
- hash 直達分頁：#quiz #laws #calendar #plan（舊 #practice/#exam/#essay/#wrong 自動導向）。
- 條號連結到全國法規資料庫：LawSingle.aspx?pcode=＆flno=；法規標題連 LawAll.aspx。
- 定時彈題：優先出「已讀」條文的相關考古題，選項重排＝變題（canShuffleChoices 排除「以上皆是」類題目）。
- 個人備份檔（fire-exam-備份-*.json）已 gitignore，含使用者筆記，勿提交。

## 修改流程

1. 動手前先 `git pull`（可能有別台電腦的修改）。
2. 改完在本機預覽驗證。
3. commit（繁中訊息）＋ `git push` → Pages 自動部署。
