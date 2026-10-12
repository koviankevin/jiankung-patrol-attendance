# 建功高中巡堂點名

老師依考程選班、登記異常後確認全班。管理者匯入標準 Excel、開放或結案考試，並匯出學生總表與逐筆明細。

## 使用規則

- 老師使用當次考試通行碼與自行填寫的姓名登入，登入有效 12 小時；管理者密碼登入有效 4 小時。
- 未點名學生在確認全班後轉為出席；抽離為初始安排，可依現場更正；免到考保留固定安排。自習不點名，跨節考試只記一次。
- 抽離不代表已在另一考場報到，報表另列是否已確認。
- 同班同場採版本檢查，衝突時需重新載入核對。連線失敗保留本頁修改，尚未儲存的資料不保證跨重新整理保留。
- 開始點名或結案後不得覆蓋名冊。新考試使用新的考試代碼。
- 更換老師通行碼或結案會使既有老師登入失效。管理者可重新開放。
- 共享通行碼不核實老師身分，填寫者姓名僅為操作紀錄。

## 資料與部署

私人 GitHub 儲存庫僅保存程式、空白匯入範本、合成測試資料與資料庫結構。學生資料、密碼、點名紀錄和匯出檔不得提交。

網站部署於 GPT Sites（Cloudflare Workers + D1）。學生資料透過管理者登入後的匯入功能寫入 D1，不包含於程式或公開資產。前台公開登入頁，所有學生查詢與修改均由伺服器驗證。

環境變數 ADMIN_PASSWORD_HASH 為 100000 次 PBKDF2-SHA256 的 salt:hash（salt 為 16 bytes 的 hex 字串，以 UTF-8 參與衍生）；SITE_ORIGIN 為正式網址。管理密碼變更需更新 Sites 私密環境變數並重新部署。不得提交實際值。

## 開發與驗證

Node.js >= 22.13，pnpm 11。執行 pnpm install、pnpm build。開發預覽為 pnpm dev。透過 Sites 外掛的標準流程打包及發布，不使用 GitHub Pages。

- 型別檢查：node node_modules/typescript/bin/tsc --noEmit
- 規則測試：node --experimental-strip-types --test tests/model.test.ts
- API 測試：node tests/api.mjs（僅允許 localhost，使用 TEST_ADMIN_PASSWORD 環境變數或測試專用預設密碼；會建立合成測試考試）
- 本機資料表：先 build 產出 dist/server/wrangler.json，再執行 node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_outgoing_lizard.sql。只對未套用的 migration 執行一次。
- 正式 schema 由 Sites 部署流程套用。程式發布不搬移本機測試資料。

匯出報表應由管理者另行保存備份。網站不是學籍主檔，原始名單及核准考程仍應由校方保存。

