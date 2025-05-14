import type {
  ContractFunctionInteraction,
} from '@aztec/aztec.js';

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
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface BenchmarkContext {}

/** Gate counts for a specific circuit */
export interface GateCount {
  /** The name of the circuit. */
  circuitName: string;
  /** The number of gates in the circuit. */
  gateCount: number;
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
  gas: GasLimits;
}

/** Defines a contract interaction to be benchmarked, with a custom display name. */
export interface NamedBenchmarkedInteraction {
  /** The contract function interaction from Aztec.js. */
  interaction: ContractFunctionInteraction;
  /** The custom name to be used for this benchmark in reports. */
  name: string;
}

/** Structure of the output JSON report */
export interface ProfileReport {
  /** Total gate counts keyed by function name */
  summary: Record<string, number>;
  /** Detailed results for each function */
  results: ProfileResult[];
  /** Gas summary (total L2 + DA) keyed by function name */
  gasSummary: Record<string, number>;
}

/** Abstract class for users to extend */
export abstract class BenchmarkBase {
  /** Optional setup function run before benchmarks */
  abstract setup?(): Promise<BenchmarkContext>;
  /** Function returning the methods to benchmark. Can be a mix of plain interactions or named interactions. */
  abstract getMethods(context: BenchmarkContext): Array<ContractFunctionInteraction | NamedBenchmarkedInteraction>;
  /** Optional teardown function run after benchmarks (no longer abstract) */
  teardown?(context: BenchmarkContext): Promise<void>;
} 