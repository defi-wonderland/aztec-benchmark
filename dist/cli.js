#!/usr/bin/env tsx
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// benchmark-cli/src/cli.ts
const commander_1 = require("commander");
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const toml_1 = __importDefault(require("@iarna/toml")); // Use @iarna/toml
const profiler_js_1 = require("./profiler.js");
const types_js_1 = require("./types.js"); // Import base class and ProfileResult
const program = new commander_1.Command();
program
    .name('benchmark-cli')
    .description('Runs benchmarks defined in Nargo.toml and associated *.benchmark.ts files.')
    .option('-c, --contracts <names...>', 'Specify contracts to benchmark by name (defined in Nargo.toml)')
    .option('--config <path>', 'Path to the Nargo.toml file', './Nargo.toml') // Default path
    .option('-o, --output-dir <path>', 'Directory to save benchmark reports', './benchmarks') // Default output
    .option('-s, --suffix <suffix>', 'Optional suffix to append to the report filename (e.g., _pr)') // New option
    .action(async (options) => {
    const nargoTomlPath = node_path_1.default.resolve(process.cwd(), options.config);
    const outputDir = node_path_1.default.resolve(process.cwd(), options.outputDir);
    const specifiedContractNames = options.contracts || [];
    const suffix = options.suffix || ''; // Get suffix or default to empty string
    if (!node_fs_1.default.existsSync(nargoTomlPath)) {
        console.error(`Error: Nargo.toml not found at ${nargoTomlPath}`);
        process.exit(1);
    }
    // Ensure output directory exists
    if (!node_fs_1.default.existsSync(outputDir)) {
        console.log(`Creating output directory: ${outputDir}`);
        node_fs_1.default.mkdirSync(outputDir, { recursive: true });
    }
    let nargoConfig;
    try {
        const tomlContent = node_fs_1.default.readFileSync(nargoTomlPath, 'utf-8');
        nargoConfig = toml_1.default.parse(tomlContent);
    }
    catch (error) {
        console.error(`Error parsing Nargo.toml at ${nargoTomlPath}:`, error.message);
        process.exit(1);
    }
    // Get benchmarks from the [benchmark] section
    const availableBenchmarks = nargoConfig.benchmark || {};
    const availableContractNames = Object.keys(availableBenchmarks);
    if (availableContractNames.length === 0) {
        console.error('No contracts found in the [benchmark] section of Nargo.toml.');
        process.exit(1);
    }
    // Filter contracts to run based on CLI option
    const contractsToRunNames = specifiedContractNames.length > 0
        ? availableContractNames.filter(name => specifiedContractNames.includes(name))
        : availableContractNames; // Run all if none specified
    // Check if any contracts are selected to run *after* processing options and config
    if (contractsToRunNames.length === 0) {
        // If specific contracts were requested but none were valid, show error
        if (specifiedContractNames.length > 0) {
            console.error(`Error: None of the specified contracts found in the [benchmark] section: ${specifiedContractNames.join(', ')}`);
        }
        else {
            // If no contracts were specified AND none were found in Nargo.toml
            console.error('Error: No benchmarks specified via --contracts flag or found in the [benchmark] section of Nargo.toml.');
        }
        // Output help only if no contracts are going to run
        program.outputHelp();
        process.exit(1);
    }
    console.log(`Found ${contractsToRunNames.length} benchmark(s) to run: ${contractsToRunNames.join(', ')}`);
    const profiler = new profiler_js_1.Profiler();
    // Iterate over the filtered contract names
    for (const contractName of contractsToRunNames) {
        const benchmarkFileName = availableBenchmarks[contractName];
        // Resolve benchmark file path relative to the Nargo.toml directory
        const benchmarkFilePath = node_path_1.default.resolve(node_path_1.default.dirname(nargoTomlPath), benchmarkFileName);
        const outputFilename = `${contractName}${suffix}.benchmark.json`;
        const outputJsonPath = node_path_1.default.join(outputDir, outputFilename);
        console.log(`--- Running benchmark for ${contractName}${suffix ? ` (suffix: ${suffix})` : ''} ---`);
        console.log(` -> Benchmark file: ${benchmarkFilePath}`);
        console.log(` -> Output report: ${outputJsonPath}`);
        if (!node_fs_1.default.existsSync(benchmarkFilePath)) {
            console.error(`Error: Benchmark file not found: ${benchmarkFilePath}`);
            await profiler.saveResults([], outputJsonPath); // Save empty/error report
            continue; // Skip to next contract
        }
        try {
            // Switch back to dynamic import(), tsx should handle it
            const module = await import(benchmarkFilePath);
            const BenchmarkClass = module.default;
            if (!BenchmarkClass || !(typeof BenchmarkClass === 'function') || !(BenchmarkClass.prototype instanceof types_js_1.BenchmarkBase)) {
                console.error(`Error: ${benchmarkFilePath} does not export a default class extending Benchmark.`);
                await profiler.saveResults([], outputJsonPath);
                continue;
            }
            const benchmarkInstance = new BenchmarkClass();
            let runContext = {}; // Initialize empty context
            if (typeof benchmarkInstance.setup === 'function') {
                console.log(`Running setup for ${contractName}...`);
                runContext = await benchmarkInstance.setup();
                console.log(`Setup complete for ${contractName}.`);
            }
            console.log(`Getting methods to benchmark for ${contractName}...`);
            const methodsToBenchmark = benchmarkInstance.getMethods(runContext);
            if (!Array.isArray(methodsToBenchmark) || methodsToBenchmark.length === 0) {
                console.warn(`No benchmark methods returned by getMethods for ${contractName}. Saving empty report.`);
                await profiler.saveResults([], outputJsonPath);
            }
            else {
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
        }
        catch (error) {
            console.error(`Failed to run benchmark for ${contractName} from ${benchmarkFilePath}:`, error);
            // Attempt to save an error report
            try {
                const errorResult = {
                    name: 'BENCHMARK_RUNNER_ERROR',
                    totalGateCount: 0,
                    gateCounts: [],
                    gas: { gasLimits: { daGas: 0, l2Gas: 0 }, teardownGasLimits: { daGas: 0, l2Gas: 0 } }, // Keep local nested structure
                };
                await profiler.saveResults([errorResult], outputJsonPath);
                console.error(`Saved error report to ${outputJsonPath}`);
            }
            catch (writeError) {
                console.error(`Failed to write error report to ${outputJsonPath}:`, writeError.message);
            }
        }
    }
    console.log('All specified benchmarks completed.');
});
program.parse(process.argv);
