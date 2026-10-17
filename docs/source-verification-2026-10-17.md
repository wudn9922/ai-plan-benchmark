# 官方來源人工核對紀錄：2026-10-17

本次逐項處理了更新流程提出的 39 個來源警告。內容變更警告先以官方頁面或官方替代頁重新核對；HTTP 狀態碼只描述自動擷取結果，不用來推定方案或產品已停止。

## 核對結果

| 來源 ID | 結果 |
| --- | --- |
| `aa-api-reference` | 已核對 [Free API 文件](https://artificialanalysis.ai/data-api/docs/reference)：免費端點提供主要指數、六項能力指數及部分價格/速度欄位，不含完整 Pro 評測集或全部逐項測試分數。 |
| `aa-coding-agent-import-v1.5-2026-10-17` | 已逐列重查 [Codex 與 Claude Code 官方比較頁](https://artificialanalysis.ai/agents/coding-agents/comparisons/claude-code-vs-codex)：匯入 27 組 Claude Code／Codex 模型與 reasoning 組態；保留三項底層分數、總 Token、時間和每任務成本，未公開的 Token 分拆留空。 |
| `aa-coding-agent-opencode-import-v1.5-2026-10-17` | 已核對 [Claude Code 與 OpenCode 比較頁](https://artificialanalysis.ai/agents/coding-agents/comparisons/claude-code-vs-opencode)：加入 GLM-5.3 組態；以「其他」標示 OpenCode Harness，不套用四家訂閱公司的權益。 |
| `aa-coding-agents` | 已核對 [Coding Agents 頁面](https://artificialanalysis.ai/agents/coding-agents)：現行 v1.5 指數彙整 DeepSWE、Terminal-Bench 與 SWE-Atlas-QnA；Agent、模型及 Harness 是組態分數，與基礎模型 Coding Index 分開。 |
| `aa-coding-method` | 已核對 [Coding Agent 方法頁](https://artificialanalysis.ai/methodology/coding-agents-benchmarking)：v1.5 將 DeepSWE v1.1、Terminal-Bench 4.0、SWE-Atlas-QnA 等權納入；現有兩組組態的三項底層值保留原分。 |
| `aa-free-api` | 已核對 [API 文件](https://artificialanalysis.ai/data-api/docs)及 2026-10-17 14:08:58 UTC 原始回應；API 金鑰由 GitHub Actions 執行環境注入，未進入前端或資料檔。修正 `evaluations` 的完整官方欄位名稱映射後，9 項指數均依 API 實際值匯入；快照含 704 筆 API 模型及 2 筆官方頁面補充模型，共 706 筆。 |
| `aa-method` | 已核對 [Intelligence Index 方法頁](https://artificialanalysis.ai/methodology/intelligence-benchmarking)：現行公開方法為 v4.3.2，10 項測試；API 的 4.3 版本欄與方法頁精度分開保留。 |
| `aa-public-gemini-argon-comparison` | 已重查 [Gemini 4 Argon High 與 GPT-6 Astra Low 比較](https://artificialanalysis.ai/models/comparisons/gemini-4-argon-vs-gpt-6-astra-low)；只採用官方有公開的值，沒有補入未標示項目。 |
| `aa-public-gpt-6-luna-high-comparison` | 已重查 [Gemini 4 Argon High 與 GPT-6 Luna High 比較](https://artificialanalysis.ai/models/comparisons/gemini-4-argon-vs-gpt-6-luna-high)；保留官方能力分數、底層測試及智能評測每任務成本。 |
| `openai-go` | 自動擷取回 403；透過 [ChatGPT Go 官方說明](https://help.openai.com/en/articles/11989085-what-is-chatgpt-go)及目前方案頁核對。美國月繳參考價維持 $8；方案權益及地區可用性以結帳頁為準。 |
| `openai-plus` | 自動擷取回 403；透過 [ChatGPT Plus 官方說明](https://help.openai.com/en/articles/6950777-what-is-chatgpt-plus)核對。美國月繳 $20，沒有年繳方案，模型與訊息量依官方用量頁變動。 |
| `openai-work` | 自動擷取回 403；透過 [Work 與 Codex 官方說明](https://help.openai.com/en/articles/20001275-chatgpt-work-and-codex)及目前方案頁核對。Free／Go 的桌面權益有限，Plus／Pro 有更廣的產品存取。 |
| `openai-work-rollout` | 自動擷取回 403；用[目前方案比較頁](https://chatgpt.com/pricing/?locale=en-US)覆核舊版推出說明。資料採用目前方案頁列出的 Free／Go 有限桌面權益，不沿用過時排除說法。 |
| `openai-agent-mode` | 自動擷取回 403；透過[官方 Agent mode 說明](https://help.openai.com/en/articles/11752874-chatgpt-agent)核對舊 Agent mode 已停用，頁面導向目前 Work 產品。 |
| `openai-current-pricing` | 自動擷取回 403；重查[目前美國方案頁](https://chatgpt.com/pricing/?locale=en-US)。一般文字聊天有防濫用條件；Free／Go 的模型、Work、Codex 與 Deep Research 權益各自不同。 |
| `anthropic-code` | 已核對[目前 Claude Code 方案說明](https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan)；Pro／Max 包含 Claude Code，並與 Claude 對話用量共用；限制會依工作負載變動。來源已改為目前 Help Center 網址。 |
| `anthropic-pro-cost` | 舊 Help Center 網址回 404；已改用[目前 Claude 官方定價頁](https://claude.com/pricing)。Pro 月繳 $20、年繳一次付 $200（月均 $16.67）；價格未含適用稅金。 |
| `anthropic-pricing` | 已核對[Claude 官方定價頁](https://claude.com/pricing)：Free 與 Pro 權益、網頁/桌面/手機可用性、Pro 年繳折扣，以及 Cowork、Research、Claude Code、Chrome 權益。 |
| `openai-codex-usage` | 自動擷取回 403；透過[官方 Codex 用量說明](https://help.openai.com/en/articles/20001516-managing-usage-with-gpt-6-astra-in-work-and-codex)核對五小時窗口、可能的每週限制及依模型分列的 Local message 估計。區間不是保證任務數；Astra 未標示 reasoning effort，資料已移除錯誤的 xHigh 標籤。 |
| `openai-deep-research` | 自動擷取回 403；透過[官方 Deep Research 說明](https://help.openai.com/en/articles/10500283-deep-research-in-chatgpt)與目前方案頁核對 Free／Go 限量、Plus 擴增；沒有固定數據時不填次數。 |
| `openai-flexible-usage` | 自動擷取回 403；透過[官方 Credits 說明](https://help.openai.com/en/articles/12642688)核對加購用量依方案及支援產品而異，與原本的訂閱額度分開記錄。 |
| `google-gemini-limits` | 已核對[Gemini Apps 使用限制](https://support.google.com/gemini/answer/16275805?gl=US&hl=en)：限制隨模型、功能、方案及需求動態變化，未公布固定值的欄位仍為空值。 |
| `gemini-cli-deprecation` | 已核對[Gemini Code Assist 淘汰政策](https://developers.google.com/gemini-code-assist/docs/deprecations)：消費者 Google 帳號的舊 Gemini CLI 登入於 2026-06-18 停止，不作為目前 AI Pro 權益。 |
| `google-annual-plus` | 已重查[Google AI Plus 年繳說明](https://support.google.com/googleone/answer/16548195?hl=en-uk)；美國年費未找到穩定公開數值，年繳欄位維持空值。 |
| `google-annual-pro` | 已重查[Google AI Pro 年繳說明](https://support.google.com/googleone/answer/16476811?hl=en)；美國年費未找到穩定公開數值，年繳欄位維持空值。 |
| `google-one-benefits` | 已核對[Google AI Pro 權益頁](https://support.google.com/googleone/answer/14534406?hl=en)：方案模型、家庭權益及可用範圍依官方頁；動態任務額度未換算成固定次數。 |
| `google-plans` | 已改用[目前 Google AI 方案矩陣](https://one.google.com/about/google-ai-plans/)核對：Plus/Pro 的 Antigravity agent requests 與 Jules task／並行級別分開列示。 |
| `google-student-offer` | 已核對[官方學生優惠公告](https://blog.google/innovation-and-ai/products/gemini-app/student-offer-google-ai/)；資格依國家不同，兌換期限至 2026-12-31，未當成標準牌價。 |
| `google-ai-plus-current` | 已核對[目前 Gemini 美國方案頁](https://gemini.google/subscriptions/?currencyCode=USD)：Plus $4.99／月，列 Gemini 3.6 Flash；Pro $19.99／月並可用 Gemini 4 Argon 與 Pro 模型。已移除錯誤的 Plus→Argon 映射。 |
| `xai-grok-bot` | 已核對[Grok Bot 方案說明](https://docs.x.ai/x-subscription/grok-bot)：只包含於 Premium 與更高層級，使用共用週池，不是額外任務池。 |
| `xai-build` | 已核對[Grok Build CLI 公告](https://x.ai/news/grok-build-cli)；舊版測試資格不足以推定新 X Plus／Premium 權益，CLI 對應維持未確認。 |
| `xai-build-all` | 已核對[Grok Build 網頁及手機版公告](https://x.ai/news/grok-build-for-everyone)；此權益與 CLI 資格分開記錄。 |
| `xai-faq` | 已核對[X Subscription FAQ](https://docs.x.ai/grok/faq)；方案共享用量、切換及帳號權益依當前訂閱規則。 |
| `xai-grok` | 已核對[Grok 官方產品與用量說明](https://docs.x.ai/grok/overview)；未公開固定任務數的欄位不推估成固定量。 |
| `gemini-cli-deprecation-individuals` | 已核對[個人帳號停用細節](https://developers.google.com/gemini-code-assist/docs/deprecations/code-assist-individuals)；個人 Google 帳號登入的舊 CLI 服務已停止，企業/API 認證另計。 |
| `openai-models` | 自動擷取回 403；透過[官方模型權益說明](https://help.openai.com/en/articles/20001354-gpt-6-and-other-models-in-chatgpt)及[目前方案矩陣](https://chatgpt.com/pricing/?locale=en-US)核對。不同方案與 Work／Codex 的模型權限分開映射。 |
| `anthropic-research` | 已核對[Claude Research Help Center](https://support.claude.com/en/articles/11088861-use-research-on-claude)：付費方案可用、與標準對話限制相同但更耗用；目前使用 Opus 5.5，必要時回退 Opus 4.8。 |
| `openai-codex` | 自動擷取回 403；透過[官方 Codex 方案說明](https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan)核對 Local 與 Cloud 使用窗口不同，Local 權益不推定為 Cloud 權益。 |
| `xai-pricing-web` | 已核對[xAI 目前方案頁](https://x.ai/pricing)；美國新自助方案價格與舊 X／SuperGrok 訂閱分開。 |
| `xai-pricing` | 已核對[xAI 官方用量價格文件](https://docs.x.ai/x-subscription/pricing)：Plus $8/月或 $80/年、Premium $30/月或 $300/年；XAI 模型的 Grok/Cursor 用量共用週池，第三方 Cursor 模型另計，稅金可於結帳另加。 |
| `google-jules` | 已核對[Google Jules 官方公告](https://blog.google/innovation-and-ai/models-and-research/google-labs/jules-now-available/)：Jules 已公開推出，AI Pro 比初始存取有更高限制；公告沒有固定任務數，資料仍標示動態／未公布，不以倍數換算任務數。 |

## 403／404 處理

- HTTP 403 只標成「自動擷取受阻」；保留最後一份已核對資料，不推定頁面內容變更或服務下架。本次 11 個 OpenAI 頁面已用瀏覽器可讀的官方頁面核對，會列為非阻斷資訊。
- HTTP 404 只代表該網址目前不存在，可能搬址或撤下；不推定整個方案已停止。本次 Claude Pro 舊網址改為目前 `claude.com/pricing` 官方頁。
- HTTP 429、5xx、逾時及無效回應只更新來源狀態；不覆寫成功快照。只有可成功讀取且內容雜湊改變時，才新增內容待核對項目。
- 人工核對後，將已核對的內容雜湊設為基準；同一個頁面不會每次排程重複提出相同警告。

## 範圍與限制

所有價格及額度比較採美國美元方案。官方沒有公開固定訊息／任務數的項目仍標示動態或未公布；本紀錄不把 API 基準測試成本換算為訂閱任務額度。頁面來源失效時，以目前官方來源替代；若沒有可驗證的替代資料，應保留空值並標示資料限制。

## 自動更新與人工資料維護

Artificial Analysis 的模型指數與成本由每日 API 工作流程更新；訂閱方案、額度、來源、測試目錄及 Coding Agent 組態由版本控制中的 `data/curated.json` 維護。工作流程先更新模型，再套用已核對的固定資料，避免 API 更新覆蓋方案研究結果。模型評測中的空值仍保留為缺值。
