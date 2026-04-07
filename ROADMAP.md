# aztec-benchmark Roadmap

Feature roadmap for `aztec-benchmark` — a universal benchmarking tool for Aztec smart contracts.

Inspired by: Foundry's gas profiling, Hyperledger Caliper, BlockBench, zk-Bench, and Noir's native profiler.

---

## Implementation Status

### Phase 1 — Core Features (DONE)

Core profiling features for trace analysis, timing, and non-standard transaction flows.

| ID | Feature | Status | Files |
|----|---------|--------|-------|
| 1.1 | Declarative trace regions | Done | `cli/traceRegions.ts` |
| 1.3 | Kernel isolation preset | Done | `cli/traceRegions.ts` — `kernelIsolation()` |
| 1.4 | Noop boundary convention | Done | `cli/traceRegions.ts` — `endMatch` support |
| 2.1 | Witness generation timing (witgenMs) | Done | `cli/profiler.ts` — `step.timings.witgen` |
| 3.1 | Raw TxExecutionRequest support | Done | `cli/rawInteraction.ts`, `cli/profiler.ts` — `#profileOneRaw` |
| 7.1 | Per-region regression detection | Done | `action/comparison.cjs` — `generateRegionComparisonSection()` |

### Phase 2 — CI & Programmatic API (DONE)

Features that make CI actionable for region-based projects and expose comparison logic for programmatic use.

| ID | Feature | Status | Files |
|----|---------|--------|-------|
| 7.2 | Configurable thresholds per metric | Done | `action/comparison.cjs` — `normalizeThresholds()`, `action/action.yml` — `thresholds` input |
| 2.5 | Timing stability annotations | Done | `cli/profiler.ts` — `metricStability` in report, `cli/types.ts` |
| 11.6 | Programmatic comparison API | Done | `cli/comparison.ts` — `compareReports()` |

---

## Pending Features

### Phase 3 — Deeper Metrics & Reporting

| ID | Feature | Description | Effort |
|----|---------|-------------|--------|
| 5.4 | Note/nullifier/log accounting | Count notes created, nullifiers emitted, encrypted/unencrypted logs per function. Drives DA gas understanding. | Medium |
| 10.1 | Version pinning in reports | Record Noir, Barretenberg, SDK, Node.js versions in every report. Warn when comparing across versions. | Low |
| 9.1 | Gate count diff attribution | When comparing base vs PR, attribute gate count delta to specific functions/operations. | Medium |
| 7.6 | Collapsible PR comments | Use `<details>` tags more aggressively for complex benchmarks — summary at top, per-contract/per-region details below. | Low |

### Phase 4 — Advanced Profiling & Parameterization

| ID | Feature | Description | Effort |
|----|---------|-------------|--------|
| 1.2 | Regex/glob matching for regions | Support regex patterns for region boundaries (e.g., `/Token:(transfer\|mint)/`). Currently only prefix matching. | Low |
| 4.1 | Automated flamegraph generation | After profiling, invoke `noir-profiler gates` and attach SVG flamegraphs to benchmark report. | Medium |
| 4.4 | Differential flamegraphs | Generate diff flamegraphs (Brendan Gregg style) highlighting operations that got more/less expensive between base and PR. | Medium |
| 8.1 | Parameterized benchmarks | Allow `getMethods()` to return parameterized interactions (e.g., transfer with 1, 2, 4, 8 notes) and plot gate count growth. | Medium |
| 3.3 | Multi-phase transaction support | Benchmark transactions with distinct setup/app/teardown phases, with per-phase metrics matching Aztec's execution model. | Medium |

---

## Full Feature Catalog

Below is the complete original proposal set. Features marked **DONE** are implemented. The rest are organized by category for reference.

### 1. Trace Slicing & Region Extraction

- **1.1 — Declarative trace regions.** DONE. Benchmark authors define named regions via `getRegions()` with `startMatch`/`endMatch` patterns. The profiler slices `executionSteps` and produces per-region summaries in the JSON report.

- **1.2 — Regex and glob matching.** PENDING. Currently only prefix matching (`startsWith`). Support regex patterns for region boundaries (e.g., `/Token:(transfer|mint)/`) and glob-style contract name matching (e.g., `FPC*`).

- **1.3 — Kernel isolation.** DONE. Built-in `kernelIsolation()` preset auto-separates kernel circuits (`private_kernel_*`, `hiding_kernel`) from application logic. Produces "app gates" vs "kernel overhead" breakdown.

- **1.4 — Noop boundary convention.** DONE. The `endMatch` parameter supports the Noop-contract-as-delimiter pattern. If the benchmark declares a delimiter contract, the runner automatically extracts the region between the entrypoint and the delimiter.

- **1.5 — Nested region support.** PENDING. Allow regions to nest (e.g., "full FPC teardown" containing sub-regions "token transfer" and "authwit verification"), producing a hierarchical gate count breakdown.

### 2. Witness Generation & Execution Timing

- **2.1 — Surface `witgenMs` per circuit step.** DONE. Each `GateCount` entry includes `witgenMs` from `PrivateExecutionStep.timings.witgen`.

- **2.2 — Compilation time tracking.** PENDING. Measure and report `aztec compile` time for the contract under test. Useful for tracking Noir compiler regressions.

- **2.3 — PXE simulation time.** PENDING. Capture and report the time taken by PXE to simulate the transaction (before proving), which reflects unconstrained execution cost.

- **2.4 — Proving time breakdown.** PENDING. Instead of a single `provingTime` number, break it down per-circuit where possible (per-step proving time from the SDK if available).

- **2.5 — Timing stability annotations.** DONE. Report includes `metricStability` field marking each metric as `"deterministic"` (gate count, gas) or `"hardware-dependent"` (witgenMs, proving time). CI tooling uses this to auto-select default thresholds.

### 3. Non-Standard Transaction Flows

- **3.1 — Raw `TxExecutionRequest` support.** DONE. `getMethods()` can return `RawBenchmarkedInteraction` objects with a `ProfileableAction` duck-typed interface. The profiler calls `simulate()`, `profile()`, `send()` without injecting fee options — the action manages everything.

- **3.2 — Custom `msg_sender` configuration.** PENDING. Allow benchmarks to specify that the contract is the tx root without manually constructing execution requests.

- **3.3 — Multi-phase transaction support.** PENDING. Support benchmarking transactions with distinct setup, app, and teardown phases, with per-phase metrics.

- **3.4 — Batched transaction profiling.** PENDING. Profile multiple transactions in sequence to measure how state changes affect gate counts.

### 4. Flamegraph Integration

- **4.1 — Automated flamegraph generation.** PENDING. After profiling, invoke `noir-profiler gates` for each contract function and attach SVG flamegraphs to the benchmark report.

- **4.2 — ACIR opcode flamegraphs.** PENDING. Generate ACIR-level flamegraphs via `noir-profiler opcodes`.

- **4.3 — Brillig execution flamegraphs.** PENDING. For unconstrained functions, generate Brillig opcode flamegraphs.

- **4.4 — Differential flamegraphs.** PENDING. Generate diff flamegraphs highlighting which operations got more/less expensive between base and PR.

- **4.5 — Flamegraph search integration.** PENDING. Embed interactive SVGs with search support.

### 5. Multi-Level Metric Collection

- **5.1 — ACIR opcode counts.** PENDING. Report ACIR opcodes per function from `nargo info`. Useful because ACIR opcode count and backend gate count can diverge.

- **5.2 — Backend gate type breakdown.** PENDING. Report gate types (arithmetic, range, EC, lookup) per circuit if Barretenberg exposes it.

- **5.3 — Memory operation tracking.** PENDING. Count RAM vs ROM operations. Dynamic array access (RAM) is ~60% more expensive than static (ROM).

- **5.4 — Note/nullifier/log accounting.** PENDING. Count notes created, nullifiers emitted, and logs per function. Directly drives DA gas costs.

- **5.5 — Call graph depth and breadth.** PENDING. Report call graph structure: internal calls, nesting depth, kernel circuits triggered.

- **5.6 — Public function metrics.** PENDING. For public functions (AVM execution), report AVM opcode counts, L2 gas consumed, and simulation time separately from private metrics.

### 6. Gas Economics & Cost Estimation

- **6.1 — Fee estimation in ETH/USD.** PENDING. Given gas price assumptions, estimate L1 settlement cost and L2 execution cost.

- **6.2 — DA gas breakdown.** PENDING. Break down DA gas into proof size, log size, and note encryption overhead.

- **6.3 — Gas limit budget tracking.** PENDING. Compare measured gas against protocol-defined limits.

- **6.4 — Gas per note/transfer.** PENDING. Compute derived metrics for apples-to-apples comparison.

- **6.5 — Teardown gas isolation.** PENDING. Separately report teardown phase gas vs app phase gas.

### 7. CI & Reporting Enhancements

- **7.1 — Per-region regression detection.** DONE. The comparison module generates per-region gate count comparison tables in collapsible `<details>` sections on PR comments.

- **7.2 — Configurable thresholds per metric.** DONE. Action accepts `thresholds` JSON input (e.g., `{"gates": 1.0, "daGas": 2.5, "provingTime": null}`). `null` means info-only. Backward compatible with scalar `threshold` input.

- **7.3 — HTML report generation.** PENDING. Interactive HTML report with tables, flamegraphs, and charts.

- **7.4 — Historical trend tracking.** PENDING. Store results over time and generate trend charts.

- **7.5 — Multi-contract comparison matrix.** PENDING. Side-by-side comparison of multiple contracts.

- **7.6 — Structured PR comment with collapsible sections.** PARTIALLY DONE. Circuit details and region breakdowns use `<details>` tags. Could be more aggressive.

- **7.7 — Badge/shield generation.** PENDING.

- **7.8 — Slack/Discord notifications.** PENDING.

### 8. Workload Patterns & Parameterization

- **8.1 — Parameterized benchmarks.** PENDING. Allow `getMethods()` to return parameterized interactions and plot gate count growth.

- **8.2 — Standard workload profiles.** PENDING. Built-in templates for common patterns (ERC20 transfer, DEX swap, etc.).

- **8.3 — Warmup/cooldown separation.** PENDING.

- **8.4 — Concurrency simulation.** PENDING.

- **8.5 — State-dependent benchmarking.** PENDING.

### 9. Developer Experience & Debugging

- **9.1 — Gate count diff attribution.** PENDING. Attribute gate count delta to specific functions when comparing.

- **9.2 — Optimization hints.** PENDING.

- **9.3 — `nargo info` integration.** PENDING.

- **9.4 — Circuit size warnings.** PENDING.

- **9.5 — Interactive profiling mode.** PENDING.

- **9.6 — Verbose trace logging.** PENDING.

### 10. Cross-Version & Cross-Backend Benchmarking

- **10.1 — Version pinning in reports.** PENDING. Record exact versions of Noir, BB, SDK in reports.

- **10.2 — Multi-version benchmarking.** PENDING.

- **10.3 — Backend-agnostic reporting.** PENDING.

- **10.4 — Noir compiler optimization flags.** PENDING.

### 11. Composability & Ecosystem Integration

- **11.1 — TXE support.** PENDING.

- **11.2 — Plugin architecture.** PENDING.

- **11.3 — Scaffold command.** PENDING.

- **11.4 — JSON Schema for reports.** PENDING.

- **11.5 — Export to common formats.** PENDING.

- **11.6 — Programmatic API.** DONE. `compareReports()` function takes two `ProfileReport` objects and `MetricThresholds`, returns structured `ComparisonResult` with per-entry status and per-region diffs. Exported from the package.

### 12. Resource Monitoring

- **12.1 — Peak memory tracking.** PENDING.
- **12.2 — CPU utilization profiling.** PENDING.
- **12.3 — Proving throughput metric.** PENDING.
- **12.4 — Hardware class recommendations.** PENDING.

### 13. Security-Adjacent Profiling

- **13.1 — Unconstrained function accounting.** PENDING.
- **13.2 — Constraint density analysis.** PENDING.
- **13.3 — Note encryption cost tracking.** PENDING.

### 14. Comparative Benchmarking

- **14.1 — Reference benchmark suite.** PENDING.
- **14.2 — Cross-project comparison.** PENDING.
- **14.3 — Public benchmark registry.** PENDING.

---

## Architecture Notes

### Key files added/modified (Phases 1-2)

| File | Purpose |
|------|---------|
| `cli/traceRegions.ts` | Region extraction engine: `extractRegion()`, `kernelIsolation()`, `applyRegions()` |
| `cli/rawInteraction.ts` | `ProfileableAction` interface, `RawBenchmarkedInteraction` type, `isRawInteraction()` guard |
| `cli/comparison.ts` | Programmatic comparison API: `compareReports()`, `MetricThresholds`, `ComparisonResult` |
| `cli/types.ts` | Extended with `witgenMs`, `regions`, `regionSummaries`, `metricStability`, `BenchmarkableItem` |
| `cli/profiler.ts` | Captures `witgenMs`, handles raw interactions via `#profileOneRaw`, applies regions in `saveResults()` |
| `cli/cli.ts` | Reads `getRegions()` from benchmark, passes to profiler |
| `action/comparison.cjs` | Per-metric thresholds (`normalizeThresholds`), per-region comparison tables |
| `action/index.cjs` | Parses `thresholds` JSON input |
| `action/action.yml` | New `thresholds` input |

### Design principles

1. **New logic in new files** — minimizes merge conflicts with upstream
2. **Additive-only changes to existing files** — optional fields, new imports, new hook calls
3. **Backward compatible** — all new features are opt-in; existing benchmarks produce identical output plus new optional fields
4. **Duck-typing for raw interactions** — `ProfileableAction` interface lets benchmark authors implement custom simulate/profile/send without subclassing

### Validated against

- **FPC-style contracts** — Trace slicing, witgenMs, raw TxExecutionRequest, kernel isolation, per-region comparison
- **Standard contract patterns** — Private/public functions, cross-contract calls, batch operations, capsule-based data delivery
