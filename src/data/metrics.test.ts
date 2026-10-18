import { describe, expect, it } from 'vitest';
import { MISSING, comparableCodingAgents, comparableCostPoints, compactQuotaEntitlementAllowed, compactQuotaWindow, defaultSortForTab, filterCodingAgentsByProvider, formatPrice, formatQuota, hasOfficialCodingAgentCostEvidence, hasOfficialCodingAgentScoreEvidence, intelligenceEfficiency, paretoFrontier, priceWithinCap, reasoningEffortIsMapped, shouldShowCompactQuota } from './metrics';
import type { CodingAgentRecord, ModelRecord, QuotaObservation, SubscriptionPlan } from './types';

function model(id: string, score: number | null, cost: number | null, version: string | null): ModelRecord {
  return {
    id, name: id, provider: 'test', version: null, retired: false,
    indices: { intelligence: score }, intelligence_cost_per_task_usd: cost,
    intelligence_cost_model_id: id, intelligence_cost_model_name: id,
    intelligence_cost_model_version: null, intelligence_cost_reasoning: null,
    intelligence_cost_benchmark_version: version,
    api_pricing: { input_per_million_usd: null, output_per_million_usd: null, cache_read_per_million_usd: null, cache_write_per_million_usd: null },
    performance: { output_tokens_per_second: null, time_to_first_token_ms: null },
    benchmarks: [], source_url: 'https://example.org', source_updated_at: null, source_kind: 'official',
  };
}

function codingAgent(overrides: Partial<CodingAgentRecord> = {}): CodingAgentRecord {
  return {
    id: 'codex-test', provider: 'openai', agent: 'Codex', harness: 'Codex', model: 'GPT test', reasoning_effort: 'high',
    coding_agent_index: 60, scores: [{ benchmark_id: 'deepswe', score: 70, unit: '%', higher_is_better: true, version: 'v1.1', updated_at: null, method_url: 'https://artificialanalysis.ai/methodology/coding-agents-benchmarking', included_in_index: true, cross_model_comparable: false, source_kind: 'official' }],
    average_task_tokens: 1000, cache_hit_percent: null, input_tokens: null, cached_tokens: null, output_tokens: null,
    average_task_seconds: 60, cost_per_task_usd: 0.2, cost_kind: 'official', benchmark_version: 'v1.5',
    source_url: 'https://artificialanalysis.ai/agents/coding-agents', source_updated_at: null, source_checked_at: '2026-10-16', note: 'fixture',
    ...overrides,
  };
}

describe('missing-data-safe metrics', () => {
  it('renders missing values without converting them to zero', () => {
    expect(formatPrice(null)).toBe(MISSING);
    expect(formatPrice(0)).toBe('免費');
    expect(formatQuota(undefined)).toBe(MISSING);
    expect(intelligenceEfficiency(model('unknown', null, null, null))).toBeNull();
  });

  it('keeps range quotas distinct from exact quotas', () => {
    const row: QuotaObservation = {
      id: 'range', plan_id: 'test-plan', plan_name: 'Test Plan', category: 'coding_agent', product: 'Codex', metric: 'local messages',
      value: null, value_type: 'range', unit: 'Local messages', window: '5 hours',
      model: 'GPT-6 Luna', reasoning_mode: null, shared_with: [], note: 'estimate',
      confidence: 'high', source_ids: ['official'], sampled_at: '2026-10-16', region: 'US',
      estimate_range: { min: 350, max: 3000, sample_size: null, workload: 'official estimate' },
    };
    expect(formatQuota(row)).toBe('350–3,000 Local messages（估計）');
  });

  it('keeps Chinese five-hour and weekly pool windows visible in the compact quota table', () => {
    expect(compactQuotaWindow('五小時額度；PDF、圖片生成與程式解釋')).toBe('5h');
    expect(compactQuotaWindow('每則複雜提示；五小時額度')).toBe('每提示／5h');
    expect(compactQuotaWindow('每週額度；約 10 分鐘內回答 4 個設定問答、送出 2 個提示')).toBe('10 分／4 問答＋2 提示／週池');
  });

  it('keeps historical model quota observations out of the current compact comparison', () => {
    const historical: QuotaObservation = {
      id: 'historical', plan_id: 'google-ai-plus', plan_name: 'Google AI Plus', category: 'chat', product: 'Gemini Apps', metric: 'community report',
      value: 4, value_type: 'exact', unit: 'prompts', window: 'five hours', model: 'Gemini Pro (version not specified)', reasoning_mode: null,
      shared_with: [], note: '歷史觀察；該帳號回報使用舊模型，不代表現行方案權限。', confidence: 'low', source_ids: ['reddit'], sampled_at: '2026-05-19', region: 'US', estimate_range: null,
    };
    expect(shouldShowCompactQuota(historical)).toBe(false);
    expect(shouldShowCompactQuota({ ...historical, note: '目前模型額度觀察' })).toBe(true);
  });

  it('shows plan-linked community quota observations with unknown product mapping only when community evidence is enabled', () => {
    const observation: QuotaObservation = {
      id: 'unmapped-community', plan_id: 'test-plan', plan_name: 'Test Plan', category: 'coding_agent', product: 'Codex（執行環境未明）', metric: 'community report',
      value: 11, value_type: 'exact', unit: '分鐘', window: 'one five-hour window', model: 'GPT-6.1 Sol', reasoning_mode: 'High',
      shared_with: [], note: '單一社群觀察；產品執行環境未確認。', confidence: 'low', source_ids: ['community'], sampled_at: '2026-10-09', region: '未提供', estimate_range: null,
    };
    expect(compactQuotaEntitlementAllowed(observation, 'unknown', true, false, true)).toBe(true);
    expect(compactQuotaEntitlementAllowed(observation, 'unknown', true, true, true)).toBe(false);
    expect(compactQuotaEntitlementAllowed(observation, 'unknown', true, false, false)).toBe(false);
    expect(compactQuotaEntitlementAllowed(observation, 'unknown', false, false, true)).toBe(false);
    expect(compactQuotaEntitlementAllowed(observation, 'excluded', true, false, true)).toBe(false);
  });

  it('marks reasoning benchmark variants approximate when the subscription mode is not mapped', () => {
    expect(reasoningEffortIsMapped([], 'High')).toBe(false);
    expect(reasoningEffortIsMapped(['High'], 'High')).toBe(true);
    expect(reasoningEffortIsMapped(['Medium'], 'High')).toBe(false);
    expect(reasoningEffortIsMapped([], null)).toBe(true);
  });

  it('does not treat an unknown plan price as within a price cap', () => {
    const plan = { monthly_price: null } as SubscriptionPlan;
    expect(priceWithinCap(plan, 30)).toBe(false);
    expect(priceWithinCap(plan, null)).toBe(true);
  });

  it('uses only shared benchmark versions for cost charts and Pareto analysis', () => {
    const rows = [
      model('a', 90, 0.1, '4.3'),
      model('b', 80, 0.05, '4.3'),
      model('c', 99, 0.01, '4.2'),
      model('missing', null, null, '4.3'),
      model('zero-cost', 90, 0, '4.3'),
    ];
    const comparable = comparableCostPoints(rows);
    expect(comparable.map((row) => row.id)).toEqual(['a', 'b']);
    expect(paretoFrontier(comparable).map((row) => row.id).sort()).toEqual(['a', 'b']);
  });

  it('compares Coding Agent results as complete configurations with matching version and evidence kind', () => {
    const rows = [
      codingAgent({ id: 'codex', harness: 'Codex Cloud', benchmark_version: 'v1.5', cost_kind: 'official' }),
      codingAgent({ id: 'claude', provider: 'anthropic', agent: 'Claude Code', harness: 'Claude Code', benchmark_version: 'v1.5', cost_kind: 'official' }),
      codingAgent({ id: 'old-version', benchmark_version: 'v1.4', cost_kind: 'official' }),
      codingAgent({ id: 'community-cost', benchmark_version: 'v1.5', cost_kind: 'community' }),
    ];
    const result = comparableCodingAgents(rows);
    expect(result.version).toBe('v1.5');
    expect(result.costKind).toBe('official');
    expect(result.records.map((agent) => agent.id)).toEqual(['codex', 'claude']);
    expect(result.records.map((agent) => agent.harness)).toEqual(['Codex Cloud', 'Claude Code']);
  });

  it('requires official task-cost evidence as well as an official score for official-only Coding Agent rows', () => {
    const official = codingAgent();
    const communityCost = codingAgent({ cost_kind: 'community' });
    const estimateCost = codingAgent({ cost_kind: 'estimate' });
    const missingCost = codingAgent({ cost_per_task_usd: null, cost_kind: null });
    expect(hasOfficialCodingAgentCostEvidence(official, 'official')).toBe(true);
    expect(hasOfficialCodingAgentCostEvidence(communityCost, 'official')).toBe(false);
    expect(hasOfficialCodingAgentCostEvidence(estimateCost, 'official')).toBe(false);
    expect(hasOfficialCodingAgentCostEvidence(official, 'community')).toBe(false);
    expect(hasOfficialCodingAgentScoreEvidence(missingCost, 'official')).toBe(true);
    expect(hasOfficialCodingAgentCostEvidence(missingCost, 'official')).toBe(false);
  });

  it('filters Coding Agent rows by explicit provider metadata', () => {
    const agents = [codingAgent(), codingAgent({ id: 'claude-test', provider: 'anthropic', agent: 'Claude Code' })];
    expect(filterCodingAgentsByProvider(agents, 'openai').map((agent) => agent.id)).toEqual(['codex-test']);
    expect(filterCodingAgentsByProvider(agents, 'all')).toHaveLength(2);
  });

  it('uses a compatible default sort whenever the selected tab changes', () => {
    expect(defaultSortForTab('plans')).toBe('price-low');
    expect(defaultSortForTab('models')).toBe('score-high');
    expect(defaultSortForTab('coding')).toBe('score-high');
    expect(defaultSortForTab('value')).toBe('score-high');
  });
});
