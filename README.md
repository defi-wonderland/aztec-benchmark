# Aztec Benchmark

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
Each entry in the array returned by `getMethods` can either be a plain `ContractFunctionInteraction` 
(in which case the benchmark name is auto-derived) or a `NamedBenchmarkedInteraction` object 
(which includes the `interaction` and a custom `name` for reporting).

```ts
import { BenchmarkBase, BenchmarkContext, NamedBenchmarkedInteraction } from '@defi-wonderland/aztec-benchmark';
import { Contract, AccountWallet, ContractFunctionInteraction /*, etc. */ } from '@aztec/aztec.js'; // Assuming specific imports

// A hypothetical contract interface for the example
interface MyExampleContract extends Contract {
  methods: {
    transfer: (amount: bigint) => ContractFunctionInteraction;
    another_function: (arg1: any, arg2: any) => ContractFunctionInteraction;
    simple_call: () => ContractFunctionInteraction;
  };
}

export default class MyBenchmark extends BenchmarkBase {
  // Example context, replace with your actual needs
  declare context: {
    contract: MyExampleContract; 
    wallet: AccountWallet;   
  };

  // Runs once before benchmarks.
  async setup(): Promise<BenchmarkContext> {
    // const wallet = await getWallet(); // Your wallet setup
    // const contract = await MyExampleContract.deploy(wallet).send().deployed() as MyExampleContract;
    // this.context = { contract, wallet };
    // return this.context;
    // For the example to run, ensure this.context is populated in a real setup.
    // This is a placeholder if you don't have a full setup for direct README testing.
    if (!this.context) { 
      // @ts-ignore - Mocking for README example viability
      this.context = { contract: { methods: { 
        transfer: (amount: bigint) => ({ dummy: 'interaction' } as unknown as ContractFunctionInteraction),
        another_function: (arg1: any, arg2: any) => ({ dummy: 'interaction'} as unknown as ContractFunctionInteraction),
        simple_call: () => ({ dummy: 'interaction' } as unknown as ContractFunctionInteraction),
      } } }; 
    }
    return this.context;
  }

  // Returns an array of interactions to benchmark. 
  // Each can be a plain ContractFunctionInteraction or a NamedBenchmarkedInteraction object.
  async getMethods(context: BenchmarkContext): Promise<Array<ContractFunctionInteraction | NamedBenchmarkedInteraction>> {
    const { contract } = context as typeof this.context; 
    
    const transferSmallInteraction = contract.methods.transfer(1n);
    const transferLargeInteraction = contract.methods.transfer(100000n);
    const anotherComplexInteraction = contract.methods.another_function("data", { value: 123 });
    const simpleInteraction = contract.methods.simple_call();

    return [
      // Example of a named interaction
      { interaction: transferSmallInteraction, name: "Transfer Small Amount (1)" }, 
      // Another named interaction
      { interaction: transferLargeInteraction, name: "Transfer Large Amount (100000)" },
      // Example of a plain interaction - name will be auto-derived (e.g., 'another_function')
      anotherComplexInteraction, 
      // Another plain interaction - name will be auto-derived (e.g., 'simple_call')
      simpleInteraction 
    ];
  }

  // Optional cleanup.
  async teardown(context: BenchmarkContext): Promise<void> {}
}
```

**Note:** Your benchmark code needs a valid Aztec project setup to interact with contracts.
Your `BenchmarkBase` implementation is responsible for constructing the `ContractFunctionInteraction` objects.
If you provide a `NamedBenchmarkedInteraction` object, its `name` field will be used in reports. 
If you provide a plain `ContractFunctionInteraction`, the tool will attempt to derive a name from the interaction (e.g., the method name).

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
