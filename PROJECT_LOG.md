# PROJECT_LOG — easy-ledger

接手前先讀這份。給 AI／未來的自己看的，不是給使用者的（使用者看 README 與 docs/ 的 PDF）。

## 一句話定位
零邊際成本的大眾記帳 PWA：打一句話記帳、資料只在使用者瀏覽器、「問 AI」是把摘要文字分享到使用者自己的 AI App。營運者不付任何 AI／伺服器費用。

## 現況（2026-09-20，v0.3.1）
- 上線：https://eaglechu-hub.github.io/easy-ledger/ ；repo `EagleChu-hub/easy-ledger`（公開）
- push `main` → `.github/workflows/deploy.yml` 自動 `npm test` → `GH_PAGES=1 npm run build` → Pages。約 1 分鐘
- 101 個 vitest 全綠；`npm run build` 前會跑 `scripts/clean-dist.mjs`
- 使用說明書：`docs/輕鬆記帳_使用說明書.pdf`（5 頁），由 `python docs/make_manual.py` 產生

## 使用者已拍板的決定（不要再問）
| 議題 | 決定 | 日期 |
|---|---|---|
| AI 分析方式 | 分享摘要到使用者自己的 ChatGPT/Gemini/Claude，不接 API、不 BYOK | 09-19 |
| LINE | 第一版不做；之後用免費官方帳號圖文選單連到網址即可，不做 webhook | 09-19 |
| 技術 | Vite + vanilla TS PWA，不用框架 | 09-19 |
| 介面 | 採用 Claude Design「夜間儀表」（深色、螢光綠、IBM Plex + Noto Sans TC） | 09-19 |
| Google Fonts | 留著（使用者手機感覺不出差別） | 09-20 |
| 未來日期（下週二） | 照日期直接記、立刻計入該月，不做「預定」狀態 | 09-20 |
| 週期規則輸入 | 在「記一筆」直接打「每月 1 號 房租 18500」，設定頁管理 | 09-20 |
| 週期規則編輯 | 要能就地編輯，不是刪掉重打 | 09-20 |

## 架構速覽
```
src/
  parser.ts      規則解析（金額、日期含相對詞、收支、分類）純函式
  recurring.ts   週期規則：parseRecurring / nextOccurrence / occurrencesBetween 純函式
  types.ts       Transaction / RecurringRule 型別與 validate*（寫入層守衛）
  db.ts          Dexie v2：transactions / userRules / settings / recurring；applyDueRecurring 冪等補記
  stats.ts       月彙總、上月比較
  ai-summary.ts  摘要文字＋提示詞
  csv.ts         CSV 匯出匯入（逐列驗證，壞就整批不收）
  ui/            record / month / ai / settings，用 common.ts 的 h() 手刻 DOM
  main.ts        hash 路由、頂欄「本月已花」、啟動與 visibilitychange 觸發補記
```
- 資料變動一律 `window.dispatchEvent(new Event('ledger:changed'))`，頂欄即時更新
- 週期補記冪等靠 `[recurringId+date]` 複合索引；`lastGenerated` 記補到哪天
- 使用者改過分類 → `userRules`（備註關鍵字 → 分類），解析時優先於預設關鍵字表

## 踩過的坑（都已修，別再踩）
1. **CSS 特異度**：全域 `input[type="text"]{width:100%…}` 是 (0,1,1)，設計版 `.amount-input` (0,1,0) 壓不過 → 金額框變 100% 寬、句子擠成一字一行。覆寫一律用 `input.xxx`。
2. **OneDrive 假刪除**：專案在 OneDrive 內，`fs.rmSync('dist')` 回報成功但檔案還在，舊 hash 檔混進 precache。`scripts/clean-dist.mjs` 刪完驗證、失敗改叫 PowerShell `Remove-Item`。
3. **瀏覽器工具的 Return 鍵**：Claude 瀏覽器面板送的 Return 是 `key:""`，不是 `Enter`；App 的 Enter 存檔要用 `new KeyboardEvent('keydown',{key:'Enter'})` 驗。
4. **Dexie EntityTable.add 回傳型別**是 `number|undefined`，要 cast。
5. **PDF（fitz.Story）**：前幾頁 h2 底色會在後頁同座標重播成 3–12pt 矮碎片蓋住文字，skill 的 `strip_bleed_fills` 只清頁首抓不到。`docs/make_manual.py` 的 `strip_stray_bars`：h2 顏色＋高度≤12pt＋沒包住任何文字 → redaction，且要**迴圈到清不出東西**（部分覆蓋會切剩一段）。跨頁表格檢查要先 `html.unescape`，否則 `&nbsp;` 讓列文字對不上而漏報。
6. **CJK 空白壓縮**會吃掉「第 1 步　標題」的全形空白與範例句「上週三 電影 300」的空格 → 標題用冒號、範例用 `&nbsp;`。

## 驗證慣例（交付時分「已完成／未完成／做不到」）
- 新守衛一定要故意打過：改壞一個測試期望看它紅、注入壞資料看被擋、拿掉換頁看跨頁檢查會叫
- 瀏覽器 375px 實測；PDF 每一頁轉 PNG 目視（機器檢核全過不代表沒問題）

## 未做／候選
- LINE 官方帳號圖文選單 → 網址
- 使用者自己用兩週後再決定新功能
- README「部署到 GitHub Pages」段落還寫著手動推 gh-pages，可精簡成「push main 即可」
- 舊 UI 備份 `.backup-v0.1.0-ui/`（gitignore），確認新 UI 沒問題後可刪

## 時間軸
- 09-19 查證 Perplexity 結論與 6 個 GitHub 專案（全部不能直接用）→ 決定自建 → v0.1（46 測試）
- 09-19 套用 Claude Design 介面 → v0.2；建 repo、GitHub Pages 上線
- 09-20 相對日期詞＋週期規則 → v0.3.0；規則就地編輯＋使用說明書 PDF → v0.3.1
