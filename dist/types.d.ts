import type { ContractFunctionInteraction } from '@aztec/aztec.js';
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
    circuitName: string;
    gateCount: number;
}
/** Result of profiling a single function */
export interface ProfileResult {
    name: string;
    totalGateCount: number;
    gateCounts: GateCount[];
    gas: GasLimits;
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
export declare abstract class BenchmarkBase {
    /** Optional setup function run before benchmarks */
    abstract setup?(): Promise<BenchmarkContext>;
    /** Function returning the methods to benchmark */
    abstract getMethods(context: BenchmarkContext): ContractFunctionInteraction[];
    /** Optional teardown function run after benchmarks (no longer abstract) */
    teardown?(context: BenchmarkContext): Promise<void>;
}
