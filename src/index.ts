import * as core from '@actions/core';
import { loadConfig } from './config.js';
import { runBenchmarks } from './run.js';
import { runComparison } from './compare.js';

async function main(): Promise<void> {
  try {
    core.info('Starting Aztec Benchmark Diff Action...');

    // Get workspace path
    const workspacePath = process.env.GITHUB_WORKSPACE;
    if (!workspacePath) {
      throw new Error('GITHUB_WORKSPACE environment variable not set.');
    }
    core.info(`Running in workspace: ${workspacePath}`);

    // --- Phase 0: Load Configuration --- 
    const config = loadConfig(workspacePath);

    // --- Phase 1: Run Benchmarks --- 
    core.startGroup('Running benchmarks');
    await runBenchmarks(config.repo_root);
    core.endGroup();

    // --- Phase 2: Compare Results ---
    core.startGroup('Comparing benchmarks');
    await runComparison(config);
    core.endGroup();

    // --- Phase 4: Set Outputs & Exit Code ---
    core.setOutput('report_path', config.report_path);
    core.info(`Benchmark comparison report generated at: ${config.report_path}`);

    core.info('Aztec Benchmark Diff Action finished.');

  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed('An unknown error occurred');
    }
  }
}

// Execute the main function
main(); 
