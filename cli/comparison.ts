import type { ProfileReport, ProfileResult, RegionResult } from './types.js';

/** Per-metric regression thresholds. Values are percentages (e.g., 2.5 = 2.5%). null = info-only (never triggers regression). */
export interface MetricThresholds {
  /** Gate count threshold %. Default: 2.5 */
  gates?: number | null;
  /** DA gas threshold %. Default: 2.5 */
  daGas?: number | null;
  /** L2 gas threshold %. Default: 2.5 */
  l2Gas?: number | null;
  /** Proving time threshold %. Default: null (info-only, hardware-dependent). */
  provingTime?: number | null;
}

/** A single metric's base vs PR comparison. */
export interface MetricDiff {
  base: number;
  pr: number;
  /** Percentage change. Infinity if base was 0 and pr > 0. */
  diffPct: number;
}

/** Comparison result for a single benchmarked function. */
export interface ComparisonEntry {
  name: string;
  gates: MetricDiff;
  daGas: MetricDiff;
  l2Gas: MetricDiff;
  provingTime: MetricDiff;
  /** Per-region gate count comparison (region name → diff). */
  regions: Record<string, MetricDiff>;
  status: 'regression' | 'improvement' | 'unchanged' | 'new' | 'removed';
}

/** Result of comparing two benchmark reports. */
export interface ComparisonResult {
  entries: ComparisonEntry[];
  /** True if any entry has status 'regression'. */
  hasRegression: boolean;
}

const DEFAULT_THRESHOLDS: Required<MetricThresholds> = {
  gates: 2.5,
  daGas: 2.5,
  l2Gas: 2.5,
  provingTime: null,
};

function pctChange(base: number, pr: number): number {
  if (base === 0 && pr === 0) return 0;
  if (base === 0) return Infinity;
  return ((pr - base) / base) * 100;
}

function makeDiff(base: number, pr: number): MetricDiff {
  return { base, pr, diffPct: pctChange(base, pr) };
}

function getDaGas(r?: ProfileResult): number {
  return r?.gas?.gasLimits?.daGas ?? 0;
}

function getL2Gas(r?: ProfileResult): number {
  return r?.gas?.gasLimits?.l2Gas ?? 0;
}

function resolveThresholds(t?: MetricThresholds | number): Required<MetricThresholds> {
  if (t == null) return { ...DEFAULT_THRESHOLDS };
  if (typeof t === 'number') return { gates: t, daGas: t, l2Gas: t, provingTime: null };
  return {
    gates: t.gates !== undefined ? t.gates : DEFAULT_THRESHOLDS.gates,
    daGas: t.daGas !== undefined ? t.daGas : DEFAULT_THRESHOLDS.daGas,
    l2Gas: t.l2Gas !== undefined ? t.l2Gas : DEFAULT_THRESHOLDS.l2Gas,
    provingTime: t.provingTime !== undefined ? t.provingTime : DEFAULT_THRESHOLDS.provingTime,
  };
}

function computeStatus(
  entry: ComparisonEntry,
  thresholds: Required<MetricThresholds>,
): ComparisonEntry['status'] {
  const isAllZeroBase = entry.gates.base === 0 && entry.daGas.base === 0 && entry.l2Gas.base === 0;
  const isAllZeroPr = entry.gates.pr === 0 && entry.daGas.pr === 0 && entry.l2Gas.pr === 0;

  if (isAllZeroPr && !isAllZeroBase) return 'removed';
  if (isAllZeroBase && !isAllZeroPr) return 'new';

  const checks: { diffPct: number; threshold: number }[] = [];
  if (thresholds.gates != null) checks.push({ diffPct: entry.gates.diffPct, threshold: thresholds.gates });
  if (thresholds.daGas != null) checks.push({ diffPct: entry.daGas.diffPct, threshold: thresholds.daGas });
  if (thresholds.l2Gas != null) checks.push({ diffPct: entry.l2Gas.diffPct, threshold: thresholds.l2Gas });
  if (thresholds.provingTime != null) checks.push({ diffPct: entry.provingTime.diffPct, threshold: thresholds.provingTime });

  const hasInfinite = checks.some(c => c.diffPct === Infinity);
  const hasRegression = hasInfinite || checks.some(c => isFinite(c.diffPct) && c.diffPct > c.threshold);
  const hasImprovement = checks.some(c => isFinite(c.diffPct) && c.diffPct < -c.threshold);

  if (hasRegression) return 'regression';
  if (hasImprovement) return 'improvement';
  return 'unchanged';
}

/**
 * Compare two benchmark reports programmatically.
 *
 * Returns structured comparison data for each function, including per-region
 * breakdowns and regression/improvement status based on configurable thresholds.
 *
 * @param base - The baseline report (e.g., from main branch).
 * @param pr - The PR/current report.
 * @param thresholds - Per-metric thresholds. A number applies to gates/daGas/l2Gas uniformly.
 */
export function compareReports(
  base: ProfileReport,
  pr: ProfileReport,
  thresholds?: MetricThresholds | number,
): ComparisonResult {
  const resolved = resolveThresholds(thresholds);

  const allNames = new Set([
    ...base.results.map(r => r.name),
    ...pr.results.map(r => r.name),
  ]);

  const entries: ComparisonEntry[] = [];

  for (const name of allNames) {
    if (!name || name.startsWith('unknown_function') || name.includes('(FAILED)')) continue;

    const baseResult = base.results.find(r => r.name === name);
    const prResult = pr.results.find(r => r.name === name);

    // Build per-region diffs
    const regionNames = new Set([
      ...Object.keys(baseResult?.regions ?? {}),
      ...Object.keys(prResult?.regions ?? {}),
    ]);
    const regions: Record<string, MetricDiff> = {};
    for (const regionName of regionNames) {
      const baseGates = baseResult?.regions?.[regionName]?.totalGateCount ?? 0;
      const prGates = prResult?.regions?.[regionName]?.totalGateCount ?? 0;
      regions[regionName] = makeDiff(baseGates, prGates);
    }

    const entry: ComparisonEntry = {
      name,
      gates: makeDiff(baseResult?.totalGateCount ?? 0, prResult?.totalGateCount ?? 0),
      daGas: makeDiff(getDaGas(baseResult), getDaGas(prResult)),
      l2Gas: makeDiff(getL2Gas(baseResult), getL2Gas(prResult)),
      provingTime: makeDiff(baseResult?.provingTime ?? 0, prResult?.provingTime ?? 0),
      regions,
      status: 'unchanged', // computed below
    };
    entry.status = computeStatus(entry, resolved);
    entries.push(entry);
  }

  return {
    entries,
    hasRegression: entries.some(e => e.status === 'regression'),
  };
}
