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

## 2026-10-17 第二輪官方頁面複核

第二次自動檢查回報 20 個官方頁面內容雜湊變動。本次已逐項重查目前頁面；不把網頁版面或指令碼的變更當成方案權益變更，已核對的資料保留並更新相關窗口說明。

| 來源 ID | 人工複核結果 |
| --- | --- |
| `aa-coding-agents` | [現行 Coding Agent 頁](https://artificialanalysis.ai/agents/coding-agents)仍為 v1.5，等權彙整 DeepSWE v1.1、Terminal-Bench 4.0、SWE-Atlas-QnA；頁面新增拒答率與 reward-hacking 區塊，Harness Comparison 仍標示 Coming soon。核心匯入資料只採官方有列出的 28 組代理組態，不把新區塊當作基礎模型分數。 |
| `anthropic-code`、`anthropic-cowork`、`anthropic-pro-cost`、`anthropic-pricing`、`anthropic-research` | [Claude Code 權益頁](https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan)確認 Pro 含 Claude Code，與 Claude 共用五小時工作階段及每週上限；官方仍未給固定訊息／任務數。Research 使用同一對話額度但耗用較快，模型為 Opus 5.5，必要時回退 Opus 4.8。Pro 月繳 $20、年繳預付 $200（月均 $16.67，頁面約顯示 $17），價格另加適用稅。Cowork 正整合至 Claude，先向 Pro／Max 分階段推出。 |
| `google-gemini-limits` | [Gemini Apps 限額頁](https://support.google.com/gemini/answer/16275805?gl=US&hl=en)明列每五小時重設並另受每週上限限制；AI Plus 為標準限額 2 倍、AI Pro 為 4 倍，依模型、功能、提示與對話長度動態變化。已將 5 小時／每週窗口及非固定訊息數寫入資料。 |
| `gemini-cli-deprecation`、`gemini-cli-deprecation-individuals` | [Google Code Assist 淘汰紀錄](https://developers.google.com/gemini-code-assist/docs/deprecations)確認個人 Google 帳號舊 Gemini CLI 服務於 2026-06-18 停止；不列為 AI Pro 權益。 |
| `google-annual-plus`、`google-annual-pro` | [AI Plus](https://support.google.com/googleone/answer/16548195?hl=en-uk)與 [AI Pro](https://support.google.com/googleone/answer/16476811?hl=en)官方說明均確認可以選年繳；美國固定年費沒有在公開頁列出，資料增加「年繳可選、價格未公開」，不推算總價或月均。 |
| `google-one-benefits`、`google-ai-plus-current`、`google-plans` | [Google AI 方案矩陣](https://one.google.com/about/google-ai-plans/)將 Antigravity 與 Jules 分別列出，Plus 為 Limited、Pro 為 Expanded，且未公布固定代理任務數；兩項分開計量。美國月繳價為 Plus $4.99、Pro $19.99；Plus 對應 Gemini 3.6 Flash，Pro 含 Gemini 4 Argon 與 Pro 模型。 |
| `xai-grok-bot`、`xai-build`、`xai-build-all`、`xai-faq`、`xai-grok`、`xai-pricing-web`、`xai-pricing` | [X Subscription 價格](https://docs.x.ai/x-subscription/pricing)確認 Plus $8／月或 $80／年、Premium $30／月或 $300／年；含用量按週重設，Grok 與 Cursor 共用池，Premium 為 Plus 的 4 倍。 [Grok Bot 說明](https://docs.x.ai/x-subscription/grok-bot)確認 Premium 以上包含 Bot 並共用週池；[Grok Build 公告](https://x.ai/news/grok-build-for-everyone)確認網頁／手機版開放所有方案。CLI 舊公告仍只列 SuperGrok／舊 X Premium Plus 測試資格，因此新方案 CLI 權益維持未確認。 |

官方變動監測已改為比對 HTML 的可見文字並忽略指令碼、樣式與 SVG 標記；第一次轉換指紋格式時以本次人工核對後的頁面作新基準。後續只有可見文字內容變更才新增待核對警告；403、404、429 及暫時錯誤仍保留最後成功快照。

## 2026-10-17 第三輪官方頁面複核

本輪處理最新自動檢查提出的 8 個內容變更警告。以下內容已重新比對官方頁面並同步到 `data/curated.json`；自動監測仍保留原始 HTTP 狀態及新內容雜湊，人工確認後只更新已核對來源的基準。

| 來源 ID | 人工複核結果 |
| --- | --- |
| `anthropic-cowork` | [Claude Cowork 公告](https://claude.com/blog/cowork-is-now-claude)確認 Cowork 正整合為 Claude 功能，先向 Pro／Max 推出後再擴大；沒有獨立的固定任務上限。 |
| `anthropic-pricing`、`anthropic-pro-cost` | [Claude 官方價格頁](https://claude.com/pricing)確認 Pro 月繳 $20 或年繳一次付 $200（月均 $16.67，頁面約顯示 $17），適用稅金另計；Pro 包含 Claude Code，Claude 對話與程式代理共用變動額度。 |
| `google-gemini-limits` | [Gemini Apps 限額頁](https://support.google.com/gemini/answer/16275805?gl=US&hl=en)及目前方案頁確認 Plus 約為 Free 的 2 倍、Pro 約為 4 倍；每五小時重設並受每週上限約束，實際用量依模型、功能與工作負載變化，這些倍數不是固定訊息數。 |
| `google-annual-plus`、`google-annual-pro` | [AI Plus 年繳說明](https://support.google.com/googleone/answer/16548195?hl=en-uk)及 [AI Pro 年繳說明](https://support.google.com/googleone/answer/16476811?hl=en)確認可選年繳；美國公開頁未列固定年繳實付金額，故年繳總價和月均價格保持空值。 |
| `google-one-benefits` | [Google AI 權益頁](https://support.google.com/googleone/answer/14534406?hl=en)確認 AI Pro 內含 Antigravity／Jules 額度與 AI credits。Antigravity 與 Jules 為不同程式代理，credits 不當作固定任務數或與其他額度相加。 |
| `google-ai-plus-current` | [Google AI 美國訂閱頁](https://gemini.google/subscriptions/?currencyCode=USD)確認 AI Plus $4.99／月並對應 Gemini 3.6 Flash；AI Pro $19.99／月並提供 Gemini 4 Argon、Pro 模型及 Flash。Gemini Omni Flash 位於 Google Flow 創作工作室，不映射成 Gemini Apps 聊天模型。AI Plus／Pro 的美國年繳確切金額需在登入結帳流程確認。 |

同輪另核對了四份 Google Coding Agent 官方文件，補入來源登錄表：

| 來源 ID | 人工複核結果 |
| --- | --- |
| `antigravity-models` | [Antigravity 官方模型表](https://antigravity.google/docs/models/)分列方案、模型與推理模式。Gemini 3.8 Flash Medium 可與 AA 同組態分數精確對應；Fast、Antigravity 專屬 Thinking 組態或未對應的 GPT-OSS Medium 不套用其他模式分數。Gemini Apps 的 Gemini 4 Argon 權益不代表 Antigravity IDE 權益。模型評測不代表 Antigravity Harness 成績。 |
| `antigravity-plans` | [Antigravity 方案額度](https://antigravity.google/docs/plans)說明 Free／Plus 以每週動態額度為主；Pro 每五小時刷新，另受每週上限限制。官方不保證固定任務數；付費 Pro 可購買額外 AI credits。 |
| `jules-usage-limits` | [Jules 官方用量上限](https://jules.google/docs/usage-limits)列出標準層每滾動 24 小時最多 15 個新任務、3 個並行；Pro 為 100 個新任務、15 個並行。任務上限與並行上限分開記錄。 |
| `jules-changelog` | [Jules 官方變更紀錄](https://jules.google/docs/changelog/)說明標準層使用 Gemini 3 Flash，Pro 使用 Gemini 3.1 Pro；AA 免費 API 目前僅有相應 Preview 條目，因此標準層不映射分數、Pro 僅標示近似映射。模型名稱不填入 reasoning mode 欄位。 |

獨立複核並移除三筆舊版 Google「一般 Agent」額度；目前 Gemini 深度研究、Gemini 任務、Antigravity、Jules 與 Chrome 代理各自只掛在所屬產品列，Flow 點數則不計入代理額度。

## 本輪自動來源錯誤處理

- 11 個 OpenAI 官方 Help／定價來源回 HTTP 403，仍列為「自動擷取受阻」；這些錯誤沒有被當成內容變更。本輪沿用先前已完成的官方頁面核對結果，保留資料並提供可開啟的官方來源連結。
- Claude 舊 Pro 計費網址曾回 HTTP 404；該來源已改為仍可讀取的 `https://claude.com/pricing`，不把舊網址失效推定成 Pro 方案停止。
- 已核對的 8 個內容變更會只針對其來源 ID 更新核對雜湊。其他不可讀來源維持最後已核對資料與錯誤狀態，不會因人工核對其他頁面而被清除。

## 2026-10-17 第四輪官方頁面複核

本輪由每日來源監測提出 6 項可讀取官方頁面的內容變更。已逐頁檢視方案價格、權益、模型文字與額度說明，確認以下資料仍與快照一致；已核對雜湊會更新為本輪頁面版本。來源自動讀取受阻的 11 個 OpenAI 頁面維持獨立警示。

| 來源 ID | 人工複核結果 |
| --- | --- |
| `anthropic-pricing` | [Claude 官方定價頁](https://claude.com/pricing)仍列 Pro 月繳 $20、年繳預付 $200（頁面約顯示月均 $17），適用稅金另計；Pro 包含 Claude Code、Research 及 Claude in Chrome。頁面說明 Cowork 正改為 Claude 的功能，先向 Pro／Max 分階段推出。方案未承諾固定訊息或代理任務數。 |
| `google-gemini-limits` | [Gemini Apps 限額及功能頁](https://support.google.com/gemini/answer/16275805?gl=US&hl=en)確認 AI Plus 為標準限額 2 倍、Pro 為 4 倍，Ultra 為 Pro 的 5 倍或 20 倍；用量每五小時刷新並另受每週上限限制。限額會依提示複雜度、對話長度、功能和容量變化；Deep Research 耗用較高，Tasks in Gemini 僅列於 Pro／Ultra。未公布固定任務數的欄位保持空值。 |
| `google-annual-plus`、`google-annual-pro` | [AI Plus](https://support.google.com/googleone/answer/16548195?hl=en-uk)及 [AI Pro](https://support.google.com/googleone/answer/16476811?hl=en)說明均確認可選月繳或年繳；美國公開頁未顯示登入後的年繳實付價。資料保留年繳月均與總額空值，不以月費推算。 |
| `google-one-benefits` | [Google AI Pro 權益頁](https://support.google.com/googleone/answer/14534406?hl=en)確認 Pro 的 Antigravity 增額、Jules 增額與可加購 AI credits；這些產品各有獨立用量。Jules 的 15／100 個新任務與 3／15 個並行值取自專屬 [Jules 用量頁](https://jules.google/docs/usage-limits)，沒有混成一個任務池。 |
| `google-ai-plus-current`、`google-plans` | [Google AI 方案頁](https://gemini.google/subscriptions/?currencyCode=USD)確認美國 Plus 月費 $4.99、2 倍 Gemini 使用量、200 Flow Credits；Pro 月費 $19.99、4 倍使用量、1,000 Flow Credits，並列 Gemini 4 Argon、Pro 與 Flash。方案頁未列出可登入帳戶以外確認的年繳金額。Plus 的 Gemini 3.6 Flash 名稱另由目前 [Google One AI 方案矩陣](https://one.google.com/about/google-ai-plans/)核對。Flow Credits 是創作產品點數，不計入 Chat 或 Agent 額度。 |

四個 Google Help URL 在下一次每日檢查又出現可見文字雜湊變化，因此重新開啟目前官方頁面的方案與用量段落核對。AI Plus／Pro 年繳選項仍可在 Google One 選擇，年費須登入並查看結帳金額；Gemini 限制仍為 Plus 2x、Pro 4x，每五小時刷新並另受每週上限限制，且沒有固定訊息數；Pro 權益頁仍將 Antigravity、Jules、Deep Research、Tasks in Gemini 與 credits 分別說明。上述值與快照一致。這些 Help 頁的自動雜湊是整頁可見文字指紋，故資料狀態會記錄本次已檢查的版本；未公開的固定額度仍不填數字。
