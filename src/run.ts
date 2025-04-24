import * as core from '@actions/core';
import {
  type ContractFunctionInteraction,
} from '@aztec/aztec.js';

import {
  type Gas,
  type ProfileResult,
  type ProfileReport,
  type BenchmarkRunContext,
  type BenchmarkConfig,
} from './types.js';

import { sumArray, sumGas } from './utils.js';
import fs from 'node:fs';
import path from 'node:path';
import { sync as globSync } from 'glob'; // Use sync version

/**
 * Handles the profiling of Aztec contract function interactions.
 */
class Profiler {
  /**
   * Profiles a list of contract function interactions.
   * @param fsToProfile - An array of ContractFunctionInteraction objects to profile.
   * @returns A promise resolving to an array of ProfileResult objects.
   */
  async profile(fsToProfile: ContractFunctionInteraction[]): Promise<ProfileResult[]> {
    const results: ProfileResult[] = [];
    for (const f of fsToProfile) {
      // Assumption: f is correctly configured with wallet/PXE context
      // This context must be available in the environment where the contract's
      // benchmark setup/getMethods runs.
      results.push(await this.#profileOne(f));
    }
    return results;
  }

  /**
   * Saves the collected benchmark results to a JSON file.
   * @param results - The array of profile results to save.
   * @param filename - The path to the output JSON file.
   */
  async saveResults(results: ProfileResult[], filename: string) {
    core.info(`Attempting to save ${results.length} results to ${filename}`);
    if (!results.length) {
      core.info(`No results to save for ${filename}. Writing empty report.`);
      const emptyReport: ProfileReport = { summary: {}, results: [], gasSummary: {} };
      fs.writeFileSync(filename, JSON.stringify(emptyReport, null, 2));
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
        [result.name]: sumGas(result.gas.gasLimits) + sumGas(result.gas.teardownGasLimits),
      }),
      {} as Record<string, number>,
    );

    const report: ProfileReport = {
      summary,
      results: results,
      gasSummary,
    };

    core.info(`Saving results for ${results.length} methods in ${filename}`);
    try {
      fs.writeFileSync(filename, JSON.stringify(report, null, 2));
      core.info(`Successfully saved benchmark results to ${filename}`);
    } catch (error: any) {
      core.error(`Failed to write results to ${filename}: ${error.message}`);
      // Decide if this should be a fatal error for the whole action
      // For now, just log the error and continue
    }
  }

  /**
   * Profiles a single contract function interaction.
   * Handles gas estimation, profiling execution, and sending the transaction.
   * @param f - The ContractFunctionInteraction to profile.
   * @returns A promise resolving to a ProfileResult object.
   * @private
   */
  async #profileOne(f: ContractFunctionInteraction): Promise<ProfileResult> {
    const request = await f.request();
    const call = request.calls[0];
    let name = call?.name;

    if (!name) {
      const selector = call?.selector.toString() ?? 'no_selector';
      core.warning(`Function name is undefined for selector ${selector}. Using placeholder.`);
      name = `unknown_function_${selector}`;
    }

    core.info(`Profiling ${name}...`);

    let profileResults;
    let gas: Record<'gasLimits' | 'teardownGasLimits', Gas>;

    try {
      core.debug(`Estimating gas for ${name}...`);
      gas = await f.estimateGas();
      core.debug(`Gas estimated for ${name}.`);

      core.debug(`Profiling execution for ${name}...`);
      profileResults = await f.profile({ profileMode: 'full' });
      core.debug(`Profiling complete for ${name}.`);

      // Decision Point: Is send().wait() necessary for benchmarking?
      // It confirms state changes and might be needed for subsequent calls within the *same* benchmark run,
      // but adds overhead and requires a funded account.
      // Keeping it for now to match original script, but flag for potential optimization.
      core.debug(`Sending and waiting for transaction mine for ${name}...`);
      await f.send().wait();
      core.debug(`Transaction mined for ${name}.`);

      const result: ProfileResult = {
        name,
        totalGateCount: sumArray(
          profileResults.executionSteps
            .map((step: { gateCount?: number }) => step.gateCount)
            .filter((count: number | undefined): count is number => count !== undefined),
        ),
        gateCounts: profileResults.executionSteps.map((step: { functionName: string; gateCount?: number }) => ({
          circuitName: step.functionName,
          gateCount: step.gateCount ?? 0,
        })),
        gas,
      };
      core.info(` -> ${name}: ${result.totalGateCount} gates`);
      return result;
    } catch (error: any) {
      core.error(`Error profiling ${name}: ${error.message}`);
      // Return a partial result indicating failure
      return {
        name: `${name} (FAILED)`,
        totalGateCount: 0,
        gateCounts: [],
        gas: { gasLimits: {} as Gas, teardownGasLimits: {} as Gas },
      };
    }
  }
}


/**
 * Finds all benchmark definition files (*.benchmark.ts) within the specified project's benchmark directory.
 * @param projectRoot - The root directory of the project containing the 'benchmarks' subdirectory.
 * @returns An array of objects, each describing a found benchmark script (name, path, benchmarkFile).
 */
function findBenchmarkableContracts(projectRoot: string): { name: string; path: string; benchmarkFile: string }[] {
  const benchmarksDir = path.join(projectRoot, 'benchmarks');
  core.info(`Looking for benchmark scripts (*.benchmark.ts) in: ${benchmarksDir}`);

  if (!fs.existsSync(benchmarksDir) || !fs.lstatSync(benchmarksDir).isDirectory()) {
    core.warning(`Benchmarks directory not found at ${benchmarksDir}. No benchmarks will be run.`);
    return [];
  }

  try {
    // Use glob.sync
    const benchmarkFiles: string[] = globSync('*.benchmark.ts', {
      cwd: benchmarksDir,
      absolute: true, // Get absolute paths
      nodir: true, // Only match files
    });

    core.info(`Found ${benchmarkFiles.length} benchmark script(s).`);

    // Map the found files to the expected return structure
    const contractsInfo = benchmarkFiles.map((benchmarkFile: string) => {
      // Extract contract name from filename, e.g., /path/to/benchmarks/token.benchmark.ts -> token
      const contractName = path.basename(benchmarkFile, '.benchmark.ts');
      // The 'path' property originally pointed to the contract's source directory.
      // Since we only have the benchmark file now, we'll use the benchmarks directory itself.
      // This might need adjustment depending on how `outputJsonPath` uses it later.
      const contractPath = benchmarksDir;

      core.info(` -> Discovered benchmark script: ${path.basename(benchmarkFile)} for contract: ${contractName}`);
      return { name: contractName, path: contractPath, benchmarkFile };
    });

    return contractsInfo;

  } catch (error: any) {
    core.error(`Error finding benchmark scripts in ${benchmarksDir}: ${error.message}`);
    throw new Error(`Failed to search for benchmark scripts: ${error.message}`);
  }
}

/**
 * Main benchmark execution orchestrator.
 * Finds all benchmark scripts, runs their setup (if defined),
 * gets the methods to benchmark, profiles them, and saves the results.
 * Requires necessary Aztec client context (PXE, Wallet) to be available externally.
 * @param projectRoot - The root directory of the project to benchmark.
 */
async function runBenchmarks(projectRoot: string): Promise<void> {
  core.info(`Starting benchmark run within: ${projectRoot}`);

  // Call the synchronous function
  const contractsToRun = findBenchmarkableContracts(projectRoot);

  if (!contractsToRun.length) {
    core.warning("No benchmarkable contracts found. Nothing to run.");
    return;
  }

  const profiler = new Profiler();

  for (const contractInfo of contractsToRun) {
    core.startGroup(`Benchmarking Contract: ${contractInfo.name}`);
    const benchmarkFilePath = contractInfo.benchmarkFile; // Absolute path
    const outputJsonPath = path.join(contractInfo.path, `${contractInfo.name}.benchmark_latest.json`);
    core.info(`Output JSON will be saved to: ${outputJsonPath}`);

    try {
      core.debug(`Attempting to import benchmark config from: ${benchmarkFilePath}`);
      const module = await import(benchmarkFilePath);
      const config: BenchmarkConfig = module.benchmarkConfig;
      core.debug(`Successfully imported module from ${benchmarkFilePath}`);

      if (!config || typeof config.getMethods !== 'function') {
        core.error(`Error: ${benchmarkFilePath} does not export a valid benchmarkConfig object with a getMethods function.`);
        // Save an empty/error report for this contract
        await profiler.saveResults([], outputJsonPath);
        core.endGroup(); // Close group for this contract
        continue; // Move to next contract
      }

      let runContext: BenchmarkRunContext = {};

      if (typeof config.setup === 'function') {
        core.info(`Running setup for ${contractInfo.name}...`);
        try {
          runContext = await config.setup();
          core.info(`Setup complete for ${contractInfo.name}.`);
        } catch (setupError: any) {
          core.error(`Error during setup for ${contractInfo.name}: ${setupError.message}`);
          await profiler.saveResults([], outputJsonPath); // Save empty report on setup failure
          core.endGroup();
          continue;
        }
      } else {
        core.info(`No setup function defined for ${contractInfo.name}.`);
      }

      core.info(`Getting benchmark methods for ${contractInfo.name}...`);
      const methodsToBenchmark = config.getMethods(runContext);

      // Ensure methodsToBenchmark is an array before proceeding
      if (!Array.isArray(methodsToBenchmark) || methodsToBenchmark.length === 0) {
        core.warning(`No benchmark methods returned by getMethods for ${contractInfo.name}. Skipping profiling.`);
        await profiler.saveResults([], outputJsonPath); // Save empty report
      } else {
        core.info(`Profiling ${methodsToBenchmark.length} methods for ${contractInfo.name}...`);
        const results = await profiler.profile(methodsToBenchmark);
        await profiler.saveResults(results, outputJsonPath);
      }

    } catch (error: any) {
      core.error(`Failed to benchmark contract ${contractInfo.name} from ${benchmarkFilePath}: ${error.message}`);
      // Log stack trace for better debugging if available
      if (error.stack) {
        core.debug(error.stack);
      }
      // Save an error report JSON
      const errorReport: ProfileReport = {
        summary: { [`${contractInfo.name}_RUN_ERROR`]: 0 },
        results: [{ name: 'BENCHMARK_RUNNER_ERROR', totalGateCount: 0, gateCounts: [], gas: { gasLimits: {} as Gas, teardownGasLimits: {} as Gas } }],
        gasSummary: { [`${contractInfo.name}_RUN_ERROR`]: 0 },
      };
      // Use profiler.saveResults which handles logging
      await profiler.saveResults([], outputJsonPath); // Save empty/error report
    }
    core.endGroup(); // End group for this contract
  }

  core.info("Benchmark run phase complete.");
}

export { runBenchmarks }; 
