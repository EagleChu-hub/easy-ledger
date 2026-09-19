# 輕鬆記帳 easy-ledger

用一句話記帳、資料只留在你自己手機、想分析時把摘要丟給你自己的 AI。
沒有伺服器、沒有帳號、沒有任何費用。

## 給使用的人

### 怎麼記
打開網頁（或加到主畫面），在「記一筆」輸入：

```
午餐 180
昨天 Uber 245
9/12 Costco 2350
全聯 685 元
薪水 52000
```

手機上點鍵盤的麥克風，用講的也一樣。
App 會自動抓出日期、金額、分類；不確定的會請你選一次，之後就記得了。

### 怎麼看
「本月」分頁：收入、支出、結餘、各分類金額與上月差額、每一筆明細（可改可刪）。

### 怎麼問 AI
「問 AI」分頁會把**本月的彙總數字**（不含每一筆明細、不含你打的原文）整理成一段文字，
按「分享」選你手機上的 ChatGPT / Gemini / Claude，或按「複製」貼過去。
AI 回答什麼、要不要付費，都是你和那個 AI 之間的事，這個 App 不經手、不收費。

### 你的資料在哪裡
- 全部存在**這台裝置的瀏覽器**（IndexedDB），不會上傳到任何地方。
- 因此：清除瀏覽器資料、換手機，紀錄就沒了。**請定期到「設定」匯出 CSV 備份**，換手機後再匯入。
- CSV 可用 Excel / Google 試算表打開。

## 給開發的人

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # vitest：解析器、統計、CSV、AI 摘要
npm run build      # tsc --noEmit + vite build → dist/
npm run preview    # 用正式 build 開 http://localhost:4173（可驗 PWA）
```

### 結構
```
src/
  categories.ts   預設分類與關鍵字（繁中、台灣商家）
  parser.ts       規則解析：金額、日期、收支、分類（純函式）
  types.ts        Transaction 型別與 validateTransaction
  db.ts           Dexie（IndexedDB）：transactions / userRules / settings
  stats.ts        月彙總、上月比較（純函式）
  ai-summary.ts   產生給 AI 的摘要文字與提示詞（純函式）
  csv.ts          匯出／匯入
  ui/             四個分頁：record / month / ai / settings
tests/            對應上面純函式的測試
```

### 介面（v0.2，Claude Design「夜間儀表」）
- 深色優先、螢光綠主色；淺色為對應變體。字型 IBM Plex Sans / Mono + Noto Sans TC，**從 Google Fonts 載入**：離線或被擋時會退回系統字型（`display=swap`），功能不受影響，但每次開啟會對 Google 發一次請求。若要做到「完全不連外」，把 `index.html` 裡三行 `fonts.googleapis.com` 移除即可。
- 存檔鍵固定在分頁列上方的 `#dock`，手機鍵盤升起時就在鍵盤正上方。
- 解析結果是一句話（「今天 花了 🍜 餐飲，記為 午餐」），虛線的字可點著改。
- 低信心時：黃色警示框＋「？分類」＋直接展開分類格；存檔鍵鎖住直到選好。
- 任何改動都會發 `ledger:changed` 事件，頂欄「本月已花」即時更新。
- 全域表單規則 `input[type="text"]` 等特異度是 (0,1,1)，覆寫時要用 `input.xxx` 才壓得過（已踩過一次）。

### OneDrive 注意
專案在 OneDrive 同步資料夾裡，`fs.rmSync` 刪 `dist/` 會回報成功但檔案還在，導致舊 hash 檔殘留進 precache。
`npm run build` 前會自動跑 `scripts/clean-dist.mjs`（驗證刪除、失敗時改用 PowerShell）。

### 設計原則
- **零邊際成本**：靜態檔案即可部署，多一個使用者不多一分錢。
- **AI 不在 App 裡**：App 只產生文字，由使用者自己的 AI 回答；不需要 API key。
- **規則優先**：日常記帳靠關鍵字表就夠準，使用者改過的分類會記成 `userRules`，越用越準。
- **資料驗證在寫入層**：`validateTransaction` 擋掉非整數金額、壞日期、亂型別；CSV 匯入任一列壞就整批不收。

### 部署到 GitHub Pages
```bash
GH_PAGES=1 npm run build   # base 會變成 /easy-ledger/
```
把 `dist/` 推到 `gh-pages` 分支，或用 GitHub Actions。

### 之後可以加、但刻意還沒做
- LINE 官方帳號圖文選單直接連到這個網址（免費方案即可，不需 webhook）
- 多幣別、付款方式、家庭共用帳本
- 跨裝置同步（會需要後端，也就會有成本）
