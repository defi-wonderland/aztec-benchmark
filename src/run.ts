import * as core from '@actions/core';
import {
  type ContractFunctionInteraction,
} from '@aztec/aztec.js';

// Import shared types
import {
  type Gas,
  type ProfileResult,
  type ProfileReport,
  type BenchmarkRunContext,
  type BenchmarkConfig,
} from './common.js'; // Use .js extension for imports within src

import * as TOML from 'toml';
import fs from 'node:fs';
import path from 'node:path';

// --- Utilities ---

function sumArray(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0);
}

function sumGas(gas: Gas): number {
  return (gas?.daGas ?? 0) + (gas?.l2Gas ?? 0);
}

// --- Profiler Class ---

class Profiler {
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

// --- Runner Logic ---

// Changed to accept projectRoot (GITHUB_WORKSPACE)
async function findBenchmarkableContracts(projectRoot: string): Promise<{ name: string; path: string; benchmarkFile: string }[]> {
  const rootNargoTomlPath = path.join(projectRoot, 'Nargo.toml');
  core.info(`Looking for Nargo.toml at: ${rootNargoTomlPath}`);
  const benchmarkableContracts: { name: string; path: string; benchmarkFile: string }[] = [];

  try {
    const tomlContent = fs.readFileSync(rootNargoTomlPath, 'utf-8');
    const parsedToml = TOML.parse(tomlContent);

    if (parsedToml.workspace && Array.isArray(parsedToml.workspace.members)) {
      core.info(`Found ${parsedToml.workspace.members.length} workspace members in Nargo.toml`);
      for (const memberPath of parsedToml.workspace.members) {
        const absoluteContractPath = path.join(projectRoot, memberPath);
        const contractName = path.basename(absoluteContractPath);
        const benchmarkFilePath = path.join(absoluteContractPath, `${contractName}.benchmark.ts`);

        core.debug(`Checking for benchmark file: ${benchmarkFilePath}`);
        if (fs.existsSync(benchmarkFilePath)) {
          benchmarkableContracts.push({ name: contractName, path: absoluteContractPath, benchmarkFile: benchmarkFilePath });
          core.info(` -> Discovered benchmarkable contract: ${contractName} at ${memberPath}`);
        } else {
          core.warning(`Workspace member ${memberPath} does not have a ${contractName}.benchmark.ts file. Skipping.`);
        }
      }
    } else {
      core.warning(`Root Nargo.toml (${rootNargoTomlPath}) does not contain a [workspace].members array or it's not an array.`);
    }
  } catch (error: any) {
    if (error.code === 'ENOENT') {
       core.error(`Error: Root Nargo.toml not found at ${rootNargoTomlPath}. Cannot discover contracts.`);
       // If Nargo.toml is missing, we likely can't do anything, rethrow or handle gracefully
       throw new Error(`Root Nargo.toml not found at ${rootNargoTomlPath}`);
    } else {
      core.error(`Error reading or parsing root Nargo.toml at ${rootNargoTomlPath}: ${error.message}`);
      throw new Error(`Failed to read/parse Nargo.toml: ${error.message}`);
    }
  }

  core.info(`Found ${benchmarkableContracts.length} benchmarkable contracts.`);
  return benchmarkableContracts;
}

// Changed to accept projectRoot (GITHUB_WORKSPACE)
// This function now orchestrates the run for all discovered contracts.
async function runBenchmarks(projectRoot: string): Promise<void> {
  core.info(`Starting benchmark run within: ${projectRoot}`);

  const contractsToRun = await findBenchmarkableContracts(projectRoot);

  if (!contractsToRun.length) {
    core.warning("No benchmarkable contracts found. Nothing to run.");
    return;
  }

  const profiler = new Profiler();

  for (const contractInfo of contractsToRun) {
    core.startGroup(`Benchmarking Contract: ${contractInfo.name}`);
    const benchmarkFilePath = contractInfo.benchmarkFile; // Absolute path
    const outputJsonPath = path.join(
      contractInfo.path, // Absolute path to contract directory
      `${contractInfo.name}.benchmark_latest.json`
    );
    core.info(`Output JSON will be saved to: ${outputJsonPath}`);

    try {
      core.debug(`Attempting to import benchmark config from: ${benchmarkFilePath}`);
      // Use dynamic import with the absolute path. Requires Node.js environment that supports it.
      // Make sure the build target (tsconfig) and execution environment are compatible.
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
        // CRITICAL: The setup function MUST have access to the necessary Aztec client (PXE, Wallet).
        // This action does NOT set that up; it must be done externally in the workflow.
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
        results: [{ name: 'BENCHMARK_RUNNER_ERROR', totalGateCount: 0, gateCounts: [], gas: { gasLimits: {} as Gas, teardownGasLimits: {} as Gas} }],
        gasSummary: { [`${contractInfo.name}_RUN_ERROR`]: 0 },
      };
      // Use profiler.saveResults which handles logging
      await profiler.saveResults([], outputJsonPath); // Save empty/error report
    }
    core.endGroup(); // End group for this contract
  }

  core.info("Benchmark run phase complete.");
}

// Export the main runner function for use in main.ts
// Keep findBenchmarkableContracts internal to this module for now.
export { runBenchmarks }; 