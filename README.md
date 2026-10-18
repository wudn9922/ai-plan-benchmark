# AI Plan Benchmark

繁體中文、手機優先的 AI 訂閱方案、模型能力與 Coding Agent 比較器。資料欄位把 Chat、一般 Agent、Coding Agent 分開，並分開呈現訂閱月費、API 每百萬 Token 價格與基準任務 API 成本。

## 目前資料狀態

- 方案參考地區為 US，幣別為 USD；每筆方案和額度都保留來源、核對日、窗口、地區及限制。
- 最近一次成功的 Artificial Analysis API 檢查（2026-10-18 16:20 UTC）取得 706 個模型；快照保留九項指數空值，不會把缺少分數補成 0。workflow 的後續即時狀態見 `public/data/status.json`。
- 最近一次已發布快照中，696 個模型有綜合智能指數，198 個有官方智能評測每任務 API 成本；API 免費端點不含完整底層 benchmark 結果或所有加權分項。
- 程式代理資料使用版本化 JSON 匯入流程；目前 28 組官方組態有指數、每任務成本、總詞元和執行時間。官方未公開輸入／快取／輸出詞元分拆的組態維持空值。
- 方案資料涵蓋 OpenAI、Anthropic、Google、xAI 四家公司，共 13 個方案與 63 筆分開分類的 Chat／Agent／Coding Agent 額度觀察；xAI Super、Ultra 標為超過 $30 的參考方案。
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

正式自動更新只讀取 GitHub Actions Secret `Artificial_Analysis_API`。GitHub repository variable 不是 Secret，因此不會作為 API 金鑰使用；若金鑰目前存在於 Variable，需將同一把金鑰移至 Actions Secrets 才會啟用 API 自動更新。金鑰不會寫入前端或資料快照。不要把 `.env`、Secrets 或 API Key 放入 `public/`、前端程式或 Git。沒有 Secret 時，連接器會保留最後一次合法快照，狀態顯示停用。

## Coding Agent 資料匯入

複製 `public/data/imports/coding-agents-v1.template.json`，填入官方公開且可核對的版本、模型、reasoning、Harness、來源、分數與成本後，先檢查：

```sh
python scripts/import_coding_agents.py /path/to/reviewed-coding-agents.json
python scripts/validate_data.py
```

匯入器拒絕非官方來源、無限值、負數和缺少組態欄位的紀錄。每筆 Coding Agent 資料是一組完整的模型、推理強度、執行框架與測試環境設定；效率表只在同一評測版本及成本來源類型中比較組態，不把差異歸因於單一模型。

## 官方方案來源監測

`scripts/source_health.py` 每日讀取快照中的公開官方頁面，使用 ETag / Last-Modified 並保留內容雜湊。若內容變動，會把來源 URL、雜湊變化和人工核對提示寫到 `status.json`；若讀取失敗則顯示警告。它不自動推測或更新方案價格。

完成人工核對後，可清除該來源的待處理提示：

```sh
python scripts/source_health.py --ack SOURCE_ID
```

監測器在來源狀態不變時不改寫資料檔，因此 Actions 不會為每日無變更檢查建立空 commit。

## GitHub Pages

`.github/workflows/update-and-deploy.yml` 每日 UTC 04:17 檢查 API 和官方方案來源，通過資料驗證、Python/前端測試後建立靜態網站，並把有變更的 JSON 快照提交到目前 repository。

此專案的獨立 repository：<https://github.com/wudn9922/ai-plan-benchmark>。目前網站：<https://wudn9922.github.io/ai-plan-benchmark/>。

Workflow 會在推送到 `main`、手動執行及每日 UTC 04:17 時驗證、建置並部署。GitHub Pages 建置來源須設為 **GitHub Actions**；部署失敗時以 workflow run 結果為準。

若尚未設定 `Artificial_Analysis_API` Actions Secret，靜態頁仍可部署並提供最後一份核對快照，但官方 API 更新會維持停用。
