// Export the base class and types for users
export { BenchmarkBase as Benchmark, BenchmarkContext } from './types.js'; // Alias BenchmarkBase to Benchmark for user convenience
export type { ProfileReport, ProfileResult, GateCount, SystemInfo, NamedBenchmarkedInteraction, BenchmarkableItem } from './types.js';
export type { TraceRegion, RegionResult, RawBenchmarkedInteraction, ProfileableAction, MetricThresholds, ComparisonEntry, ComparisonResult } from './types.js';

// Export system info utilities
export { getSystemInfo } from './systemInfo.js';

// Also export the Profiler for potential advanced use (or internal use by CLI)
export { Profiler } from './profiler.js';

// Export fee payment helpers
export { FeeWrappedInteraction, namedMethod } from './feeWrappedInteraction.js';
export type { FeeGasSettings, FeeOptions } from './feeWrappedInteraction.js';

// Export trace region utilities
export { extractRegion, extractKernelOverhead, extractAppLogic, applyRegions, kernelIsolation, isKernelCircuit } from './traceRegions.js';

// Export raw interaction utilities
export { isRawInteraction } from './rawInteraction.js';

// Export programmatic comparison API
export { compareReports } from './comparison.js';