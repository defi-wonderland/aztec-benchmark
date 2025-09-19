import type { ContractFunctionInteraction, Wallet } from '@aztec/aztec.js';
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
}
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
/** Defines a contract interaction to be benchmarked along with the wallet executing it. */
export interface BenchmarkedInteraction {
    /** The contract function interaction from Aztec.js. */
    interaction: ContractFunctionInteraction;
    /** Wallet responsible for sending the interaction. */
    wallet: Wallet;
}
/** Defines a contract interaction to be benchmarked, with a custom display name. */
export interface NamedBenchmarkedInteraction extends BenchmarkedInteraction {
    /** The custom name to be used for this benchmark in reports. */
    name: string;
}
/** Union of supported benchmark definitions. */
export type BenchmarkTarget = BenchmarkedInteraction | NamedBenchmarkedInteraction;
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
export declare abstract class BenchmarkBase {
    /** Optional setup function run before benchmarks */
    abstract setup?(): Promise<BenchmarkContext>;
    /** Function returning the methods to benchmark. Can be a mix of plain interactions or named interactions. */
    abstract getMethods(context: BenchmarkContext): BenchmarkTarget[];
    /** Optional teardown function run after benchmarks (no longer abstract) */
    teardown?(context: BenchmarkContext): Promise<void>;
}
