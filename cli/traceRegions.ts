import type { GateCount } from './types.js';

/** Defines a named region of the execution trace to extract and report separately. */
export interface TraceRegion {
  /** Display name for this region in reports (e.g., 'fpc-only', 'app', 'kernel'). */
  name: string;
  /** Contract name prefix(es) marking the first step of this region. */
  startMatch: string | string[];
  /** Contract name prefix(es) marking the end boundary (exclusive). Omit to include until end of trace. */
  endMatch?: string | string[];
  /** If true, filter out kernel circuits (private_kernel_*, hiding_kernel) from the extracted region. */
  excludeKernels?: boolean;
}

/** Result of extracting a trace region: the filtered gate counts and their total. */
export interface RegionResult {
  /** Sum of gate counts in this region. */
  totalGateCount: number;
  /** Per-circuit gate counts within this region. */
  gateCounts: GateCount[];
}

const KERNEL_PATTERN_PREFIX = 'private_kernel_';
const KERNEL_EXACT = 'hiding_kernel';

/** Returns true if the circuit name is a kernel circuit (private_kernel_* or hiding_kernel). */
export function isKernelCircuit(name: string): boolean {
  return name.startsWith(KERNEL_PATTERN_PREFIX) || name === KERNEL_EXACT;
}

function toArray(value: string | string[]): string[] {
  return Array.isArray(value) ? value : [value];
}

function matchesAny(name: string, prefixes: string[]): boolean {
  return prefixes.some(prefix => name.startsWith(prefix));
}

/**
 * Extracts a slice of execution steps matching a trace region definition.
 *
 * Algorithm (proven in FPC's extractFpcSteps):
 * 1. Find first step where circuitName starts with any startMatch prefix
 * 2. Find first step after that matching any endMatch prefix (or end of trace)
 * 3. Optionally filter out kernel circuits
 */
export function extractRegion(steps: GateCount[], region: TraceRegion): GateCount[] {
  const startPrefixes = toArray(region.startMatch);

  const startIdx = steps.findIndex(s => matchesAny(s.circuitName, startPrefixes));
  if (startIdx === -1) return [];

  let endIdx = steps.length;
  if (region.endMatch) {
    const endPrefixes = toArray(region.endMatch);
    for (let i = startIdx; i < steps.length; i++) {
      if (matchesAny(steps[i].circuitName, endPrefixes)) {
        endIdx = i;
        break;
      }
    }
  }

  let sliced = steps.slice(startIdx, endIdx);

  if (region.excludeKernels) {
    sliced = sliced.filter(s => !isKernelCircuit(s.circuitName));
  }

  return sliced;
}

/** Extracts only kernel circuits from the full trace. */
export function extractKernelOverhead(steps: GateCount[]): GateCount[] {
  return steps.filter(s => isKernelCircuit(s.circuitName));
}

/** Extracts only non-kernel (application) circuits from the full trace. */
export function extractAppLogic(steps: GateCount[]): GateCount[] {
  return steps.filter(s => !isKernelCircuit(s.circuitName));
}

/**
 * Returns a built-in region preset that splits the trace into "app" (non-kernel)
 * and "kernel" (kernel overhead) regions. No configuration needed.
 */
export function kernelIsolation(): TraceRegion[] {
  // These are synthetic regions handled specially by applyRegions —
  // they use the full trace and filter by kernel vs non-kernel.
  return [
    { name: 'app', startMatch: '__all__', excludeKernels: true },
    { name: 'kernel', startMatch: '__all__', excludeKernels: false },
  ];
}

function sumGateCounts(steps: GateCount[]): number {
  return steps.reduce((sum, s) => sum + (s.gateCount ?? 0), 0);
}

/**
 * Applies an array of region definitions to a list of gate counts,
 * returning a map of region name → RegionResult.
 */
export function applyRegions(
  gateCounts: GateCount[],
  regions: TraceRegion[],
): Record<string, RegionResult> {
  const result: Record<string, RegionResult> = {};

  for (const region of regions) {
    let extracted: GateCount[];

    if (region.startMatch === '__all__') {
      // Synthetic region: filter the full trace
      extracted = region.excludeKernels
        ? extractAppLogic(gateCounts)
        : extractKernelOverhead(gateCounts);
    } else {
      extracted = extractRegion(gateCounts, region);
    }

    result[region.name] = {
      totalGateCount: sumGateCounts(extracted),
      gateCounts: extracted,
    };
  }

  return result;
}
