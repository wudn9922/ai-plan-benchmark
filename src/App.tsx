import { useEffect, useMemo, useState } from 'react';
import { Activity, BadgeDollarSign, Bot, CircleHelp, Code2, ExternalLink, Layers3, RefreshCw, Search, Sparkles } from 'lucide-react';
import {
  CartesianGrid, Legend, ResponsiveContainer, Scatter, ScatterChart, Tooltip as ChartTooltip, XAxis, YAxis,
} from 'recharts';
import { BENCHMARK_INFO, INDEX_KEYS, INDEX_LABELS, type BenchmarkDefinition, type CodingAgentRecord, type ModelRecord, type QuotaCategory, type QuotaObservation, type Snapshot, type SourceRef, type SubscriptionPlan, type UpdateStatus } from './data/types';
import { comparableCodingAgents, comparableCostPoints, countScores, defaultSortForTab, filterCodingAgentsByProvider, formatPrice, formatQuota, hasOfficialCodingAgentCostEvidence, hasOfficialCodingAgentScoreEvidence, intelligenceEfficiency, paretoFrontier, preferredVersion, priceWithinCap } from './data/metrics';

type Tab = 'plans' | 'models' | 'coding' | 'value';
const PROVIDERS = [
  { id: 'openai', name: 'OpenAI', color: '#247d68' },
  { id: 'anthropic', name: 'Anthropic', color: '#a36132' },
  { id: 'google', name: 'Google', color: '#3977c3' },
  { id: 'xai', name: 'xAI / X', color: '#666975' },
];
const TABS: Array<{ id: Tab; label: string; icon: typeof Layers3; subtitle: string }> = [
  { id: 'plans', label: '訂閱方案', icon: Layers3, subtitle: '比月費、產品權限與三種分開計量的額度。' },
  { id: 'models', label: '模型能力', icon: Sparkles, subtitle: '檢視 Artificial Analysis 指數、API 成本與基準測試版本。' },
  { id: 'coding', label: '程式代理', icon: Code2, subtitle: '比較 Agent + 模型 + Harness 組態，不把代理結果當成純模型分數。' },
  { id: 'value', label: '每美元價值', icon: BadgeDollarSign, subtitle: '把訂閱月費、智能評測 API 成本、程式代理 API 成本分開看。' },
];
const CHART_COLORS = ['#247d68', '#a36132', '#3977c3', '#777b88', '#b57b26', '#b65352'];

const defaultStatus: UpdateStatus = {
  aa: { configured: false, status: 'disabled', message: '尚未設定 Artificial Analysis API Key；目前只顯示已儲存資料。', checked_at: null, stale_days: null, http_status: null, last_error: null, models_count: 0, endpoint: 'https://artificialanalysis.ai/api/v2/language/models/free', data_updated_at: null },
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
  const text = kind === 'official' ? '官方' : kind === 'measured' ? '實測' : kind === 'community' ? '社群' : kind === 'estimate' ? '推估' : confidence === 'high' ? '高可信' : confidence === 'medium' ? '中可信' : confidence === 'low' ? '低可信' : '未知';
  const cls = kind === 'official' || confidence === 'high' ? 'good' : kind === 'community' || kind === 'estimate' || confidence === 'medium' ? 'warm' : 'quiet';
  return <span className={`evidence evidence--${cls}`}>{text}</span>;
}

function SourceLinks({ ids, sources, label = '來源' }: { ids: string[]; sources: SourceRef[]; label?: string }) {
  const list = ids.map((id) => sources.find((source) => source.id === id)).filter((source): source is SourceRef => Boolean(source));
  if (!list.length) return <span className="muted">尚無來源</span>;
  return <span className="source-links" aria-label={label}>{list.map((source) => <a href={source.url} key={source.id} target="_blank" rel="noreferrer">{source.label}<ExternalLink size={12} /></a>)}</span>;
}

function benchmarkLabel(id: string): string {
  const labels: Record<string, string> = { ...Object.fromEntries(Object.entries(BENCHMARK_INFO).map(([key, value]) => [key, value.name])), terminal_bench: 'Terminal-Bench 4.0' };
  if (id === 'swe_atlas_qna') return 'SWE-Atlas-QnA';
  return labels[id] ?? id;
}

function Badge({ value }: { value: boolean | null }) {
  return <span className={`product-badge ${value === true ? 'product-badge--yes' : value === false ? 'product-badge--no' : 'product-badge--unknown'}`}>{value === true ? '包含' : value === false ? '未包含' : '未確認'}</span>;
}

function PriceBlock({ plan }: { plan: SubscriptionPlan }) {
  return <div className="price-block">
    <strong>{formatPrice(plan.monthly_price, plan.currency)}</strong>
    <span>/ 月</span>
    {plan.annual_billed_total !== null && <small>年繳 {formatPrice(plan.annual_billed_total, plan.currency)}，月均 {formatPrice(plan.annual_monthly_price, plan.currency)}</small>}
    {plan.annual_billed_total === null && plan.annual_monthly_price === null && <small>年繳價格：尚無官方靜態價格</small>}
    <small>稅金：{plan.tax === 'extra' ? '另計' : plan.tax === 'included' ? '已含' : plan.tax === 'varies' ? '依地區/結帳而異' : '未知'} · {plan.region} / {plan.currency}</small>
  </div>;
}

function numericQuotaCount(snapshot: Snapshot, plan: SubscriptionPlan, category: QuotaCategory): number {
  return snapshot.quotas.filter((quota) => plan.quota_ids.includes(quota.id) && quota.category === category && (quota.value !== null || quota.estimate_range !== null && quota.estimate_range !== undefined)).length;
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

function QuotaCard({ quota, sources }: { quota: QuotaObservation; sources: SourceRef[] }) {
  return <article className="quota-card">
    <div className="quota-card__top"><strong>{quota.product}</strong><Evidence confidence={quota.confidence} /></div>
    <div className="quota-card__value">{formatQuota(quota)}</div>
    <div className="quota-card__meta">{quota.window ?? '時間窗口尚未公布'}{quota.model ? ` · ${quota.model}` : ''}{quota.reasoning_mode ? ` · ${quota.reasoning_mode}` : ''}</div>
    <p>{quota.note}</p>
    <div className="quota-card__meta">{quota.plan_name} · {quota.region} · 資料日 {quota.sampled_at}{quota.shared_with.length ? ` · 共用：${quota.shared_with.join('、')}` : ''}</div>
    <SourceLinks ids={quota.source_ids} sources={sources} />
  </article>;
}

function PlanCard({ plan, snapshot, quotaFilter, verifiedOnly }: { plan: SubscriptionPlan; snapshot: Snapshot; quotaFilter: QuotaCategory | 'all'; verifiedOnly: boolean }) {
  const quotas = snapshot.quotas.filter((quota) => plan.quota_ids.includes(quota.id) && (quotaFilter === 'all' || quota.category === quotaFilter) && (!verifiedOnly || (quota.source_ids.length > 0 && quota.source_ids.every((id) => snapshot.sources.find((source) => source.id === id)?.kind === 'official'))));
  const categoryInfo: Array<{ id: QuotaCategory; name: string }> = [
    { id: 'chat', name: 'Chat 額度' }, { id: 'agent', name: '一般 Agent 額度' }, { id: 'coding_agent', name: 'Coding Agent 額度' },
  ];
  const promo = plan.promo || plan.trial;
  return <article className="plan-card">
    <div className="plan-card__heading">
      <div><span className={`provider-dot provider-dot--${plan.provider}`} /> <span className="provider-name">{plan.provider_name}</span><span className="plan-tier">{plan.tier === 'free' ? '免費' : '個人方案'}</span></div>
      <h3>{plan.name}</h3>
    </div>
    <PriceBlock plan={plan} />
    {promo && <div className="promo-note"><Sparkles size={15} /><span>{promo}</span></div>}
    <p className="plan-note">{plan.note}</p>
    <div className="plan-card__section">
      <h4>產品與模型權限</h4>
      <div className="product-list">
        {plan.products.map((product) => <div className={`product-row ${product.rollout === 'discontinued' ? 'product-row--retired' : ''}`} key={product.product}>
          <div className="product-row__head"><span>{product.product}</span><Badge value={product.included} />{product.rollout === 'discontinued' && <span className="status-tag">已停止</span>}{product.rollout === 'limited' && <span className="status-tag">推出/地區限制</span>}{product.rollout === 'beta' && <span className="status-tag">Beta</span>}</div>
          {product.model_access.length > 0 && <div className="product-models">模型：{product.model_access.map((m) => `${m.model}${m.reasoning_modes.length ? `（${m.reasoning_modes.join('、')}）` : ''}${m.mapping === 'unmapped' ? ' · 無精確基準對應' : m.mapping === 'approximate' ? ' · 近似對應' : ''}`).join('、')}</div>}
          {product.note && <div className="product-note">{product.note}</div>}
          {product.source_ids.length > 0 && <SourceLinks ids={product.source_ids} sources={snapshot.sources} label="產品權限來源" />}
        </div>)}
      </div>
    </div>
    <div className="plan-card__section">
      <h4>用量與限制</h4>
      {categoryInfo.filter((category) => quotaFilter === 'all' || quotaFilter === category.id).map((category) => {
        const rows = quotas.filter((quota) => quota.category === category.id);
        return <div className="quota-group" key={category.id}>
          <h5>{category.name}</h5>
          {rows.length ? rows.map((quota) => <QuotaCard quota={quota} sources={snapshot.sources} key={quota.id} />) : <div className="empty-compact">此方案目前尚無可核實的 {category.name} 額度數據。</div>}
        </div>;
      })}
    </div>
    <div className="plan-card__footer"><span>方案核對日 {plan.checked_at}</span><SourceLinks ids={plan.source_ids} sources={snapshot.sources} /></div>
  </article>;
}

function IndexTable({ models, activeIndex }: { models: ModelRecord[]; activeIndex: string }) {
  return <div className="table-scroll"><table className="data-table index-table"><thead><tr><th>供應商 / 模型</th>{INDEX_KEYS.map((key) => <th key={key}><span className="th-info">{INDEX_LABELS[key].label}<Info title={INDEX_LABELS[key].label}>{INDEX_LABELS[key].description}</Info></span></th>)}<th><span className="th-info">智能評測每任務 API 成本<Info title="智能評測每任務 API 成本（美元）">Artificial Analysis Intelligence Index 基準工作負載的 API 成本。依基準 Token 用量及 API 定價計算；不是訂閱方案月費或訂閱任務保證。Free API 不提供逐 benchmark 原始結果。</Info></span></th></tr></thead>
    <tbody>{models.length ? models.map((model) => <tr key={model.id}><td><b>{model.name}</b><small>{model.provider} · {model.version ?? '未另行公布模型版本'}{model.retired ? ' · 已淘汰' : ''}<br/>ID：{model.id}</small>{model.benchmarks.length > 0 && <details className="model-benchmark-disclosure"><summary>查看底層 Benchmark（{model.benchmarks.length}）</summary><div className="model-benchmark-list">{model.benchmarks.map((score) => <div className="model-benchmark-item" key={`${score.benchmark_id}-${score.version ?? 'unknown'}`}><b>{benchmarkLabel(score.benchmark_id)}</b><span>{score.score === null ? MISSING : `${score.score}${score.unit === '%' || score.unit.startsWith('%') ? '' : ' '}${score.unit}`}</span><small>版本 {score.version ?? '未另行公布'} · {score.higher_is_better === true ? '越高越佳' : score.higher_is_better === false ? '越低越佳' : '依官方方法'}</small><small>資料更新日 {score.updated_at ?? '未公布'} · 核對日 {model.source_checked_at ?? '見來源核對紀錄'}</small><a href={score.method_url} target="_blank" rel="noreferrer">官方方法 <ExternalLink size={10}/></a></div>)}</div><a className="model-benchmark-source" href={model.public_page_source_url ?? model.source_url} target="_blank" rel="noreferrer">分數來源頁 <ExternalLink size={10}/></a></details>}</td>{INDEX_KEYS.map((key) => <td className={activeIndex === key ? 'selected-score' : ''} key={key}>{model.indices[key] === null || model.indices[key] === undefined ? <span className="muted">{MISSING}</span> : <b>{model.indices[key]}</b>}</td>)}<td>{model.intelligence_cost_per_task_usd === null ? <span className="muted">{MISSING}</span> : <>{formatPrice(model.intelligence_cost_per_task_usd)}<small>{model.intelligence_cost_model_name} · ID {model.intelligence_cost_model_id} · 推理 {model.intelligence_cost_reasoning ?? '未知'} · AA Index {model.intelligence_cost_benchmark_version ?? '版本未知'}</small></>}<small>{model.data_origin === 'aa_free_api' ? '官方 Free API' : model.data_origin === 'aa_free_api+aa_public_page' ? 'Free API + 公開頁快照' : '官方公開頁快照'} · API 資料更新 {model.source_updated_at ?? '未公布'} · 頁面核對 {model.public_page_checked_at ?? model.source_checked_at ?? '見來源核對紀錄'} · <a href={model.source_url} target="_blank" rel="noreferrer">資料來源 <ExternalLink size={10}/></a>{model.public_page_source_url && <> · <a href={model.public_page_source_url} target="_blank" rel="noreferrer">公開頁面 <ExternalLink size={10}/></a></>}</small></td></tr>) : <tr><td colSpan={11}><EmptyState title="尚無已取得的 Artificial Analysis 分數" description="正式 API 需要 AA_API_KEY。免費 API 包含 9 項能力指數與 intelligence cost per task；目前沒有授權金鑰，所以分數保持缺值。" /></td></tr>}</tbody>
    </table></div>;
}

function ApiPricingTable({ models }: { models: ModelRecord[] }) {
  const money = (value: number | null) => value === null ? MISSING : `$${value.toLocaleString('en-US', { maximumFractionDigits: 6 })}`;
  return <div className="table-scroll"><table className="data-table api-pricing-table"><thead><tr><th>模型 / 版本</th><th>輸入 / 百萬 Token</th><th>輸出 / 百萬 Token</th><th>快取讀取 / 百萬 Token</th><th>快取寫入 / 百萬 Token</th><th>更新日 / 來源</th></tr></thead><tbody>{models.length ? models.map((model) => <tr key={model.id}><td><b>{model.name}</b><small>{model.id}</small></td><td>{money(model.api_pricing.input_per_million_usd)}</td><td>{money(model.api_pricing.output_per_million_usd)}</td><td>{money(model.api_pricing.cache_read_per_million_usd)}</td><td>{money(model.api_pricing.cache_write_per_million_usd)}</td><td>{model.source_updated_at ?? '來源更新日未公布'}<small>核對日 {model.public_page_checked_at ?? model.source_checked_at ?? '未知'} · {model.source_kind} · <a href={model.source_url} target="_blank" rel="noreferrer">資料來源 <ExternalLink size={10}/></a></small></td></tr>) : <tr><td colSpan={6}><div className="empty-compact">尚未取得 API 定價資料。</div></td></tr>}</tbody></table></div>;
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return <div className="empty-state"><div className="empty-state__icon"><Activity size={19} /></div><strong>{title}</strong><p>{description}</p></div>;
}

function BenchmarkCatalog({ snapshot, indexId }: { snapshot: Snapshot; indexId: 'intelligence' | 'coding_agent' }) {
  const rows = snapshot.benchmark_catalog.filter((benchmark) => benchmark.index_id === indexId);
  return <div className="benchmark-list">{rows.map((benchmark) => <BenchmarkCard benchmark={benchmark} key={benchmark.id} />)}</div>;
}

function BenchmarkCard({ benchmark }: { benchmark: BenchmarkDefinition }) {
  return <details className="benchmark-card">
    <summary><span className="benchmark-card__name">{benchmark.name_zh}<small>{benchmark.name} · {benchmark.index_version}</small></span><span className="benchmark-card__metric">{benchmark.actual_score ?? MISSING}<small>{benchmark.metric_unit}</small></span><span className="benchmark-card__weight">{benchmark.index_weight_percent === null ? '未公開權重' : `權重 ${benchmark.index_weight_percent.toFixed(benchmark.index_weight_percent % 1 ? 1 : 0)}%`}</span></summary>
    <div className="benchmark-card__details"><p>{benchmark.what_it_tests}</p><dl><div><dt>測試版本 / 更新日</dt><dd>{benchmark.index_version} / {benchmark.updated_at}</dd></div><div><dt>測試量與方式</dt><dd>{benchmark.protocol}</dd></div><div><dt>分數方向</dt><dd>{benchmark.direction === 'higher' ? '越高越佳' : benchmark.direction === 'lower' ? '越低越佳' : '依官方方法'} · {benchmark.metric_unit}</dd></div><div><dt>跨模型比較</dt><dd>{benchmark.cross_model_comparable ? '同版本及同評估設定下可比' : '需比對完整模型與 Harness 組態'}</dd></div><div><dt>計入指數</dt><dd>{benchmark.index_id === 'intelligence' ? '綜合智能指數' : benchmark.index_id === 'coding_agent' ? 'Coding Agent Index' : '其他'}</dd></div></dl><p className="caveat">{benchmark.comparability_note}</p><a href={benchmark.method_url} target="_blank" rel="noreferrer">官方測試方法 <ExternalLink size={13} /></a></div>
  </details>;
}

function ModelPage({ snapshot, models, activeIndex, onIndex, providerFilter }: { snapshot: Snapshot; models: ModelRecord[]; activeIndex: string; onIndex: (id: string) => void; providerFilter: string }) {
  const filtered = providerFilter === 'all' ? models : models.filter((model) => `${model.provider} ${model.id}`.toLowerCase().includes(providerFilter));
  const chartData = comparableCostPoints(filtered).map((item) => ({ name: item.name, provider: item.id, x: item.cost, y: item.score }));
  const apiConnected = models.some((model) => model.data_origin === 'aa_free_api' || model.data_origin === 'aa_free_api+aa_public_page');
  const publicSnapshots = models.filter((model) => model.data_origin === 'aa_public_page' || model.data_origin === 'aa_free_api+aa_public_page').length;
  return <div className="page-stack">
    <section className="section-panel">
      <div className="snapshot-note"><b>{apiConnected ? 'Artificial Analysis Free API + 官方公開頁面快照' : '官方公開頁面快照'}</b><span>{apiConnected ? `目前有免費 API 模型資料；另保留 ${publicSnapshots} 筆公開頁面 benchmark 快照。` : `以下 ${publicSnapshots} 筆模型組態及底層測試分數於 2026-10-16 從公開官方比較頁人工核對；AA Free API 仍未連接（需要 API key），不代表即時 API 擷取。`}</span></div>
      <div className="section-title"><div><h2>Artificial Analysis 能力指數</h2><p>目前指數方法版 {snapshot.index_versions.intelligence_methodology ?? '尚未核實'}；API 回傳版 {snapshot.index_versions.intelligence_api ?? '未連接'}。</p></div><label className="select-label">查看欄位<select value={activeIndex} onChange={(e) => onIndex(e.target.value)}>{INDEX_KEYS.map((key) => <option value={key} key={key}>{INDEX_LABELS[key].label}</option>)}</select></label></div>
      <div className="index-cards">{INDEX_KEYS.map((key) => <button className={`index-chip ${activeIndex === key ? 'index-chip--active' : ''}`} onClick={() => onIndex(key)} key={key}><span>{INDEX_LABELS[key].label}<Info title={INDEX_LABELS[key].label}>{INDEX_LABELS[key].description}</Info></span><b>{models.length ? models.filter((model) => model.indices[key] !== null).length : '—'}</b><small>有分數模型</small></button>)}</div>
      <IndexTable models={filtered} activeIndex={activeIndex} />
      <div className="methodology-box"><div><b>Intelligence Index 分類權重 · {snapshot.index_versions.intelligence_methodology ?? '版本未核實'}</b><p>{snapshot.index_methodology.note}</p></div><div className="weight-list">{Object.entries(snapshot.index_methodology.intelligence_category_weights).map(([name, weight])=><span key={name}><b>{name}</b><strong>{weight}%</strong></span>)}</div><SourceLinks ids={['aa-method']} sources={snapshot.sources} label="指數方法來源" /></div>
      <div className="capability-gap"><b>免費 API 未提供的其他指標</b><p>多語言、中文、日文、視覺理解、開源程度、長文本理解、指示遵循等項目，免費 API schema 未公開可匯入分數；部分資料可能只在 Pro API 或獨立測試頁面提供。取得授權資料前維持缺值，不以九項指數代替。</p><SourceLinks ids={['aa-api-reference','aa-method']} sources={snapshot.sources} /></div>
      <div className="source-footnote"><span>API 每百萬 Token 單價會隨輸入/輸出/快取拆分，與每任務成本及訂閱月費分開顯示。公開比較頁未公布的欄位保留缺值。</span><SourceLinks ids={['aa-free-api','aa-api-reference','aa-method','aa-public-gemini-argon-comparison','aa-public-gpt-6-luna-high-comparison']} sources={snapshot.sources} /></div>
    </section>
    <section className="section-panel">
      <div className="section-title"><div><h2>綜合智能能力 × API 每任務成本</h2><p>只繪製同一 Intelligence Index 版本、且同時有分數與正值成本的模型。{chartData[0] ? `目前顯示版本 ${comparableCostPoints(filtered)[0]?.benchmarkVersion}。` : ''}</p></div></div>
      {chartData.length > 1 ? <div className="chart-box"><ResponsiveContainer width="100%" height={300}><ScatterChart margin={{ top: 12, right: 18, bottom: 18, left: 8 }}><CartesianGrid strokeDasharray="3 3" stroke="#e6e9eb"/><XAxis type="number" dataKey="x" name="每任務成本（美元）" tickFormatter={(value) => `$${value}`} label={{ value: '智能評測每任務 API 成本（美元）', position: 'insideBottom', offset: -10 }}/><YAxis type="number" dataKey="y" name="綜合智能指數" label={{ value: '綜合智能指數', angle: -90, position: 'insideLeft' }}/><ChartTooltip cursor={{ strokeDasharray: '3 3' }} formatter={(value: number, name) => [name === 'x' ? `$${value}` : value, name === 'x' ? 'API 成本/任務' : '綜合智能指數']}/><Scatter data={chartData} fill="#247d68"/></ScatterChart></ResponsiveContainer></div> : <EmptyState title="目前沒有可比較的成本點" description="相同 Artificial Analysis 版本至少要有兩筆已驗證的分數與每任務 API 成本，才能繪圖。"/>}
    </section>
    <section className="section-panel"><div className="section-title"><div><h2>API 每百萬 Token 價格</h2><p>輸入、輸出及快取價格獨立列出，與兩種基準任務成本及訂閱月費分開。</p></div></div><ApiPricingTable models={filtered}/></section>
    <section className="section-panel">
      <div className="section-title"><div><h2>底層 Benchmark 目錄</h2><p>每個測試保留自己的單位、方法版與可比性。未取得分數顯示「尚無可靠數據」。</p></div></div>
      <BenchmarkCatalog snapshot={snapshot} indexId="intelligence" />
    </section>
  </div>;
}

function CodingPage({ snapshot, agents, verifiedOnly }: { snapshot: Snapshot; agents: CodingAgentRecord[]; verifiedOnly: boolean }) {
  const comparable = comparableCodingAgents(verifiedOnly ? officialCodingCostRows(snapshot, agents) : agents);
  const data = comparable.records.map((agent) => ({ name: agent.agent, harness: agent.harness ?? 'Harness 未公布', x: agent.cost_per_task_usd!, y: agent.coding_agent_index! }));
  const harnessGroups = [...new Set(data.map((item) => item.harness))];
  return <div className="page-stack">
    <section className="section-panel">
      <div className="section-title"><div><h2>Coding Agent Index {snapshot.index_versions.coding_agent ?? '版本未知'}</h2><p>DeepSWE v1.1、Terminal-Bench 4.0、SWE-Atlas-QnA；各測試等權，依 pooled task metrics 計分。成本圖只納入同 benchmark 版本及同來源類型：{comparable.version ?? '尚無可比資料'}{comparable.costKind ? ` · ${comparable.costKind}` : ''}。</p></div><a className="button button--quiet" href="https://artificialanalysis.ai/agents/coding-agents" target="_blank" rel="noreferrer">官方 Coding Agent 頁面 <ExternalLink size={14}/></a></div>
      <div className="agent-note"><Bot size={18}/><p><b>每個點代表 Agent 組態，不是純模型分數。</b> 模型、推理強度、Harness 與測試環境都會影響結果；點的顏色依 Harness 分組。Gemini CLI 個人帳號已停止，不代表目前 AI Pro 權限。</p></div>
      {data.length > 1 ? <div className="chart-box"><ResponsiveContainer width="100%" height={300}><ScatterChart margin={{ top: 12,right:18,bottom:18,left:8 }}><CartesianGrid strokeDasharray="3 3" stroke="#e6e9eb"/><XAxis type="number" dataKey="x" name="每任務 API 成本" tickFormatter={(value) => `$${value}`} label={{ value:'程式代理每任務 API 成本（美元）',position:'insideBottom',offset:-10 }}/><YAxis type="number" dataKey="y" name="Coding Agent Index" label={{ value:'Coding Agent Index',angle:-90,position:'insideLeft' }}/><ChartTooltip formatter={(value: number,name)=>[name==='x'?`$${value}`:value,name==='x'?'API 成本/任務':'Coding Agent Index']} labelFormatter={(_,payload)=>`${payload?.[0]?.payload?.name ?? ''} · ${payload?.[0]?.payload?.harness ?? ''}`}/>{harnessGroups.map((harness, index) => <Scatter key={harness} name={harness} data={data.filter((item) => item.harness === harness)} fill={CHART_COLORS[index % CHART_COLORS.length]}/>) }<Legend/></ScatterChart></ResponsiveContainer></div> : <EmptyState title="尚無可核對的代理組態分數" description="Coding Agent API 端點未公開可用的授權匯入方式；目前提供版本化人工匯入範本。資料只會在附官方來源、組態與日期後進入排名。"/>}
      <div className="table-scroll"><table className="data-table coding-table"><thead><tr><th>代理 / Harness</th><th>模型 / 推理</th><th>Coding Agent Index</th><th>底層測試結果</th><th>基準版本</th><th>每任務平均 Token</th><th>輸入 / 快取 / 輸出</th><th>平均時間</th><th>程式代理每任務 API 成本</th><th>更新日 / 來源 / 備註</th></tr></thead><tbody>{agents.length ? agents.map((agent) => <tr key={agent.id}><td><b>{agent.agent}</b><small>公司：{agent.provider === 'openai' ? 'OpenAI' : agent.provider === 'anthropic' ? 'Anthropic' : agent.provider === 'google' ? 'Google' : 'xAI / X'}</small><small>{agent.harness ?? MISSING}</small></td><td>{agent.model ?? MISSING}<small>{agent.reasoning_effort ?? '推理等級未公布'}</small></td><td>{agent.coding_agent_index ?? MISSING}<small>{agent.cost_kind ?? '來源類型未知'}</small></td><td>{agent.scores.length ? agent.scores.map((score) => <small className="coding-score" key={`${score.benchmark_id}-${score.version}`}><b>{benchmarkLabel(score.benchmark_id)}</b>：{score.score === null ? MISSING : `${score.score}${score.unit === '%' ? '%' : ` ${score.unit}`}`} · {score.version ?? '版本未公布'}<br/>{score.method_url ? <a href={score.method_url} target="_blank" rel="noreferrer">官方方法</a> : null}</small>) : MISSING}</td><td>{agent.benchmark_version ?? MISSING}</td><td>{agent.average_task_tokens?.toLocaleString() ?? MISSING}</td><td>{agent.input_tokens?.toLocaleString() ?? MISSING} / {agent.cached_tokens?.toLocaleString() ?? MISSING} / {agent.output_tokens?.toLocaleString() ?? MISSING}<small>快取命中率 {agent.cache_hit_percent == null ? MISSING : `${agent.cache_hit_percent}%`}</small></td><td>{agent.average_task_seconds === null ? MISSING : `${agent.average_task_seconds.toFixed(1)} 秒`}</td><td>{agent.cost_per_task_usd === null ? MISSING : formatPrice(agent.cost_per_task_usd)}</td><td>{agent.source_updated_at ?? '來源頁未公布'}<small>核對日 {agent.source_checked_at ?? '見來源核對紀錄'}<br/><a href={agent.source_url} target="_blank" rel="noreferrer">來源 <ExternalLink size={10}/></a> · {agent.note}</small></td></tr>) : <tr><td colSpan={10}><div className="empty-compact">目前篩選條件下沒有已核對匯入的 Agent 組態。保留缺值；不從網頁圖表估讀分數。</div></td></tr>}</tbody></table></div>
      <div className="source-footnote"><span>需要匯入時使用 <code>public/data/imports/coding-agents-v1.template.json</code>，通過 `scripts/import_coding_agents.py` 與 `scripts/validate_data.py` 檢查。</span><SourceLinks ids={['aa-coding-agents','aa-coding-method']} sources={snapshot.sources}/></div>
    </section>
    <section className="section-panel"><div className="section-title"><div><h2>Coding Agent Index 底層測試</h2><p>目前列出官方公開比較頁人工核對的組態結果；未公開的測試版本或分數保留缺值。</p></div></div><BenchmarkCatalog snapshot={snapshot} indexId="coding_agent"/></section>
  </div>;
}

function ValuePage({ snapshot, plans, models, agents, verifiedOnly }: { snapshot: Snapshot; plans: SubscriptionPlan[]; models: ModelRecord[]; agents: CodingAgentRecord[]; verifiedOnly: boolean }) {
  const points = comparableCostPoints(models);
  const frontier = paretoFrontier(points);
  const codingComparison = comparableCodingAgents(verifiedOnly ? officialCodingCostRows(snapshot, agents) : agents);
  const codingPoints = codingComparison.records;
  const codingHarnesses = [...new Set(codingPoints.map((agent) => agent.harness ?? 'Harness 未公布'))];
  const coverage = countScores(snapshot);
  return <div className="page-stack">
    <section className="section-panel"><div className="section-title"><div><h2>智能能力 × API 成本</h2><p>模型數 {coverage.models} · Intelligence 每任務成本 {coverage.intelligenceCost}/{coverage.models} · 程式代理有成本資料 {coverage.codingScores}/{coverage.codingTasks}</p></div></div>
      {points.length > 1 ? <div className="chart-box"><ResponsiveContainer width="100%" height={310}><ScatterChart margin={{top:12,right:18,bottom:18,left:8}}><CartesianGrid strokeDasharray="3 3" stroke="#e6e9eb"/><XAxis type="number" dataKey="cost" name="每任務 API 成本（美元）" tickFormatter={(v)=>`$${v}`} label={{value:'智能評測每任務 API 成本（美元）',position:'insideBottom',offset:-10}}/><YAxis type="number" dataKey="score" name="綜合智能指數" label={{value:'綜合智能指數',angle:-90,position:'insideLeft'}}/><ChartTooltip formatter={(v:number,n)=>[n==='cost'?`$${v}`:v,n==='cost'?'每任務成本':'綜合智能指數']}/><Scatter name="所有模型" data={points.map(p=>({...p,cost:p.cost,score:p.score}))} fill="#8c939d"/><Scatter name="Pareto 前緣" data={frontier.map(p=>({...p,cost:p.cost,score:p.score}))} fill="#247d68" shape="star"/><Legend/></ScatterChart></ResponsiveContainer><p className="chart-caption">Pareto 前緣：同一基準版本中，沒有其他模型同時分數更高且成本更低的點。</p></div> : <EmptyState title="智能 API 成本覆蓋尚未建立" description="API key 尚未設定，模型分數與 cost_per_task 都缺值。指數/成本互相比較需要同一版基準測試。"/>}
    </section>
    <section className="section-panel"><div className="section-title"><div><h2>程式代理能力 × 每任務 API 成本</h2><p>同 benchmark 版本 {codingComparison.version ?? '尚無可靠數據'}、同來源類型 {codingComparison.costKind ?? '尚無可靠數據'}；顏色依 Harness 分組。不轉換為訂閱月費可執行任務數。</p></div></div>
      {codingPoints.length>1 ? <div className="chart-box"><ResponsiveContainer width="100%" height={280}><ScatterChart margin={{top:12,right:18,bottom:18,left:8}}><CartesianGrid strokeDasharray="3 3" stroke="#e6e9eb"/><XAxis type="number" dataKey="cost_per_task_usd" name="每任務 API 成本" tickFormatter={(v)=>`$${v}`} label={{value:'程式代理每任務 API 成本（美元）',position:'insideBottom',offset:-10}}/><YAxis type="number" dataKey="coding_agent_index" name="Coding Agent Index" label={{value:'Coding Agent Index',angle:-90,position:'insideLeft'}}/><ChartTooltip formatter={(v:number,n)=>[n==='cost_per_task_usd'?`$${v}`:v,n==='cost_per_task_usd'?'程式代理每任務成本':'Coding Agent Index']} labelFormatter={(_,payload)=>`${payload?.[0]?.payload?.agent ?? ''} · ${payload?.[0]?.payload?.harness ?? ''}`}/>{codingHarnesses.map((harness,index)=><Scatter key={harness} name={harness} data={codingPoints.filter((agent)=> (agent.harness ?? 'Harness 未公布')===harness)} fill={CHART_COLORS[index%CHART_COLORS.length]}/>)}<Legend/></ScatterChart></ResponsiveContainer></div> : <EmptyState title="程式代理成本缺少可比組態數據" description="圖表只會畫同一 benchmark 版本與成本來源類型的組態；等待附來源、模型、推理等級、Harness、Token 和日期的合法匯入資料。"/>}
    </section>
    <section className="section-panel"><div className="section-title"><div><h2>每美元能力公式與範圍</h2><p>只在同一基準版本、同一 cost definition 和有效正成本時計算。</p></div></div>
      <div className="formula-grid"><div className="formula-card"><span>智能評測效率</span><code>綜合智能指數 ÷ Intelligence Index 每任務 API 成本（美元）</code><p>只用同一 Intelligence Index 版本且官方公布的 index cost；不是訂閱價值或用戶每月額度保證。</p></div><div className="formula-card"><span>程式代理效率</span><code>Coding Agent Index ÷ Coding Agent 每任務 API 成本（美元）</code><p>只有相同 Agent benchmark 版、Harness 對照和成本定義的組態可比。</p></div><div className="formula-card"><span>訂閱費</span><code>月繳價格 / 年繳總額 / 年繳月均分列</code><p>不以 API 每任務成本換算訂閱可以跑多少任務；Chat、一般 Agent、Coding Agent 額度分開記錄。</p></div></div>
    </section>
    <section className="section-panel"><div className="section-title"><div><h2>三種金錢欄位覆蓋</h2><p>API 費率、基準工作任務成本、消費者訂閱月費使用不同資料欄位與公式。</p></div></div>
      <div className="money-coverage"><div><small>API 每百萬 Token 價格</small><strong>{coverage.models ? `${models.filter(m=>m.api_pricing.input_per_million_usd!==null).length}/${coverage.models} 模型` : MISSING}</strong><p>依輸入、輸出、快取讀寫分欄。</p></div><div><small>智能評測每任務 API 成本</small><strong>{coverage.models ? `${coverage.intelligenceCost}/${coverage.models} 模型` : MISSING}</strong><p>只採官方 cost_per_task.total_cost。</p></div><div><small>程式代理每任務 API 成本</small><strong>{coverage.codingTasks ? `${coverage.codingScores}/${coverage.codingTasks} 組態` : MISSING}</strong><p>沒有官方數據時保留缺值。</p></div><div><small>訂閱方案月費</small><strong>{plans.length} 個方案</strong><p>非 API 任務成本。</p></div></div>
    </section>
  </div>;
}

function App() {
  const { snapshot, status, error, refreshing, reload } = useSnapshot();
  const [tab, setTab] = useState<Tab>('plans');
  const [provider, setProvider] = useState('all');
  const [cap, setCap] = useState('30');
  const [quotaFilter, setQuotaFilter] = useState<QuotaCategory | 'all'>('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('price-low');
  const [verifiedOnly, setVerifiedOnly] = useState(true);
  const [activeIndex, setActiveIndex] = useState('intelligence');
  const [includeCommunity, setIncludeCommunity] = useState(false);
  const [modelFilter, setModelFilter] = useState('all');
  const [reasoningFilter, setReasoningFilter] = useState('all');
  const [windowFilter, setWindowFilter] = useState('all');
  const [capabilityFilter, setCapabilityFilter] = useState('all');
  const capNumber = cap.trim() === '' ? null : Number(cap);
  const selectedTab = TABS.find((item) => item.id === tab)!;

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
    if (sort === 'quota-chat') rows = [...rows].sort((a,b) => numericQuotaCount(snapshot,b,'chat') - numericQuotaCount(snapshot,a,'chat'));
    if (sort === 'quota-coding') rows = [...rows].sort((a,b) => numericQuotaCount(snapshot,b,'coding_agent') - numericQuotaCount(snapshot,a,'coding_agent'));
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
      <div className="header-actions"><span className="region-chip">美國方案參考 · USD</span><button className="icon-button" onClick={() => void reload()} disabled={refreshing} aria-label="重新載入資料"><RefreshCw size={16}/></button></div>
    </header>
    <main className="app-main">
      <section className="hero"><div><div className="eyebrow">來源可追溯 · 缺值不補零</div><h1>選擇 AI 方案，<br className="mobile-break"/>看清楚能力與用量。</h1><p>比較訂閱產品、實際模型權限與 Artificial Analysis 評測。每個分數與額度都保留版本、來源及限制。</p></div><div className="hero-note"><span className={`api-dot api-dot--${apiStatus.status}`}/><div><b>{apiStatus.status === 'ready' ? 'Artificial Analysis API 已連接' : apiStatus.status === 'stale' ? 'API 更新失敗，保留舊資料' : apiStatus.status === 'error' ? 'API 連線錯誤' : 'Artificial Analysis API 尚未啟用'}</b><small>{apiStatus.message}</small><small>{apiStatus.models_count} 個模型 · 最後資料更新 {apiStatus.data_updated_at ?? '尚無成功匯入'}</small></div></div></section>
      {apiStatus.status === 'error' || apiStatus.status === 'stale' || apiStatus.methodology_warning ? <div className="alert alert--warning"><b>{apiStatus.methodology_warning ? '評測方法版本需要人工核對' : '來源更新警告'}</b><span>{apiStatus.methodology_warning ?? apiStatus.message}{apiStatus.http_status ? ` HTTP ${apiStatus.http_status}` : ''}{apiStatus.stale_days !== null ? ` · 資料快照已 ${apiStatus.stale_days} 天未更新` : ''}</span></div> : null}
      {status.source_health?.status === 'warning' && <div className="alert alert--warning"><b>官方來源需要人工核對</b><span>{status.source_health.summary} · {status.source_health.checked_at}<br/>{status.source_health.warnings.map((item) => `${item.label}: ${item.message}`).join(' · ')}</span></div>}
      {error && <div className="alert alert--warning">{error}；目前未載入快照。</div>}
      <nav className="tab-nav" aria-label="比較分頁">{TABS.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => setTab(id)} className={tab === id ? 'tab-button tab-button--active' : 'tab-button'}><Icon size={16}/><span>{label}</span></button>)}</nav>
      <section className="toolbar">
        <div className="toolbar__search"><Search size={16}/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜尋方案、模型或代理…" aria-label="搜尋"/></div>
        <label><span>公司</span><select value={provider} onChange={(e)=>setProvider(e.target.value)}><option value="all">全部公司</option>{PROVIDERS.map((p)=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        {tab === 'plans' && <label><span>月費上限</span><div className="cap-input"><span>$</span><input aria-label="月費上限美金" type="number" min="0" value={cap} onChange={(e)=>setCap(e.target.value)}/><span>USD</span></div></label>}
        {tab === 'plans' && <label><span>額度類別</span><select value={quotaFilter} onChange={(e)=>setQuotaFilter(e.target.value as QuotaCategory|'all')}><option value="all">全部三類</option><option value="chat">Chat</option><option value="agent">一般 Agent</option><option value="coding_agent">Coding Agent</option></select></label>}
        {modelOptions.length > 0 && <label><span>模型</span><select value={modelFilter} onChange={(e)=>setModelFilter(e.target.value)}><option value="all">全部模型</option>{modelOptions.map((model)=><option key={model} value={model}>{model}</option>)}</select></label>}
        {reasoningOptions.length > 0 && <label><span>推理等級</span><select value={reasoningFilter} onChange={(e)=>setReasoningFilter(e.target.value)}><option value="all">全部等級</option>{reasoningOptions.map((mode)=><option key={mode} value={mode}>{mode}</option>)}</select></label>}
        {tab === 'plans' && windowOptions.length > 0 && <label><span>額度窗口</span><select value={windowFilter} onChange={(e)=>setWindowFilter(e.target.value)}><option value="all">全部窗口</option>{windowOptions.map((window)=><option key={window} value={window}>{window}</option>)}</select></label>}
        {tab === 'models' && <label><span>能力指標篩選</span><select value={capabilityFilter} onChange={(e)=>setCapabilityFilter(e.target.value)}><option value="all">不依分數篩選</option>{INDEX_KEYS.map((key)=><option key={key} value={key}>{INDEX_LABELS[key].label}</option>)}</select></label>}
        {tab === 'plans' && <label><span>排序</span><select value={sort} onChange={(e)=>setSort(e.target.value)}><option value="price-low">月費最低</option><option value="price-high">月費最高</option><option value="quota-chat">Chat 可量化資料最多</option><option value="quota-coding">Coding Agent 可量化資料最多</option><option value="cost-low" disabled={!hasPlanCostSort}>可用模型評測成本最低</option><option value="speed-high" disabled={!hasPlanSpeedSort}>可用模型輸出最快</option></select>{!hasPlanCostSort && !hasPlanSpeedSort && <small className="sort-note">目前沒有與訂閱可用模型精確對應的評測成本或速度資料；暫停這兩種排序。</small>}{!hasPlanCostSort && hasPlanSpeedSort && <small className="sort-note">目前沒有與訂閱可用模型精確對應的評測成本資料；成本排序暫停。</small>}{hasPlanCostSort && !hasPlanSpeedSort && <small className="sort-note">目前沒有與訂閱可用模型精確對應的速度資料；速度排序暫停。</small>}</label>}
        {tab === 'models' && <label><span>排序</span><select value={sort} onChange={(e)=>setSort(e.target.value)}><option value="score-high">能力最高</option><option value="cost-low">每任務成本最低</option><option value="value-high">每美元效率最高</option></select></label>}
        {tab === 'coding' && <label><span>排序</span><select value={sort} onChange={(e)=>setSort(e.target.value)}><option value="score-high">Coding Agent Index 最高</option><option value="cost-low">每任務成本最低</option></select></label>}
        <label className="check-filter"><input type="checkbox" checked={verifiedOnly} onChange={(e)=>setVerifiedOnly(e.target.checked)}/><span>只看官方驗證</span></label>
        <label className="check-filter"><input type="checkbox" checked={includeCommunity} onChange={(e)=>setIncludeCommunity(e.target.checked)}/><span>納入社群實測</span></label>
      </section>
      <div className="tab-heading"><div><h2>{selectedTab.label}</h2><p>{selectedTab.subtitle}</p></div><span className="date-chip">資料基準日 {snapshot.as_of}</span></div>
      {tab==='plans' && <div className="page-stack">{plans.length ? <div className="plan-grid">{plans.map((plan)=><PlanCard key={plan.id} plan={plan} snapshot={snapshot} quotaFilter={quotaFilter} verifiedOnly={verifiedOnly}/>)}</div> : <EmptyState title="沒有符合篩選的方案" description="調整公司、月費上限、來源或搜尋條件。未知價格不會被當作零元納入上限。"/>}</div>}
      {tab==='models' && <ModelPage snapshot={snapshot} models={models} activeIndex={activeIndex} onIndex={setActiveIndex} providerFilter={provider}/>}
      {tab==='coding' && <CodingPage snapshot={snapshot} agents={agents} verifiedOnly={verifiedOnly}/>}
      {tab==='value' && <ValuePage snapshot={snapshot} plans={plans} models={models} agents={agents} verifiedOnly={verifiedOnly}/>}
      <footer className="app-footer"><div><b>可信度標記</b><Evidence kind="official"/><Evidence kind="measured"/><Evidence kind="community"/><Evidence kind="estimate"/><Evidence confidence="unknown"/></div><p>量化數據以來源頁面與產品內額度提示為準。API 評測成本、訂閱價格與任務額度是三種不同數據。</p><p>資料更新與錯誤狀態記錄在靜態快照；本頁不會公開或呼叫前端 API Key。</p></footer>
    </main>
  </div>;
}

const MISSING = '尚無可靠數據';
export default App;
