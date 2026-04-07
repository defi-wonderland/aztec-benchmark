# Aztec Benchmark
[![npm version](https://badge.fury.io/js/%40defi-wonderland%2Faztec-benchmark.svg)](https://www.npmjs.com/package/@defi-wonderland/aztec-benchmark)

**CLI tool and reusable CI workflows for running Aztec contract benchmarks.**

Use the CLI to execute benchmark files written in TypeScript. For CI integration, this repository provides **reusable GitHub workflows** that handle the full benchmark-and-compare cycle — including environment setup, baseline management, and PR commenting — so consumer repos can integrate with a single `uses:` line.

## Table of Contents

- [Installation](#installation)
- [CLI Usage](#cli-usage)
  - [Configuration (`Nargo.toml`)](#configuration-nargotoml)
  - [Options](#options)
  - [Examples](#examples)
- [Writing Benchmarks](#writing-benchmarks)
  - [Trace Regions](#trace-regions)
  - [Raw Transaction Support](#raw-transaction-support)
- [Benchmark Output](#benchmark-output)
- [Reusable Workflows](#reusable-workflows)
  - [PR Benchmark (`pr-benchmark.yml`)](#pr-benchmark-pr-benchmarkyml)
  - [Update Baseline (`update-baseline.yml`)](#update-baseline-update-baselineyml)
  - [How Baselines Work](#how-baselines-work)
- [Action Usage (Advanced)](#action-usage-advanced)
  - [Inputs](#inputs)
  - [Outputs](#outputs)

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
- `--skip-proving`: Skip proving transactions. Only measures gate counts and gas; proving time will be `0` in reports. When enabled, the `wallet` is not required in the benchmark context.

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
Each entry in the array returned by `getMethods` can either be a plain `ContractFunctionInteractionCallIntent` 
(in which case the benchmark name is auto-derived) or a `NamedBenchmarkedInteraction` object 
(which includes the `interaction` and a custom `name` for reporting).

### Fee Payment

By default, every benchmarked account must hold Fee Juice (FJ) to pay for transaction fees. If your accounts don't have pre-existing FJ (e.g. freshly-created accounts on sandbox), you can return a `feePaymentMethod` from `setup()` inside the `BenchmarkContext`. The profiler will pass it to every `send()` and `proveInteraction()` call automatically.

The sandbox ships with a canonical `SponsoredFPC` contract that has FJ and can sponsor fees for any account — making it the easiest way to get benchmarks running without bridging from L1.

```ts
import {
  Benchmark, // Alias for BenchmarkBase
  type BenchmarkContext,
  type NamedBenchmarkedInteraction
} from '@defi-wonderland/aztec-benchmark';
import type { PXE } from '@aztec/pxe/server';
import type { Contract } from '@aztec/aztec.js/contracts'; // Generic Contract type from Aztec.js
import type { AztecAddress } from '@aztec/aztec.js/addresses';
import type { ContractFunctionInteractionCallIntent } from '@aztec/aztec.js/authorization';
import type { FeePaymentMethod } from '@aztec/aztec.js/fee';
import { createStore } from '@aztec/kv-store/lmdb-v2';
import { createPXE, getPXEConfig } from '@aztec/pxe/server';
import { createAztecNodeClient, waitForNode } from '@aztec/aztec.js/node';
import { registerInitialSandboxAccountsInWallet, type TestWallet } from '@aztec/test-wallet/server';
// import { YourSpecificContract } from '../artifacts/YourSpecificContract.js'; // Replace with your actual contract artifact

// 1. Define a specific context for your benchmark (optional but good practice)
interface MyBenchmarkContext extends BenchmarkContext {
  pxe: PXE;
  wallet: TestWallet;
  deployer: AztecAddress;
  contract: Contract; // Use the generic Contract type or your specific contract type
  feePaymentMethod?: FeePaymentMethod;
}

export default class MyContractBenchmark extends Benchmark {
  // Runs once before all benchmark methods.
  async setup(): Promise<MyBenchmarkContext> {
    console.log('Setting up benchmark environment...');

    const { NODE_URL = 'http://localhost:8080' } = process.env;
    const node = createAztecNodeClient(NODE_URL);
    await waitForNode(node);
    const l1Contracts = await node.getL1ContractAddresses();
    const config = getPXEConfig();
    const fullConfig = { ...config, l1Contracts };
    // IMPORTANT: true enables proof generation for the benchmark, set it to false when using --skip-proving
    fullConfig.proverEnabled = true;
    const pxeVersion = 2;
    const store = await createStore('pxe', pxeVersion, {
      dataDirectory: 'store',
      dataStoreMapSizeKb: 1e6,
    });

    const pxe: PXE = await createPXE(node, fullConfig, { store });
    const wallet: TestWallet = await TestWallet.create(node, { ...fullConfig, proverEnabled });
    const accounts: AztecAddress[] = await registerInitialSandboxAccountsInWallet(wallet);
    const [deployer] = accounts;
    
    //  Deploy your contract (replace YourSpecificContract with your actual contract class)
    const deployedContract = await YourSpecificContract
      .deploy(wallet, /* constructor args */)
      .send({ from: deployer })
      .deployed();
    const contract = await YourSpecificContract.at(deployedContract.address, wallet);
    console.log('Contract deployed at:', contract.address.toString());

    // Optional: use SponsoredFPC so accounts don't need pre-existing Fee Juice.
    // The sandbox ships with a canonical SponsoredFPC pre-deployed at a deterministic address.
    //
    // import { SponsoredFeePaymentMethod } from '@aztec/aztec.js/fee/testing';
    // import { SponsoredFPCContract } from '@aztec/noir-contracts.js/SponsoredFPC';
    // import { getContractInstanceFromInstantiationParams } from '@aztec/aztec.js/contracts';
    //
    // const instance = await getContractInstanceFromInstantiationParams(
    //   SponsoredFPCContract.artifact,
    //   { salt: new Fr(0n) },
    // );
    // await wallet.registerContract(instance, SponsoredFPCContract.artifact);
    // const feePaymentMethod = new SponsoredFeePaymentMethod(instance.address);

    return { pxe, wallet, deployer, contract /*, feePaymentMethod */ }; 
  }

  // Returns an array of interactions to benchmark. 
  getMethods(context: MyBenchmarkContext): Promise<Array<ContractFunctionInteractionCallIntent | NamedBenchmarkedInteraction>> {
    // Ensure context is available (it should be if setup ran correctly)
    if (!context || !context.contract) {
      // In a real scenario, setup() must initialize the context properly.
      // Throwing an error or returning an empty array might be appropriate here if setup failed.
      console.error("Benchmark context or contract not initialized in setup(). Skipping getMethods.");
      return [];
    }
    
    const { contract, deployer } = context;
    const recipient = deployer; // Example recipient

    // Replace `contract.methods.someMethodName` with actual methods from your contract.
    const interactionPlain = { caller: deployer, action: contract.methods.transfer(recipient, 100n) }
    const interactionNamed1 = { caller: deployer, action: contract.methods.someOtherMethod("test_value_1") };
    const interactionNamed2 = { caller: deployer, action: contract.methods.someOtherMethod("test_value_2") };

    return [
      // Example of a plain interaction - name will be auto-derived
      interactionPlain,
      // Example of a named interaction
      { interaction: interactionNamed1, name: "Some Other Method (value 1)" }, 
      // Another named interaction
      { interaction: interactionNamed2, name: "Some Other Method (value 2)" }, 
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
Your `BenchmarkBase` implementation is responsible for constructing the `ContractFunctionInteractionCallIntent` objects.
If you provide a `NamedBenchmarkedInteraction` object, its `name` field will be used in reports. 
If you provide a plain `ContractFunctionInteractionCallIntent`, the tool will attempt to derive a name from the interaction (e.g., the method name).
If you return a `feePaymentMethod` in the `BenchmarkContext`, it is automatically passed to every transaction the profiler sends — no changes to `getMethods` are needed.

### Trace Regions

By default, benchmarks report gate counts for the entire transaction trace, including kernel circuit overhead. For contracts like FPCs where you want to isolate specific portions of the trace, implement the optional `getRegions()` method:

```ts
import { Benchmark } from '@defi-wonderland/aztec-benchmark';

export default class FPCBenchmark extends Benchmark {
  getRegions() {
    return [
      {
        name: 'fpc-only',
        startMatch: ['FPC:', 'FPCMultiAsset:'],  // start at first FPC step
        endMatch: 'Noop:',                        // stop before the Noop delimiter
      },
    ];
  }

  // ... setup(), getMethods(), teardown()
}
```

**Region options:**

| Option | Type | Description |
|--------|------|-------------|
| `name` | `string` | Display name for this region in reports |
| `startMatch` | `string \| string[]` | Contract name prefix(es) marking the first step |
| `endMatch` | `string \| string[]` | Contract name prefix(es) marking the end boundary (exclusive). Omit to include until end of trace |
| `excludeKernels` | `boolean` | If `true`, filter out `private_kernel_*` and `hiding_kernel` circuits from the region |

The profiler also ships a **built-in kernel isolation preset** that auto-splits the trace into "app" (non-kernel) and "kernel" (overhead) regions:

```ts
import { Benchmark, kernelIsolation } from '@defi-wonderland/aztec-benchmark';

export default class MyBenchmark extends Benchmark {
  getRegions() {
    return kernelIsolation();
  }
  // ...
}
```

When regions are configured, the JSON report includes:
- `regions` on each `ProfileResult` — per-region gate count breakdowns
- `regionSummaries` on the report — region name -> function name -> total gates
- PR comparison comments show a collapsible **region breakdown** section

### Raw Transaction Support

Some contracts (e.g., cold-start FPCs) must be the transaction root (`msg_sender = None`), bypassing the account entrypoint. For these, return a `RawBenchmarkedInteraction` from `getMethods()`:

```ts
import { Benchmark, type RawBenchmarkedInteraction } from '@defi-wonderland/aztec-benchmark';

export default class ColdStartBenchmark extends Benchmark {
  async setup() {
    // ... build TxExecutionRequest, set up PXE, etc.
    return { wallet, _coldStartAction: myAction };
  }

  getMethods(context) {
    return [{
      action: context._coldStartAction,  // implements simulate(), profile(), send()
      caller: context.userAddress,
      name: 'cold_start_entrypoint',
    }];
  }
}
```

Your action object must implement:
- `simulate(opts?)` — should return `{ estimatedGas: { gasLimits, teardownGasLimits } }`
- `profile(opts?)` — should return a `TxProfileResult`-compatible object with `executionSteps` and `stats`
- `send(opts?)` — submit the transaction on-chain

The profiler calls these directly **without injecting fee options or origin** — your action manages all transaction construction internally.

### Wonderland's Usage Example

You can find how we use this tool for benchmarking our Aztec contracts in [`aztec-standards`](https://github.com/defi-wonderland/aztec-standards/tree/dev/benchmarks).

---

## Benchmark Output

The profiler generates a JSON report for each benchmarked contract. Each entry includes:

| Field | Type | Description |
|-------|------|-------------|
| `totalGateCount` | `number` | Total gates across all circuits |
| `gateCounts[]` | `GateCount[]` | Per-circuit breakdown with `circuitName`, `gateCount`, and `witgenMs` (witness generation time) |
| `gas` | `GasLimits` | DA and L2 gas estimates |
| `provingTime` | `number` | Proving time in ms (hardware-dependent) |
| `regions` | `Record<string, RegionResult>` | Per-region gate counts (if `getRegions()` is defined) |

**Metric stability:** Gate counts and gas are **deterministic** — identical across runs on any hardware. Witness generation time (`witgenMs`) and proving time are **hardware-dependent** and should not be used for tight regression thresholds in CI. Reports include a `metricStability` field annotating each metric.

### Programmatic Comparison

You can compare two reports programmatically without the CLI:

```ts
import { compareReports } from '@defi-wonderland/aztec-benchmark';

const result = compareReports(baseReport, prReport, {
  gates: 1.0,        // 1% threshold for gate counts
  daGas: 2.5,        // 2.5% for DA gas
  l2Gas: 2.5,        // 2.5% for L2 gas
  provingTime: null,  // info-only (never triggers regression)
});

if (result.hasRegression) {
  console.log('Regressions detected:', result.entries.filter(e => e.status === 'regression'));
}
```

---

## Reusable Workflows

This repository ships two **reusable GitHub workflows** (`workflow_call`) that handle the full CI benchmark cycle. Consumer repos call them with a single `uses:` line — no need to copy workflow YAML or wire up artifact management manually.

### PR Benchmark (`pr-benchmark.yml`)

Runs benchmarks on the PR head, downloads the baseline from the base branch, generates a comparison report, comments it on the PR (hiding any previous benchmark comments as outdated), and uploads the new results as a baseline artifact for the PR branch.

**Usage:**

```yaml
# .github/workflows/pr-checks.yml
name: PR Checks

on:
  pull_request:
    branches: [dev, main]

jobs:
  benchmark:
    uses: defi-wonderland/aztec-benchmark/.github/workflows/pr-benchmark.yml@v0
    permissions:
      pull-requests: write
      issues: write
      actions: read
```

**Inputs:**

| Input | Type | Default | Description |
|---|---|---|---|
| `runner` | `string` | `ubuntu-latest-m` | GitHub runner label |
| `timeout` | `number` | `120` | Job timeout in minutes |
| `bench-dir` | `string` | `./benchmarks` | Directory for benchmark files |

**With custom inputs:**

```yaml
jobs:
  benchmark:
    uses: defi-wonderland/aztec-benchmark/.github/workflows/pr-benchmark.yml@v0
    permissions:
      pull-requests: write
      issues: write
      actions: read
    with:
      runner: ubuntu-latest-l
      timeout: 180
      bench-dir: ./my-benchmarks
```

### Update Baseline (`update-baseline.yml`)

Runs benchmarks on the current branch and uploads the results as a baseline artifact. This should be triggered on pushes to your default branches so that PR benchmarks have a baseline to compare against.

**Usage:**

```yaml
# .github/workflows/update-baseline.yml
name: Update Baseline

on:
  push:
    branches: [dev, main]

jobs:
  update-baseline:
    uses: defi-wonderland/aztec-benchmark/.github/workflows/update-baseline.yml@v0
    permissions:
      contents: read
      actions: write
```

**Inputs:**

| Input | Type | Default | Description |
|---|---|---|---|
| `runner` | `string` | `ubuntu-latest-m` | GitHub runner label |
| `timeout` | `number` | `120` | Job timeout in minutes |
| `bench-dir` | `string` | `./benchmarks` | Directory for benchmark files |

### How Baselines Work

The workflows use GitHub Actions artifacts to store and retrieve baseline benchmark results:

1. **`update-baseline.yml`** runs benchmarks with the `_latest` suffix and uploads the results as `benchmark-baseline-<branch>`.
2. **`pr-benchmark.yml`** runs benchmarks with the `_new` suffix on the PR head, then downloads the `benchmark-baseline-<base-branch>` artifact to get the `_latest` files. It compares `_latest` (baseline) vs `_new` (PR) and comments a Markdown diff table on the PR.
3. Before posting the new comment, the workflow finds all previous benchmark comments on the PR (identified by a unique marker in the comment body) and hides them as **Outdated** via the GitHub GraphQL API, so the PR timeline stays clean.
4. After comparison, the PR workflow renames `_new` files to `_latest` and uploads them as `benchmark-baseline-<head-branch>`, so stacked PRs can also compare against each other.

Artifacts are retained for **90 days** by default.

---

## Action Usage (Advanced)

> **Note:** For most projects, the [reusable workflows](#reusable-workflows) above are the recommended approach. The action below is a lower-level building block for projects that need a custom CI setup.

This repository also includes a GitHub Action (defined in `action/action.yml`) that runs `aztec-benchmark` and compares results. It automatically finds benchmark reports (named with `_base` and `_latest` suffixes) and produces a Markdown comparison report.

### Inputs

- `threshold`: Scalar regression threshold percentage applied to gates, DA gas, and L2 gas (default: `2.5`).
- `thresholds`: Per-metric thresholds as JSON string. Overrides `threshold` when set. Example: `'{"gates": 1.0, "daGas": 2.5, "l2Gas": 2.5, "provingTime": null}'`. Use `null` for info-only metrics (shown but never trigger regression).
- `output_markdown_path`: Path to save the generated Markdown comparison report (default: `benchmark-comparison.md`).

### Outputs

- `comparison_markdown`: The generated Markdown report content.
- `markdown_file_path`: Path to the saved Markdown file.

Refer to the `action/action.yml` file for the definitive inputs and description.
