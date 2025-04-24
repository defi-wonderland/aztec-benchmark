import * as core from '@actions/core';
import fs from 'node:fs';
import path from 'node:path';
import { sync as globSync } from 'glob';

import { type Config, type ProfileReport, type ComparisonResult } from './types.js';
import {
  getDaGas,
  getL2Gas
} from './utils.js';


/** Formats the difference between two numbers for the report table */
const formatDiff = (main: number, pr: number): string => {
  if (main === 0 && pr === 0) return '-';
  if (main === 0) return '+100% 🚀'; // Indicate new non-zero value
  if (pr === 0) return '-100% 🗑️'; // Indicate removed value

  const diff = pr - main;
  if (diff === 0) return '-';

  const pct = ((diff / main) * 100);
  const sign = diff > 0 ? '+' : '';

  if (Math.abs(pct) < 0.01) return '-'; // Threshold for displaying diff
  // Format with commas for readability
  const diffFormatted = diff.toLocaleString();
  return `${sign}${diffFormatted} (${sign}${pct.toFixed(0)}%)`;
};

/** Determines the status emoji based on comparison and threshold */
const getStatusEmoji = (metrics: ComparisonResult, thresholdDecimal: number): string => {
  // Check if the benchmark was added or removed entirely
  const isNew = metrics.gates.main === 0 && metrics.daGas.main === 0 && metrics.l2Gas.main === 0 &&
    (metrics.gates.pr > 0 || metrics.daGas.pr > 0 || metrics.l2Gas.pr > 0);
  const isRemoved = metrics.gates.pr === 0 && metrics.daGas.pr === 0 && metrics.l2Gas.pr === 0 &&
    (metrics.gates.main > 0 || metrics.daGas.main > 0 || metrics.l2Gas.main > 0);

  if (isNew) return '🆕';
  if (isRemoved) return '🚮';

  // Calculate percentage differences, handling division by zero
  const calcPctDiff = (main: number, pr: number): number => {
    if (main === 0) {
      return pr > 0 ? Infinity : 0; // Infinite increase if pr > 0, zero change if pr is also 0
    }
    return (pr - main) / main;
  };

  const gateDiffPct = calcPctDiff(metrics.gates.main, metrics.gates.pr);
  const daGasDiffPct = calcPctDiff(metrics.daGas.main, metrics.daGas.pr);
  const l2GasDiffPct = calcPctDiff(metrics.l2Gas.main, metrics.l2Gas.pr);

  const metricsDiffs = [gateDiffPct, daGasDiffPct, l2GasDiffPct].filter(m => isFinite(m));
  const hasInfiniteIncrease = [gateDiffPct, daGasDiffPct, l2GasDiffPct].some(m => m === Infinity);

  // Determine status based on thresholds
  // Note: thresholdDecimal is already in decimal form (e.g., 0.05 for 5%)
  const hasRegression = hasInfiniteIncrease || metricsDiffs.some(m => m > thresholdDecimal);
  const hasImprovement = metricsDiffs.some(m => m < -thresholdDecimal);

  if (hasRegression) return '🔴'; // Regression (increase beyond threshold or new cost)
  if (hasImprovement) return '🟢'; // Improvement (decrease beyond threshold)
  return '⚪'; // No significant change (within threshold, or zero/no change)
};

/** Generates the Markdown table comparing baseline and PR results for one contract */
const generateContractComparisonTable = (mainData: ProfileReport, prData: ProfileReport, thresholdDecimal: number): string => {
  const comparison: Record<string, ComparisonResult> = {};
  const allFunctionNames = new Set<string>();

  // Populate comparison map and collect all function names
  const processResults = (report: ProfileReport, target: 'main' | 'pr') => {
    report.results.forEach(result => {
      const name = result.name;
      if (!name || name.startsWith('unknown_function') || name.includes('(FAILED)')) {
        core.debug(`Skipping malformed/failed entry in ${target} data: ${name}`);
        return; // Skip malformed or failed entries
      }
      allFunctionNames.add(name);
      if (!comparison[name]) {
        comparison[name] = {
          gates: { main: 0, pr: 0 },
          daGas: { main: 0, pr: 0 },
          l2Gas: { main: 0, pr: 0 },
        };
      }
      comparison[name].gates[target] = result.totalGateCount ?? 0;
      comparison[name].daGas[target] = getDaGas(result);
      comparison[name].l2Gas[target] = getL2Gas(result);
    });
  };

  processResults(mainData, 'main');
  processResults(prData, 'pr');

  if (allFunctionNames.size === 0) {
    core.warning("No valid benchmark functions found in either main or PR results for table generation.");
    return "\n_No valid benchmark functions found to compare._\n";
  }

  const output = [
    '<table>',
    '<thead>',
    '<tr>',
    '  <th></th>',
    '  <th>Function</th>',
    '  <th colspan="3" align="center">Gates</th>',
    '  <th colspan="3" align="center">DA Gas</th>',
    '  <th colspan="3" align="center">L2 Gas</th>',
    '</tr>',
    '<tr>',
    '  <th>Status</th>',
    '  <th></th>',
    '  <th align="right">Base</th>',
    '  <th align="right">PR</th>',
    '  <th align="center">Diff</th>',
    '  <th align="right">Base</th>',
    '  <th align="right">PR</th>',
    '  <th align="center">Diff</th>',
    '  <th align="right">Base</th>',
    '  <th align="right">PR</th>',
    '  <th align="center">Diff</th>',
    '</tr>',
    '</thead>',
    '<tbody>',
  ];

  // Sort function names alphabetically for consistent table order
  const sortedNames = Array.from(allFunctionNames).sort();

  for (const funcName of sortedNames) {
    const metrics = comparison[funcName];
    // Metrics should always exist here due to the processing logic, but guard anyway
    if (!metrics) {
      core.warning(`Metrics for function ${funcName} unexpectedly missing during table generation.`);
      continue;
    }

    const statusEmoji = getStatusEmoji(metrics, thresholdDecimal);
    output.push(
      '<tr>',
      `  <td align="center">${statusEmoji}</td>`,
      `  <td><code>${funcName}</code></td>`,
      // Gates (formatted with commas)
      `  <td align="right">${metrics.gates.main.toLocaleString()}</td>`,
      `  <td align="right">${metrics.gates.pr.toLocaleString()}</td>`,
      `  <td align="center">${formatDiff(metrics.gates.main, metrics.gates.pr)}</td>`,
      // DA Gas
      `  <td align="right">${metrics.daGas.main.toLocaleString()}</td>`,
      `  <td align="right">${metrics.daGas.pr.toLocaleString()}</td>`,
      `  <td align="center">${formatDiff(metrics.daGas.main, metrics.daGas.pr)}</td>`,
      // L2 Gas
      `  <td align="right">${metrics.l2Gas.main.toLocaleString()}</td>`,
      `  <td align="right">${metrics.l2Gas.pr.toLocaleString()}</td>`,
      `  <td align="center">${formatDiff(metrics.l2Gas.main, metrics.l2Gas.pr)}</td>`,
      '</tr>',
    );
  }

  output.push('</tbody>');
  output.push('</table>');
  return output.join('\n');
};

/** Discovers pairs of baseline (*.benchmark.json) and latest (*.benchmark_latest.json) result files. */
function findBenchmarkJsonPairs(projectRoot: string): { name: string; path: string; baselinePath: string; latestPath: string }[] {
  const benchmarksDir = path.join(projectRoot, 'benchmarks');
  core.info(`Looking for benchmark JSON pairs in: ${benchmarksDir}`);

  if (!fs.existsSync(benchmarksDir) || !fs.lstatSync(benchmarksDir).isDirectory()) {
    core.warning(`Benchmarks directory not found at ${benchmarksDir}. Cannot perform comparison.`);
    return [];
  }

  const foundPairs: { name: string; path: string; baselinePath: string; latestPath: string }[] = [];

  try {
    // Use glob.sync
    const latestJsonFiles: string[] = globSync('*.benchmark_latest.json', {
      cwd: benchmarksDir,
      absolute: true,
      nodir: true,
    });

    core.info(`Found ${latestJsonFiles.length} latest benchmark result file(s). Checking for baselines...`);

    for (const latestPath of latestJsonFiles) {
      const baseName = path.basename(latestPath, '.benchmark_latest.json');
      const baselinePath = path.join(benchmarksDir, `${baseName}.benchmark.json`);

      if (fs.existsSync(baselinePath)) {
        core.info(` -> Found pair for ${baseName}: ${path.basename(baselinePath)} and ${path.basename(latestPath)}`);
        foundPairs.push({
          name: baseName,
          path: benchmarksDir, // Consistent with src/run.ts, path refers to benchmarks dir
          baselinePath,
          latestPath,
        });
      } else {
        core.warning(`Skipping ${baseName}: Baseline file missing (${path.basename(baselinePath)})`);
      }
    }
  } catch (error: any) {
    core.error(`Error finding benchmark JSON files in ${benchmarksDir}: ${error.message}`);
    throw new Error(`Failed to search for benchmark JSON files: ${error.message}`);
  }

  core.info(`Found ${foundPairs.length} contracts with benchmark result pairs for comparison.`);
  return foundPairs;
}

/** 
 * Main comparison orchestration function.
 * Finds benchmark result pairs, compares them, generates a Markdown report,
 * and writes it to the configured path.
 * @param config The loaded configuration object.
 */
async function runComparison(config: Config): Promise<void> { // Still returns void
  const { repo_root: projectRoot, report_path: outputFilePath, regression_threshold_percentage } = config;

  // Convert percentage threshold to decimal for getStatusEmoji
  const thresholdDecimal = (regression_threshold_percentage ?? 0) / 100;

  core.info("Starting benchmark comparison...");
  core.info(`Output report file: ${outputFilePath}`);

  // Call the synchronous function
  const benchmarkPairs = findBenchmarkJsonPairs(projectRoot);

  if (!benchmarkPairs.length) {
    core.warning("No contracts found with both base and latest benchmark JSON files for comparison.");
    const reportContent = '# Benchmark Comparison\n\n_No benchmark results found to compare._\n';
    fs.writeFileSync(outputFilePath!, reportContent);
    core.info("Written empty comparison report.");
    return; // Nothing to compare
  }

  let markdownOutput = [
    '<!-- benchmark-diff -->',
    '# Benchmark Comparison',
    regression_threshold_percentage !== undefined ? `_Comparison Threshold: ${regression_threshold_percentage}%_\n` : '_No regression threshold set._\n',
    // Restore legend with regression/improvement emojis
    'Legends: 🟢 Improvement | 🔴 Regression | ⚪ No significant change | 🆕 New | 🚮 Removed\n'
  ];
  let contractsComparedCount = 0;

  for (const pairInfo of benchmarkPairs) {
    const { name: contractName, baselinePath: baseJsonPath, latestPath: latestJsonPath } = pairInfo;

    core.startGroup(`Comparing Contract: ${contractName}`);
    core.info(`Base file: ${baseJsonPath}`);
    core.info(`PR file: ${latestJsonPath}`);

    // Files are confirmed to exist by findBenchmarkJsonPairs
    try {
      const mainDataJson = fs.readFileSync(baseJsonPath, 'utf-8');
      const prDataJson = fs.readFileSync(latestJsonPath, 'utf-8');
      const mainData: ProfileReport = JSON.parse(mainDataJson);
      const prData: ProfileReport = JSON.parse(prDataJson);

      // Basic validation
      if (!mainData.results || !prData.results || !Array.isArray(mainData.results) || !Array.isArray(prData.results)) {
        core.warning(`Skipping ${contractName}: Invalid JSON structure (missing or non-array results).`);
        markdownOutput.push(`## Contract: ${contractName}
\n_Skipped: Invalid benchmark JSON structure._\n`);
        core.endGroup();
        continue;
      }

      core.info(`Comparing ${mainData.results.length} base functions with ${prData.results.length} PR functions for ${contractName}.`);

      // Pass the decimal threshold to the table generator
      const tableMarkdown = generateContractComparisonTable(mainData, prData, thresholdDecimal);

      markdownOutput.push(`## Contract: ${contractName}`);
      markdownOutput.push(tableMarkdown);
      markdownOutput.push('\n---\n'); // Separator between contracts
      contractsComparedCount++;

    } catch (error: any) {
      core.error(`Error processing benchmark files for ${contractName}: ${error.message}`);
      if (error.stack) {
        core.debug(error.stack);
      }
      markdownOutput.push(`## Contract: ${contractName}\n`);
      markdownOutput.push(`\n⚠️ Error comparing benchmarks for this contract: ${error.message}\n`);
      markdownOutput.push('\n---\n');
    }
    core.endGroup(); // End group for this contract
  }

  if (contractsComparedCount === 0 && benchmarkPairs.length > 0) {
    // This case means we found pairs but failed to process all of them
    core.warning("Found contract pairs but failed to process or validate any for comparison.");
    markdownOutput.push('\n_Found contract pairs but failed to process or validate any for comparison._\n');
  }

  // Write the final combined report
  core.info(`Writing comparison report for ${contractsComparedCount} contract(s) to ${outputFilePath}`);
  try {
    fs.writeFileSync(outputFilePath!, markdownOutput.join('\n'));
    core.info("Comparison report successfully written.");
  } catch (writeError: any) {
    core.error(`Failed to write comparison report to ${outputFilePath}: ${writeError.message}`);
    // This is a critical failure, maybe rethrow or set action failure state directly?
    throw new Error(`Failed to write comparison report: ${writeError.message}`);
  }
}

export { runComparison }; 
