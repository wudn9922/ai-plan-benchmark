import type { CodingAgentRecord, ModelRecord, QuotaObservation, Snapshot, SubscriptionPlan } from './types';

export const MISSING = '尚無可靠數據';

export function formatPrice(value: number | null, currency = 'USD'): string {
  if (value === null || !Number.isFinite(value)) return MISSING;
  if (value === 0) return '免費';
  return new Intl.NumberFormat('zh-Hant', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value);
}

export function formatQuota(quota: QuotaObservation | undefined): string {
  if (!quota) return MISSING;
  if (quota.value_type === 'range' && quota.estimate_range) {
    const { min, max } = quota.estimate_range;
    return `${min.toLocaleString('zh-Hant')}–${max.toLocaleString('zh-Hant')} ${quota.unit}（估計）`;
  }
  if (quota.value_type === 'exact' && quota.value !== null) {
    const value = Number.isInteger(quota.value) ? quota.value.toLocaleString('zh-Hant') : quota.value.toLocaleString('zh-Hant', { maximumFractionDigits: 2 });
    return `${value} ${quota.unit}`;
  }
  return quota.note || MISSING;
}

export function priceWithinCap(plan: SubscriptionPlan, cap: number | null): boolean {
  if (cap === null) return true;
  return plan.monthly_price !== null && plan.monthly_price <= cap;
}

export function getQuota(snapshot: Snapshot, id: string): QuotaObservation | undefined {
  return snapshot.quotas.find((quota) => quota.id === id);
}

export function intelligenceEfficiency(model: ModelRecord, benchmarkVersion?: string | null): number | null {
  const score = model.indices.intelligence;
  const cost = model.intelligence_cost_per_task_usd;
  if (benchmarkVersion && model.intelligence_cost_benchmark_version !== benchmarkVersion) return null;
  if (score === null || cost === null || !Number.isFinite(score) || !Number.isFinite(cost) || cost <= 0) return null;
  return score / cost;
}

export function codingEfficiency(agent: CodingAgentRecord): number | null {
  const score = agent.coding_agent_index;
  const cost = agent.cost_per_task_usd;
  if (score === null || cost === null || !Number.isFinite(score) || !Number.isFinite(cost) || cost <= 0) return null;
  return score / cost;
}

export function hasOfficialCodingAgentScoreEvidence(agent: CodingAgentRecord, recordSourceKind: string | undefined): boolean {
  const index = agent.coding_agent_index;
  return recordSourceKind === 'official' && (
    index !== null && Number.isFinite(index) ||
    agent.scores.some((score) => score.source_kind === 'official' && typeof score.score === 'number' && Number.isFinite(score.score))
  );
}

/** Official-only cost comparisons require official evidence for both a positive task cost and a score. */
export function hasOfficialCodingAgentCostEvidence(agent: CodingAgentRecord, recordSourceKind: string | undefined): boolean {
  const cost = agent.cost_per_task_usd;
  return hasOfficialCodingAgentScoreEvidence(agent, recordSourceKind) &&
    agent.cost_kind === 'official' && cost !== null && Number.isFinite(cost) && cost > 0;
}

export function filterCodingAgentsByProvider(agents: CodingAgentRecord[], provider: string): CodingAgentRecord[] {
  return provider === 'all' ? agents : agents.filter((agent) => agent.provider === provider);
}

export function defaultSortForTab(tab: 'plans' | 'models' | 'coding' | 'value'): string {
  return tab === 'plans' ? 'price-low' : 'score-high';
}

export interface CostPoint {
  id: string;
  name: string;
  group: string;
  score: number | null;
  cost: number | null;
  benchmarkVersion: string | null;
}

function versionParts(version: string): number[] {
  return (version.match(/\d+/g) ?? []).map(Number);
}

function versionCompare(a: string, b: string): number {
  const left = versionParts(a);
  const right = versionParts(b);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return a.localeCompare(b);
}

export function preferredVersion(versions: Array<string | null | undefined>): string | null {
  const counts = new Map<string, number>();
  for (const version of versions) {
    if (version) counts.set(version, (counts.get(version) ?? 0) + 1);
  }
  return [...counts.entries()].sort(([a, countA], [b, countB]) => countB - countA || versionCompare(b, a))[0]?.[0] ?? null;
}

/** Return one representative benchmark version so different releases are never plotted together. */
export function comparableCostPoints(models: ModelRecord[], requestedVersion?: string | null): CostPoint[] {
  const eligible = models.filter((model) =>
    model.indices.intelligence !== null &&
    model.intelligence_cost_per_task_usd !== null &&
    model.intelligence_cost_per_task_usd > 0 &&
    model.intelligence_cost_benchmark_version !== null,
  );
  const selectedVersion = requestedVersion ?? preferredVersion(eligible.map((model) => model.intelligence_cost_benchmark_version));
  if (!selectedVersion) return [];
  return eligible
    .filter((model) => model.intelligence_cost_benchmark_version === selectedVersion)
    .map((model) => ({
      id: model.id,
      name: model.name,
      group: model.provider,
      score: model.indices.intelligence,
      cost: model.intelligence_cost_per_task_usd,
      benchmarkVersion: model.intelligence_cost_benchmark_version,
    }));
}

export function comparableCodingAgents(agents: CodingAgentRecord[]): { records: CodingAgentRecord[]; version: string | null; costKind: string | null } {
  const eligible = agents.filter((agent) =>
    agent.coding_agent_index !== null &&
    agent.cost_per_task_usd !== null && agent.cost_per_task_usd > 0 &&
    agent.benchmark_version !== null && agent.cost_kind !== null,
  );
  const version = preferredVersion(eligible.map((agent) => agent.benchmark_version));
  if (!version) return { records: [], version: null, costKind: null };
  const versionRows = eligible.filter((agent) => agent.benchmark_version === version);
  const kindCounts = new Map<string, number>();
  for (const agent of versionRows) kindCounts.set(agent.cost_kind!, (kindCounts.get(agent.cost_kind!) ?? 0) + 1);
  const preference: Record<string, number> = { official: 0, measured: 1, community: 2, estimate: 3 };
  const costKind = [...kindCounts.entries()].sort(([a, countA], [b, countB]) => countB - countA || (preference[a] ?? 9) - (preference[b] ?? 9))[0]?.[0] ?? null;
  return { records: versionRows.filter((agent) => agent.cost_kind === costKind), version, costKind };
}

/** Pareto frontier: higher scores and lower costs are preferred within one version. */
export function paretoFrontier(points: CostPoint[]): CostPoint[] {
  return points.filter((candidate) => {
    if (candidate.score === null || candidate.cost === null || candidate.cost <= 0 || !candidate.benchmarkVersion) return false;
    const dominated = points.some((other) =>
      other.id !== candidate.id &&
      other.benchmarkVersion === candidate.benchmarkVersion &&
      other.score !== null && other.cost !== null &&
      other.score >= candidate.score! && other.cost <= candidate.cost! &&
      (other.score > candidate.score! || other.cost < candidate.cost!),
    );
    return !dominated;
  });
}

export function countScores(snapshot: Snapshot): { models: number; intelligenceCost: number; codingTasks: number; codingScores: number } {
  return {
    models: snapshot.models.length,
    intelligenceCost: snapshot.models.filter((model) => model.intelligence_cost_per_task_usd !== null).length,
    codingTasks: snapshot.coding_agents.length,
    codingScores: snapshot.coding_agents.filter((agent) => agent.cost_per_task_usd !== null).length,
  };
}
