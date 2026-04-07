import type { AztecAddress } from '@aztec/aztec.js/addresses';
import type { ContractFunctionInteractionCallIntent } from '@aztec/aztec.js/authorization';
import type { FeePaymentMethod } from '@aztec/aztec.js/fee';
import { EmbeddedWallet } from '@aztec/wallets/embedded';
import type { SystemInfo } from './systemInfo.js';
import type { TraceRegion, RegionResult } from './traceRegions.js';
import type { RawBenchmarkedInteraction, ProfileableAction } from './rawInteraction.js';
import type { MetricThresholds, ComparisonEntry, ComparisonResult } from './comparison.js';

export type { SystemInfo } from './systemInfo.js';
export type { TraceRegion, RegionResult } from './traceRegions.js';
export type { RawBenchmarkedInteraction, ProfileableAction } from './rawInteraction.js';
export type { MetricThresholds, ComparisonEntry, ComparisonResult } from './comparison.js';

/** Simplified Gas type (contains actual gas values) */
export type Gas = {
  /** Data Availability gas */
  daGas: number;
  /** Layer 2 execution gas */
  l2Gas: number;
};

/** Structure holding execution and teardown gas */
export type GasLimits = {
  gasLimits: Gas;
  teardownGasLimits: Gas;
};

/** Benchmark specific setup/teardown context */
export interface BenchmarkContext {
  wallet?: EmbeddedWallet;
  /** Optional fee payment method used when sending profiled transactions.
   *  When set, the profiler passes this to every send/prove call.
   *  When unset, the sender must have pre-existing Fee Juice. */
  feePaymentMethod?: FeePaymentMethod;
}

/** Gate counts for a specific circuit */
export interface GateCount {
  /** The name of the circuit. */
  circuitName: string;
  /** The number of gates in the circuit. */
  gateCount: number;
  /** Witness generation time in ms (hardware-dependent). */
  witgenMs?: number;
}

/** Result of profiling a single function */
export interface ProfileResult {
  /** The name of the profiled function. */
  name: string;
  /** The total gate count for the function. */
  totalGateCount: number;
  /** Detailed gate counts for each circuit in the function. */
  gateCounts: GateCount[];
  /** Gas usage information for the function. */
  gas?: GasLimits;
  /** Proving time in milliseconds. */
  provingTime?: number;
  /** Per-region gate count breakdowns (present when benchmark defines getRegions()). */
  regions?: Record<string, RegionResult>;
}

/** Defines a contract interaction to be benchmarked, with a custom display name. */
export interface NamedBenchmarkedInteraction {
  /** The contract function interaction from Aztec.js. */
  interaction: ContractFunctionInteractionCallIntent;
  /** The custom name to be used for this benchmark in reports. */
  name: string;
  /** Extra addresses whose private state (keys, notes) should be accessible during execution. */
  additionalScopes?: AztecAddress[];
}

/** Union of all interaction types accepted by the profiler. */
export type BenchmarkableItem =
  | ContractFunctionInteractionCallIntent
  | NamedBenchmarkedInteraction
  | RawBenchmarkedInteraction;

/** Structure of the output JSON report */
export interface ProfileReport {
  /** Total gate counts keyed by function name */
  summary: Record<string, number>;
  /** Detailed results for each function */
  results: ProfileResult[];
  /** Gas summary (total L2 + DA) keyed by function name */
  gasSummary: Record<string, number>;
  /** Proving time summary (in ms) keyed by function name */
  provingTimeSummary: Record<string, number>;
  /** Per-region total gate counts: region name → function name → total gates. */
  regionSummaries?: Record<string, Record<string, number>>;
  /** Metric stability annotations: which metrics are deterministic vs hardware-dependent. */
  metricStability?: Record<string, 'deterministic' | 'hardware-dependent'>;
  /** System information where the benchmark was run */
  systemInfo: SystemInfo;
}

/** Abstract class for users to extend */
export abstract class BenchmarkBase {
  /** Optional setup function run before benchmarks */
  abstract setup?(): Promise<BenchmarkContext>;
  /** Function returning the methods to benchmark. Can be a mix of plain interactions, named interactions, or raw interactions. */
  abstract getMethods(context: BenchmarkContext): BenchmarkableItem[];
  /** Optional teardown function run after benchmarks (no longer abstract) */
  teardown?(context: BenchmarkContext): Promise<void>;
  /** Optional: define named trace regions for per-region gate count breakdown. */
  getRegions?(): TraceRegion[];
} 