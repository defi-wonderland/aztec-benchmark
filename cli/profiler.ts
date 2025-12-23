import type { ContractFunctionInteractionCallIntent } from '@aztec/aztec.js/authorization';
import { proveInteraction } from '@aztec/test-wallet/server';
import { TestWallet } from '@aztec/test-wallet/server';


import fs from 'node:fs';
import {
  type ProfileResult,
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

interface ProfilerOptions {
  skipProving?: boolean;
}

/**
 * Profiles Aztec contract functions to measure gate counts, gas usage and proving time.
 */
export class Profiler {
  #wallet?: TestWallet;
  #skipProving: boolean;

  constructor(wallet?: TestWallet, options?: ProfilerOptions) {
    this.#wallet = wallet;
    this.#skipProving = options?.skipProving ?? false;
    
    if (!this.#skipProving && !wallet) {
      throw new Error('Wallet is required when proving is enabled');
    }
  }

  /**
   * Profiles a list of contract function interactions. 
   * Items can be plain interactions or objects with an interaction and a custom name.
   * @param fsToProfile - An array of items to profile.
   * @returns A promise that resolves to an array of profile results.
   */
  async profile(fsToProfile: Array<ContractFunctionInteractionCallIntent | NamedBenchmarkedInteraction>): Promise<ProfileResult[]> {
    const results: ProfileResult[] = [];
    for (const item of fsToProfile) {
      if ('interaction' in item && 'name' in item) {
        // This is a NamedBenchmarkedInteraction object
        results.push(await this.#profileOne(item.interaction, item.name));
      } else {
        // This is a plain ContractFunctionInteractionCallIntent
        results.push(await this.#profileOne(item as ContractFunctionInteractionCallIntent)); // Pass undefined for customName
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
        JSON.stringify({ summary: {}, gasSummary: {}, provingTimeSummary: {}, results: [] } as ProfileReport, null, 2),
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

    const provingTimeSummary = results.reduce(
      (acc, result) => ({
        ...acc,
        [result.name]: result.provingTime ?? 0,
      }),
      {} as Record<string, number>,
    );

    const report: ProfileReport = {
      summary,
      gasSummary,
      provingTimeSummary,
      results: results,
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
  async #profileOne(f: ContractFunctionInteractionCallIntent, customName?: string): Promise<ProfileResult> {
    let name: string;
    if (customName) {
      name = customName;
    } else {
      // Name discovery logic (reinstated)
      try {
        const executionPayload = await f.action.request(); // Note: f.request() might be an issue if f is already a PxeSimoneResponse - check aztec.js docs
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
      const origin = f.caller;

      // Gas simulated is 10% higher by default, we set the padding to 0 to get a better estimate.
      const gas: GasLimits = (await f.action.simulate({ from: origin, fee: { estimateGas: true, estimatedGasPadding: 0 } })).estimatedGas;
      // We cannot send a profiled tx proof, so we skip proof generation. We still need to profile gate counts.
      const profileResults = await f.action.profile({ profileMode: 'full', from: origin, skipProofGeneration: true });

      let provingTime: number | undefined;

      if (!this.#skipProving && this.#wallet) {
        // We prove the tx to get the proving time.
        const provenTx = await proveInteraction(this.#wallet, f.action, { from: f.caller });
        // We send the tx. We could get the gas used from the receipt.
        await provenTx.send().wait();
        provingTime = provenTx.stats?.timings?.proving;
      } else {
        // We send the tx. We could get the gas used from the receipt.
        await f.action.send({ from: origin }).wait();
      }

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
        provingTime,
      };

      const daGas = gas?.gasLimits?.daGas ?? 'N/A';
      const l2Gas = gas?.gasLimits?.l2Gas ?? 'N/A';
      const provingDisplay = provingTime !== undefined ? `${provingTime}ms` : 'skipped';
      console.log(` -> ${name}: ${result.totalGateCount} gates, Gas (DA: ${daGas}, L2: ${l2Gas}), Proving: ${provingDisplay}`);
      return result;
    } catch (error: any) {
      console.error(`Error profiling ${name}:`, error.message);
      throw error;
    }
  }
} 
