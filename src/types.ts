import { type ContractFunctionInteraction } from '@aztec/aztec.js';

/** Simplified Gas type */
export type Gas = {
  /** Data Availability gas */
  daGas: number;
  /** Layer 2 execution gas */
  l2Gas: number;
};

/** Result of profiling a single function */
export type ProfileResult = {
  /** Name of the profiled function */
  readonly name: string;
  /** Total gate count across all execution steps */
  readonly totalGateCount: number;
  /** Gate counts for individual circuits/steps */
  readonly gateCounts: readonly {
    /** Name of the circuit or execution step */
    readonly circuitName: string;
    /** Gate count for this specific circuit/step */
    readonly gateCount: number;
  }[];
  /** Gas usage details */
  readonly gas: Record<'gasLimits' | 'teardownGasLimits', Gas>;
};

/** Overall benchmark report JSON structure */
export type ProfileReport = {
  /** Summary mapping function names to total gate counts */
  readonly summary: Record<string, number>; // function name -> total gate count
  /** Detailed results for each profiled function */
  readonly results: readonly ProfileResult[];
  /** Summary mapping function names to total gas usage (DA + L2) */
  readonly gasSummary: Record<string, number>; // function name -> total gas (DA + L2)
};

/** Generic context passed between setup and getMethods in individual benchmark files. */
export interface BenchmarkRunContext {
  /** Allows benchmark files to pass arbitrary context data */
  [key: string]: any;
}

/** Expected structure of the default export from a *.benchmark.ts file */
export interface BenchmarkConfig {
  /** Optional asynchronous setup function run before getMethods */
  setup?: () => Promise<BenchmarkRunContext>;
  /** Function that returns the contract function interactions to benchmark */
  getMethods: (context: BenchmarkRunContext) => ContractFunctionInteraction[];
}

/** Configuration loaded from Nargo.toml and defaults */
export interface Config {
  /** Optional percentage threshold for flagging regressions */
  regression_threshold_percentage?: number;
  /** Optional path for the final report file (relative to repo root) */
  report_path?: string;
  /** Absolute path to the root of the repository being analyzed */
  repo_root: string; // Added for convenience
}

/** Structure holding baseline and PR values for a single metric */
export interface MetricComparison {
  /** Value from the baseline (e.g., main branch) */
  main: number;
  /** Value from the current run (e.g., PR branch) */
  pr: number;
}

/** Structure holding comparison results for a single function */
export interface ComparisonResult {
  /** Comparison for ACIR gates */
  gates: MetricComparison;
  /** Comparison for DA gas */
  daGas: MetricComparison;
  /** Comparison for L2 gas */
  l2Gas: MetricComparison;
} 
