# Aztec Benchmark
[![npm version](https://badge.fury.io/js/%40defi-wonderland%2Faztec-benchmark.svg)](https://www.npmjs.com/package/@defi-wonderland/aztec-benchmark)

**CLI tool for running Aztec contract benchmarks.**

Use this tool to execute benchmark files written in TypeScript. For comparing results and generating reports in CI, use the separate companion GitHub Action: [`defi-wonderland/aztec-benchmark`](https://github.com/defi-wonderland/aztec-benchmark).

## Table of Contents

- [Installation](#installation)
- [CLI Usage](#cli-usage)
  - [Configuration (`Nargo.toml`)](#configuration-nargotoml)
  - [Options](#options)
  - [Examples](#examples)
- [Writing Benchmarks](#writing-benchmarks)
- [Benchmark Output](#benchmark-output)
- [Action Usage](#action-usage)
  - [Inputs](#inputs)
  - [Outputs](#outputs)
  - [Example Usage (in PR workflow)](#example-usage-in-pr-workflow)

---

## Installation

```sh
yarn add --dev @defi-wonderland/aztec-benchmark
# or
npm install --save-dev @defi-wonderland/aztec-benchmark
```

---

## CLI Usage

After installing, run the CLI using `npx aztec-benchmark`. By default, it looks for a `Nargo.toml` file in the current directory and runs benchmarks defined within it.

```sh
npx aztec-benchmark [options]
```

### Configuration (`Nargo.toml`)

Define which contracts have associated benchmark files in your `Nargo.toml` under the `[benchmark]` section:

```toml
[benchmark]
token = "benchmarks/token_contract.benchmark.ts"
another_contract = "path/to/another.benchmark.ts"
```

The paths to the `.benchmark.ts` files are relative to the `Nargo.toml` file.

### Options

- `-c, --contracts <names...>`: Specify which contracts (keys from the `[benchmark]` section) to run. If omitted, runs all defined benchmarks.
- `--config <path>`: Path to your `Nargo.toml` file (default: `./Nargo.toml`).
- `-o, --output-dir <path>`: Directory to save benchmark JSON reports (default: `./benchmarks`).
- `-s, --suffix <suffix>`: Optional suffix to append to report filenames (e.g., `_pr` results in `token_pr.benchmark.json`).

### Examples

Run all benchmarks defined in `./Nargo.toml`:
```sh
npx aztec-benchmark 
```

Run only the `token` benchmark:
```sh
npx aztec-benchmark --contracts token
```

Run `token` and `another_contract` benchmarks, saving reports with a suffix:
```sh
npx aztec-benchmark --contracts token another_contract --output-dir ./benchmark_results --suffix _v2
```

---

## Writing Benchmarks

Benchmarks are TypeScript classes extending `BenchmarkBase` from this package.
Each entry in the array returned by `getMethods` must provide both the `ContractFunctionInteraction` and the
`Wallet` that will submit it. Use `BenchmarkedInteraction` for the minimal shape, or
`NamedBenchmarkedInteraction` when you want to override the report label.

```ts
import {
  Benchmark, // Alias for BenchmarkBase
  type BenchmarkContext,
  type BenchmarkTarget,
} from '@defi-wonderland/aztec-benchmark';
import {
  type AccountWallet,
  type ContractFunctionInteraction,
  type PXE,
  type Contract, // Generic Contract type from Aztec.js
  createPXEClient, // Example import
  getInitialTestAccountsWallets // Example import
} from '@aztec/aztec.js';
// import { YourSpecificContract } from '../artifacts/YourSpecificContract.js'; // Replace with your actual contract artifact

// 1. Define a specific context for your benchmark (optional but good practice)
interface MyBenchmarkContext extends BenchmarkContext {
  pxe: PXE;
  deployer: AccountWallet;
  contract: Contract; // Use the generic Contract type or your specific contract type
}

export default class MyContractBenchmark extends Benchmark {
  // Runs once before all benchmark methods.
  async setup(): Promise<MyBenchmarkContext> {
    console.log('Setting up benchmark environment...');
    const pxe = createPXEClient(process.env.PXE_URL || 'http://localhost:8080');
    const [deployer] = await getInitialTestAccountsWallets(pxe);
    
    //  Deploy your contract (replace YourSpecificContract with your actual contract class)
    const deployedContract = await YourSpecificContract.deploy(deployer, /* constructor args */).send().deployed();
    const contract = await YourSpecificContract.at(deployedContract.address, deployer);
    console.log('Contract deployed at:', contract.address.toString());

    return { pxe, deployer, contract }; 
  }

  // Returns an array of interactions to benchmark.
  getMethods(context: MyBenchmarkContext): BenchmarkTarget[] {
    // Ensure context is available (it should be if setup ran correctly)
    if (!context || !context.contract) {
      // In a real scenario, setup() must initialize the context properly.
      // Throwing an error or returning an empty array might be appropriate here if setup failed.
      console.error("Benchmark context or contract not initialized in setup(). Skipping getMethods.");
      return [];
    }
    
    const { contract, deployer } = context;
    const recipient = deployer.getAddress(); // Example recipient

    // Replace `contract.methods.someMethodName` with actual methods from your contract.
    const interactionPlain = contract.methods.transfer(recipient, 100n); 
    const interactionNamed1 = contract.methods.someOtherMethod("test_value_1");
    const interactionNamed2 = contract.methods.someOtherMethod("test_value_2");

    return [
      // Example of a plain interaction - name will be auto-derived
      { interaction: interactionPlain, wallet: deployer },
      // Example of a named interaction
      { interaction: interactionNamed1, wallet: deployer, name: "Some Other Method (value 1)" },
      // Another named interaction
      { interaction: interactionNamed2, wallet: deployer, name: "Some Other Method (value 2)" },
    ];
  }

  // Optional cleanup phase
  async teardown(context: MyBenchmarkContext): Promise<void> {
    console.log('Cleaning up benchmark environment...');
    if (context && context.pxe) { 
      await context.pxe.stop(); 
    }
  }
}
```

**Note:** Your benchmark code needs a valid Aztec project setup to interact with contracts.
Your `BenchmarkBase` implementation is responsible for constructing the `ContractFunctionInteraction` objects and
supplying the wallet that should execute them. If you provide a `NamedBenchmarkedInteraction` object, its `name`
field will be used in reports; otherwise the tool derives a name from the interaction (for example, using the method
selector).

### Wonderland's Usage Example

You can find how we use this tool for benchmarking our Aztec contracts in [`aztec-standards`](https://github.com/defi-wonderland/aztec-standards/tree/dev/benchmarks).

---

## Benchmark Output

Your `BenchmarkBase` implementation is responsible for measuring and outputting performance data (e.g., as JSON). The comparison action uses this output.
Each entry in the output will be identified by the custom `name` you provided (if any) or the auto-derived name.

--- 

## Action Usage

This repository includes a GitHub Action (defined in `action/action.yml`) designed for CI workflows. It automatically finds and compares benchmark results (conventionally named with `_base` and `_latest` suffixes) generated by previous runs of `aztec-benchmark` and produces a Markdown comparison report.

### Inputs

- `threshold`: Regression threshold percentage (default: `2.5`).
- `output_markdown_path`: Path to save the generated Markdown comparison report (default: `benchmark-comparison.md`).

### Outputs

- `comparison_markdown`: The generated Markdown report content.
- `markdown_file_path`: Path to the saved Markdown file.

### Example Usage (in PR workflow)

This action is typically used in a workflow that runs on pull requests. It assumes a previous step or job has already run the benchmarks on the base commit and saved the results with the `_base` suffix (e.g., in `./benchmarks/token_base.benchmark.json`).

**Workflow Steps:**
1. Checkout the base branch/commit.
2. Run `npx aztec-benchmark -s _base` (saving outputs to `./benchmarks`).
3. Checkout the PR branch/current commit.
4. Use this action (`./action`), which will:
   a. Run `npx aztec-benchmark -s _latest` to generate current benchmarks.
   b. Compare the new `_latest` files against the existing `_base` files.
   c. Generate the Markdown report.

```yaml
# Example steps within a PR workflow job:

# (Assume previous steps checked out base, ran benchmarks with _base suffix, 
#  and artifacts/reports are available, potentially via actions/upload-artifact 
#  and actions/download-artifact if run in separate jobs)

- name: Checkout Current Code
  uses: actions/checkout@v4

# (Ensure Nargo.toml and benchmark dependencies are set up)
- name: Install Dependencies
  run: yarn install --frozen-lockfile

- name: Generate Latest Benchmarks, Compare, and Create Report
  # This action runs 'aztec-benchmark -s _latest' internally
  uses: defi-wonderland/aztec-benchmark-diff/action 
  id: benchmark_compare
  with:
    threshold: '2.0' # Optional threshold
    output_markdown_path: 'benchmark_diff.md' # Optional output path

- name: Comment Report on PR
  uses: peter-evans/create-or-update-comment@v4
  with:
    issue-number: ${{ github.event.pull_request.number }}
    body-file: ${{ steps.benchmark_compare.outputs.markdown_file_path }}
```

Refer to the `action/action.yml` file for the definitive inputs and description.
