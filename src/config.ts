import * as fs from 'node:fs';
import * as path from 'node:path';
import * as toml from 'toml'; // Assuming 'toml' package is installed
import { type Config } from './types.js'; // Import Config type

const DEFAULT_REPORT_PATH = 'benchmark_diff.md';

/**
 * Loads benchmark configuration from Nargo.toml located at the repository root.
 * Applies default values for missing fields.
 * Exits process on error.
 *
 * @param repoRoot The absolute path to the repository root.
 * @returns The benchmark configuration object.
 */
export function loadConfig(repoRoot: string): Config {
  const nargoTomlPath = path.join(repoRoot, 'Nargo.toml');
  let rawTomlContent: string;
  let parsedToml: any;

  try {
    rawTomlContent = fs.readFileSync(nargoTomlPath, 'utf-8');
  } catch (error) {
    console.error(`Error reading Nargo.toml at ${nargoTomlPath}:`, error);
    process.exit(1);
  }

  try {
    parsedToml = toml.parse(rawTomlContent);
  } catch (error) {
    console.error(`Error parsing Nargo.toml at ${nargoTomlPath}:`, error);
    process.exit(1);
  }

  // Cast the potentially existing section to Partial<Config>
  const benchmarkSection: Partial<Config> | undefined = parsedToml?.benchmark;

  const config: Config = {
    repo_root: repoRoot,
    regression_threshold_percentage: benchmarkSection?.regression_threshold_percentage,
    // Apply default report_path here
    report_path: path.resolve(repoRoot, benchmarkSection?.report_path ?? DEFAULT_REPORT_PATH),
  };

  // Basic validation for threshold
  if (
    config.regression_threshold_percentage !== undefined &&
    (typeof config.regression_threshold_percentage !== 'number' || config.regression_threshold_percentage < 0)
  ) {
    console.error(
      `Error: Invalid value for benchmark.regression_threshold_percentage in Nargo.toml. Must be a non-negative number. Found: ${config.regression_threshold_percentage}`,
    );
    process.exit(1);
  }

  console.log('Benchmark configuration loaded successfully.');
  return config;
} 