import { GasDimensions } from '@aztec/stdlib/gas';
import {
  type Gas,
} from './types.js';

// Export directly without redefinition
export { GasDimensions };

/** Extracts total DA gas from a ProfileResult-like object */
export function getDaGas(result?: { gas?: Record<string, Gas> }): number {
  if (!result?.gas) return 0;
  const limits = result.gas.gasLimits?.daGas ?? 0;
  const teardown = result.gas.teardownGasLimits?.daGas ?? 0;
  return limits + teardown;
}

/** Extracts total L2 gas from a ProfileResult-like object */
export function getL2Gas(result?: { gas?: Record<string, Gas> }): number {
  if (!result?.gas) return 0;
  const limits = result.gas.gasLimits?.l2Gas ?? 0;
  const teardown = result.gas.teardownGasLimits?.l2Gas ?? 0;
  return limits + teardown;
}

/** Sums the numbers in an array */
export function sumArray(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0);
}

/** Calculates total gas (DA + L2) from a Gas object */
export function sumGas(gas: Gas): number {
  return (gas?.daGas ?? 0) + (gas?.l2Gas ?? 0);
}
