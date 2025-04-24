# Aztec Benchmark Diff GitHub Action

This GitHub Action automatically runs benchmarks for Aztec contracts, compares the results against a baseline, and generates a Markdown report highlighting performance changes (gas usage, gate counts). It's designed to be integrated into CI/CD workflows to monitor performance regressions or improvements in pull requests.

## How it Works

1.  **Benchmark Execution:** The action discovers benchmark definition files (`*.benchmark.ts`) within a `benchmarks/` directory in your repository root. It executes these scripts, which typically involve setting up contract state and calling specific functions using `@aztec/aztec.js`. Results are saved as `*.benchmark_latest.json`.
2.  **Comparison:** It looks for corresponding baseline files (`*.benchmark.json`) and compares the metrics (gate counts, DA gas, L2 gas) between the baseline and the latest run.
3.  **Reporting:** A Markdown report (`benchmark_diff.md` by default) is generated, summarizing the comparisons with status indicators for regressions, improvements, or significant changes based on a configurable threshold.

## Usage

Integrate this action into your GitHub Actions workflow file (e.g., `.github/workflows/benchmark.yml`). You'll typically want to run it on pull requests targeting your main branch.

```yaml
name: Benchmark Comparison

on:
  pull_request:
    # Optionally specify paths if benchmarks should only run when relevant files change
    # paths:
    #   - 'contracts/**'
    #   - 'benchmarks/**'

jobs:
  benchmark:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          # Fetch depth 0 to allow checkout of the base branch for comparison
          fetch-depth: 0

      # Add steps here to build your contracts and set up any necessary
      # environment for Aztec.js (e.g., installing dependencies, setting up PXE)
      # Make sure the baseline *.benchmark.json files are available

      - name: Run Benchmark and Compare
        id: benchmark # Give the step an ID to easily reference the report path
        uses: ./ # Use the local action path if it's in the same repo
        # Or use <your-org>/aztec-benchmark-diff@<version> if published
        # Configuration is primarily read from Nargo.toml

      # Example: Post report to PR using peter-evans/create-or-update-comment
      - name: Post Benchmark Report to PR
        uses: peter-evans/create-or-update-comment@v4
        with:
          # Read the report content. Use default path or get from Nargo.toml if customized.
          # This example assumes the default report path 'benchmark_diff.md'
          # You might need a step before this to read the actual path from Nargo.toml if it's dynamic.
          body-path: benchmark_diff.md
          # Use a consistent marker to find and update the comment
          issue-number: ${{ github.event.pull_request.number }}
          # Update existing comment if found, otherwise create a new one
          edit-mode: upsert
```

## Configuration

-   **`Nargo.toml`:** Basic configuration like the `regression_threshold_percentage` and `report_path` can be set in the `[benchmark]` section of your `Nargo.toml` file at the repository root. If these values are not present, defaults will be used (threshold: 10%, report path: `benchmark_diff.md`).

    ```toml
    # Nargo.toml (at the root of the consuming repository)

    [benchmark]
    # Optional: Define the percentage change considered a regression.
    # Default is 10 (meaning 10%)
    regression_threshold_percentage = 5

    # Optional: Specify the output filename for the markdown report.
    # Default is "benchmark_diff.md"
    report_path = "benchmarks/performance_report.md"
    ```

-   **Benchmark Scripts (`benchmarks/*.benchmark.ts`):** Each script defines how to benchmark a specific contract. It should export a `benchmarkConfig` object containing:
    -   An optional async `setup` function to prepare the environment (e.g., deploy contracts, get wallet).
    -   A required `getMethods` function that returns an array of `ContractFunctionInteraction` objects to be profiled.
-   **Baseline Results (`benchmarks/*.benchmark.json`):** These files contain the benchmark results from the base branch (e.g., `main`) and are used as the reference for comparison. You typically generate/update these when merging performance improvements to the base branch.

See the action's implementation details for more advanced configuration options or specific requirements.
