# 自動回歸測試

GitHub Actions `Regression` 在所有 PR、main push 與手動觸發時執行。
使用 Ubuntu 24.04、Node 22.22.0 與 package.json 指定的 pnpm 11.25.0；
以 `pnpm install --frozen-lockfile` 安裝，不修改 lockfile。

## 與 CI 相同的順序

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test:unit
pnpm build
pnpm test:api
```

- `typecheck`：全專案 TypeScript，不以建置成功代替型別檢查。
- `test:unit`：所有 `tests/*.test.ts`，包含出席／匯入／同日帶入、考試檢查／歷史判定、
  跨節／同步、姓名遮罩，以及測試 HTTP 的本機限制和禁止重新導向。
  Linux 另以替身程序驗證執行器成功、失敗與 SIGTERM 中斷三條路徑，包括環境／設定
  白名單、獨立 state、非零結束碼、日誌完整寫入，以及不回應 SIGTERM 的子孫程序清理。
  共用 fixture 獨立存放，避免匯入另一個測試檔而重複計數。
- `build`：沿用既有 `pnpm build` 的正式 Worker 建置，不發布。
- `test:api`：執行 `api.mjs`、`carry-forward.mjs`、`admin-data.mjs`、`lifecycle.mjs`。
  每組各自從空白 D1 開始，不依賴執行順序、既有名冊或登入狀態。

## D1 隔離

`scripts/test-api-local.mjs` 在系統臨時目錄為每組測試產生獨立 config、state 和
隨機測試密碼／PBKDF2 雜湊。依 Drizzle journal 順序套用全部 migration，並檢查
沒有遺漏 SQL 檔。每條 D1 指令與 Worker 啟動都明確指定 `--local`、`--config`
和 `--persist-to`；僅使用假的資料庫 ID，binding 明確設為 `remote: false`。

測試 config 僅選取建置的 entry、相容性設定與靜態資產；不複製正式 vars、
services、帳戶、路由或其他 binding。子程序使用白名單環境、獨立 XDG 設定目錄，
不繼承 Cloudflare 權杖、代理設定、TEST_URL、測試密碼或網站環境變數，亦不讀取
checkout 的 `.env` / `.dev.vars`。不需要 GitHub secrets 或 Cloudflare 帳戶登入。

Worker 只綁定 `127.0.0.1` 的臨時 port。等待 `/api/bootstrap` 成功且確認考試清單
為空後才執行測試；HTTP 請求只允許同一個本機 origin，禁止 redirect，並設有逾時。
最後停止 Worker 並移除臨時資料，即使失敗也清理；Linux 收到 SIGINT／SIGTERM 時，
會等待所有測試／Worker 程序群組與日誌完成，五秒後強制停止未退出的程序，
再移除臨時資料並以 130／143 結束。Runner 遭 SIGKILL 強制終止時，由 GitHub
丟棄該虛擬機。所有學生、老師、年度資料和點名皆為合成資料。

既有 `node tests/api.mjs` 等單檔指令仍支援本機測試網站，**不負責隔離其資料庫**；
會修改資料的測試應優先使用上述 `pnpm test:api`。

## 失敗診斷與邊界

Actions 步驟保留非零結束碼，沒有允許失敗或跳過 API 的 fallback。工作最長 20 分鐘；
API 子程序、啟動與 HTTP 各自有限時。`regression-logs-*` artifact 保留 7 天，包含
`test-results/` 的安裝、型別、單元、建置及各組 migration／Worker／API 日誌。
API 斷言會標明 HTTP method、API path 與回應；可從對應 suite 的 `*-tests.log`
及 `*-server.log` 查起。不上傳資料庫、config、環境檔或正式資料。

CI 只有 contents:read 權限，不保存 checkout 憑證，不部署、不變更 GPT Sites 流程。
通過代表合成資料在本機 workerd/D1 與目前規則下通過；不代表正式 D1 既有資料／
migration、GPT Sites 身分與網路、瀏覽器 UI、實際 Excel 或校方作業的完整驗收。
