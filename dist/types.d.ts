export interface CircuitData {
    name: string;
    totalGateCount: number;
    gateCounts: Array<{
        circuitName: string;
        gateCount: number;
    }>;
    gas: {
        gasLimits: {
            daGas: number;
            l2Gas: number;
        };
        teardownGasLimits: {
            daGas: number;
            l2Gas: number;
        };
    };
}
export interface GateCounts {
    summary: Record<string, number>;
    results: CircuitData[];
    gasSummary: Record<string, number>;
}
export interface MetricComparison {
    main: number;
    pr: number;
    diff: number;
}
export interface ComparisonResult {
    gates: MetricComparison;
    daGas: MetricComparison;
    l2Gas: MetricComparison;
}
