import { useState } from 'react';
import type { ModelRecord, Snapshot } from './data/types';

const groups = [
  { name: '知識工作', weight: '25%', items: [
    ['AA-Briefcase v1.1', '15%', '跨文件、表格與長期專案，評估成果、分析和呈現品質；適合參考財報與研究報告。', 'Elo 相對分數'],
    ['AutomationBench-AA', '5%', '透過工具操作應用程式，完成跨步驟自動化工作。', '任務完成率'],
    ['GDP.pdf', '5%', '根據長篇專業 PDF 回答問題，適合參考年報與論文閱讀。', '全部通過率'],
  ] },
  { name: '程式開發', weight: '25%', items: [
    ['FrontierCode 2.0', '15%', '修改真實開源專案，檢查程式變更與成果品質。', '成果評分'],
    ['Terminal-Bench 4.0', '10%', '在終端機完成程式、除錯、系統與資料任務。', '首次通過率'],
  ] },
  { name: '科學研究', weight: '25%', items: [
    ['Terminal-Bench-Science 0.1', '15%', '在終端機執行多步驟科學研究工作流程。', '首次通過率'],
    ['CritPt v2 高難度題組', '10%', '物理推理、數學建模與程式計算；不能直接代表統計推論能力。', '首次通過率'],
  ] },
  { name: '通用能力', weight: '25%', items: [
    ['AA-Omniscience v1.1', '15%', '衡量知識正確性與錯誤猜測；正確率占 10%、非幻覺率占 5%。', '知識指數'],
    ['HLE-Diamond', '10%', '以高難度知識與推理問題測試專家級問答能力。', '首次通過率'],
  ] },
] as const;

const extra = [
  ['財務與會計', '財報、會計與財務文件分析；適合投資研究。'],
  ['策略與營運', '商業策略、營運決策與專案規劃。'],
  ['法律、醫療、工程與經濟學', '各專業領域能力，應搭配領域內實際工作驗證。'],
  ['AA-AnalystAgent', '用 Python 與文件處理量化分析；每題重複五次，官方也衡量五次全部正確。'],
  ['GDPval-AA', '比較專業工作成果的品質，以 Elo 呈現。'],
  ['IFBench', '衡量遵守複雜指示的能力。'],
  ['多語言指數', '跨語言知識與推理，包含中文與日文；不能完整代表翻譯文風或敬語品質。'],
  ['MMMU Pro', '圖片與圖表等視覺推理。'],
  ['AA-PersonalityBench', '比較表達、條理、資訊、透明度、親和、表態、創意與空泛套話等風格；並非正確率。'],
] as const;
const costs = [
  ['每任務 API 成本', '基準工作負載的平均 API 成本；與訂閱費及訂閱額度分開。'],
  ['輸入／輸出價格', '每百萬輸入或輸出詞元的價格；輸出可能含計費推理詞元。'],
  ['快取讀取價格', '重複使用已快取輸入時的價格，依供應商與條件而異。'],
  ['輸出速度', '開始輸出後每秒產生的詞元數，越高不一定越早收到答案。'],
  ['首次輸出等待時間（TTFT）', '從送出請求到第一批內容的等待時間，越低越快。'],
  ['完整回應時間', '標準請求從送出到回答完成的時間，越低越快。'],
  ['每任務時間', '依評測詞元與輸出速度估算，不能當成真實 Codex 任務時間。'],
  ['上下文長度', '單次請求可容納的詞元範圍；實際輸入與輸出限制依模型而異。'],
  ['每任務輸出詞元', '工作負載消耗量，不等同能力高低。'],
] as const;
const defaults = [30, 20, 25, 15, 10];
const priorities = [
  { name: '程式開發', detail: 'FrontierCode、Terminal-Bench', ids: ['frontiercode', 'terminal_bench'] },
  { name: '知識工作', detail: 'AA-Briefcase、AutomationBench、GDP.pdf', ids: ['aa_briefcase', 'automationbench_aa', 'gdp_pdf'] },
  { name: '科學與量化分析', detail: 'AA-AnalystAgent、科學工作測試', ids: ['aa_analystagent', 'terminal_bench_science'] },
  { name: '知識可靠度與推理', detail: 'AA-Omniscience、HLE-Diamond', ids: ['aa_omniscience', 'hle_diamond'] },
  { name: '使用成本與體驗', detail: '每任務 API 成本、首次輸出等待時間、多語言', ids: [] },
] as const;

function metricDetails(model: ModelRecord, group: number): string[] {
  if (group === 4) return [
    `智能評測 API 成本：${model.intelligence_cost_per_task_usd == null ? '尚無可靠數據' : `$${model.intelligence_cost_per_task_usd}`}`,
    `首次輸出等待：${model.performance.time_to_first_token_ms == null ? '尚無可靠數據' : `${model.performance.time_to_first_token_ms} 毫秒`}`,
    '多語言：尚無可靠數據',
  ];
  return priorities[group].ids.map((id) => {
    const score = model.benchmarks.find((entry) => entry.benchmark_id === id);
    const name = ({ frontiercode: 'FrontierCode', terminal_bench: 'Terminal-Bench', aa_briefcase: 'AA-Briefcase', automationbench_aa: 'AutomationBench-AA', gdp_pdf: 'GDP.pdf', aa_analystagent: 'AA-AnalystAgent', terminal_bench_science: 'Terminal-Bench-Science', aa_omniscience: 'AA-Omniscience', hle_diamond: 'HLE-Diamond' } as Record<string, string>)[id];
    return `${name}：${score?.score == null ? '尚無可靠數據' : `${score.score} ${score.unit}（版本 ${score.version ?? '未公布'}）`}`;
  });
}

export function IndexGuide({ models, snapshot }: { models: ModelRecord[]; snapshot: Snapshot }) {
  const [weights, setWeights] = useState(defaults);
  const [first, setFirst] = useState('');
  const [second, setSecond] = useState('');
  const [showComparison, setShowComparison] = useState(false);
  const sum = weights.reduce((a, b) => a + b, 0);
  const modelA = models.find((model) => model.id === first) ?? models[0];
  const modelB = models.find((model) => model.id === second) ?? models.find((model) => model.id !== modelA?.id);
  const ordered = priorities.map((item, index) => ({ ...item, index, weight: weights[index] })).filter((item) => item.weight > 0).sort((a, b) => b.weight - a.weight);
  return <section className="section-panel index-guide">
    <div className="index-guide__intro"><span className="index-guide__eyebrow">選模指南 · 官方方法 v5.0</span><h2>找適合工作的模型</h2><p>先選任務，再看相關評測。綜合智能指數由四個類別組成，各占 25%；它主要測英文文字，中文、日文和視覺能力需另看專項評測。</p><a href="https://artificialanalysis.ai/methodology/intelligence-benchmarking" target="_blank" rel="noreferrer">查看官方評測方法 ↗</a></div>
    <p className="index-guide__notice">以下說明依官方 v5.0（2026-10-28 核對）。網站資料快照方法版本為 {snapshot.index_versions.intelligence_methodology ?? '未確認'}；不同版本的分數與權重請分開解讀。</p>
    <div className="guide-groups">{groups.map((group) => <details className="guide-group" key={group.name}><summary><span>{group.name}</span><b>{group.weight}</b></summary><div className="guide-items">{group.items.map(([name, weight, detail, unit]) => <article key={name}><div><strong>{name}</strong><b>{weight}</b></div><p>{detail}</p><small>{unit} · 越高越好</small></article>)}</div></details>)}</div>
    <details className="guide-section"><summary>分數怎麼讀？</summary><p>綜合智能指數是加權與正規化分數；Elo、正確率、任務完成率與標準化指數各有不同尺度。請比較同一測試、同一版本與相同設定的模型，不能直接把不同測試的百分比相減。</p></details>
    <details className="guide-section"><summary>其他值得看的專項評測</summary><div className="guide-extras">{extra.map(([name, detail]) => <article key={name}><strong>{name}</strong><p>{detail}</p></article>)}</div><p>這些專項評測分開公布，缺少授權資料時保持缺值。</p></details>
    <details className="guide-section"><summary>API 價格與速度怎麼看？</summary><div className="guide-extras">{costs.map(([name, detail]) => <article key={name}><strong>{name}</strong><p>{detail}</p></article>)}</div></details>
    <details className="guide-section" open><summary>依工作調整比較權重</summary><p>調整各項優先順序後，比較兩個模型的可用原始指標。權重用於排列關注項目；資料不足或尺度不同時不產生加權總分。</p><div className="guide-weights">{priorities.map((item, i) => <label key={item.name}><span><strong>{item.name}</strong><small>{item.detail}</small></span><span className="guide-weight-input"><input type="number" min="0" max="100" step="1" value={weights[i]} aria-label={`${item.name}權重`} onChange={(event) => { const value = Math.max(0, Math.min(100, Number(event.target.value) || 0)); setWeights((old) => old.map((entry, index) => index === i ? value : entry)); setShowComparison(false); }}/><b>%</b></span></label>)}</div><div className="guide-weight-actions"><strong aria-live="polite">合計 {sum}%／100%</strong><button type="button" onClick={() => { setWeights(defaults); setShowComparison(false); }}>重設權重</button></div>
      <div className="guide-model-select"><label>模型一<select value={modelA?.id ?? ''} onChange={(event) => setFirst(event.target.value)}>{models.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}</select></label><label>模型二<select value={modelB?.id ?? ''} onChange={(event) => setSecond(event.target.value)}>{models.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}</select></label></div>
      <button type="button" className="guide-compare-button" disabled={sum !== 100 || !modelA || !modelB} onClick={() => setShowComparison(true)}>依照這組權重比較模型</button>{sum !== 100 && <p role="status">請將權重合計調整為 100%。</p>}
      {showComparison && modelA && modelB && <div className="guide-results" aria-live="polite"><p>依權重由高至低排列；分數保留原始單位及來源版本。版本不同或未公布時，不能直接比較。</p>{ordered.map((item) => <article key={item.name}><h4>{item.name} · {item.weight}%</h4>{[modelA, modelB].map((model, index) => <div className="guide-result-model" key={`${model.id}-${index}`}><strong>{model.name}</strong>{metricDetails(model, item.index).map((line) => <span key={line}>{line}</span>)}</div>)}</article>)}</div>}
    </details>
  </section>;
}
