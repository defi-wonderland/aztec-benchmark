/**
 * Mock benchmark that exercises the full profiler pipeline WITHOUT a running sandbox.
 *
 * Uses RawBenchmarkedInteraction with a fake action that returns canned profile data.
 * Tests: raw interaction handling, witgenMs capture, trace region extraction, JSON output.
 *
 * Run with:
 *   npx aztec-benchmark --config examples/Nargo.toml --skip-proving -o examples/output
 */

import { AztecAddress } from '@aztec/aztec.js/addresses';

// Fake execution steps simulating a realistic FPC-style transaction trace.
// The profiler will capture gateCount and timings.witgen from each step.
const MOCK_EXECUTION_STEPS = [
  { functionName: 'private_kernel_init', gateCount: 25000, bytecode: Buffer.alloc(0), witness: new Map(), vk: Buffer.alloc(0), timings: { witgen: 15.2 } },
  { functionName: 'SchnorrAccount:entrypoint', gateCount: 18000, bytecode: Buffer.alloc(0), witness: new Map(), vk: Buffer.alloc(0), timings: { witgen: 22.5 } },
  { functionName: 'private_kernel_inner', gateCount: 30000, bytecode: Buffer.alloc(0), witness: new Map(), vk: Buffer.alloc(0), timings: { witgen: 10.1 } },
  { functionName: 'FPC:fee_entrypoint', gateCount: 45000, bytecode: Buffer.alloc(0), witness: new Map(), vk: Buffer.alloc(0), timings: { witgen: 55.3 } },
  { functionName: 'Token:transfer_private_to_private', gateCount: 32000, bytecode: Buffer.alloc(0), witness: new Map(), vk: Buffer.alloc(0), timings: { witgen: 40.7 } },
  { functionName: 'private_kernel_inner', gateCount: 30000, bytecode: Buffer.alloc(0), witness: new Map(), vk: Buffer.alloc(0), timings: { witgen: 10.0 } },
  { functionName: 'Noop:noop', gateCount: 5000, bytecode: Buffer.alloc(0), witness: new Map(), vk: Buffer.alloc(0), timings: { witgen: 3.2 } },
  { functionName: 'private_kernel_inner', gateCount: 30000, bytecode: Buffer.alloc(0), witness: new Map(), vk: Buffer.alloc(0), timings: { witgen: 10.0 } },
  { functionName: 'private_kernel_tail', gateCount: 20000, bytecode: Buffer.alloc(0), witness: new Map(), vk: Buffer.alloc(0), timings: { witgen: 8.5 } },
];

/** Mock action that returns canned profile data — no sandbox needed. */
class MockAction {
  async simulate() {
    return {
      estimatedGas: {
        gasLimits: { daGas: 1500, l2Gas: 560000 },
        teardownGasLimits: { daGas: 0, l2Gas: 0 },
      },
    };
  }

  async profile() {
    return {
      executionSteps: MOCK_EXECUTION_STEPS,
      stats: {
        timings: {
          proving: 4200,
          perFunction: MOCK_EXECUTION_STEPS.map(s => ({
            functionName: s.functionName,
            time: s.timings.witgen,
          })),
          unaccounted: 50,
          total: 4250,
        },
      },
    };
  }

  async send() {
    // No-op: nothing to send in mock mode
  }
}

export default class MockBenchmark {
  getRegions() {
    return [
      {
        name: 'fpc-only',
        startMatch: 'FPC:',
        endMatch: 'Noop:',
      },
      {
        name: 'fpc-no-kernels',
        startMatch: 'FPC:',
        endMatch: 'Noop:',
        excludeKernels: true,
      },
    ];
  }

  async setup() {
    return {};
  }

  getMethods() {
    return [
      {
        action: new MockAction(),
        caller: AztecAddress.fromBigInt(1n),
        name: 'fee_entrypoint',
      },
    ];
  }

  async teardown() {}
}
