import { type ContractFunctionInteraction } from '@aztec/aztec.js';
import fs from 'node:fs';
import {
  type ProfileResult,
  type GateCount,
  type ProfileReport,
  type Gas,
  type GasLimits,
  type NamedBenchmarkedInteraction,
} from './types.js';

/**
 * Sums all numbers in an array.
 * @param arr - The array of numbers to sum.
 * @returns The sum of the numbers.
 */
function sumArray(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0);
}

/**
 * Sums DA and L2 gas components.
 * @param gas - The gas object.
 * @returns The total gas (DA + L2).
 */
function sumGas(gas: Gas): number {
  return (gas?.daGas ?? 0) + (gas?.l2Gas ?? 0);
}

/**
 * Profiles Aztec contract functions to measure gate counts and gas usage.
 */
export class Profiler {
  /**
   * Profiles a list of contract function interactions. 
   * Items can be plain interactions or objects with an interaction and a custom name.
   * @param fsToProfile - An array of items to profile.
   * @returns A promise that resolves to an array of profile results.
   */
  async profile(fsToProfile: Array<ContractFunctionInteraction | NamedBenchmarkedInteraction>): Promise<ProfileResult[]> {
    const results: ProfileResult[] = [];
    for (const item of fsToProfile) {
      if ('interaction' in item && 'name' in item) {
        // This is a NamedBenchmarkedInteraction object
        results.push(await this.#profileOne(item.interaction, item.name));
      } else {
        // This is a plain ContractFunctionInteraction
        results.push(await this.#profileOne(item as ContractFunctionInteraction)); // Pass undefined for customName
      }
    }
    return results;
  }

  /**
   * Saves the profiling results to a JSON file.
   * If no results are provided, an empty report is saved.
   * @param results - An array of profile results to save.
   * @param filename - The name of the file to save the results to.
   */
  async saveResults(results: ProfileResult[], filename: string) {
    if (!results.length) {
      console.log(`No results to save for ${filename}. Saving empty report.`);
      fs.writeFileSync(
        filename,
        JSON.stringify({ summary: {}, results: [], gasSummary: {} } as ProfileReport, null, 2),
      );
      return;
    }

    const summary = results.reduce(
      (acc, result) => ({
        ...acc,
        [result.name]: result.totalGateCount,
      }),
      {} as Record<string, number>,
    );

    const gasSummary = results.reduce(
      (acc, result) => ({
        ...acc,
        [result.name]: result.gas
          ? sumGas(result.gas.gasLimits) + sumGas(result.gas.teardownGasLimits)
          : 0,
      }),
      {} as Record<string, number>,
    );

    const report: ProfileReport = {
      summary,
      results: results,
      gasSummary,
    };

    console.log(`Saving results for ${results.length} methods in ${filename}`);
    try {
      fs.writeFileSync(filename, JSON.stringify(report, null, 2));
    } catch (error: any) {
      console.error(`Error writing results to ${filename}:`, error.message);
      throw error;
    }
  }

  /**
   * Profiles a single contract function interaction.
   * @param f - The contract function interaction to profile.
   * @param customName - Optional user-defined name for this benchmark entry. If not provided, name is derived.
   * @returns A promise that resolves to a profile result for the function.
   *          Returns a result with FAILED in the name and zero counts/gas if profiling errors.
   * @private
   */
  async #profileOne(f: ContractFunctionInteraction, customName?: string): Promise<ProfileResult> {
    let name: string;
    if (customName) {
      name = customName;
    } else {
      // Name discovery logic (reinstated)
      try {
        const executionPayload = await f.request(); // Note: f.request() might be an issue if f is already a PxeSimoneResponse - check aztec.js docs
        if (executionPayload.calls && executionPayload.calls.length > 0) {
          const firstCall = executionPayload.calls[0];
          // Attempt to get a meaningful name
          name = firstCall?.name ?? firstCall?.selector?.toString() ?? 'unknown_function';
        } else {
          name = 'unknown_function_no_calls';
          console.warn('No calls found in execution payload for name discovery.');
        }
      } catch (e: any) {
        // Fallback if request() fails or doesn't yield a name
        const potentialMethodName = (f as any).methodName; // methodName is not a standard prop, but might exist on some wrapped objects
        if (potentialMethodName) {
            name = potentialMethodName;
            console.warn(`Could not simulate request for name discovery (${e.message}), using interaction.methodName as fallback: ${name}`);
        } else {
            name = 'unknown_function_request_failed';
            console.warn(`Could not determine function name from request simulation: ${e.message}`);
        }
      }
    }

    console.log(`Profiling ${name}...`);

    try {
      const txRequest = await f.create();
      const origin = txRequest.origin;

      const gas: GasLimits = await f.estimateGas({ from: origin });
      const profileResults = await f.profile({ profileMode: 'full', from: origin });
      await f.send({ from: origin }).wait();

      const result: ProfileResult = {
        name,
        totalGateCount: sumArray(
          profileResults.executionSteps
            .map(step => step.gateCount)
            .filter((count): count is number => count !== undefined),
        ),
        gateCounts: profileResults.executionSteps.map(step => ({
          circuitName: step.functionName,
          gateCount: step.gateCount || 0,
        })),
        gas,
      };

      const daGas = gas?.gasLimits?.daGas ?? 'N/A';
      const l2Gas = gas?.gasLimits?.l2Gas ?? 'N/A';
      console.log(` -> ${name}: ${result.totalGateCount} gates, Gas (DA: ${daGas}, L2: ${l2Gas})`);
      return result;
    } catch (error: any) {
      console.error(`Error profiling ${name}:`, error.message);
      throw error;
    }
  }
} 
