// action/index.js
const core = require('@actions/core');
const exec = require('@actions/exec'); // Import exec
const fs = require('node:fs');
const path = require('node:path');
const { runComparison } = require('./comparison.cjs');

async function run() {
  try {
    // --- Get Inputs --- 
    const threshold = parseFloat(core.getInput('threshold'));
    const outputMarkdownPath = core.getInput('output_markdown_path');

    // Hardcoded assumptions for action
    const configPath = './Nargo.toml'; // Hardcode config path assumption
    const baseSuffix = '_base';
    const latestSuffix = '_latest'; // Use this for generation and comparison
    const reportsDir = './benchmarks'; // Use this for generation and comparison

    core.info('--- Inputs ---');
    core.info(`Config Path: ${configPath} (hardcoded)`); // Log hardcoded path
    core.info(`Threshold: ${threshold}%`);
    core.info(`Output Markdown Path: ${outputMarkdownPath}`);
    core.info(`Reports Directory: ${reportsDir} (hardcoded)`);
    core.info(`Base Suffix: ${baseSuffix} (hardcoded)`);
    core.info(`Latest Suffix: ${latestSuffix} (hardcoded)`);

    // Validate threshold
    if (isNaN(threshold)) {
      throw new Error('Invalid threshold value. Please provide a number.');
    }

    // --- Step 1: Generate Latest Benchmark Reports --- 
    core.startGroup('Generating latest benchmark reports (all contracts)');
    const cliArgs = [];
    cliArgs.push('--config', configPath); // Use hardcoded config path
    cliArgs.push('--output-dir', reportsDir);
    cliArgs.push('--suffix', latestSuffix); // Generate with _latest suffix

    // Determine path to the compiled CLI script relative to this action script
    // action/index.js -> ../dist/cli/cli.js <-- This logic is no longer needed
    // const cliScriptPath = path.resolve(__dirname, '../dist/cli/cli.js'); 
    // core.info(`Executing: tsx ${cliScriptPath} ${cliArgs.join(' ')}`); <-- No longer using tsx directly

    core.info(`Executing: benchmark-cli ${cliArgs.join(' ')}`); // Log the command

    const execOptions = {
        cwd: process.cwd() // Ensure CLI runs in the context of the consuming repo root
    };
    // const exitCode = await exec.exec('tsx', [cliScriptPath, ...cliArgs], execOptions); <-- Change command
    const exitCode = await exec.exec('benchmark-cli', cliArgs, execOptions);
    if (exitCode !== 0) {
        throw new Error(`Benchmark CLI execution failed with exit code ${exitCode}`);
    }
    core.endGroup();

    // --- Step 2: Compare Reports --- 
    core.startGroup('Comparing benchmark reports');
    const comparisonInputs = {
        reportsDir,
        baseSuffix,
        prSuffix: latestSuffix, // Compare _base vs _latest
        threshold
    };
    const markdownResult = runComparison(comparisonInputs);
    core.endGroup();

    // --- Write Output File --- 
    const resolvedOutputPath = path.resolve(outputMarkdownPath);
    core.info(`Writing comparison report to: ${resolvedOutputPath}`);
    fs.writeFileSync(resolvedOutputPath, markdownResult);

    // --- Set Action Outputs --- 
    core.setOutput('comparison_markdown', markdownResult);
    core.setOutput('markdown_file_path', resolvedOutputPath);

    core.info('Benchmark generation and comparison action completed successfully.');

  } catch (error) {
    core.setFailed(`Action failed: ${error.message}`);
    if (error.stack) {
      core.debug(error.stack);
    }
  }
}

run(); 