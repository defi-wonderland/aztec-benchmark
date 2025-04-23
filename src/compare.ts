import * as core from '@actions/core';
import * as TOML from 'toml';
import fs from 'node:fs';
import path from 'node:path';

import {
  type ProfileReport,
  getDaGas,
  getL2Gas
} from './common.js'; // Use .js extension

// --- Types ---

interface MetricComparison {
  main: number;
  pr: number;
}

interface ComparisonResult {
  gates: MetricComparison;
  daGas: MetricComparison;
  l2Gas: MetricComparison;
}

// --- Helper Functions ---

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

const getStatusEmoji = (metrics: ComparisonResult, threshold: number): string => {
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
  const thresholdDecimal = threshold; // Threshold is already a decimal (e.g., 0.024)

  // Determine status based on thresholds
  const hasRegression = hasInfiniteIncrease || metricsDiffs.some(m => m > thresholdDecimal);
  const hasImprovement = metricsDiffs.some(m => m < -thresholdDecimal);

  if (hasRegression) return '🔴'; // Regression (increase beyond threshold or new cost)
  if (hasImprovement) return '🟢'; // Improvement (decrease beyond threshold)
  return '⚪'; // No significant change (within threshold, or zero/no change)
};

// Generates the Markdown table string for a single contract comparison
const generateContractComparisonTable = (mainData: ProfileReport, prData: ProfileReport, threshold: number): string => {
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

    const statusEmoji = getStatusEmoji(metrics, threshold);
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

// --- Contract Discovery (Identical logic needed, but only checks for JSON) ---

// Changed to accept projectRoot (GITHUB_WORKSPACE)
async function findBenchmarkableContractsForComparison(projectRoot: string): Promise<{ name: string; path: string }[]> {
    const rootNargoTomlPath = path.join(projectRoot, 'Nargo.toml');
    core.info(`Looking for Nargo.toml for comparison discovery at: ${rootNargoTomlPath}`);
    const benchmarkableContracts: { name: string; path: string }[] = [];

    try {
        const tomlContent = fs.readFileSync(rootNargoTomlPath, 'utf-8');
        const parsedToml = TOML.parse(tomlContent);

        if (parsedToml.workspace && Array.isArray(parsedToml.workspace.members)) {
            core.info(`Found ${parsedToml.workspace.members.length} workspace members for comparison discovery.`);
            for (const memberPath of parsedToml.workspace.members) {
                const contractPath = path.join(projectRoot, memberPath);
                const contractName = path.basename(contractPath);

                if (fs.existsSync(contractPath) && fs.lstatSync(contractPath).isDirectory()) {
                    const baseJsonPath = path.join(contractPath, `${contractName}.benchmark.json`);
                    const latestJsonPath = path.join(contractPath, `${contractName}.benchmark_latest.json`);

                    core.debug(`Checking for benchmark JSON files in ${contractPath}`);
                    // Require *both* files to exist for comparison
                    if (fs.existsSync(baseJsonPath) && fs.existsSync(latestJsonPath)) {
                        benchmarkableContracts.push({ name: contractName, path: contractPath });
                        core.info(` -> Found benchmark result pair for: ${contractName} at ${memberPath}`);
                    } else {
                        core.debug(`Skipping ${contractName}: Missing base (${fs.existsSync(baseJsonPath)}) or latest (${fs.existsSync(latestJsonPath)}) JSON file.`);
                    }
                } else {
                    core.warning(`Workspace member path ${memberPath} not found or not a directory. Skipping comparison discovery.`);
                }
            }
        } else {
            core.warning(`Root Nargo.toml (${rootNargoTomlPath}) does not contain a [workspace].members array or it's not an array.`);
        }
    } catch (error: any) {
        if (error.code === 'ENOENT') {
            core.error(`Error: Root Nargo.toml not found at ${rootNargoTomlPath}. Cannot discover contracts for comparison.`);
            throw new Error(`Root Nargo.toml not found at ${rootNargoTomlPath}`);
        } else {
            core.error(`Error reading or parsing root Nargo.toml at ${rootNargoTomlPath}: ${error.message}`);
            throw new Error(`Failed to read/parse Nargo.toml: ${error.message}`);
        }
    }

    core.info(`Found ${benchmarkableContracts.length} contracts with benchmark result pairs for comparison.`);
    return benchmarkableContracts;
}

// --- Main Comparison Orchestration --- 

// Changed to accept projectRoot, outputFilePath, threshold
async function runComparison(projectRoot: string, outputFilePath: string, threshold: number): Promise<void> {

  core.info("Starting benchmark comparison...");
  core.info(`Threshold for significant change: ${threshold * 100}%`);
  core.info(`Output report file: ${outputFilePath}`);

  const contractsToCompare = await findBenchmarkableContractsForComparison(projectRoot);

  if (!contractsToCompare.length) {
    core.warning("No contracts found with both base and latest benchmark JSON files for comparison.");
    const reportContent = '# Benchmark Comparison\n\n_No benchmark results found to compare._\n';
    fs.writeFileSync(outputFilePath, reportContent);
    core.info("Written empty comparison report.");
    return;
  }

  let markdownOutput = [
      '<!-- benchmark-diff -->',
      '# Benchmark Comparison',
      `_Comparison Threshold: ${threshold * 100}%_\n`,
      'Legends: 🟢 Improvement | 🔴 Regression | ⚪ No significant change | 🆕 New | 🚮 Removed\n'
    ];
  let contractsComparedCount = 0;

  for (const contractInfo of contractsToCompare) {
    const contractName = contractInfo.name;
    const contractPath = contractInfo.path; // Absolute path
    const baseJsonPath = path.join(contractPath, `${contractName}.benchmark.json`);
    const latestJsonPath = path.join(contractPath, `${contractName}.benchmark_latest.json`);

    core.startGroup(`Comparing Contract: ${contractName}`);
    core.info(`Base file: ${baseJsonPath}`);
    core.info(`PR file: ${latestJsonPath}`);

    // Files are already confirmed to exist by findBenchmarkableContractsForComparison
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

      const tableMarkdown = generateContractComparisonTable(mainData, prData, threshold);

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

  if (contractsComparedCount === 0 && contractsToCompare.length > 0) {
      // This case means we found pairs but failed to process all of them
       core.warning("Found contract pairs but failed to process or validate any for comparison.");
      markdownOutput.push('\n_Found contract pairs but failed to process or validate any for comparison._\n');
  }

  // Write the final combined report
  core.info(`Writing comparison report for ${contractsComparedCount} contract(s) to ${outputFilePath}`);
  try {
      fs.writeFileSync(outputFilePath, markdownOutput.join('\n'));
      core.info("Comparison report successfully written.");
  } catch (writeError: any) {
      core.error(`Failed to write comparison report to ${outputFilePath}: ${writeError.message}`);
      // This is a critical failure, maybe rethrow or set action failure state directly?
      throw new Error(`Failed to write comparison report: ${writeError.message}`);
  }
}

// Export the main comparison function
export { runComparison }; 