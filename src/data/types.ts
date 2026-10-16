export type ProviderId = 'openai' | 'anthropic' | 'google' | 'xai' | string;
export type QuotaCategory = 'chat' | 'agent' | 'coding_agent';
export type EvidenceKind = 'official' | 'community' | 'measured' | 'estimate';
export type Confidence = 'high' | 'medium' | 'low' | 'unknown';

export interface SourceRef {
  id: string;
  label: string;
  url: string;
  kind: EvidenceKind;
  checked_at: string;
  region?: string;
  notes?: string;
}

export interface QuotaObservation {
  id: string;
  plan_id: string;
  plan_name: string;
  category: QuotaCategory;
  product: string;
  metric: string;
  value: number | null;
  value_type: 'exact' | 'range' | 'variable' | 'not_published';
  unit: string;
  window: string | null;
  model: string | null;
  reasoning_mode: string | null;
  shared_with: string[];
  note: string;
  confidence: Confidence;
  source_ids: string[];
  sampled_at: string;
  region: string;
  estimate_range?: { min: number; max: number; sample_size: number | null; workload: string } | null;
}

export interface ProductAccess {
  product: string;
  included: boolean | null;
  surface: Array<'web' | 'mobile' | 'cli' | 'cloud' | 'desktop' | 'agent'>;
  model_access: Array<{
    model: string;
    reasoning_modes: string[];
    mapping: 'exact' | 'approximate' | 'unmapped';
    note?: string;
  }>;
  quota_ids: string[];
  source_ids: string[];
  rollout: 'generally_available' | 'limited' | 'beta' | 'discontinued' | 'unknown';
  note?: string;
}

export interface SubscriptionPlan {
  id: string;
  provider: ProviderId;
  provider_name: string;
  name: string;
  tier: 'free' | 'paid' | 'reference';
  region: string;
  currency: string;
  monthly_price: number | null;
  annual_monthly_price: number | null;
  annual_billed_total: number | null;
  tax: 'included' | 'extra' | 'varies' | 'unknown';
  promo: string | null;
  trial: string | null;
  purchasable: 'yes' | 'limited' | 'no' | 'unknown';
  source_ids: string[];
  checked_at: string;
  products: ProductAccess[];
  quota_ids: string[];
  note?: string;
};

export interface BenchmarkScore {
  benchmark_id: string;
  score: number | string | null;
  unit: string;
  higher_is_better: boolean | null;
  version: string | null;
  updated_at: string | null;
  method_url: string;
  included_in_index: boolean | null;
  cross_model_comparable: boolean | null;
  source_kind: EvidenceKind;
}

export interface ModelRecord {
  id: string;
  provider: string;
  name: string;
  version: string | null;
  retired: boolean;
  indices: Record<string, number | null>;
  intelligence_cost_per_task_usd: number | null;
  intelligence_cost_model_id: string;
  intelligence_cost_model_name: string;
  intelligence_cost_model_version: string | null;
  intelligence_cost_reasoning: string | null;
  intelligence_cost_benchmark_version: string | null;
  api_pricing: {
    input_per_million_usd: number | null;
    output_per_million_usd: number | null;
    cache_read_per_million_usd: number | null;
    cache_write_per_million_usd: number | null;
  };
  performance: {
    output_tokens_per_second: number | null;
    time_to_first_token_ms: number | null;
  };
  benchmarks: BenchmarkScore[];
  source_url: string;
  source_updated_at: string | null;
  source_checked_at?: string | null;
  source_kind: EvidenceKind;
  data_origin?: 'aa_free_api' | 'aa_public_page' | 'aa_free_api+aa_public_page';
  public_page_source_url?: string;
  public_page_checked_at?: string | null;
}

export interface CodingAgentRecord {
  id: string;
  provider: ProviderId;
  agent: string;
  harness: string | null;
  model: string | null;
  reasoning_effort: string | null;
  coding_agent_index: number | null;
  scores: BenchmarkScore[];
  average_task_tokens: number | null;
  cache_hit_percent?: number | null;
  input_tokens: number | null;
  cached_tokens: number | null;
  output_tokens: number | null;
  average_task_seconds: number | null;
  cost_per_task_usd: number | null;
  cost_kind: EvidenceKind | null;
  benchmark_version: string | null;
  source_url: string;
  source_updated_at: string | null;
  source_checked_at?: string | null;
  note: string;
}

export interface BenchmarkDefinition {
  id: string;
  name: string;
  name_zh: string;
  what_it_tests: string;
  metric_unit: string;
  direction: 'higher' | 'lower' | 'official_method';
  task_count: number | null;
  protocol: string;
  index_id: 'intelligence' | 'coding_agent' | 'other';
  index_version: string;
  index_weight_percent: number | null;
  actual_score: null;
  updated_at: string;
  method_url: string;
  cross_model_comparable: boolean;
  comparability_note: string;
}

export interface IndexMethodology {
  intelligence_category_weights: Record<string, number>;
  coding_agent_method: string;
  note: string;
}

export interface Snapshot {
  schema_version: string;
  region: string;
  currency: string;
  as_of: string;
  sources: SourceRef[];
  plans: SubscriptionPlan[];
  quotas: QuotaObservation[];
  models: ModelRecord[];
  coding_agents: CodingAgentRecord[];
  benchmark_catalog: BenchmarkDefinition[];
  index_methodology: IndexMethodology;
  index_versions: { intelligence_api: string | null; intelligence_methodology: string | null; coding: string | null; coding_agent: string | null };
  notes: string[];
}

export interface UpdateStatus {
  aa: {
    configured: boolean;
    status: 'ready' | 'disabled' | 'error' | 'stale';
    message: string;
    checked_at: string | null;
    last_successful_snapshot_at?: string | null;
    data_updated_at: string | null;
    stale_days: number | null;
    http_status: number | null;
    last_error: string | null;
    methodology_warning?: string | null;
    models_count: number;
    endpoint: string;
  };
  source_health?: {
    status: 'ok' | 'warning';
    checked_at: string;
    summary: string;
    warnings: Array<{ source_id: string; label: string; url: string; message: string }>;
  };
}

export const INDEX_LABELS: Record<string, { label: string; description: string }> = {
  intelligence: { label: '綜合智能指數', description: 'Artificial Analysis Intelligence Index 的標準化綜合結果；依官方當前版本及其納入測試計算，不是聊天體驗保證。' },
  coding: { label: '程式能力指數', description: 'Artificial Analysis Coding Index；衡量模型在官方編程任務集合的表現。它不等於 Coding Agent Index，也不含完整代理工具鏈效果。' },
  agentic: { label: '代理執行能力指數', description: 'Artificial Analysis Agentic Index；反映模型在代理型任務中的表現，不代表特定訂閱方案的任務配額。' },
  finance_accounting: { label: '財務與會計能力', description: 'Artificial Analysis 專業能力指數中的財務與會計能力分項。請參照官方方法與版本解讀。' },
  strategy_ops: { label: '商業策略與營運能力', description: 'Artificial Analysis 專業能力指數中的商業策略與營運能力分項。請參照官方方法與版本解讀。' },
  legal: { label: '法律能力', description: 'Artificial Analysis 專業能力指數中的法律能力分項；不能取代專業法律意見。' },
  healthcare_medical: { label: '醫療能力', description: 'Artificial Analysis 專業能力指數中的醫療能力分項；不能取代臨床判斷。' },
  engineering: { label: '工程能力', description: 'Artificial Analysis 專業能力指數中的工程能力分項。請參照官方方法與版本解讀。' },
  economics: { label: '經濟學能力', description: 'Artificial Analysis 專業能力指數中的經濟學能力分項。請參照官方方法與版本解讀。' },
};

export const INDEX_KEYS = Object.keys(INDEX_LABELS);

export const BENCHMARK_INFO: Record<string, { name: string; what: string; methodUrl: string }> = {
  aa_briefcase: { name: 'AA-Briefcase', what: 'Artificial Analysis 公布的專業工作任務測試。分數定義與版本請以官方方法頁為準。', methodUrl: 'https://artificialanalysis.ai/methodology/intelligence-benchmarking' },
  gdpval_aa: { name: 'GDPval-AA', what: '以實際工作產出評估模型完成具經濟價值任務的能力。', methodUrl: 'https://artificialanalysis.ai/methodology/intelligence-benchmarking' },
  automationbench_aa: { name: 'AutomationBench-AA', what: '評估模型完成多步驟自動化任務的表現。', methodUrl: 'https://artificialanalysis.ai/methodology/intelligence-benchmarking' },
  terminal_bench: { name: 'Terminal-Bench', what: '在終端機環境中執行編程與系統任務的測試。代理結果會受到 Harness 影響。', methodUrl: 'https://artificialanalysis.ai/agents/coding-agents' },
  scicode: { name: 'SciCode', what: '評估科學計算與研究編程問題的解題表現。', methodUrl: 'https://artificialanalysis.ai/methodology/intelligence-benchmarking' },
  aa_omniscience: { name: 'AA-Omniscience', what: '評估知識問答中的正確性及不確定時的作答行為。', methodUrl: 'https://artificialanalysis.ai/methodology/intelligence-benchmarking' },
  aa_lcr: { name: 'AA-LCR', what: '評估長文本檢索與理解能力。', methodUrl: 'https://artificialanalysis.ai/methodology/intelligence-benchmarking' },
  gdp_pdf: { name: 'GDP.pdf', what: '長文件工作任務測試；分數單位與方向以該版本官方方法為準。', methodUrl: 'https://artificialanalysis.ai/methodology/intelligence-benchmarking' },
  humanity_last_exam: { name: 'Humanity’s Last Exam', what: '跨學科專家級問題集合；不同版本與設定不可混作同一量尺。', methodUrl: 'https://artificialanalysis.ai/methodology/intelligence-benchmarking' },
  critpt: { name: 'CritPt', what: '物理學與科學問題評測；以官方當前版本說明為準。', methodUrl: 'https://artificialanalysis.ai/methodology/intelligence-benchmarking' },
  deepswe: { name: 'DeepSWE', what: '軟體工程代理任務測試；結果屬於模型與代理組態。', methodUrl: 'https://artificialanalysis.ai/methodology/coding-agents-benchmarking' },
  swe_atlas_qna: { name: 'SWE-Atlas-QnA', what: '軟體工程程式庫問題與任務評測；結果可能依模型及 Harness 而異。', methodUrl: 'https://artificialanalysis.ai/methodology/coding-agents-benchmarking' },
};

export function isFiniteScore(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
