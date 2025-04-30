#!/usr/bin/env node
// benchmark-cli/src/cli.ts
import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import toml from '@iarna/toml';
import { Profiler } from './profiler.js';
import { BenchmarkBase, BenchmarkContext, type ProfileResult } from './types.js';

// Interface for the expected [benchmark] section
interface NargoToml {
  benchmark?: Record<string, string>;
}

const program = new Command();

program
  .name('benchmark-cli')
  .description('Runs benchmarks defined in Nargo.toml and associated *.benchmark.ts files.')
  .option('-c, --contracts <names...>', 'Specify contracts to benchmark by name (defined in Nargo.toml)')
  .option('--config <path>', 'Path to the Nargo.toml file', './Nargo.toml')
  .option('-o, --output-dir <path>', 'Directory to save benchmark reports', './benchmarks')
  .option('-s, --suffix <suffix>', 'Optional suffix to append to the report filename (e.g., _pr)')
  .action(async (options) => {

    const nargoTomlPath = path.resolve(process.cwd(), options.config);
    const outputDir = path.resolve(process.cwd(), options.outputDir);
    const specifiedContractNames = options.contracts || [];
    const suffix = options.suffix || '';

    if (!fs.existsSync(nargoTomlPath)) {
      console.error(`Error: Nargo.toml not found at ${nargoTomlPath}`);
      process.exit(1);
    }

    if (!fs.existsSync(outputDir)) {
      console.log(`Creating output directory: ${outputDir}`);
      fs.mkdirSync(outputDir, { recursive: true });
    }

    let nargoConfig: NargoToml;
    try {
      const tomlContent = fs.readFileSync(nargoTomlPath, 'utf-8');
      nargoConfig = toml.parse(tomlContent) as NargoToml;
    } catch (error: any) {
      console.error(`Error parsing Nargo.toml at ${nargoTomlPath}:`, error.message);
      process.exit(1);
    }

    const availableBenchmarks = nargoConfig.benchmark || {};
    const availableContractNames = Object.keys(availableBenchmarks);

    if (availableContractNames.length === 0) {
      console.error('No contracts found in the [benchmark] section of Nargo.toml.');
      process.exit(1);
    }

    // Filter contracts to run based on CLI option
    const contractsToRunNames = specifiedContractNames.length > 0
      ? availableContractNames.filter(name => specifiedContractNames.includes(name))
      : availableContractNames;

    if (contractsToRunNames.length === 0) {
        if (specifiedContractNames.length > 0) {
            console.error(
              `Error: None of the specified contracts found in the [benchmark] section: ${specifiedContractNames.join(', ')}`,
            );
        } else {
            console.error('Error: No benchmarks specified via --contracts flag or found in the [benchmark] section of Nargo.toml.');
        }
        program.outputHelp();
        process.exit(1);
    }

    console.log(
      `Found ${contractsToRunNames.length} benchmark(s) to run: ${contractsToRunNames.join(', ')}`,
    );

    const profiler = new Profiler();

    // Iterate over the filtered contract names
    for (const contractName of contractsToRunNames) {
      const benchmarkFileName = availableBenchmarks[contractName];
      const benchmarkFilePath = path.resolve(path.dirname(nargoTomlPath), benchmarkFileName);
      const outputFilename = `${contractName}${suffix}.benchmark.json`;
      const outputJsonPath = path.join(outputDir, outputFilename);

      console.log(`--- Running benchmark for ${contractName}${suffix ? ` (suffix: ${suffix})` : ''} ---`);
      console.log(` -> Benchmark file: ${benchmarkFilePath}`);
      console.log(` -> Output report: ${outputJsonPath}`);

      if (!fs.existsSync(benchmarkFilePath)) {
        console.error(`Error: Benchmark file not found: ${benchmarkFilePath}`);
        continue;
      }

      try {
        const module = await import(benchmarkFilePath);
        const BenchmarkClass = module.default;

        if (!BenchmarkClass || !(typeof BenchmarkClass === 'function') || !(typeof BenchmarkClass.prototype.getMethods === 'function')) {
            console.error(`Error: ${benchmarkFilePath} does not export a default class with a getMethods method.`);
            continue;
        }

        const benchmarkInstance: BenchmarkBase = new BenchmarkClass();

        let runContext: BenchmarkContext = {};

        if (typeof benchmarkInstance.setup === 'function') {
          console.log(`Running setup for ${contractName}...`);
          runContext = await benchmarkInstance.setup();
          console.log(`Setup complete for ${contractName}.`);
        }

        console.log(`Getting methods to benchmark for ${contractName}...`);
        const methodsToBenchmark = benchmarkInstance.getMethods(runContext);

        if (!Array.isArray(methodsToBenchmark) || methodsToBenchmark.length === 0) {
          console.warn(`No benchmark methods returned by getMethods for ${contractName}. Saving empty report.`);
        } else {
          console.log(`Profiling ${methodsToBenchmark.length} methods for ${contractName}...`);
          const results = await profiler.profile(methodsToBenchmark);
          await profiler.saveResults(results, outputJsonPath);
        }

        if (typeof benchmarkInstance.teardown === 'function') {
          console.log(`Running teardown for ${contractName}...`);
          await benchmarkInstance.teardown(runContext);
          console.log(`Teardown complete for ${contractName}.`);
        }

        console.log(`--- Benchmark finished for ${contractName} ---`);
      } catch (error: any) {
        console.error(`Failed to run benchmark for ${contractName} from ${benchmarkFilePath}:`, error);
      }
    }

    console.log('All specified benchmarks completed.');
  });

program.parse(process.argv);
