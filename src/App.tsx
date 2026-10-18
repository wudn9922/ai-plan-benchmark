import { useEffect, useMemo, useState } from 'react';
import { Activity, BadgeDollarSign, Bot, CircleHelp, Code2, ExternalLink, Layers3, RefreshCw, Search, SlidersHorizontal, Sparkles } from 'lucide-react';
import {
  CartesianGrid, Legend, ResponsiveContainer, Scatter, ScatterChart, Tooltip as ChartTooltip, XAxis, YAxis,
} from 'recharts';
import { BENCHMARK_INFO, INDEX_KEYS, INDEX_LABELS, type CodingAgentRecord, type ModelRecord, type ProductAccess, type QuotaCategory, type QuotaObservation, type Snapshot, type SourceRef, type SubscriptionPlan, type UpdateStatus } from './data/types';
import { comparableCodingAgents, comparableCostPoints, compactQuotaEntitlementAllowed, compactQuotaWindow, defaultSortForTab, filterCodingAgentsByProvider, formatPrice, hasOfficialCodingAgentCostEvidence, hasOfficialCodingAgentScoreEvidence, intelligenceEfficiency, paretoFrontier, preferredVersion, priceWithinCap, reasoningEffortIsMapped, shouldShowCompactQuota } from './data/metrics';

type Tab = 'plans' | 'models' | 'coding' | 'value';
const PROVIDERS = [
  { id: 'openai', name: 'OpenAI', color: '#247d68' },
  { id: 'anthropic', name: 'Anthropic', color: '#a36132' },
  { id: 'google', name: 'Google', color: '#3977c3' },
  { id: 'xai', name: 'xAI / X', color: '#666975' },
  { id: 'other', name: '其他', color: '#777b88' },
];
const TABS: Array<{ id: Tab; label: string; icon: typeof Layers3; subtitle: string }> = [
  { id: 'plans', label: '訂閱方案', icon: Layers3, subtitle: '比月費、產品權限與三種分開計量的額度。' },
  { id: 'models', label: '模型能力', icon: Sparkles, subtitle: '檢視 Artificial Analysis 指數、API 成本與基準測試版本。' },
  { id: 'coding', label: '程式代理', icon: Code2, subtitle: '比較代理、模型與執行框架組態，不把代理結果當成純模型分數。' },
  { id: 'value', label: '每美元價值', icon: BadgeDollarSign, subtitle: '分開比較訂閱月費、智能評測成本與程式代理成本。' },
];
const CHART_COLORS = ['#247d68', '#a36132', '#3977c3', '#777b88', '#b57b26', '#b65352'];

const SOURCE_LABELS: Record<string, string> = {
  'aa-free-api': 'Artificial Analysis 免費模型 API', 'aa-api-reference': 'Artificial Analysis API 欄位說明', 'aa-free-endpoint': '免費模型資料端點',
  'aa-method': '綜合智能評測方法', 'aa-coding-agents': '程式代理排名', 'aa-coding-method': '程式代理評測方法',
  'aa-coding-agent-import-v1.5-2026-10-17': '程式代理評測組態資料', 'aa-coding-agent-opencode-import-v1.5-2026-10-17': 'OpenCode 程式代理組態',
  'openai-go': 'ChatGPT Go 方案', 'openai-plus': 'ChatGPT Plus 方案', 'openai-codex': 'ChatGPT 方案中的 Codex', 'openai-codex-usage': 'Codex 用量與模型', 'openai-models': 'ChatGPT 模型清單',
  'anthropic-pricing': 'Claude 方案價格', 'anthropic-pro-cost': 'Claude Pro 計費', 'anthropic-code': 'Claude 訂閱中的 Claude Code',
  'google-plans': 'Google AI 方案', 'google-ai-plus-current': 'Google AI 方案與模型權限', 'google-annual-plus': 'Google AI Plus 年繳', 'google-annual-pro': 'Google AI Pro 年繳', 'google-student-offer': 'Google AI 學生優惠', 'google-gemini-limits': 'Gemini 使用上限', 'google-one-benefits': 'Google AI 方案福利', 'gemini-cli-deprecation': 'Gemini CLI 個人帳號服務狀態', 'gemini-cli-deprecation-individuals': '個人帳號方案說明',
  'xai-pricing': 'X 訂閱價格', 'xai-grok': 'Grok 功能介紹', 'xai-faq': 'Grok 常見問題', 'xai-build': 'Grok Build 命令列公告', 'xai-grok-bot': 'Grok Bot 方案權限', 'xai-build-all': 'Grok Build 網頁與手機版', 'google-ai-plan-benefits': 'Google AI Plus／Pro／Ultra 權益', 'google-jules': 'Jules 非同步程式代理',
  'antigravity-models': 'Antigravity 可用模型與推理模式', 'antigravity-plans': 'Antigravity 方案額度與重設窗口', 'jules-usage-limits': 'Jules 每日任務與並行上限', 'jules-changelog': 'Jules 模型更新紀錄',
  'openai-agent-mode': 'ChatGPT 舊版代理模式（已停用）', 'openai-work': 'ChatGPT Work 與 Codex', 'openai-work-rollout': 'ChatGPT Work 推出資訊', 'openai-deep-research': 'ChatGPT 深度研究', 'openai-flexible-usage': 'ChatGPT 彈性用量點數', 'anthropic-research': 'Claude Research 官方說明', 'xai-pricing-web': 'X 訂閱方案價格', 'openai-current-pricing': 'ChatGPT 最新方案比較',
  'aa-public-gemini-argon-comparison': 'Artificial Analysis Gemini 4 Argon 公開評測', 'aa-public-gpt-6-luna-high-comparison': 'Artificial Analysis GPT-6 Luna 公開評測', 'aa-coding-agent-import-v1.5-2026-10-16': '程式代理指數 v1.5 匯入資料',
};
const PRODUCT_LABELS: Record<string, string> = {
  'Codex Local': 'Codex 本機版', 'Codex Cloud': 'Codex 雲端版', 'ChatGPT Agent mode': '舊版 ChatGPT 代理模式（已停用）',
  'ChatGPT Deep Research': 'ChatGPT 深度研究', 'ChatGPT Work': 'ChatGPT 工作區', 'Claude Chat': 'Claude 對話', 'Claude Research': 'Claude 研究',
  'Gemini Apps': 'Gemini 應用程式', 'Antigravity Desktop': 'Antigravity 桌面版', 'Gemini CLI (舊個人登入產品)': 'Gemini 命令列工具（舊個人帳號版）',
  'Gemini Deep Research': 'Gemini 深度研究', 'Gemini Tasks in Gemini': 'Gemini 任務', 'Chrome agent': 'Chrome 網頁代理', 'Jules': 'Jules 程式代理', 'Google Flow': 'Google Flow 創作工作室',
  'Grok Build Web': 'Grok Build 網頁版', 'Grok Build CLI': 'Grok Build 命令列工具', 'Grok Bot / 雲端電腦': 'Grok Bot／雲端電腦',
  'Cursor Agent': 'Cursor 程式代理', 'Grok / Grok Build Web': 'Grok／Grok Build 網頁版', 'Grok / Grok Bot / Grok Build Web': 'Grok／Grok Bot／Grok Build 網頁版',
  'Cursor Pro / Grok Build CLI': 'Cursor Pro／Grok Build 命令列工具', 'ChatGPT Deep Research / ChatGPT Work': 'ChatGPT 深度研究／工作區',
  'Claude Chat + Claude Code': 'Claude 對話＋Claude Code', 'Gemini Deep Research / Agent': 'Gemini 深度研究／代理', 'Grok Bot': 'Grok Bot',
  '一般 Agent 功能': '一般代理功能', 'Codex Local / ChatGPT Work': 'Codex 本機版／ChatGPT 工作區', 'Codex Local / Codex Cloud': 'Codex 本機版／Codex 雲端版',
};
const MODEL_ACCESS_LABELS: Record<string, string> = {
  'Cursor-supported models': 'Cursor 支援的模型',
};
const PLAN_LABELS: Record<string, string> = {
  'ChatGPT Free': 'ChatGPT 免費方案', 'Claude Free': 'Claude 免費方案', 'Google AI Free': 'Google AI 免費方案',
  'The X Subscription Free': 'X 免費方案', 'The X Subscription Plus': 'X Plus 方案', 'The X Subscription Premium': 'X Premium 方案',
};
const QUOTA_UNITS: Record<string, string> = {
  'Local messages': '本機訊息', 'Jules tasks / concurrent tasks': 'Jules 任務數／並行任務數', 'messages or tasks': '訊息或任務',
  'messages / research sessions': '訊息／研究工作階段', 'Work allowance / agent tasks': '工作區額度／代理任務', reports: '研究報告', tasks: '任務',
  'tasks from shared weekly pool': '共享週額度任務', 'tasks / actions': '任務／操作',
};
const QUOTA_WINDOWS: Record<string, string> = {
  'Varies by plan and agent feature': '依方案與代理功能而異',
  'Same as conversation allowance; variable by workload': '與對話額度共用；依工作負載而異',
  'May use a five-hour or weekly window; task/model/settings vary': '可能採五小時或每週窗口；視任務、模型與設定而異',
  'Dynamic model/feature limits; reports consume high relative usage': '模型與功能限制會動態調整；研究報告耗用量較高',
  'Dynamic; fixed task count not published': '動態調整；未公布固定任務數',
  'Weekly shared pool with Grok and Cursor; effort varies': '與 Grok、Cursor 共用每週額度；耗用量依任務而異',
};
const COPY_TRANSLATIONS: Record<string, string> = {
  'Free 方案；可用性與部分功能會依地區、模型及推出狀態變動。': '免費方案；可用性與部分功能會依地區、模型及推出狀態變動。',
  'US 月繳參考價；地區可用性和稅金依結帳頁為準。': '美國月繳參考價；地區可用性和稅金依結帳頁為準。',
  '美國月繳參考價；Codex local 與 Work 共用用量。Cloud 任務消耗可能較高，且可能另受 weekly cap 限制。': '美國月繳參考價；Codex 本機版與 Work 共用用量。雲端任務消耗可能較高，且可能另受每週上限限制。',
  '月繳 $20；年繳一次付 $200，月均 $16.67（官方頁約顯示 $17/月）。Claude Chat 與 Claude Code 共用額度，官方未公布固定任務數。': '月繳 $20；年繳一次付 $200，月均 $16.67（官方頁約顯示 $17／月）。Claude 對話與 Claude Code 共用額度；官方未公布固定任務數。',
  '符合資格的非美國學生可獲 1 年免費 AI Plus，之後依當地月費計價；美國及 Bolivia、Albania、Canada、Macau、Hong Kong、Tunisia 不符合此優惠，至 2026-12-31 可兌換。': '符合資格的美國以外學生可獲 1 年免費 AI Plus，之後依當地月費計價；美國、玻利維亞、阿爾巴尼亞、加拿大、澳門、香港及突尼西亞不適用。優惠兌換期限至 2026-12-31。',
  '美國符合資格學生可獲 1 年免費 AI Pro，之後依月費計價；學生方案資格、期限和地區限制見官方說明。': '符合資格的美國學生可獲 1 年免費 AI Pro，之後依月費計價；學生方案資格、期限與地區限制請參閱官方說明。',
  'Intelligence Index 與各底層測試有自己的方法、權重及原生單位；Elo、通過率、標準化指數不可混成單一尺度。類別權重與各測試權重分開呈現。': '綜合智能指數與各底層測試各有方法、權重及原生單位；Elo 評分、通過率與標準化指數不可混成同一尺度。類別權重與各測試權重分開呈現。',
  'Research requires a paid Claude plan.': 'Claude Research 需要付費 Claude 方案。',
  'Paid plan feature; no fixed research task count published.': '付費方案功能；官方未公布固定研究任務數。',
  'Expanded limits；與 Antigravity 使用量分開。': '使用額度提高；與 Antigravity 使用量分開計算。',
  'Multi-step web research; high relative usage cost. Free access may vary with demand.': '多步驟網頁研究，耗用量相對較高。免費使用會隨需求變動。',
  'Higher task and concurrency limits；與 Antigravity 使用量分開。': '任務與並行上限較高；與 Antigravity 使用量分開計算。',
  'Persistent cloud computer with browser, filesystem, and terminal. Premium includes it; Plus does not.': '提供持續運作的雲端電腦，含瀏覽器、檔案系統與終端機。Premium 方案包含，Plus 不包含。',
  'Current monthly allowance depends on plan; the in-product usage counter is authoritative. This value is not a Codex task count.': '每月額度依方案而異，請以產品內用量計數器為準。此項不是 Codex 任務數。',
  'Research is available on paid plans and draws from standard conversation limits; sessions may consume limits faster.': '付費方案可使用研究功能，並共用一般對話額度；研究工作階段可能更快耗用額度。',
  'ChatGPT Work shares an agentic allowance with Codex for applicable plans. Work usage varies by task; no fixed task count is published. API task costs are separate.': '適用方案中的 ChatGPT 工作區與 Codex 共用代理額度。工作區用量依任務而異，官方未公布固定任務數。API 任務成本另計。',
  'Deep Research is available in the Gemini Apps feature matrix. It has high relative usage cost; fixed task counts are not published. Free access may be reduced during peak demand.': 'Gemini 應用程式功能表列有深度研究。此功能耗用量相對較高，官方未公布固定任務數；需求高峰時免費使用量可能降低。',
  'Tasks in Gemini is listed for AI Pro; use limits are dynamic and not published as a fixed count.': 'AI Pro 方案列有 Gemini 任務功能；用量限制會動態調整，官方未公布固定數量。',
  'Grok Bot is not included in this tier.': '此方案不包含 Grok Bot。',
  'Grok Bot runs multi-step work on a persistent cloud computer; included only on Premium and higher. Usage is shared, not a separate additive allowance; fixed task count is not published.': 'Grok Bot 在持續運作的雲端電腦上執行多步驟工作；僅 Premium 以上方案包含。用量屬共享額度，不是可額外累加的獨立額度；官方未公布固定任務數。',
  'Grok Bot is not included on Free/Plus. This records the product entitlement and does not imply a zero quota.': '免費與 Plus 方案不包含 Grok Bot。本筆僅記錄產品權益，不代表額度為零。',
  '每月 200 Google Flow Credits，含 Gemini Omni Flash；屬創作工作室點數，與 Gemini 對話及代理任務分開。': '每月 200 點 Flow 用量，包含 Gemini Omni Flash；屬創作工作室點數，與 Gemini 對話及代理任務分開計算。',
  '每月 1,000 Google Flow Credits，含 Gemini Omni Flash；屬創作工作室點數，與 Gemini 對話及代理任務分開。': '每月 1,000 點 Flow 用量，包含 Gemini Omni Flash；屬創作工作室點數，與 Gemini 對話及代理任務分開計算。',
};

function translateUiText(value: string | null | undefined): string {
  if (!value) return '';
  const exact = COPY_TRANSLATIONS[value];
  if (exact) return exact;
  return value
    .replace(/\bBolivia\b/g, '玻利維亞').replace(/\bAlbania\b/g, '阿爾巴尼亞').replace(/\bCanada\b/g, '加拿大')
    .replace(/\bMacau\b/g, '澳門').replace(/\bHong Kong\b/g, '香港').replace(/\bTunisia\b/g, '突尼西亞')
    .replace(/\bUS\b/g, '美國').replace(/\bCodex local\b/gi, 'Codex 本機版')
    .replace(/\bFree\/Go\b/g, '免費版／Go').replace(/\blocal-message(?:s)?\b/gi, '本機訊息').replace(/\bCloud task(?:s)?\b/gi, '雲端任務').replace(/\bCloud\b/g, '雲端')
    .replace(/\(Thinking\)/gi, '（思考模式）').replace(/\(Medium\)/gi, '（中等推理）').replace(/\(Fast\)/gi, '（快速）').replace(/\(High\)/gi, '（高推理）')
    .replace(/\bFlow Credits\b/gi, 'Flow 用量點數')
    .replace(/\bIntelligence Index\b/g, '綜合智能指數').replace(/\bCoding Agent Index\b/g, '程式代理指數')
    .replace(/\bAgentic Index\b/g, '代理執行能力指數').replace(/\bCoding Index\b/g, '程式能力指數')
    .replace(/\bpooled task metrics\b/gi, '合併任務指標').replace(/\bFree API\b/g, '免費 API')
    .replace(/\bExpanded limits\b/g, '額度提高').replace(/\bHigher task and concurrency limits\b/g, '任務與並行上限較高')
    .replace(/\bBeta\b/g, '測試版').replace(/\bbeta\b/g, '測試版').replace(/\bFree\b/g, '免費方案').replace(/\bfree\b/g, '免費使用')
    .replace(/\bweekly cap\b/gi, '每週上限').replace(/\blocal messages\b/gi, '本機訊息').replace(/\btask count\b/gi, '任務數')
    .replace(/\bAPI key\b/gi, 'API 金鑰').replace(/\bHarness\b/g, '執行框架').replace(/\bBenchmark\b/g, '基準測試')
    .replace(/\btask-macro mean pass rate\b/gi, '任務宏平均通過率').replace(/\bsee current methodology for task groups and scoring\b/gi, '任務分類與評分請參照現行方法文件')
    .replace(/\bPooled task metric\b/gi, '匯總任務指標').replace(/\bofficial agent score\b/gi, '官方代理分數')
    .replace(/\bagentic allowance\b/gi, '代理額度').replace(/\btask count\b/gi, '任務數')
    .replace(/\b([\d,]+)\s+tasks\b/gi, '$1 項任務').replace(/\b([\d,]+)\s+scenarios\b/gi, '$1 種情境').replace(/\b([\d,]+)\s+subproblems\b/gi, '$1 個子題').replace(/\b([\d,]+)\s+questions\b/gi, '$1 題')
    .replace(/\btasks\b/gi, '任務').replace(/\btask\b/gi, '任務')
    .replace(/\bscenarios\b/gi, '情境').replace(/\bsubproblems\b/gi, '子題').replace(/\bquestions\b/gi, '題')
    .replace(/\bworkflow\b/gi, '工作流程').replace(/\bcompletion rate\b/gi, '完成率').replace(/\bAccuracy\b/g, '正確率')
    .replace(/\bnon-hallucination rate\b/gi, '非幻覺率').replace(/\bAll-pass rate\b/gi, '全項通過率')
    .replace(/\bequal-weight component\b/gi, '等權組成項目').replace(/\bIndex weight\b/gi, '指數權重')
    .replace(/\bitems\b/gi, '項目').replace(/\bconditions\b/gi, '條件').replace(/\bruns\b/gi, '次執行').replace(/\bdomains\b/gi, '個領域').replace(/\bacross\b/gi, '涵蓋')
    .replace(/\bFree\/Plus\b/g, '免費／Plus').replace(/\bFree\/ AI Pro\b/g, '免費／AI Pro').replace(/\bGrok Build CLI\b/g, 'Grok Build 命令列工具')
    .replace(/\bChat\b/g, '對話').replace(/\bAgent\b/g, '代理').replace(/\bcredits\b/gi, '用量點數').replace(/\bCLI\b/g, '命令列工具')
    .replace(/\bbenefit\b/gi, '權益').replace(/\bentitlement\b/gi, '權益').replace(/\bdesktop\b/gi, '桌面版')
    .replace(/\bmessages\b/gi, '訊息').replace(/\bmessage\b/gi, '訊息').replace(/\bresearch sessions\b/gi, '研究工作階段')
    .replace(/\bconcurrency\b/gi, '並行數').replace(/\bmodel\b/gi, '模型').replace(/\bsettings\b/gi, '設定')
    .replace(/\bAPI task costs\b/gi, 'API 任務成本').replace(/\bper task\b/gi, '每任務').replace(/\bTokens?\b/g, '詞元（Token）');
}

function sourceLabel(source: SourceRef): string { return SOURCE_LABELS[source.id] ?? translateUiText(source.label); }
function sourceLabelById(id: string, fallback: string): string { return SOURCE_LABELS[id] ?? translateUiText(fallback); }
function productLabel(value: string): string { return PRODUCT_LABELS[value] ?? translateUiText(value); }
function modelAccessLabel(value: string): string { return MODEL_ACCESS_LABELS[value] ?? translateUiText(value); }
function modelAccessDisplay(model: ProductAccess['model_access'][number]): string {
  const label = modelAccessLabel(model.model);
  const modes = model.reasoning_modes.filter((mode) => !label.toLowerCase().includes(mode.toLowerCase()) && !label.includes(reasoningLabel(mode)));
  return `${label}${modes.length ? `（${modes.map(reasoningLabel).join('、')}）` : ''}${model.mapping === 'unmapped' ? ' · 無精確對應' : model.mapping === 'approximate' ? ' · 近似對應' : ''}`;
}
function planLabel(value: string): string { return PLAN_LABELS[value] ?? translateUiText(value); }
function quotaUnit(value: string): string { return QUOTA_UNITS[value] ?? translateUiText(value); }
function quotaWindow(value: string | null): string { return value ? QUOTA_WINDOWS[value] ?? translateUiText(value) : '時間窗口尚未公布'; }
function benchmarkUnit(value: string): string {
  const labels: Record<string, string> = { Elo: 'Elo 評分', 'pass@1': '首次通過率（pass@1）', 'Objective completion rate': '目標完成率', 'Accuracy + non-hallucination rate': '正確率＋非幻覺率', 'All-pass rate + task-macro mean pass rate': '全項通過率＋任務宏平均通過率', 'official AA-LCR score': 'AA-LCR 官方分數', 'Pooled task metric (official agent score)': '匯總任務指標（官方代理分數）' };
  return labels[value] ?? translateUiText(value);
}
function reasoningLabel(value: string | null | undefined): string {
  const labels: Record<string, string> = { Fast: '快速', Medium: '中等', High: '高', Thinking: '思考', xHigh: '超高', Max: '最高' };
  return value ? labels[value] ?? translateUiText(value) : '未公布';
}
function agentLabel(value: string): string { return value.replace(' + ', '＋').replace(' (xhigh)', '（超高推理）').replace(' (Max)', '（最高推理）'); }
function evidenceLabel(value: string | null | undefined): string {
  return value === 'official' ? '官方' : value === 'measured' ? '實測' : value === 'community' ? '社群觀察' : value === 'estimate' ? '推估' : value ? translateUiText(value) : '尚無資料';
}
function shortDate(value: string | null | undefined): string {
  if (!value) return '未公布';
  const isoDate = value.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  return isoDate ?? value;
}

function quotaValue(quota: QuotaObservation): string {
  if (quota.value_type === 'unlimited') return '不限量*';
  if (quota.value_type === 'range' && quota.estimate_range) return `${quota.estimate_range.min.toLocaleString('zh-Hant')}–${quota.estimate_range.max.toLocaleString('zh-Hant')} ${quotaUnit(quota.unit)}（估計）`;
  if (quota.value_type === 'exact' && quota.value !== null) return `${quota.value.toLocaleString('zh-Hant', { maximumFractionDigits: 2 })} ${quotaUnit(quota.unit)}`;
  return MISSING;
}

const defaultStatus: UpdateStatus = {
  aa: { configured: false, status: 'disabled', message: '尚未設定 Artificial Analysis API 金鑰；目前只顯示已儲存資料。', checked_at: null, stale_days: null, http_status: null, last_error: null, models_count: 0, endpoint: 'https://artificialanalysis.ai/api/v2/language/models/free', data_updated_at: null },
};

function useSnapshot() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [status, setStatus] = useState<UpdateStatus>(defaultStatus);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const load = async () => {
    setRefreshing(true);
    try {
      const base = import.meta.env.BASE_URL;
      const [dataRes, statusRes] = await Promise.all([
        fetch(`${base}data/snapshot.json`, { cache: 'no-store' }),
        fetch(`${base}data/status.json`, { cache: 'no-store' }),
      ]);
      if (!dataRes.ok) throw new Error(`資料快照讀取失敗（${dataRes.status}）`);
      const data = await dataRes.json() as Snapshot;
      setSnapshot(data);
      setError(null);
      if (statusRes.ok) setStatus(await statusRes.json() as UpdateStatus);
    } catch (e) {
      setError(e instanceof Error ? e.message : '資料載入失敗');
    } finally {
      setRefreshing(false);
    }
  };
  useEffect(() => { void load(); }, []);
  return { snapshot, status, error, refreshing, reload: load };
}

function Info({ children, title = '指標說明' }: { children: React.ReactNode; title?: string }) {
  return <details className="info-pop"><summary aria-label={title}><CircleHelp size={15} /></summary><div className="info-pop__panel"><strong>{title}</strong><p>{children}</p></div></details>;
}

function Evidence({ confidence, kind }: { confidence?: string; kind?: string }) {
  const text = kind === 'official' ? '官方' : kind === 'measured' ? '實測' : kind === 'community' ? '社群實測' : kind === 'estimate' ? '推估' : confidence === 'high' ? '高可信' : confidence === 'medium' ? '中可信' : confidence === 'low' ? '低可信' : '未知';
  const cls = kind === 'official' || confidence === 'high' ? 'good' : kind === 'community' || kind === 'estimate' || confidence === 'medium' ? 'warm' : 'quiet';
  return <span className={`evidence evidence--${cls}`}>{text}</span>;
}

function SourceLinks({ ids, sources, label = '來源' }: { ids: string[]; sources: SourceRef[]; label?: string }) {
  const list = ids.map((id) => sources.find((source) => source.id === id)).filter((source): source is SourceRef => Boolean(source));
  if (!list.length) return <span className="muted">尚無來源</span>;
  return <span className="source-links" aria-label={label}>{list.map((source) => <a href={source.url} key={source.id} target="_blank" rel="noreferrer">{sourceLabel(source)}<ExternalLink size={12} /></a>)}</span>;
}

function benchmarkLabel(id: string): string {
  const labels: Record<string, string> = {
    aa_briefcase: 'AA-Briefcase 專業工作任務', gdpval_aa: 'GDPval-AA 經濟價值任務', automationbench_aa: 'AutomationBench-AA 自動化工作流程',
    terminal_bench: 'Terminal-Bench 終端機任務', scicode: 'SciCode 科學程式任務', aa_omniscience: 'AA-Omniscience 知識與不確定性',
    gdp_pdf: 'GDP.pdf 長文件任務', aa_lcr: 'AA-LCR 長上下文檢索', humanity_last_exam: 'Humanity’s Last Exam 人類最後考試',
    critpt: 'CritPt 物理與科學推理', deepswe: 'DeepSWE 軟體工程代理', terminal_bench_agent: 'Terminal-Bench 終端機代理任務',
    swe_atlas_qna: 'SWE-Atlas-QnA 程式庫問答',
  };
  return labels[id] ?? translateUiText(BENCHMARK_INFO[id]?.name ?? id);
}

function Badge({ value }: { value: boolean | null }) {
  return <span className={`product-badge ${value === true ? 'product-badge--yes' : value === false ? 'product-badge--no' : 'product-badge--unknown'}`}>{value === true ? '包含' : value === false ? '未包含' : '未確認'}</span>;
}

type QuotaEntitlement = 'included' | 'excluded' | 'unknown';

function quotaEntitlement(plan: SubscriptionPlan, quota: QuotaObservation): QuotaEntitlement {
  const linkedProducts = plan.products.filter((product) => product.quota_ids.includes(quota.id));
  if (!linkedProducts.length) return 'unknown';
  const states = new Set(linkedProducts.map((product) => product.included));
  if (states.size !== 1 || states.has(null)) return 'unknown';
  return states.has(false) ? 'excluded' : 'included';
}

function quotaEvidenceAllowed(snapshot: Snapshot, quota: QuotaObservation, verifiedOnly: boolean, includeCommunity: boolean): boolean {
  const kinds = quota.source_ids.map((id) => snapshot.sources.find((source) => source.id === id)?.kind).filter(Boolean);
  if (verifiedOnly) return kinds.length > 0 && kinds.every((kind) => kind === 'official');
  return includeCommunity || !kinds.includes('community');
}

function numericQuotaCount(snapshot: Snapshot, plan: SubscriptionPlan, category: QuotaCategory, verifiedOnly: boolean, includeCommunity: boolean): number {
  return snapshot.quotas.filter((quota) => {
    const hasCommunitySource = quota.source_ids.some((id) => snapshot.sources.find((source) => source.id === id)?.kind === 'community');
    const quantified = quota.value_type === 'unlimited'
      || (quota.value_type === 'exact' && quota.value !== null)
      || (quota.value_type === 'range' && quota.estimate_range !== null && quota.estimate_range !== undefined);
    return plan.quota_ids.includes(quota.id)
      && quota.category === category
      && quantified
      && compactQuotaEntitlementAllowed(quota, quotaEntitlement(plan, quota), hasCommunitySource, verifiedOnly, includeCommunity)
      && quotaEvidenceAllowed(snapshot, quota, verifiedOnly, includeCommunity);
  }).length;
}

function mappedModels(snapshot: Snapshot, plan: SubscriptionPlan): ModelRecord[] {
  const names = plan.products.flatMap((product) => product.model_access.filter((access) => access.mapping === 'exact').map((access) => access.model.trim().toLowerCase()));
  return snapshot.models.filter((model) => names.includes(model.name.trim().toLowerCase()) || names.includes(model.id.trim().toLowerCase()));
}

function linkedPlanMetric(snapshot: Snapshot, plan: SubscriptionPlan, metric: 'cost' | 'speed'): number | null {
  const models = mappedModels(snapshot, plan);
  if (metric === 'cost') {
    const preferred = preferredVersion(models.map((model) => model.intelligence_cost_benchmark_version));
    const values = models.filter((model) => model.intelligence_cost_benchmark_version === preferred).map((model) => model.intelligence_cost_per_task_usd).filter((value): value is number => value !== null && value > 0);
    return values.length ? Math.min(...values) : null;
  }
  const values = models.map((model) => model.performance.output_tokens_per_second).filter((value): value is number => value !== null && value > 0);
  return values.length ? Math.max(...values) : null;
}

function isOfficialCodingAgent(snapshot: Snapshot, agent: CodingAgentRecord): boolean {
  const sourceKind = snapshot.sources.find((source) => source.url === agent.source_url)?.kind;
  return hasOfficialCodingAgentScoreEvidence(agent, sourceKind);
}

function officialCodingCostRows(snapshot: Snapshot, agents: CodingAgentRecord[]): CodingAgentRecord[] {
  return agents.filter((agent) => {
    const sourceKind = snapshot.sources.find((source) => source.url === agent.source_url)?.kind;
    return hasOfficialCodingAgentCostEvidence(agent, sourceKind);
  });
}

function PriceBlock({ plan }: { plan: SubscriptionPlan }) {
  return <div className="price-block">
    <strong>{formatPrice(plan.monthly_price, plan.currency)}</strong><span>/ 月</span>
    {plan.annual_billed_total !== null && <small>年繳 {formatPrice(plan.annual_billed_total, plan.currency)}，月均 {formatPrice(plan.annual_monthly_price, plan.currency)}</small>}
    {plan.annual_billed_total === null && plan.annual_monthly_price === null && <small>{plan.annual_billing_available === true ? '年繳可選；公開年費尚無可靠數據' : plan.annual_billing_available === false ? '無年繳方案' : '年繳價格：尚無可靠數據'}</small>}
    <small>稅金：{plan.tax === 'extra' ? '另計' : plan.tax === 'included' ? '已含' : plan.tax === 'varies' ? '依地區／結帳頁而異' : '未知'} · {plan.region} · {plan.currency}</small>
  </div>;
}

function quotaDisplayValue(quota: QuotaObservation): string {
  return quota.value_type === 'unlimited' ? '不限量*' : quota.value_type === 'variable' ? '動態額度' : quota.value_type === 'not_published' ? '未公布' : quotaValue(quota);
}

function quotaModelReason(quota: QuotaObservation): string {
  return [quota.model, quota.reasoning_mode ? `推理${reasoningLabel(quota.reasoning_mode)}` : null].filter(Boolean).join(' · ');
}

function PlanQuotaCard({ plan, quota, sources }: { plan: SubscriptionPlan; quota: QuotaObservation; sources: SourceRef[] }) {
  const entitlement = quotaEntitlement(plan, quota);
  const value = entitlement === 'excluded' ? '未包含' : quotaDisplayValue(quota);
  const modelReason = quotaModelReason(quota);
  return <article className="quota-card">
    <div className="quota-card__top"><strong>{productLabel(quota.product)}</strong><Evidence confidence={quota.confidence} /></div>
    <div className="quota-card__value">{value}</div>
    <div className="quota-card__meta">{entitlement === 'excluded' ? '此方案未包含此產品；以下為來源記錄的條件' : entitlement === 'unknown' ? '權益未確認' : ''}{entitlement === 'excluded' || entitlement === 'unknown' ? ' · ' : ''}{quotaWindow(quota.window)}{modelReason ? ` · ${modelReason}` : ''}</div>
    {quota.note && <p>{translateUiText(quota.note)}</p>}
    <div className="quota-card__meta">{quota.region} · 取樣日 {quota.sampled_at}{quota.shared_with.length ? ` · 共用：${quota.shared_with.map(productLabel).join('、')}` : ''}</div>
    <SourceLinks ids={quota.source_ids} sources={sources} />
  </article>;
}

function PlanCard({ plan, snapshot, quotaFilter, verifiedOnly, includeCommunity }: { plan: SubscriptionPlan; snapshot: Snapshot; quotaFilter: QuotaCategory | 'all'; verifiedOnly: boolean; includeCommunity: boolean }) {
  const quotas = snapshot.quotas.filter((quota) => plan.quota_ids.includes(quota.id) && (quotaFilter === 'all' || quota.category === quotaFilter) && quotaEvidenceAllowed(snapshot, quota, verifiedOnly, includeCommunity));
  const categoryInfo: Array<{ id: QuotaCategory; name: string }> = [
    { id: 'chat', name: '對話額度' }, { id: 'agent', name: '一般代理額度' }, { id: 'coding_agent', name: '程式代理額度' },
  ];
  const promo = plan.promo || plan.trial;
  const surfaces: Record<string, string> = { web: '網頁', mobile: '手機', cli: '命令列', cloud: '雲端', desktop: '桌面', agent: '代理' };
  const chatModelNames = [...new Set(compactModelAccesses(plan, 'chat').map(({ access }) => modelAccessLabel(access.model)))];
  const agentModelNames = [...new Set(compactModelAccesses(plan, 'agent').map(({ access }) => modelAccessLabel(access.model)))];
  const modelSummary = (names: string[]) => names.length ? `${names.slice(0, 3).join('、')}${names.length > 3 ? ` 等 ${names.length} 款` : ''}` : '尚無已公開模型';
  return <article className="plan-card">
    <div className="plan-card__heading">
      <div><span className={`provider-dot provider-dot--${plan.provider}`} /><span className="provider-name">{plan.provider_name}</span><span className="plan-tier">{plan.tier === 'free' ? '免費方案' : plan.tier === 'reference' ? '參考方案（>$30）' : '個人方案'}</span></div>
      <h3>{planLabel(plan.name)}</h3>
    </div>
    <PriceBlock plan={plan} />
    <div className="plan-card__summary">
      <div className="plan-summary-models">
        <div><b>聊天可用模型</b><span>{modelSummary(chatModelNames)}</span></div>
        <div><b>代理可用模型</b><span>{modelSummary(agentModelNames)}</span></div>
      </div>
      <div className="plan-summary-quotas" aria-label="三類額度摘要">
        {categoryInfo.map((category) => <div className={`plan-summary-quota ${quotaFilter === category.id ? 'plan-summary-quota--focused' : ''}`} key={category.id}>
          <b>{category.name}</b><span>{compactQuotaCardSummary(snapshot, plan, category.id, verifiedOnly, includeCommunity)}</span>
        </div>)}
      </div>
    </div>
    <details className="plan-detail">
      <summary>查看完整產品權限、額度條件與來源</summary>
      <div className="plan-detail__body">
        {promo && <div className="promo-note"><Sparkles size={15} /><span>{translateUiText(promo)}</span></div>}
        {plan.note && <p className="plan-note">{translateUiText(plan.note)}</p>}
        <div className="plan-card__section">
          <h4>產品與模型權限</h4>
          <div className="product-list">{plan.products.map((product) => <div className={`product-row ${product.rollout === 'discontinued' ? 'product-row--retired' : ''}`} key={product.product}>
            <div className="product-row__head"><span>{productLabel(product.product)}</span><Badge value={product.included} />{product.rollout === 'discontinued' && <span className="status-tag">已停止</span>}{product.rollout === 'limited' && <span className="status-tag">推出／地區限制</span>}{product.rollout === 'beta' && <span className="status-tag">測試版</span>}</div>
            {product.surface.length > 0 && <div className="product-note">{product.surface.map((surface) => surfaces[surface] ?? surface).join(' · ')}</div>}
            {product.model_access.length > 0 && <div className="product-models">可用模型：{product.model_access.map((model, index) => <span className="product-model-access" key={model.model}>{index > 0 ? '、' : ''}{modelAccessDisplay(model)}{model.note && <Info title={`模型對應：${modelAccessLabel(model.model)}`}>{translateUiText(model.note)}</Info>}</span>)}</div>}
            {product.note && <div className="product-note">{translateUiText(product.note)}</div>}
            {product.source_ids.length > 0 && <SourceLinks ids={product.source_ids} sources={snapshot.sources} label="產品權限來源" />}
          </div>)}</div>
        </div>
        <div className="plan-card__section">
          <h4>用量與限制</h4>
          {categoryInfo.filter((category) => quotaFilter === 'all' || quotaFilter === category.id).map((category) => {
            const rows = quotas.filter((quota) => quota.category === category.id);
            return <div className="quota-group" key={category.id}><h5>{category.name}</h5>{rows.length ? rows.map((quota) => <PlanQuotaCard plan={plan} quota={quota} sources={snapshot.sources} key={quota.id} />) : <div className="empty-compact">尚無可靠數據</div>}</div>;
          })}
        </div>
        <div className="plan-card__footer"><span>方案核對日 {plan.checked_at} · {plan.region} · 稅金：{plan.tax === 'extra' ? '另計' : plan.tax === 'included' ? '已含' : plan.tax === 'varies' ? '依地區／結帳頁而異' : '未知'}</span><SourceLinks ids={plan.source_ids} sources={snapshot.sources} /></div>
      </div>
    </details>
  </article>;
}

const PRIMARY_SCORE_KEYS = [
  { key: 'intelligence', label: '智' },
  { key: 'coding', label: '程式' },
  { key: 'agentic', label: '代理' },
] as const;

function isCodingAgentProduct(product: ProductAccess): boolean {
  return /codex|claude code|antigravity|jules|cursor agent|grok build|coding agent/i.test(product.product);
}

function isChatProduct(product: ProductAccess): boolean {
  return ['ChatGPT', 'Claude Chat', 'Gemini Apps', 'Grok'].includes(product.product);
}

function isAgentProduct(product: ProductAccess): boolean {
  return isCodingAgentProduct(product) || product.surface.includes('agent') || /deep research|tasks in gemini|chrome agent|grok bot|chatgpt work/i.test(product.product);
}

function compactQuotaValue(quota: QuotaObservation): string {
  if (quota.value_type === 'unlimited') return '不限量';
  if (quota.value_type === 'variable') return '動態，未公布固定數';
  if (quota.value_type === 'not_published') return '官方未公布';
  if (quota.value_type === 'range' && quota.estimate_range) {
    const range = `${quota.estimate_range.min.toLocaleString('zh-Hant')}–${quota.estimate_range.max.toLocaleString('zh-Hant')}`;
    if (/額度百分比|使用量百分比/i.test(quota.unit)) return `${range}%`;
    return `${range} ${quotaUnit(quota.unit)}`;
  }
  if (quota.value_type === 'exact' && quota.value !== null) {
    const value = quota.value.toLocaleString('zh-Hant', { maximumFractionDigits: 2 });
    if (/額度百分比|使用量百分比/i.test(quota.unit)) return `${value}%`;
    if (/倍標準/.test(quota.unit)) return `${value}×標準`;
    if (/共享池/.test(quota.unit)) return `${value}×週池`;
    return `${value} ${quotaUnit(quota.unit)}`;
  }
  return MISSING;
}

function compactQuotaEvidence(snapshot: Snapshot, quota: QuotaObservation): { label: string; source: SourceRef | null } {
  const sources = quota.source_ids.map((id) => snapshot.sources.find((item) => item.id === id)).filter((item): item is SourceRef => item !== undefined);
  const communitySource = sources.find((source) => source.kind === 'community');
  if (!communitySource) {
    const source = sources[0] ?? null;
    return { label: `官方${source ? ` · ${source.checked_at}` : ''}`, source };
  }
  const sampleSize = quota.estimate_range?.sample_size ?? quota.sample_size ?? 1;
  const historical = /舊方案|歷史觀察/.test(quota.note) ? '舊方案 · ' : '';
  return { label: `${historical}社群 n=${sampleSize} · ${quota.sampled_at}${quota.confidence === 'low' ? ' · 低信心' : ''}`, source: communitySource };
}

function compactQuotaRows(snapshot: Snapshot, plan: SubscriptionPlan, category: QuotaCategory, verifiedOnly: boolean, includeCommunity: boolean): QuotaObservation[] {
  return snapshot.quotas.filter((quota) => {
    const hasCommunitySource = quota.source_ids.some((id) => snapshot.sources.find((source) => source.id === id)?.kind === 'community');
    return plan.quota_ids.includes(quota.id)
      && quota.category === category
      && compactQuotaEntitlementAllowed(quota, quotaEntitlement(plan, quota), hasCommunitySource, verifiedOnly, includeCommunity)
      && (quota.value_type === 'unlimited'
        || (quota.value_type === 'exact' && quota.value !== null)
        || (quota.value_type === 'range' && quota.estimate_range !== null && quota.estimate_range !== undefined))
      && quotaEvidenceAllowed(snapshot, quota, verifiedOnly, includeCommunity);
  });
}

function compactModelAccesses(plan: SubscriptionPlan, category: 'chat' | 'agent'): Array<{ product: ProductAccess; access: ProductAccess['model_access'][number] }> {
  const matches = plan.products.filter((product) => product.included === true
    && product.rollout !== 'discontinued'
    && product.rollout !== 'unknown'
    && (category === 'chat' ? isChatProduct(product) : isAgentProduct(product)));
  return matches.flatMap((product) => {
    return product.model_access
      .filter((access) => !/未公布|未確認/.test(access.model))
      .map((access) => ({ product, access }));
  });
}

function modelForAccess(snapshot: Snapshot, plan: SubscriptionPlan, access: ProductAccess['model_access'][number]): ModelRecord | null {
  if (access.mapping === 'unmapped' || /未公布|未確認/.test(access.model)) return null;
  const target = access.model.replace(/（[^）]*）/g, '').trim().toLowerCase();
  const providerMatches = (model: ModelRecord) => plan.provider === 'xai'
    ? /spacexai|xai/i.test(model.provider)
    : model.provider.toLowerCase().includes(plan.provider.toLowerCase());
  const matches = snapshot.models.filter((model) => {
    if (!providerMatches(model)) return false;
    const name = model.name.trim().toLowerCase();
    return name === target || name.startsWith(`${target} (`);
  });
  if (!matches.length) return null;
  const modes = access.reasoning_modes.map((mode) => mode.toLowerCase().replace(/[^a-z]/g, '')).filter(Boolean);
  const rank = (model: ModelRecord): number => {
    const name = model.name.toLowerCase();
    const effort = name.match(/\(([^)]*)\)/)?.[1]?.toLowerCase() ?? '';
    if (modes.length === 1 && effort.includes(modes[0])) return -10;
    if (modes.includes('medium') && effort.includes('medium')) return -8;
    if (name.includes('default fallback')) return effort.includes('medium') ? -7 : -5;
    if (effort.includes('medium')) return 0;
    if (effort.includes('low')) return 1;
    if (effort.includes('high')) return 2;
    if (effort.includes('xhigh')) return 3;
    return 4;
  };
  return [...matches].sort((left, right) => rank(left) - rank(right))[0];
}

function modelScoreSummary(snapshot: Snapshot, plan: SubscriptionPlan, access: ProductAccess['model_access'][number]): string {
  const model = modelForAccess(snapshot, plan, access);
  if (!model) return MISSING;
  const scores = PRIMARY_SCORE_KEYS.flatMap(({ key, label }) => {
    const value = model.indices[key];
    return value === null || value === undefined ? [] : [`${label} ${value}`];
  });
  if (!scores.length) return MISSING;
  const effort = model.name.match(/\(([^)]*)\)/)?.[1]?.replace(/,?\s*Default Fallback/i, '').trim();
  const effortMapped = reasoningEffortIsMapped(access.reasoning_modes, effort ?? null);
  const approximate = access.mapping === 'approximate' || !effortMapped ? '≈' : '';
  const effortLabel = effort ? ` · AA ${reasoningLabel(effort)}${effortMapped ? '' : '（方案推理等級未對應）'}` : '';
  return `${approximate}${scores.join(' · ')}${effortLabel}`;
}

function compactProductLabel(product: ProductAccess): string {
  const status = product.rollout === 'limited' ? '推出中' : product.rollout === 'beta' ? '測試版' : '';
  return `${productLabel(product.product)}${status ? ` · ${status}` : ''}`;
}

function CompactModelList({ plan, snapshot, category }: { plan: SubscriptionPlan; snapshot: Snapshot; category: 'chat' | 'agent' }) {
  const rawEntries = compactModelAccesses(plan, category);
  const grouped = new Map<string, { products: ProductAccess[]; access: ProductAccess['model_access'][number] }>();
  rawEntries.forEach(({ product, access }) => {
    const privateModel = /未公布|未確認/.test(access.model);
    const key = `${privateModel ? product.product : ''}|${access.model}|${access.mapping}`;
    const group = grouped.get(key) ?? { products: [], access };
    if (!group.products.some((item) => item.product === product.product)) group.products.push(product);
    grouped.set(key, group);
  });
  const entries = [...grouped.values()];
  if (!entries.length) return <span className="compact-empty">尚無已公開模型</span>;
  return <div className="compact-model-list">{entries.map(({ products, access }, index) => {
    const scoreModel = modelForAccess(snapshot, plan, access);
    const score = modelScoreSummary(snapshot, plan, access);
    const productNames = [...new Set(products.map(compactProductLabel))].join('／');
    return <div className="compact-model-item" key={`${productNames}-${access.model}-${index}`}>
      <span className="compact-product-name">{productNames}</span>
      <b>{access.model}</b>
      <small className={score === MISSING ? 'compact-no-score' : 'compact-score'}>{score}{scoreModel && <> · <a href={scoreModel.public_page_source_url ?? scoreModel.source_url} target="_blank" rel="noreferrer" title={`Artificial Analysis 評測來源；資料更新 ${scoreModel.source_updated_at ?? '日期未公布'}`} aria-label="模型評分來源"><ExternalLink size={11}/></a></>}</small>
    </div>;
  })}</div>;
}

function CompactQuotaList({ snapshot, plan, category, verifiedOnly, includeCommunity }: { snapshot: Snapshot; plan: SubscriptionPlan; category: QuotaCategory; verifiedOnly: boolean; includeCommunity: boolean }) {
  const rows = compactQuotaRows(snapshot, plan, category, verifiedOnly, includeCommunity);
  if (!rows.length) return <span className="compact-empty">尚無可靠數據</span>;
  return <div className="compact-quota-list">{rows.map((quota) => {
    const value = compactQuotaValue(quota);
    const window = compactQuotaWindow(quota.window, quota.unit);
    const model = quota.model && !/未公布|未確認/.test(quota.model) ? ` · ${modelAccessLabel(quota.model)}` : '';
    const shared = quota.shared_with.length ? ` · 共用：${quota.shared_with.map(productLabel).join('、')}` : '';
    const entitlement = quotaEntitlement(plan, quota) === 'unknown' ? ' · 產品／權益未確認' : '';
    const caveat = /標題.*(?:正文|內文)|前後不一致|說法不一致/.test(quota.note)
      ? ' · 單次回報前後不一致'
      : /多代理|外部模型整合|疑似異常|非一般任務/i.test(quota.note) ? ' · 特殊多代理／異常案例' : '';
    const evidence = compactQuotaEvidence(snapshot, quota);
    return <div className="compact-quota-item" key={quota.id}>
      <span>{productLabel(quota.product)}</span>
      <b>{value}{window && value !== MISSING && value !== '官方未公布' ? `／${window}` : ''}</b>
      <small>{model}{shared}{entitlement}{caveat}{model || shared || entitlement || caveat ? ' · ' : ''}{evidence.label}{evidence.source && <> · <a href={evidence.source.url} target="_blank" rel="noreferrer" title={`${sourceLabel(evidence.source)}：${evidence.source.notes ?? ''}`} aria-label="額度資料來源"><ExternalLink size={11}/></a></>}</small>
    </div>;
  })}</div>;
}

function compactQuotaCardSummary(snapshot: Snapshot, plan: SubscriptionPlan, category: QuotaCategory, verifiedOnly: boolean, includeCommunity: boolean): string {
  const rows = snapshot.quotas.filter((quota) => plan.quota_ids.includes(quota.id) && quota.category === category && shouldShowCompactQuota(quota) && quotaEvidenceAllowed(snapshot, quota, verifiedOnly, includeCommunity));
  if (!rows.length) return '尚無資料';
  const includedRows = rows.filter((quota) => quotaEntitlement(plan, quota) === 'included');
  const excludedCount = rows.filter((quota) => quotaEntitlement(plan, quota) === 'excluded').length;
  const unknownRows = rows.filter((quota) => quotaEntitlement(plan, quota) === 'unknown');
  const unknownSummary = unknownRows.map((quota) => {
    const value = quota.value_type === 'variable' ? '動態額度' : quota.value_type === 'not_published' ? '未公布' : compactQuotaValue(quota);
    const modelReason = quotaModelReason(quota);
    return `${value}${modelReason ? `（${modelReason}）` : ''}`;
  });
  const statusNotes = [
    excludedCount ? excludedCount === 1 ? '未包含' : `${excludedCount} 項未包含` : '',
    unknownRows.length ? `${unknownSummary.join('、')}（權益未確認）` : '',
  ].filter(Boolean);
  if (!includedRows.length) return statusNotes.join(' · ') || '尚無資料';

  const modelNames = [...new Set(includedRows.map((quota) => quota.model).filter((model): model is string => Boolean(model)))];
  let summary: string;
  if (modelNames.length > 1) summary = `${modelNames.length} 組模型額度`;
  else if (includedRows.length > 1) summary = `${includedRows.length} 項產品額度`;
  else {
    const quota = includedRows[0];
    const value = quota.value_type === 'not_published' ? '官方未公布' : quotaDisplayValue(quota);
    const modelReason = quotaModelReason(quota);
    summary = `${productLabel(quota.product)}：${value}${modelReason ? `（${modelReason}）` : ''}`;
  }
  return statusNotes.length ? `${summary} · ${statusNotes.join(' · ')}` : summary;
}

function CompactPlanTable({ plans, snapshot, verifiedOnly, includeCommunity }: { plans: SubscriptionPlan[]; snapshot: Snapshot; verifiedOnly: boolean; includeCommunity: boolean }) {
  return <div className="table-scroll compact-plan-scroll"><table className="data-table compact-plan-table">
    <thead><tr><th>方案</th><th>聊天</th><th>代理</th></tr></thead>
    <tbody>{plans.length ? plans.map((plan) => <tr key={plan.id}>
      <td className="compact-plan-name"><b>{plan.provider_name}</b><small>{planLabel(plan.name)}{plan.tier === 'reference' ? ' · 參考方案（>$30）' : ''}</small></td>
      <td className="compact-usage-cell">
        <section className="compact-table-section"><b className="compact-section-title">可用模型／模型評分</b><CompactModelList plan={plan} snapshot={snapshot} category="chat"/></section>
        <section className="compact-table-section"><b className="compact-section-title">量化額度</b><CompactQuotaList snapshot={snapshot} plan={plan} category="chat" verifiedOnly={verifiedOnly} includeCommunity={includeCommunity}/></section>
      </td>
      <td className="compact-usage-cell">
        <section className="compact-table-section"><b className="compact-section-title">可用模型／模型評分</b><CompactModelList plan={plan} snapshot={snapshot} category="agent"/></section>
        <section className="compact-table-section compact-agent-quota-groups">
          <b className="compact-section-title">量化額度</b>
          <div><span>一般代理</span><CompactQuotaList snapshot={snapshot} plan={plan} category="agent" verifiedOnly={verifiedOnly} includeCommunity={includeCommunity}/></div>
          <div><span>程式代理</span><CompactQuotaList snapshot={snapshot} plan={plan} category="coding_agent" verifiedOnly={verifiedOnly} includeCommunity={includeCommunity}/></div>
        </section>
      </td>
    </tr>) : <tr><td colSpan={3}>{MISSING}</td></tr>}</tbody>
  </table></div>;
}

function IndexTable({ models, activeIndex }: { models: ModelRecord[]; activeIndex: string }) {
  return <div className="table-scroll"><table className="data-table index-table"><thead><tr><th>公司與模型</th>{INDEX_KEYS.map((key) => <th key={key}><span className="th-info">{INDEX_LABELS[key].label}<Info title={INDEX_LABELS[key].label}>{INDEX_LABELS[key].description}</Info></span></th>)}<th><span className="th-info">智能評測每任務 API 成本（美元）<Info title="智能評測每任務 API 成本（美元）">依 Artificial Analysis 綜合智能指數基準工作負載中的詞元（Token）用量及 API 定價計算；不是訂閱月費或訂閱任務保證。免費 API 不提供逐項基準測試的原始結果。</Info></span></th></tr></thead>
    <tbody>{models.length ? models.map((model) => <tr key={model.id}><td><b>{model.name}</b><small>{model.provider} · {model.version ?? '模型版本未另行公布'}{model.retired ? ' · 已淘汰' : ''}<br/>模型代碼：{model.id}</small>{model.benchmarks.length > 0 && <details className="model-benchmark-disclosure"><summary>查看底層基準測試（{model.benchmarks.length}）</summary><div className="model-benchmark-list">{model.benchmarks.map((score) => <div className="model-benchmark-item" key={`${score.benchmark_id}-${score.version ?? 'unknown'}`}><b>{benchmarkLabel(score.benchmark_id)}</b><span>{score.score === null ? MISSING : `${score.score}${score.unit === '%' || score.unit.startsWith('%') ? '' : ` ${translateUiText(score.unit)}`}`}</span><small>版本 {score.version ?? '未另行公布'} · {score.higher_is_better === true ? '越高越佳' : score.higher_is_better === false ? '越低越佳' : '依官方方法'}</small><small>資料更新日 {score.updated_at ?? '未公布'} · 核對日 {model.source_checked_at ?? '見來源核對紀錄'}</small><a href={score.method_url} target="_blank" rel="noreferrer">官方方法 <ExternalLink size={10}/></a></div>)}</div><a className="model-benchmark-source" href={model.public_page_source_url ?? model.source_url} target="_blank" rel="noreferrer">分數來源頁 <ExternalLink size={10}/></a></details>}</td>{INDEX_KEYS.map((key) => <td className={activeIndex === key ? 'selected-score' : ''} key={key}>{model.indices[key] === null || model.indices[key] === undefined ? <span className="muted">{MISSING}</span> : <b>{model.indices[key]}</b>}</td>)}<td>{model.intelligence_cost_per_task_usd === null ? <span className="muted">{MISSING}</span> : <>{formatPrice(model.intelligence_cost_per_task_usd)}<small>{model.intelligence_cost_model_name} · 代碼 {model.intelligence_cost_model_id} · 推理強度 {reasoningLabel(model.intelligence_cost_reasoning)} · 評測版本 {model.intelligence_cost_benchmark_version ?? '版本未知'}</small></>}<small>{model.data_origin === 'aa_free_api' ? '官方免費 API' : model.data_origin === 'aa_free_api+aa_public_page' ? '免費 API＋公開頁面快照' : '官方公開頁面快照'} · API 資料更新 {model.source_updated_at ?? '未公布'} · 頁面核對 {model.public_page_checked_at ?? model.source_checked_at ?? '見來源核對紀錄'} · <a href={model.source_url} target="_blank" rel="noreferrer">資料來源 <ExternalLink size={10}/></a>{model.public_page_source_url && <> · <a href={model.public_page_source_url} target="_blank" rel="noreferrer">公開頁面 <ExternalLink size={10}/></a></>}</small></td></tr>) : <tr><td colSpan={11}><EmptyState title="尚無已取得的 Artificial Analysis 分數" description="正式 API 需要 AA_API_KEY。免費 API 包含 9 項能力指數與智能評測每任務成本；目前未載入已授權 API 資料，因此分數維持缺值。" /></td></tr>}</tbody>
    </table></div>;
}

function ApiPricingTable({ models }: { models: ModelRecord[] }) {
  const money = (value: number | null) => value === null ? MISSING : `$${value.toLocaleString('en-US', { maximumFractionDigits: 6 })}`;
  return <div className="table-scroll"><table className="data-table api-pricing-table"><thead><tr><th>模型／版本</th><th>輸入／百萬詞元</th><th>輸出／百萬詞元</th><th>快取讀取／百萬詞元</th><th>快取寫入／百萬詞元</th><th>更新日／來源</th></tr></thead><tbody>{models.length ? models.map((model) => <tr key={model.id}><td><b>{model.name}</b><small>{model.id}</small></td><td>{money(model.api_pricing.input_per_million_usd)}</td><td>{money(model.api_pricing.output_per_million_usd)}</td><td>{money(model.api_pricing.cache_read_per_million_usd)}</td><td>{money(model.api_pricing.cache_write_per_million_usd)}</td><td>{model.source_updated_at ?? '來源更新日未公布'}<small>核對日 {model.public_page_checked_at ?? model.source_checked_at ?? '未知'} · {evidenceLabel(model.source_kind)} · <a href={model.source_url} target="_blank" rel="noreferrer">資料來源 <ExternalLink size={10}/></a></small></td></tr>) : <tr><td colSpan={6}><div className="empty-compact">尚未取得 API 定價資料。</div></td></tr>}</tbody></table></div>;
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return <div className="empty-state"><div className="empty-state__icon"><Activity size={19} /></div><strong>{title}</strong><p>{description}</p></div>;
}

function BenchmarkCatalog({ snapshot, indexId }: { snapshot: Snapshot; indexId: 'intelligence' | 'coding_agent' }) {
  const rows = snapshot.benchmark_catalog.filter((benchmark) => benchmark.index_id === indexId);
  return <div className="table-scroll"><table className="data-table benchmark-table"><thead><tr><th>基準測試</th><th>測試內容</th><th>分數方向與單位</th><th>實際得分</th><th>版本、樣本與更新日</th><th>指數權重與納入狀態</th><th>跨模型比較與限制</th><th>官方方法</th></tr></thead>
    <tbody>{rows.length ? rows.map((benchmark) => <tr key={benchmark.id}>
      <td><b>{benchmark.name_zh}</b><small>官方測試名稱：{benchmark.name}</small></td>
      <td className="wrapped-cell">{translateUiText(benchmark.what_it_tests)}</td>
      <td>{benchmark.direction === 'higher' ? '越高越佳' : benchmark.direction === 'lower' ? '越低越佳' : '依官方方法'}<small>單位：{benchmarkUnit(benchmark.metric_unit)}</small></td>
      <td>{benchmark.actual_score ?? MISSING}</td>
      <td>{benchmark.index_version}<small>{benchmark.task_count === null ? '樣本數未公布' : `樣本數 ${benchmark.task_count.toLocaleString('zh-Hant')} 項`}</small><small>{translateUiText(benchmark.protocol)}</small><small>官方更新日 {benchmark.updated_at ?? '未公布'} · 核對日 {benchmark.source_checked_at}</small></td>
      <td>{benchmark.index_weight_percent === null ? '權重未公開' : `${benchmark.index_weight_percent}%`}<small>{benchmark.index_id === 'intelligence' ? '納入綜合智能指數' : benchmark.index_id === 'coding_agent' ? '納入程式代理指數' : '未確認納入主要指數'}</small></td>
      <td className="wrapped-cell">{benchmark.cross_model_comparable ? '同版本及同評估設定下可比' : '需比對完整模型與執行框架組態'}<small>{translateUiText(benchmark.comparability_note)}</small></td>
      <td><a href={benchmark.method_url} target="_blank" rel="noreferrer">查看測試方法 <ExternalLink size={11}/></a></td>
    </tr>) : <tr><td colSpan={8}><div className="empty-compact">目前沒有可核對的基準測試資料。</div></td></tr>}</tbody>
  </table></div>;
}

function ModelPage({ snapshot, models, activeIndex, onIndex, providerFilter }: { snapshot: Snapshot; models: ModelRecord[]; activeIndex: string; onIndex: (id: string) => void; providerFilter: string }) {
  const filtered = providerFilter === 'all' ? models : models.filter((model) => `${model.provider} ${model.id}`.toLowerCase().includes(providerFilter));
  const summaryModels = filtered.slice(0, 6);
  const chartData = comparableCostPoints(filtered).map((item) => ({ name: item.name, provider: item.id, x: item.cost, y: item.score }));
  const apiConnected = models.some((model) => model.data_origin === 'aa_free_api' || model.data_origin === 'aa_free_api+aa_public_page');
  const publicSnapshots = models.filter((model) => model.data_origin === 'aa_public_page' || model.data_origin === 'aa_free_api+aa_public_page').length;
  return <div className="page-stack">
    <section className="section-panel">
      <div className="snapshot-note"><b>{apiConnected ? 'Artificial Analysis 免費 API＋官方公開頁面快照' : '官方公開頁面快照'}</b><span>{apiConnected ? `目前有免費 API 模型資料；另保留 ${publicSnapshots} 筆公開頁面基準測試快照。` : `以下 ${publicSnapshots} 筆模型組態及底層測試分數於 2026-10-16 從公開官方比較頁人工核對；免費 API 尚未連接（需要 API 金鑰），不代表即時 API 擷取。`}</span></div>
      <div className="section-title"><div><h2>Artificial Analysis 能力指數</h2><p>目前指數方法版 {snapshot.index_versions.intelligence_methodology ?? '尚未核實'}；API 回傳版 {snapshot.index_versions.intelligence_api ?? '未連接'}。</p></div><label className="select-label">查看欄位<select value={activeIndex} onChange={(e) => onIndex(e.target.value)}>{INDEX_KEYS.map((key) => <option value={key} key={key}>{INDEX_LABELS[key].label}</option>)}</select></label></div>
      <div className="model-summary-block">
        <div className="summary-block-heading"><h3>{INDEX_LABELS[activeIndex]?.label ?? '能力指數'}摘要</h3><span>{filtered.length > summaryModels.length ? `顯示前 ${summaryModels.length} 個` : `顯示全部 ${summaryModels.length} 個`}／共 {filtered.length} 個模型 · 依目前排序</span></div>
        {summaryModels.length ? <div className="model-summary-grid">{summaryModels.map((model) => <article className="summary-card" key={model.id}>
          <span className="summary-card__eyebrow">{translateUiText(model.provider)}</span><h4>{model.name}</h4>
          <div className="summary-card__metric"><b>{model.indices[activeIndex] ?? MISSING}</b><span>{INDEX_LABELS[activeIndex]?.label}</span></div>
          <p>智能評測每任務成本：{model.intelligence_cost_per_task_usd === null ? MISSING : formatPrice(model.intelligence_cost_per_task_usd)}</p>
          <small>模型版本 {model.version ?? '未公布'} · {evidenceLabel(model.source_kind)}</small>
        </article>)}</div> : <EmptyState title="目前篩選條件沒有模型" description="調整公司、模型或來源條件。"/>}
      </div>
      <details className="data-disclosure"><summary>查看九項能力的資料覆蓋</summary><div className="index-cards">{INDEX_KEYS.map((key) => <button className={`index-chip ${activeIndex === key ? 'index-chip--active' : ''}`} onClick={() => onIndex(key)} key={key}><span>{INDEX_LABELS[key].label}<Info title={INDEX_LABELS[key].label}>{INDEX_LABELS[key].description}</Info></span><b>{models.length ? models.filter((model) => model.indices[key] !== null).length : '—'}</b><small>有分數模型</small></button>)}</div></details>
      <details className="data-disclosure"><summary>完整模型指數、底層測試與資料來源（{filtered.length} 個模型）</summary><IndexTable models={filtered} activeIndex={activeIndex} /></details>
      <details className="data-disclosure"><summary>指數方法與分類權重</summary><div className="methodology-box"><div><b>綜合智能指數分類權重 · {snapshot.index_versions.intelligence_methodology ?? '版本未核實'}</b><p>{translateUiText(snapshot.index_methodology.note)}</p></div><div className="table-scroll"><table className="data-table compact-table"><thead><tr><th>能力類別</th><th>權重</th></tr></thead><tbody>{Object.entries(snapshot.index_methodology.intelligence_category_weights).map(([name, weight])=><tr key={name}><td>{name === 'Agents' ? '代理任務' : name === 'Coding' ? '程式能力' : name === 'Scientific Reasoning' ? '科學推理' : name === 'General' ? '一般能力' : translateUiText(name)}</td><td><b>{weight}%</b></td></tr>)}</tbody></table></div><SourceLinks ids={['aa-method']} sources={snapshot.sources} label="指數方法來源" /></div><div className="capability-gap"><b>免費 API 尚未提供的其他指標</b><p>多語言、中文、日文、視覺理解、開源程度、長文本理解與指示遵循等項目，目前沒有可匯入的免費 API 分數；部分資料可能僅在 Pro API 或獨立測試頁提供。取得授權資料前維持缺值，不以九項指數代替。</p><SourceLinks ids={['aa-api-reference','aa-method']} sources={snapshot.sources} /></div></details>
      <div className="source-footnote"><span>API 每百萬詞元單價會依輸入、輸出及快取分開列示，並與每任務成本及訂閱月費分開。官方公開比較頁未公布的欄位保留缺值。</span><SourceLinks ids={['aa-free-api','aa-api-reference','aa-method','aa-public-gemini-argon-comparison','aa-public-gpt-6-luna-high-comparison']} sources={snapshot.sources} /></div>
    </section>
    <section className="section-panel">
      <div className="section-title"><div><h2>綜合智能能力 × API 每任務成本</h2><p>只繪製相同綜合智能指數版本且同時有分數與正值成本的模型。{chartData[0] ? `目前顯示版本 ${comparableCostPoints(filtered)[0]?.benchmarkVersion}。` : ''}</p></div></div>
      <details className="chart-disclosure"><summary>查看成本與分數散點圖</summary>{chartData.length > 1 ? <div className="chart-box"><ResponsiveContainer width="100%" height={300}><ScatterChart margin={{ top: 12, right: 18, bottom: 18, left: 8 }}><CartesianGrid strokeDasharray="3 3" stroke="#e6e9eb"/><XAxis type="number" dataKey="x" name="每任務成本（美元）" tickFormatter={(value) => `$${value}`} label={{ value: '智能評測每任務 API 成本（美元）', position: 'insideBottom', offset: -10 }}/><YAxis type="number" dataKey="y" name="綜合智能指數" label={{ value: '綜合智能指數', angle: -90, position: 'insideLeft' }}/><ChartTooltip cursor={{ strokeDasharray: '3 3' }} formatter={(value: number, name) => [name === 'x' ? `$${value}` : value, name === 'x' ? 'API 成本/任務' : '綜合智能指數']}/><Scatter data={chartData} fill="#247d68"/></ScatterChart></ResponsiveContainer></div> : <EmptyState title="目前沒有可比較的成本點" description="相同 Artificial Analysis 版本至少要有兩筆已驗證的分數與每任務 API 成本，才能繪圖。"/>}</details>
    </section>
    <section className="section-panel"><div className="section-title"><div><h2>API 每百萬詞元價格</h2><p>輸入、輸出及快取價格分開列示，與兩種基準測試任務成本及訂閱月費分開。</p></div></div><details className="data-disclosure"><summary>查看 API 價格、快取費率與來源</summary><ApiPricingTable models={filtered}/></details></section>
    <section className="section-panel">
      <div className="section-title"><div><h2>底層基準測試目錄</h2><p>各項測試保留自己的單位、方法版本與可比性。未取得分數顯示「尚無可靠數據」。</p></div></div>
      <details className="data-disclosure"><summary>查看測試單位、版本、權重與限制</summary><BenchmarkCatalog snapshot={snapshot} indexId="intelligence" /></details>
    </section>
  </div>;
}

function CodingPage({ snapshot, agents, verifiedOnly }: { snapshot: Snapshot; agents: CodingAgentRecord[]; verifiedOnly: boolean }) {
  const comparable = comparableCodingAgents(verifiedOnly ? officialCodingCostRows(snapshot, agents) : agents);
  const data = comparable.records.map((agent) => ({ name: agentLabel(agent.agent), harness: agent.harness ?? '執行框架未公布', x: agent.cost_per_task_usd!, y: agent.coding_agent_index! }));
  const harnessGroups = [...new Set(data.map((item) => item.harness))];
  const summaryAgents = agents.slice(0, 6);
  return <div className="page-stack">
    <section className="section-panel">
      <div className="section-title"><div><h2>程式代理指數 {snapshot.index_versions.coding_agent ?? '版本未知'}</h2><p>DeepSWE v1.1、Terminal-Bench 4.0、SWE-Atlas-QnA；三項測試等權，依合併任務指標計分。成本圖只比較相同基準版本及來源類型：{comparable.version ?? MISSING}{comparable.costKind ? ` · ${evidenceLabel(comparable.costKind)}` : ''}。</p></div><a className="button button--quiet" href="https://artificialanalysis.ai/agents/coding-agents" target="_blank" rel="noreferrer">官方程式代理頁面 <ExternalLink size={14}/></a></div>
      <div className="agent-summary-block">
        <div className="summary-block-heading"><h3>代理組態摘要</h3><span>{agents.length} 組設定 · 依目前排序</span></div>
        {summaryAgents.length ? <div className="agent-summary-grid">{summaryAgents.map((agent) => <article className="summary-card" key={agent.id}>
          <span className="summary-card__eyebrow">{agent.provider === 'openai' ? 'OpenAI' : agent.provider === 'anthropic' ? 'Anthropic' : agent.provider === 'google' ? 'Google' : 'xAI / X'}</span>
          <h4>{agentLabel(agent.agent)}</h4>
          <div className="summary-card__metric"><b>{agent.coding_agent_index ?? MISSING}</b><span>程式代理指數</span></div>
          <p>{agent.model ?? MISSING} · {reasoningLabel(agent.reasoning_effort)}</p>
          <p>執行框架：{translateUiText(agent.harness ?? MISSING)}</p>
          <small>每任務 API 成本：{agent.cost_per_task_usd === null ? MISSING : formatPrice(agent.cost_per_task_usd)} · {evidenceLabel(agent.cost_kind)}</small>
        </article>)}</div> : <EmptyState title="目前篩選條件沒有代理組態" description="調整公司、模型或來源條件。"/>}
      </div>
      <div className="agent-note"><Bot size={18}/><p><b>每個資料點代表一組代理設定，不是純模型分數。</b>模型、推理強度、執行框架與測試環境都會影響結果；點的顏色依執行框架分組。Gemini CLI 個人帳號版已停止服務，不代表目前 AI Pro 權益。</p></div>
      <details className="chart-disclosure"><summary>查看程式代理成本散點圖</summary>
      {data.length > 1 ? <div className="chart-box"><ResponsiveContainer width="100%" height={300}><ScatterChart margin={{ top: 12,right:18,bottom:18,left:8 }}><CartesianGrid strokeDasharray="3 3" stroke="#e6e9eb"/><XAxis type="number" dataKey="x" name="每任務 API 成本" tickFormatter={(value) => `$${value}`} label={{ value:'程式代理每任務 API 成本（美元）',position:'insideBottom',offset:-10 }}/><YAxis type="number" dataKey="y" name="程式代理指數" label={{ value:'程式代理指數',angle:-90,position:'insideLeft' }}/><ChartTooltip formatter={(value: number,name)=>[name==='x'?`$${value}`:value,name==='x'?'每任務 API 成本':'程式代理指數']} labelFormatter={(_,payload)=>`${payload?.[0]?.payload?.name ?? ''} · ${payload?.[0]?.payload?.harness ?? ''}`}/>{harnessGroups.map((harness, index) => <Scatter key={harness} name={translateUiText(harness)} data={data.filter((item) => item.harness === harness)} fill={CHART_COLORS[index % CHART_COLORS.length]}/>) }<Legend/></ScatterChart></ResponsiveContainer></div> : <EmptyState title="尚無可核對的代理組態分數" description="程式代理 API 尚未提供可用的授權匯入端點；目前採用附來源與版本的人工匯入流程。只有記錄官方來源、組態與日期的資料才會納入比較。"/>}
      </details>
      <details className="data-disclosure"><summary>完整代理組態、詞元、分數來源與日期（{agents.length} 組）</summary>
      <div className="table-scroll"><table className="data-table coding-table"><thead><tr><th>代理／執行框架</th><th>模型／推理強度</th><th>程式代理指數</th><th>底層測試結果</th><th>基準版本</th><th>每任務平均詞元數</th><th>輸入／快取／輸出詞元</th><th>平均執行時間</th><th>程式代理每任務 API 成本</th><th>更新日／來源／備註</th></tr></thead><tbody>{agents.length ? agents.map((agent) => <tr key={agent.id}><td><b>{agentLabel(agent.agent)}</b><small>公司：{agent.provider === 'openai' ? 'OpenAI' : agent.provider === 'anthropic' ? 'Anthropic' : agent.provider === 'google' ? 'Google' : 'xAI / X'}</small><small>{translateUiText(agent.harness ?? MISSING)}</small></td><td>{agent.model ?? MISSING}<small>推理強度：{reasoningLabel(agent.reasoning_effort)}</small></td><td>{agent.coding_agent_index ?? MISSING}<small>資料類型：{evidenceLabel(agent.cost_kind)}</small></td><td>{agent.scores.length ? agent.scores.map((score) => <small className="coding-score" key={`${score.benchmark_id}-${score.version}`}><b>{benchmarkLabel(score.benchmark_id)}</b>：{score.score === null ? MISSING : `${score.score}${score.unit === '%' ? '%' : ` ${translateUiText(score.unit)}`}`} · {score.version ?? '版本未公布'}<br/>{score.method_url ? <a href={score.method_url} target="_blank" rel="noreferrer">官方測試方法</a> : null}</small>) : MISSING}</td><td>{agent.benchmark_version ?? MISSING}</td><td>{agent.average_task_tokens?.toLocaleString() ?? MISSING}</td><td>{agent.input_tokens?.toLocaleString() ?? MISSING}／{agent.cached_tokens?.toLocaleString() ?? MISSING}／{agent.output_tokens?.toLocaleString() ?? MISSING}<small>快取命中率 {agent.cache_hit_percent == null ? MISSING : `${agent.cache_hit_percent}%`}</small></td><td>{agent.average_task_seconds === null ? MISSING : `${agent.average_task_seconds.toFixed(1)} 秒`}</td><td>{agent.cost_per_task_usd === null ? MISSING : formatPrice(agent.cost_per_task_usd)}</td><td>{agent.source_updated_at ?? '來源頁未公布'}<small>核對日 {agent.source_checked_at ?? '見來源核對紀錄'}<br/><a href={agent.source_url} target="_blank" rel="noreferrer">資料來源 <ExternalLink size={10}/></a> · {translateUiText(agent.note)}</small></td></tr>) : <tr><td colSpan={10}><div className="empty-compact">目前篩選條件下沒有已核對匯入的代理組態。保留缺值，不從圖表估讀分數。</div></td></tr>}</tbody></table></div>
      </details>
      <div className="source-footnote"><span>基準資料採版本化匯入範本，並經資料匯入與驗證流程檢查。</span><SourceLinks ids={['aa-coding-agents','aa-coding-method']} sources={snapshot.sources}/></div>
    </section>
    <section className="section-panel"><div className="section-title"><div><h2>程式代理指數的底層測試</h2><p>列出官方公開比較頁人工核對的組態結果；未公開的測試版本或分數保留缺值。</p></div></div><details className="data-disclosure"><summary>查看底層測試內容、版本與方法</summary><BenchmarkCatalog snapshot={snapshot} indexId="coding_agent"/></details></section>
  </div>;
}

function ValuePage({ snapshot, plans, models, agents, verifiedOnly }: { snapshot: Snapshot; plans: SubscriptionPlan[]; models: ModelRecord[]; agents: CodingAgentRecord[]; verifiedOnly: boolean }) {
  const points = comparableCostPoints(models);
  const frontier = paretoFrontier(points);
  const codingComparison = comparableCodingAgents(verifiedOnly ? officialCodingCostRows(snapshot, agents) : agents);
  const codingPoints = codingComparison.records;
  const codingHarnesses = [...new Set(codingPoints.map((agent) => agent.harness ?? '執行框架未公布'))];
  const intelligenceCostCount = models.filter((model) => model.intelligence_cost_per_task_usd !== null).length;
  const apiPriceCount = models.filter((model) => model.api_pricing.input_per_million_usd !== null).length;
  const codingCostCount = agents.filter((agent) => agent.cost_per_task_usd !== null).length;
  const frontierIds = new Set(frontier.map((point) => point.id));
  const topIntelligence = [...points].sort((a, b) => (intelligenceEfficiency(models.find((model) => model.id === b.id)!, b.benchmarkVersion) ?? -Infinity) - (intelligenceEfficiency(models.find((model) => model.id === a.id)!, a.benchmarkVersion) ?? -Infinity)).slice(0, 6);
  const topCoding = [...codingPoints].sort((a, b) => (b.coding_agent_index! / b.cost_per_task_usd!) - (a.coding_agent_index! / a.cost_per_task_usd!)).slice(0, 6);
  return <div className="page-stack">
    <section className="section-panel"><div className="section-title"><div><h2>綜合智能能力 × 每任務 API 成本</h2><p>目前篩選結果：{models.length} 個模型；有智能評測每任務成本 {intelligenceCostCount} 個。圖表與表格只納入相同評測版本。</p></div></div>
      <div className="value-summary-block"><div className="summary-block-heading"><h3>智能評測每美元效率摘要</h3><span>{points.length} 個同版本可比較模型</span></div>{topIntelligence.length ? <div className="value-summary-grid">{topIntelligence.map((point) => { const model = models.find((item) => item.id === point.id); const efficiency = model ? intelligenceEfficiency(model, point.benchmarkVersion) : null; return <article className="summary-card" key={point.id}><span className="summary-card__eyebrow">{model?.provider ?? ''}</span><h4>{point.name}</h4><div className="summary-card__metric"><b>{efficiency === null ? MISSING : efficiency.toFixed(2)}</b><span>綜合智能指數／美元</span></div><p>指數 {point.score ?? MISSING} · 每任務成本 {point.cost === null ? MISSING : formatPrice(point.cost)}</p><small>同一評測版本 {point.benchmarkVersion ?? MISSING}{frontierIds.has(point.id) ? ' · 帕累托前緣' : ''}</small></article>; })}</div> : <EmptyState title="尚無可比較的智能評測成本資料" description="需要相同 Artificial Analysis 評測版本的模型分數與正值任務成本，才會納入效率比較。"/>}</div>
      <details className="chart-disclosure"><summary>查看智能能力與每任務成本散點圖</summary>{points.length > 1 ? <div className="chart-box"><ResponsiveContainer width="100%" height={310}><ScatterChart margin={{top:12,right:18,bottom:18,left:8}}><CartesianGrid strokeDasharray="3 3" stroke="#e6e9eb"/><XAxis type="number" dataKey="cost" name="每任務 API 成本（美元）" tickFormatter={(v)=>`$${v}`} label={{value:'智能評測每任務 API 成本（美元）',position:'insideBottom',offset:-10}}/><YAxis type="number" dataKey="score" name="綜合智能指數" label={{value:'綜合智能指數',angle:-90,position:'insideLeft'}}/><ChartTooltip formatter={(v:number,n)=>[n==='cost'?`$${v}`:v,n==='cost'?'每任務成本':'綜合智能指數']}/><Scatter name="所有模型" data={points.map(p=>({...p,cost:p.cost,score:p.score}))} fill="#8c939d"/><Scatter name="帕累托前緣" data={frontier.map(p=>({...p,cost:p.cost,score:p.score}))} fill="#247d68" shape="star"/><Legend/></ScatterChart></ResponsiveContainer><p className="chart-caption">帕累托前緣：在同一評測版本中，沒有其他模型同時分數更高且成本更低。</p></div> : <EmptyState title="尚無可比較的智能評測成本資料" description="需要相同 Artificial Analysis 評測版本的模型分數與正值任務成本，才會納入圖表和效率比較。"/>}</details>
      <details className="data-disclosure"><summary>完整智能模型成本與效率表（{points.length} 個模型）</summary>
      <div className="table-scroll"><table className="data-table value-table"><thead><tr><th>模型</th><th>綜合智能指數</th><th>評測版本</th><th>智能評測每任務 API 成本（美元）</th><th>每美元智能指數</th><th>帕累托前緣</th></tr></thead><tbody>{points.length ? points.map((point) => { const model = models.find((item) => item.id === point.id); const efficiency = model ? intelligenceEfficiency(model, point.benchmarkVersion) : null; return <tr key={point.id}><td><b>{point.name}</b><small>{model?.provider ?? ''}</small></td><td>{point.score ?? MISSING}</td><td>{point.benchmarkVersion ?? MISSING}</td><td>{point.cost === null ? MISSING : formatPrice(point.cost)}</td><td>{efficiency === null ? MISSING : efficiency.toFixed(2)}</td><td>{frontierIds.has(point.id) ? '是' : '否'}</td></tr>; }) : <tr><td colSpan={6}><div className="empty-compact">目前沒有相同評測版本下可比較的模型成本資料。</div></td></tr>}</tbody></table></div>
      </details>
    </section>
    <section className="section-panel"><div className="section-title"><div><h2>程式代理能力 × 每任務 API 成本</h2><p>僅比較相同評測版本 {codingComparison.version ?? MISSING}、相同來源類型 {evidenceLabel(codingComparison.costKind)}；每筆資料都是模型、推理強度與執行框架等設定組合，顏色依執行框架分組。此成本不換算為訂閱可執行任務數。</p></div></div>
      <div className="value-summary-block"><div className="summary-block-heading"><h3>程式代理每美元效率摘要</h3><span>{codingPoints.length} 組同版本、同來源的代理組態</span></div>{topCoding.length ? <div className="value-summary-grid">{topCoding.map((agent) => <article className="summary-card" key={agent.id}><span className="summary-card__eyebrow">{agent.provider === 'openai' ? 'OpenAI' : agent.provider === 'anthropic' ? 'Anthropic' : agent.provider === 'google' ? 'Google' : 'xAI / X'}</span><h4>{agentLabel(agent.agent)}</h4><div className="summary-card__metric"><b>{(agent.coding_agent_index! / agent.cost_per_task_usd!).toFixed(2)}</b><span>程式代理指數／美元</span></div><p>{agent.model ?? MISSING} · {translateUiText(agent.harness ?? MISSING)}</p><small>指數 {agent.coding_agent_index} · 每任務成本 {formatPrice(agent.cost_per_task_usd)} · {evidenceLabel(agent.cost_kind)}</small></article>)}</div> : <EmptyState title="尚無相同版本的程式代理成本資料" description="摘要只列相同評測版本和來源類型下的代理組態。"/>}</div>
      <details className="chart-disclosure"><summary>查看程式代理能力與成本散點圖</summary>{codingPoints.length>1 ? <div className="chart-box"><ResponsiveContainer width="100%" height={280}><ScatterChart margin={{top:12,right:18,bottom:18,left:8}}><CartesianGrid strokeDasharray="3 3" stroke="#e6e9eb"/><XAxis type="number" dataKey="cost_per_task_usd" name="每任務 API 成本" tickFormatter={(v)=>`$${v}`} label={{value:'程式代理每任務 API 成本（美元）',position:'insideBottom',offset:-10}}/><YAxis type="number" dataKey="coding_agent_index" name="程式代理指數" label={{value:'程式代理指數',angle:-90,position:'insideLeft'}}/><ChartTooltip formatter={(v:number,n)=>[n==='cost_per_task_usd'?`$${v}`:v,n==='cost_per_task_usd'?'程式代理每任務成本':'程式代理指數']} labelFormatter={(_,payload)=>`${agentLabel(payload?.[0]?.payload?.agent ?? '')} · ${translateUiText(payload?.[0]?.payload?.harness ?? '')}`}/>{codingHarnesses.map((harness,index)=><Scatter key={harness} name={translateUiText(harness)} data={codingPoints.filter((agent)=> (agent.harness ?? '執行框架未公布')===harness)} fill={CHART_COLORS[index%CHART_COLORS.length]}/>)}<Legend/></ScatterChart></ResponsiveContainer></div> : <EmptyState title="尚無相同版本的程式代理成本資料" description="圖表只比較相同評測版本和成本來源類型的代理組態。"/>}</details>
      <details className="data-disclosure"><summary>完整代理詞元、時間、成本與效率表（{codingPoints.length} 組）</summary>
      <div className="table-scroll"><table className="data-table value-table"><thead><tr><th>代理組態</th><th>模型／推理強度</th><th>執行框架</th><th>程式代理指數</th><th>每任務詞元數</th><th>平均時間</th><th>程式代理每任務 API 成本（美元）</th><th>每美元代理指數</th><th>評測版本／資料類型</th></tr></thead><tbody>{codingPoints.length ? codingPoints.map((agent) => <tr key={agent.id}><td><b>{agentLabel(agent.agent)}</b></td><td>{agent.model ?? MISSING}<small>{reasoningLabel(agent.reasoning_effort)}</small></td><td>{translateUiText(agent.harness ?? MISSING)}</td><td>{agent.coding_agent_index ?? MISSING}</td><td>{agent.average_task_tokens?.toLocaleString() ?? MISSING}<small>輸入／快取／輸出：{agent.input_tokens?.toLocaleString() ?? MISSING}／{agent.cached_tokens?.toLocaleString() ?? MISSING}／{agent.output_tokens?.toLocaleString() ?? MISSING}</small></td><td>{agent.average_task_seconds === null ? MISSING : `${agent.average_task_seconds.toFixed(1)} 秒`}</td><td>{agent.cost_per_task_usd === null ? MISSING : formatPrice(agent.cost_per_task_usd)}</td><td>{agent.coding_agent_index === null || agent.cost_per_task_usd === null || agent.cost_per_task_usd <= 0 ? MISSING : (agent.coding_agent_index / agent.cost_per_task_usd).toFixed(2)}</td><td>{agent.benchmark_version ?? MISSING}<small>{evidenceLabel(agent.cost_kind)}</small></td></tr>) : <tr><td colSpan={9}><div className="empty-compact">目前沒有相同評測版本與成本來源類型下可比較的代理組態。</div></td></tr>}</tbody></table></div>
      </details>
    </section>
    <section className="section-panel"><div className="section-title"><div><h2>每美元價值公式與限制</h2><p>只在相同基準版本、成本定義一致且成本大於零時計算。</p></div></div><details className="data-disclosure"><summary>查看計算方式與限制</summary>
      <div className="table-scroll"><table className="data-table formula-table"><thead><tr><th>比較項目</th><th>計算公式</th><th>可比較條件</th><th>限制</th></tr></thead><tbody>
        <tr><td><b>智能評測效率</b></td><td>綜合智能指數 ÷ 智能評測每任務 API 成本（美元）</td><td>相同綜合智能指數版本；使用官方公布的每任務成本</td><td>不是訂閱價值，也不代表每月任務額度。</td></tr>
        <tr><td><b>程式代理效率</b></td><td>程式代理指數 ÷ 程式代理每任務 API 成本（美元）</td><td>相同代理評測版本與成本資料類型；每個執行框架均標明為獨立組態</td><td>不同代理組態的差異不能全歸因於模型，也不代表相同執行框架下的直接比較。</td></tr>
        <tr><td><b>消費者訂閱費</b></td><td>月繳價格、年繳總額、年繳月均各自列示</td><td>相同幣別與地區；優惠另行標示</td><td>不以 API 任務成本推算訂閱可執行任務數。</td></tr>
      </tbody></table></div></details>
    </section>
    <section className="section-panel"><div className="section-title"><div><h2>三種金錢資料的覆蓋情況</h2><p>API 詞元單價、基準測試任務成本、消費者訂閱月費使用不同欄位與公式。</p></div></div><details className="data-disclosure"><summary>查看三類成本資料的覆蓋與差異</summary>
      <div className="table-scroll"><table className="data-table coverage-table"><thead><tr><th>金錢資料</th><th>目前覆蓋</th><th>資料內容</th><th>不得混用的項目</th></tr></thead><tbody>
        <tr><td><b>API 每百萬詞元價格</b></td><td>{models.length ? `${apiPriceCount}/${models.length} 個模型` : MISSING}</td><td>輸入、輸出、快取讀取與快取寫入價格。</td><td>不可直接當成每任務成本或訂閱月費。</td></tr>
        <tr><td><b>智能評測每任務 API 成本</b></td><td>{models.length ? `${intelligenceCostCount}/${models.length} 個模型` : MISSING}</td><td>只採官方公布的基準工作負載成本。</td><td>不可換算成訂閱方案保證任務數。</td></tr>
        <tr><td><b>程式代理每任務 API 成本</b></td><td>{agents.length ? `${codingCostCount}/${agents.length} 組代理設定` : MISSING}</td><td>列出平均詞元數、執行時間、模型與執行框架。</td><td>與智能評測成本、訂閱額度分開比較。</td></tr>
        <tr><td><b>訂閱方案月費</b></td><td>{plans.length} 個方案</td><td>另列年繳總額、月均、稅金與地區。</td><td>方案額度依對話、一般代理、程式代理分開記錄。</td></tr>
      </tbody></table></div></details>
    </section>
  </div>;
}

function App() {
  const { snapshot, status, error, refreshing, reload } = useSnapshot();
  const [tab, setTab] = useState<Tab>('plans');
  const [planView, setPlanView] = useState<'cards' | 'table'>('cards');
  const [provider, setProvider] = useState('all');
  const [cap, setCap] = useState('30');
  const [quotaFilter, setQuotaFilter] = useState<QuotaCategory | 'all'>('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('price-low');
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [activeIndex, setActiveIndex] = useState('intelligence');
  const [includeCommunity, setIncludeCommunity] = useState(true);
  const [modelFilter, setModelFilter] = useState('all');
  const [reasoningFilter, setReasoningFilter] = useState('all');
  const [windowFilter, setWindowFilter] = useState('all');
  const [capabilityFilter, setCapabilityFilter] = useState('all');
  const capNumber = cap.trim() === '' ? null : Number(cap);
  const selectedTab = TABS.find((item) => item.id === tab)!;
  const activeAdvancedFilters = [quotaFilter !== 'all', modelFilter !== 'all', reasoningFilter !== 'all', windowFilter !== 'all', capabilityFilter !== 'all', !verifiedOnly, includeCommunity].filter(Boolean).length;

  useEffect(() => { setSort(defaultSortForTab(tab)); }, [tab]);

  const modelOptions = useMemo(() => {
    if (!snapshot) return [];
    const names = [
      ...snapshot.models.map((model) => model.name),
      ...snapshot.plans.flatMap((plan) => plan.products.flatMap((product) => product.model_access.map((access) => access.model))),
      ...snapshot.coding_agents.map((agent) => agent.model).filter((model): model is string => Boolean(model)),
    ];
    return [...new Set(names)].sort((a, b) => a.localeCompare(b));
  }, [snapshot]);
  const reasoningOptions = useMemo(() => {
    if (!snapshot) return [];
    const values = [
      ...snapshot.models.map((model) => model.intelligence_cost_reasoning),
      ...snapshot.plans.flatMap((plan) => plan.products.flatMap((product) => product.model_access.flatMap((access) => access.reasoning_modes))),
      ...snapshot.quotas.map((quota) => quota.reasoning_mode),
      ...snapshot.coding_agents.map((agent) => agent.reasoning_effort),
    ].filter((value): value is string => Boolean(value));
    return [...new Set(values)].sort((a, b) => a.localeCompare(b));
  }, [snapshot]);
  const windowOptions = useMemo(() => snapshot ? [...new Set(snapshot.quotas.map((quota) => quota.window).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b)) : [], [snapshot]);

  const plans = useMemo(() => {
    if (!snapshot) return [];
    let rows = snapshot.plans.filter((plan) => priceWithinCap(plan, tab === 'plans' && Number.isFinite(capNumber) ? capNumber : null));
    if (provider !== 'all') rows = rows.filter((plan) => plan.provider === provider);
    if (search.trim()) rows = rows.filter((plan) => `${plan.provider_name} ${plan.name} ${plan.products.map(p=>p.product).join(' ')}`.toLowerCase().includes(search.toLowerCase()));
    if (modelFilter !== 'all') rows = rows.filter((plan) => plan.products.some((product) => product.model_access.some((access) => access.model.toLowerCase() === modelFilter.toLowerCase())));
    if (reasoningFilter !== 'all') rows = rows.filter((plan) => plan.products.some((product) => product.model_access.some((access) => access.reasoning_modes.includes(reasoningFilter))) || snapshot.quotas.some((quota) => plan.quota_ids.includes(quota.id) && quota.reasoning_mode === reasoningFilter));
    if (windowFilter !== 'all') rows = rows.filter((plan) => snapshot.quotas.some((quota) => plan.quota_ids.includes(quota.id) && quota.window === windowFilter));
    const sourceIds = (plan: SubscriptionPlan) => [...plan.source_ids, ...plan.products.flatMap((product) => product.source_ids)];
    if (verifiedOnly) rows = rows.filter((plan) => sourceIds(plan).length > 0 && sourceIds(plan).every((id) => snapshot.sources.find((source) => source.id === id)?.kind === 'official'));
    if (!includeCommunity) rows = rows.filter((plan) => sourceIds(plan).every((id) => snapshot.sources.find((source) => source.id === id)?.kind !== 'community'));
    if (sort === 'price-low') rows = [...rows].sort((a,b) => (a.monthly_price ?? Infinity) - (b.monthly_price ?? Infinity));
    if (sort === 'price-high') rows = [...rows].sort((a,b) => (b.monthly_price ?? -Infinity) - (a.monthly_price ?? -Infinity));
    if (sort === 'quota-chat') rows = [...rows].sort((a,b) => numericQuotaCount(snapshot,b,'chat',verifiedOnly,includeCommunity) - numericQuotaCount(snapshot,a,'chat',verifiedOnly,includeCommunity));
    if (sort === 'quota-coding') rows = [...rows].sort((a,b) => numericQuotaCount(snapshot,b,'coding_agent',verifiedOnly,includeCommunity) - numericQuotaCount(snapshot,a,'coding_agent',verifiedOnly,includeCommunity));
    if (sort === 'cost-low') rows = [...rows].sort((a,b) => (linkedPlanMetric(snapshot,a,'cost') ?? Infinity) - (linkedPlanMetric(snapshot,b,'cost') ?? Infinity));
    if (sort === 'speed-high') rows = [...rows].sort((a,b) => (linkedPlanMetric(snapshot,b,'speed') ?? -Infinity) - (linkedPlanMetric(snapshot,a,'speed') ?? -Infinity));
    return rows;
  }, [snapshot, tab, capNumber, provider, search, verifiedOnly, includeCommunity, sort, modelFilter, reasoningFilter, windowFilter]);

  const hasPlanCostSort = plans.some((plan) => linkedPlanMetric(snapshot!, plan, 'cost') !== null);
  const hasPlanSpeedSort = plans.some((plan) => linkedPlanMetric(snapshot!, plan, 'speed') !== null);
  useEffect(() => {
    if (tab === 'plans' && sort === 'cost-low' && !hasPlanCostSort) setSort('price-low');
    if (tab === 'plans' && sort === 'speed-high' && !hasPlanSpeedSort) setSort('price-low');
  }, [tab, sort, hasPlanCostSort, hasPlanSpeedSort]);

  const models = useMemo(() => {
    if (!snapshot) return [];
    const searchTerm = search.toLowerCase();
    let rows = snapshot.models.filter((model) => provider === 'all' || `${model.provider} ${model.id}`.toLowerCase().includes(provider));
    if (searchTerm) rows = rows.filter((model) => `${model.provider} ${model.name} ${model.id}`.toLowerCase().includes(searchTerm));
    if (modelFilter !== 'all') rows = rows.filter((model) => `${model.name} ${model.id}`.toLowerCase().includes(modelFilter.toLowerCase()));
    if (reasoningFilter !== 'all') rows = rows.filter((model) => model.intelligence_cost_reasoning === reasoningFilter);
    if (capabilityFilter !== 'all') rows = rows.filter((model) => model.indices[capabilityFilter] !== null && model.indices[capabilityFilter] !== undefined);
    if (verifiedOnly) rows = rows.filter((model) => model.source_kind === 'official');
    if (sort === 'score-high') rows = [...rows].sort((a,b) => (b.indices[activeIndex] ?? -Infinity) - (a.indices[activeIndex] ?? -Infinity));
    if (sort === 'cost-low') rows = [...rows].sort((a,b) => (a.intelligence_cost_per_task_usd ?? Infinity) - (b.intelligence_cost_per_task_usd ?? Infinity));
    if (sort === 'value-high') {
      const version = preferredVersion(rows.map((model) => model.intelligence_cost_benchmark_version));
      rows = [...rows].sort((a,b) => (intelligenceEfficiency(b,version) ?? -Infinity) - (intelligenceEfficiency(a,version) ?? -Infinity));
    }
    return rows;
  }, [snapshot, provider, search, verifiedOnly, sort, activeIndex, modelFilter, reasoningFilter, capabilityFilter]);

  const agents = useMemo(() => {
    if (!snapshot) return [];
    let rows = filterCodingAgentsByProvider(snapshot.coding_agents, provider);
    if (search.trim()) rows = rows.filter((agent) => `${agent.agent} ${agent.harness} ${agent.model}`.toLowerCase().includes(search.toLowerCase()));
    if (modelFilter !== 'all') rows = rows.filter((agent) => agent.model?.toLowerCase() === modelFilter.toLowerCase());
    if (reasoningFilter !== 'all') rows = rows.filter((agent) => agent.reasoning_effort === reasoningFilter);
    if (verifiedOnly) rows = rows.filter((agent) => isOfficialCodingAgent(snapshot,agent));
    if (!includeCommunity) rows = rows.filter((agent) => agent.cost_kind !== 'community');
    if (sort === 'score-high' || sort === 'cost-low') {
      const costRows = verifiedOnly ? officialCodingCostRows(snapshot, rows) : rows;
      const comparable = comparableCodingAgents(sort === 'cost-low' ? costRows : rows);
      const comparableIds = new Set(comparable.records.map((agent) => agent.id));
      rows = [...rows].sort((a,b) => {
        const aComparable = comparableIds.has(a.id), bComparable = comparableIds.has(b.id);
        if (aComparable !== bComparable) return aComparable ? -1 : 1;
        if (sort === 'score-high') return (b.coding_agent_index ?? -Infinity) - (a.coding_agent_index ?? -Infinity);
        if (verifiedOnly && !aComparable && !bComparable) return 0;
        return (a.cost_per_task_usd ?? Infinity) - (b.cost_per_task_usd ?? Infinity);
      });
    }
    return rows;
  }, [snapshot, provider, search, verifiedOnly, includeCommunity, sort, modelFilter, reasoningFilter]);

  if (!snapshot && !error) return <main className="loading"><div className="brand-mark"><Sparkles size={18}/></div><p>正在載入已驗證的比較資料…</p></main>;
  if (!snapshot) return <main className="loading"><div className="brand-mark"><Sparkles size={18}/></div><h1>資料暫時無法載入</h1><p>{error}</p><button className="button" onClick={() => void reload()}><RefreshCw size={15}/>重新載入</button></main>;

  const apiStatus = status.aa;
  return <div className="app-shell">
    <header className="app-header">
      <div className="brand"><div className="brand-mark"><Sparkles size={18}/></div><div><strong>AI Plan Benchmark</strong><span>AI 方案與模型比較器</span></div></div>
      <div className="header-actions"><span className="region-chip">美國方案參考 · 美元計價</span><button className="icon-button" onClick={() => void reload()} disabled={refreshing} aria-label="重新載入資料"><RefreshCw size={16}/></button></div>
    </header>
    <main className="app-main">
      <section className="hero"><div><div className="eyebrow">來源可追溯 · 缺值不補零</div><h1>選擇 AI 方案，<br className="mobile-break"/>看清楚能力與用量。</h1><p>比較訂閱產品、實際模型權限與 Artificial Analysis 評測。每個分數與額度都保留版本、來源及限制。</p></div><details className="hero-note"><summary><span className={`api-dot api-dot--${apiStatus.status}`}/><span><b>{apiStatus.status === 'ready' ? 'Artificial Analysis API 已連接' : apiStatus.status === 'stale' ? 'API 更新失敗，保留舊資料' : apiStatus.status === 'error' ? 'API 連線錯誤' : 'Artificial Analysis API 尚未啟用'}</b><small>{apiStatus.models_count} 個模型 · 最後資料更新 {shortDate(apiStatus.data_updated_at)}</small></span></summary><div className="hero-note__detail"><small>{apiStatus.message}</small></div></details></section>
      {apiStatus.status === 'error' || apiStatus.status === 'stale' || apiStatus.methodology_warning ? <details className="alert alert--warning alert-disclosure"><summary><b>{apiStatus.methodology_warning ? '評測方法版本需要人工核對' : apiStatus.status === 'stale' ? '來源更新失敗，保留現有快照' : 'Artificial Analysis API 連線錯誤'}</b><span>{apiStatus.http_status ? `HTTP ${apiStatus.http_status} · ` : ''}最後檢查 {shortDate(apiStatus.checked_at)}</span></summary><div className="alert-disclosure__body"><p>{apiStatus.methodology_warning ?? apiStatus.message}</p>{apiStatus.last_error && <p>最新錯誤：{apiStatus.last_error}</p>}{apiStatus.stale_days !== null && <p>資料快照已 {apiStatus.stale_days} 天未更新。</p>}</div></details> : null}
      {status.source_health && (status.source_health.warnings.length > 0 || (status.source_health.unavailable?.length ?? 0) > 0) && <details className={`alert alert-disclosure ${status.source_health.warnings.length ? 'alert--warning' : 'alert--info'}`}><summary><b>{status.source_health.warnings.length ? '官方頁面有尚待核對的內容更新' : '部分官方來源目前無法自動讀取'}</b><span>{status.source_health.warnings.length} 項內容更新 · {(status.source_health.unavailable?.length ?? 0)} 個自動讀取受限 · 狀態更新 {shortDate(status.source_health.checked_at)}</span></summary><div className="alert-disclosure__body"><p>{translateUiText(status.source_health.summary)}</p>{status.source_health.warnings.length > 0 && <><h4>待核對的內容更新</h4><ul className="source-warning-list">{status.source_health.warnings.map((item) => <li key={item.source_id}><a href={item.url} target="_blank" rel="noreferrer">{sourceLabelById(item.source_id, item.label)} <ExternalLink size={12}/></a><span>{translateUiText(item.message)}</span></li>)}</ul></>}{(status.source_health.unavailable?.length ?? 0) > 0 && <><h4>自動檢查無法讀取</h4><p>這是自動擷取的限制；HTTP 403／404 不會被當成方案停用，原有已核實資料會保留。標有日期的來源已另行核對官方頁面內容。</p><ul className="source-warning-list">{status.source_health.unavailable?.map((item) => <li key={item.source_id}><a href={item.url} target="_blank" rel="noreferrer">{sourceLabelById(item.source_id, item.label)} <ExternalLink size={12}/></a><span>{translateUiText(item.message)}{item.manual_verified_at ? ` · 人工核對 ${shortDate(item.manual_verified_at)}` : ''}</span></li>)}</ul></>}</div></details>}
      {error && <div className="alert alert--warning">{error}；目前未載入快照。</div>}
      <nav className="tab-nav" aria-label="比較分頁">{TABS.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => { setTab(id); window.scrollTo({ top: 0, behavior: 'auto' }); }} className={tab === id ? 'tab-button tab-button--active' : 'tab-button'}><Icon size={16}/><span>{label}</span></button>)}</nav>
      <section className="toolbar">
        <div className="toolbar__primary">
          <div className="toolbar__search"><Search size={18}/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜尋方案、模型或代理…" aria-label="搜尋"/></div>
          <label><span>公司</span><select value={provider} onChange={(e)=>setProvider(e.target.value)}><option value="all">全部公司</option>{PROVIDERS.map((p)=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          {tab === 'plans' && <label><span>月費上限</span><div className="cap-input"><span>$</span><input aria-label="月費上限美元" type="number" min="0" value={cap} onChange={(e)=>setCap(e.target.value)}/><span>美元</span></div></label>}
        </div>
        <details className="advanced-filters">
          <summary><SlidersHorizontal size={17}/><span>進階篩選</span><span className="advanced-filters__state">{activeAdvancedFilters ? `${activeAdvancedFilters} 項已設定` : verifiedOnly ? '只看官方來源' : '全部來源'}</span></summary>
          <div className="advanced-filters__grid">
            {tab === 'plans' && <label><span>額度類別焦點</span><select value={quotaFilter} onChange={(e)=>setQuotaFilter(e.target.value as QuotaCategory|'all')}><option value="all">全部三類</option><option value="chat">對話</option><option value="agent">一般代理</option><option value="coding_agent">程式代理</option></select></label>}
            {modelOptions.length > 0 && <label><span>模型</span><select value={modelFilter} onChange={(e)=>setModelFilter(e.target.value)}><option value="all">全部模型</option>{modelOptions.map((model)=><option key={model} value={model}>{model}</option>)}</select></label>}
            {reasoningOptions.length > 0 && <label><span>推理強度</span><select value={reasoningFilter} onChange={(e)=>setReasoningFilter(e.target.value)}><option value="all">全部等級</option>{reasoningOptions.map((mode)=><option key={mode} value={mode}>{reasoningLabel(mode)}</option>)}</select></label>}
            {tab === 'plans' && windowOptions.length > 0 && <label><span>額度窗口</span><select value={windowFilter} onChange={(e)=>setWindowFilter(e.target.value)}><option value="all">全部窗口</option>{windowOptions.map((window)=><option key={window} value={window}>{quotaWindow(window)}</option>)}</select></label>}
            {tab === 'models' && <label><span>能力指標篩選</span><select value={capabilityFilter} onChange={(e)=>setCapabilityFilter(e.target.value)}><option value="all">不依分數篩選</option>{INDEX_KEYS.map((key)=><option key={key} value={key}>{INDEX_LABELS[key].label}</option>)}</select></label>}
            {tab === 'plans' && <label><span>排序</span><select value={sort} onChange={(e)=>setSort(e.target.value)}><option value="price-low">月費最低</option><option value="price-high">月費最高</option><option value="quota-chat">對話額度可量化資料最多</option><option value="quota-coding">程式代理額度可量化資料最多</option><option value="cost-low" disabled={!hasPlanCostSort}>可用模型評測成本最低</option><option value="speed-high" disabled={!hasPlanSpeedSort}>可用模型輸出最快</option></select>{!hasPlanCostSort && !hasPlanSpeedSort && <small className="sort-note">目前沒有與訂閱可用模型精確對應的評測成本或速度資料；暫停這兩種排序。</small>}{!hasPlanCostSort && hasPlanSpeedSort && <small className="sort-note">目前沒有與訂閱可用模型精確對應的評測成本資料；成本排序暫停。</small>}{hasPlanCostSort && !hasPlanSpeedSort && <small className="sort-note">目前沒有與訂閱可用模型精確對應的速度資料；速度排序暫停。</small>}</label>}
            {tab === 'models' && <label><span>排序</span><select value={sort} onChange={(e)=>setSort(e.target.value)}><option value="score-high">能力最高</option><option value="cost-low">每任務成本最低</option><option value="value-high">每美元效率最高</option></select></label>}
            {tab === 'coding' && <label><span>排序</span><select value={sort} onChange={(e)=>setSort(e.target.value)}><option value="score-high">程式代理指數最高</option><option value="cost-low">每任務成本最低</option></select></label>}
            <label className="check-filter"><input type="checkbox" checked={verifiedOnly} onChange={(e)=>setVerifiedOnly(e.target.checked)}/><span>只看官方驗證</span></label>
            <label className="check-filter"><input type="checkbox" checked={includeCommunity} onChange={(e)=>setIncludeCommunity(e.target.checked)}/><span>納入社群實測</span></label>
          </div>
        </details>
      </section>
      <div className={`tab-heading ${tab === 'plans' ? 'tab-heading--plans' : ''}`}><div><h2>{selectedTab.label}</h2><p>{selectedTab.subtitle}</p></div><span className="date-chip">資料基準日 {snapshot.as_of}</span></div>
      {tab==='plans' && <div className="page-stack">
        <div className="plan-view-toolbar"><span>方案呈現方式</span><div role="group" aria-label="方案呈現方式"><button type="button" aria-pressed={planView === 'cards'} className={planView === 'cards' ? 'plan-view-button plan-view-button--active' : 'plan-view-button'} onClick={() => setPlanView('cards')}>方案卡片</button><button type="button" aria-pressed={planView === 'table'} className={planView === 'table' ? 'plan-view-button plan-view-button--active' : 'plan-view-button'} onClick={() => setPlanView('table')}>精簡表格</button></div></div>
        {plans.length ? planView === 'cards' ? <div className="plan-grid">{plans.map((plan)=><PlanCard key={plan.id} plan={plan} snapshot={snapshot} quotaFilter={quotaFilter} verifiedOnly={verifiedOnly} includeCommunity={includeCommunity}/>)}</div> : <section className="section-panel compact-plan-panel"><CompactPlanTable plans={plans} snapshot={snapshot} verifiedOnly={verifiedOnly} includeCommunity={includeCommunity}/></section> : <EmptyState title="沒有符合篩選的方案" description="調整公司、月費上限、來源或搜尋條件。未知價格不會被當作零元納入上限。"/>}
      </div>}
      {tab==='models' && <ModelPage snapshot={snapshot} models={models} activeIndex={activeIndex} onIndex={setActiveIndex} providerFilter={provider}/>}
      {tab==='coding' && <CodingPage snapshot={snapshot} agents={agents} verifiedOnly={verifiedOnly}/>}
      {tab==='value' && <ValuePage snapshot={snapshot} plans={plans} models={models} agents={agents} verifiedOnly={verifiedOnly}/>}
      <footer className="app-footer"><div><b>可信度標記</b><Evidence kind="official"/><Evidence kind="measured"/><Evidence kind="community"/><Evidence kind="estimate"/><Evidence confidence="unknown"/></div><p>量化數據以來源頁面與產品內額度提示為準。API 評測成本、訂閱價格與任務額度是三種不同資料。</p><p>資料更新與錯誤狀態記錄在靜態快照；本頁不會公開或呼叫前端 API 金鑰。</p></footer>
    </main>
  </div>;
}

const MISSING = '尚無可靠數據';
export default App;
