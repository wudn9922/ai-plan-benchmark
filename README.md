# AI Plan Benchmark

繁體中文、手機優先的 AI 訂閱方案、模型能力與 Coding Agent 比較器。資料欄位把 Chat、一般 Agent、Coding Agent 分開，並分開呈現訂閱月費、API 每百萬 Token 價格與基準任務 API 成本。

## 目前資料狀態

- 方案參考地區為 US，幣別為 USD；每筆方案和額度都保留來源、核對日、窗口、地區及限制。
- Artificial Analysis API 尚未連接：本快照的 `status.json` 標示 `disabled`，前端不會把它說成即時資料。
- Intelligence Index 有少量來自 Artificial Analysis 公開模型頁面的人工核對快照；其他無公開授權數值的模型指標維持 `null`。免費 API 不含逐 benchmark 原始結果或加權分項。
- Coding Agent Index 沒有可用的公開授權 API 匯入端點，使用版本化 JSON 匯入範本。空值不代表 0。
- 官方方案頁內容變更只會產生人工核對警告；監測器不會根據網頁文字自動改寫價格、權限或額度。

## 本機執行

需要 Node.js 22、npm 和 Python 3.12。前端沒有伺服器或瀏覽器 API Key。

```sh
npm ci
npm run dev
```

資料驗證和離線測試：

```sh
python scripts/validate_data.py
npm run test:all
npm run build
```

## Artificial Analysis 免費 API

使用官方文件中的免費模型端點：`GET https://artificialanalysis.ai/api/v2/language/models/free`。目前連接器會讀取分頁、驗證 schema、快取 ETag、檢查九項指數及 `artificial_analysis_intelligence_index_cost.cost_per_task.total_cost`。不會呼叫 Pro-only API。

本機手動更新時，將授權金鑰放在環境變數：

```sh
AA_API_KEY='...' python scripts/update_data.py
```

正式自動更新會優先讀取 GitHub Actions Secret `Artificial_Analysis_API`，並相容讀取既有的 `vars.Artificial_Analysis_API` repository variable。由於這是 API Key，建議存為 Secret；workflow 只會注入 `AA_API_KEY` 環境變數，不會寫入前端或資料快照。不要把 `.env`、Secrets 或 API Key 放入 `public/`、前端程式或 Git。沒有金鑰時，連接器會保留最後一次合法快照，狀態維持停用。

## Coding Agent 資料匯入

複製 `public/data/imports/coding-agents-v1.template.json`，填入官方公開且可核對的版本、模型、reasoning、Harness、來源、分數與成本後，先檢查：

```sh
python scripts/import_coding_agents.py /path/to/reviewed-coding-agents.json
python scripts/validate_data.py
```

匯入器拒絕非官方來源、無限值、負數和缺少組態欄位的紀錄。不同 Harness、benchmark 版本及成本來源類型分開比較。

## 官方方案來源監測

`scripts/source_health.py` 每日讀取快照中的公開官方頁面，使用 ETag / Last-Modified 並保留內容雜湊。若內容變動，會把來源 URL、雜湊變化和人工核對提示寫到 `status.json`；若讀取失敗則顯示警告。它不自動推測或更新方案價格。

完成人工核對後，可清除該來源的待處理提示：

```sh
python scripts/source_health.py --ack SOURCE_ID
```

監測器在來源狀態不變時不改寫資料檔，因此 Actions 不會為每日無變更檢查建立空 commit。

## GitHub Pages

`.github/workflows/update-and-deploy.yml` 每日 UTC 04:17 檢查 API 和官方方案來源，通過資料驗證、Python/前端測試後建立靜態網站，並把有變更的 JSON 快照提交到目前 repository。

部署到獨立 repository 前：

1. 把此專案放進獨立 repository（例如 `ai-plan-benchmark`），不要放進其他既有產品 repo。
2. 在 **Settings → Pages** 設定建置來源為 **GitHub Actions**。
3. 可選擇新增 `Artificial_Analysis_API` Actions Secret（或使用相容的同名 repository variable）以啟用官方免費 API 更新；不設定時前端會標示停用。
4. 在 **Actions** 手動執行 `Update data and deploy`；每日排程之後會自動執行。

目前工作區沒有連接 GitHub repository，故尚未建立 PR 或部署網站網址。
