// action/index.cjs
const core = require('@actions/core');
const exec = require('@actions/exec');
const fs = require('node:fs');
const path = require('node:path');
const { runComparison } = require('./comparison.cjs');

async function run() {
  try {
    const threshold = parseFloat(core.getInput('threshold'));
    const outputMarkdownPath = core.getInput('output_markdown_path');

    const configPath = './Nargo.toml';
    const baseSuffix = '_base';
    const latestSuffix = '_latest';
    const reportsDir = './benchmarks';

    core.info('--- Inputs ---');
    core.info(`Config Path: ${configPath} (hardcoded)`);
    core.info(`Threshold: ${threshold}%`);
    core.info(`Output Markdown Path: ${outputMarkdownPath}`);
    core.info(`Reports Directory: ${reportsDir} (hardcoded)`);
    core.info(`Base Suffix: ${baseSuffix} (hardcoded)`);
    core.info(`Latest Suffix: ${latestSuffix} (hardcoded)`);

    if (isNaN(threshold)) {
      throw new Error('Invalid threshold value. Please provide a number.');
    }

    core.startGroup('Generating latest benchmark reports (all contracts)');
    const cliArgs = [];
    cliArgs.push('--suffix', latestSuffix);

    core.info(`Executing: benchmark-cli ${cliArgs.join(' ')}`);

    const execOptions = {
        cwd: process.cwd()
    };
    const exitCode = await exec.exec('yarn bench', cliArgs, execOptions);
    if (exitCode !== 0) {
        throw new Error(`Benchmark CLI execution failed with exit code ${exitCode}`);
    }
    core.endGroup();

    core.startGroup('Comparing benchmark reports');
    const comparisonInputs = {
        reportsDir,
        baseSuffix,
        prSuffix: latestSuffix,
        threshold
    };
    const markdownResult = runComparison(comparisonInputs);
    core.endGroup();

    const resolvedOutputPath = path.resolve(outputMarkdownPath);
    core.info(`Writing comparison report to: ${resolvedOutputPath}`);
    fs.writeFileSync(resolvedOutputPath, markdownResult);

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
