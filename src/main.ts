import * as core from '@actions/core';
import * as github from '@actions/github';
import path from 'node:path';
import { runBenchmarks } from './run.js';
import { runComparison } from './compare.js';

async function main(): Promise<void> {
  try {
    core.info('Starting Aztec Benchmark Diff Action...');

    // Get inputs
    const githubToken = core.getInput('github_token'); // Currently unused, but good practice
    const thresholdInput = core.getInput('threshold');
    const reportFilename = core.getInput('report_filename');
    // const baseRef = core.getInput('base_ref'); // Future use

    const threshold = parseFloat(thresholdInput);
    if (isNaN(threshold)) {
        throw new Error(`Invalid threshold input: ${thresholdInput}. Must be a number.`);
    }
    core.info(`Using threshold: ${threshold * 100}%`);

    // Get workspace path
    const workspacePath = process.env.GITHUB_WORKSPACE;
    if (!workspacePath) {
      throw new Error('GITHUB_WORKSPACE environment variable not set.');
    }
    core.info(`Running in workspace: ${workspacePath}`);

    // --- Phase 1: Run Benchmarks --- 
    core.startGroup('Running benchmarks');
    await runBenchmarks(workspacePath); // Assumes *.benchmark.ts files exist
    core.endGroup();

    // --- Phase 2: Compare Benchmarks ---
    core.startGroup('Comparing benchmarks');
    const reportPath = path.join(workspacePath, reportFilename);
    await runComparison(workspacePath, reportPath, threshold); // Assumes *.benchmark.json and *.benchmark_latest.json exist
    core.endGroup();

    // --- Phase 3: Set Outputs ---
    core.setOutput('report_path', reportPath);
    core.info(`Benchmark comparison report generated at: ${reportPath}`);

    core.info('Aztec Benchmark Diff Action finished successfully.');

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