# Quick Start: Benchmarking Aztec Smart Contracts

Get gate counts, gas estimates, and performance metrics for your Aztec contracts in under 10 minutes.

## Prerequisites

- **Node.js 22+**
- **Running Aztec sandbox** (`aztec start --sandbox`)
- **Compiled contracts** (`aztec compile`)

## 1. Install

```sh
yarn add --dev @defi-wonderland/aztec-benchmark
```

## 2. Configure

Add a `[benchmark]` section to your `Nargo.toml`:

```toml
[benchmark]
my_contract = "benchmarks/my_contract.benchmark.ts"
```

The path is relative to the `Nargo.toml` file.

## 3. Write Your First Benchmark

Create `benchmarks/my_contract.benchmark.ts`:

```ts
import { Benchmark, type BenchmarkContext } from '@defi-wonderland/aztec-benchmark';
import { createAztecNodeClient, waitForNode } from '@aztec/aztec.js/node';
import { Contract } from '@aztec/aztec.js/contracts';
import { createPXE, getPXEConfig } from '@aztec/pxe/server';
import { loadContractArtifact } from '@aztec/stdlib/abi';
import { readFileSync } from 'fs';

export default class MyContractBenchmark extends Benchmark {
  async setup() {
    const node = createAztecNodeClient('http://localhost:8080');
    await waitForNode(node);
    const pxe = await createPXE(node, {
      ...getPXEConfig(),
      l1Contracts: await node.getL1ContractAddresses(),
    });

    // Register accounts, deploy contracts, mint tokens, etc.
    // ...

    return { wallet, pxe };
  }

  getMethods(context) {
    const { contract, userAddress } = context;
    return [
      // Auto-derived name from the method
      { caller: userAddress, action: contract.methods.transfer(recipient, 100n) },

      // Or specify a custom name
      {
        interaction: { caller: userAddress, action: contract.methods.mint(userAddress, 1000n) },
        name: 'mint_1000',
      },
    ];
  }

  async teardown(context) {
    // Optional cleanup
  }
}
```

## 4. Run

```sh
npx aztec-benchmark
```

Run a specific contract:
```sh
npx aztec-benchmark --contracts my_contract
```

Skip proving (faster, still measures gates and gas):
```sh
npx aztec-benchmark --skip-proving
```

## 5. Read Results

The profiler writes a JSON report to `./benchmarks/my_contract.benchmark.json`:

```json
{
  "summary": { "transfer": 45230, "mint_1000": 32100 },
  "results": [
    {
      "name": "transfer",
      "totalGateCount": 45230,
      "gateCounts": [
        { "circuitName": "private_kernel_init", "gateCount": 15000, "witgenMs": 12.3 },
        { "circuitName": "Token:transfer", "gateCount": 18230, "witgenMs": 45.1 },
        { "circuitName": "private_kernel_tail", "gateCount": 12000, "witgenMs": 8.7 }
      ],
      "gas": {
        "gasLimits": { "daGas": 1200, "l2Gas": 450000 },
        "teardownGasLimits": { "daGas": 0, "l2Gas": 0 }
      },
      "provingTime": 2500
    }
  ],
  "gasSummary": { "transfer": 451200, "mint_1000": 380000 },
  "provingTimeSummary": { "transfer": 2500, "mint_1000": 1800 },
  "systemInfo": { "cpuModel": "...", "cpuCores": 16, "totalMemoryGiB": 64, "arch": "x64" }
}
```

**Key metrics:**
- **Gate count** (deterministic) -- total circuit complexity, main regression indicator
- **DA gas / L2 gas** (deterministic) -- on-chain cost
- **witgenMs** (hardware-dependent) -- witness generation time per circuit
- **provingTime** (hardware-dependent) -- total proving time

## 6. Add CI

Add two workflow files to get automatic PR regression detection:

**`.github/workflows/update-baseline.yml`** -- runs on push to main:
```yaml
name: Update Benchmark Baseline
on:
  push:
    branches: [main, dev]
jobs:
  benchmark:
    uses: defi-wonderland/aztec-benchmark/.github/workflows/update-baseline.yml@v0
    permissions:
      contents: read
      actions: write
```

**`.github/workflows/pr-checks.yml`** -- runs on PRs:
```yaml
name: PR Benchmark
on:
  pull_request:
    branches: [main, dev]
jobs:
  benchmark:
    uses: defi-wonderland/aztec-benchmark/.github/workflows/pr-benchmark.yml@v0
    permissions:
      pull-requests: write
      issues: write
      actions: read
```

PRs will get a comment showing gate count, gas, and proving time diffs with regression indicators.

## 7. Configure Thresholds

By default, a 2.5% change in gates, DA gas, or L2 gas triggers a regression flag. Proving time is info-only (shown but doesn't trigger regression since it's hardware-dependent).

For tighter control, set per-metric thresholds in your workflow:

```yaml
jobs:
  benchmark:
    uses: defi-wonderland/aztec-benchmark/.github/workflows/pr-benchmark.yml@v0
    with:
      thresholds: '{"gates": 1.0, "daGas": 2.5, "l2Gas": 2.5, "provingTime": null}'
```

| Value | Meaning |
|-------|---------|
| `1.0` | Flag as regression if metric changes by more than 1% |
| `null` | Info-only: show the metric but never flag it |

Reports also include a `metricStability` field annotating each metric as `"deterministic"` (gates, gas) or `"hardware-dependent"` (witgenMs, provingTime).

---

## Advanced: Trace Regions

Transaction traces include kernel overhead (private_kernel_init, private_kernel_inner, etc.) alongside your contract logic. To isolate specific portions, define regions:

```ts
import { Benchmark, kernelIsolation } from '@defi-wonderland/aztec-benchmark';

export default class MyBenchmark extends Benchmark {
  getRegions() {
    // Built-in: splits trace into "app" and "kernel" regions
    return kernelIsolation();
  }

  // Or define custom regions:
  getRegions() {
    return [
      {
        name: 'fpc-only',
        startMatch: ['FPC:', 'FPCMultiAsset:'],
        endMatch: 'Noop:',
      },
      {
        name: 'app-no-kernels',
        startMatch: 'Token:',
        excludeKernels: true,
      },
    ];
  }
}
```

Region results appear in the JSON report under `regions` and `regionSummaries`, and in PR comments as a collapsible breakdown section.

## Advanced: Custom Transaction Flows

For contracts that must be the transaction root (bypassing the account entrypoint), use raw interactions:

```ts
import { Benchmark } from '@defi-wonderland/aztec-benchmark';

export default class ColdStartBenchmark extends Benchmark {
  async setup() {
    // Build a TxExecutionRequest manually
    // ...
    const action = {
      async simulate() {
        const sim = await pxe.simulateTx(txRequest, { simulatePublic: true, scopes: signers });
        return { estimatedGas: { gasLimits: { daGas: ..., l2Gas: ... }, teardownGasLimits: { daGas: 0, l2Gas: 0 } } };
      },
      async profile(opts) {
        return await pxe.profileTx(txRequest, { profileMode: 'full', scopes: signers, ...opts });
      },
      async send() {
        const result = await pxe.proveTx(txRequest, signers);
        const tx = await result.toTx();
        await node.sendTx(tx);
      },
    };
    return { wallet: undefined, _action: action, userAddress };
  }

  getMethods(context) {
    return [{
      action: context._action,
      caller: context.userAddress,
      name: 'cold_start_entrypoint',
    }];
  }
}
```

The profiler calls `simulate()`, `profile()`, and `send()` directly on your action without injecting fee options.

## Advanced: Fee Payment

If your accounts don't have pre-existing Fee Juice, return a `feePaymentMethod` from `setup()`:

```ts
async setup() {
  // Using the sandbox's built-in SponsoredFPC
  const feePaymentMethod = new SponsoredFeePaymentMethod(sponsoredFpcAddress);
  return { wallet, feePaymentMethod };
}
```

For custom FPCs, use `FeeWrappedInteraction` to inject per-interaction fee payment:

```ts
import { namedMethod } from '@defi-wonderland/aztec-benchmark';

getMethods(context) {
  return [
    namedMethod('transfer_with_fpc', context.userAddress, contract.methods.transfer(...), {
      paymentMethod: myFpcPaymentMethod,
      gasSettings: customGasSettings,
    }),
  ];
}
```
