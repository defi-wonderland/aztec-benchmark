import type { AztecAddress } from '@aztec/aztec.js/addresses';

/**
 * Duck-type interface for actions that manage their own simulate/profile/send lifecycle.
 *
 * Use this when the standard ContractFunctionInteraction flow doesn't apply —
 * for example, when the contract under test must be the transaction root
 * (msg_sender = None), bypassing the account entrypoint.
 *
 * The profiler calls these methods directly without injecting fee options,
 * origin address, or additional scopes — your implementation handles all of that.
 */
export interface ProfileableAction {
  /** Optional: return an execution payload or request for name discovery. */
  request?(): any;
  /** Simulate the transaction. Should return an object with `estimatedGas` if gas tracking is desired. */
  simulate(opts?: any): Promise<any>;
  /** Profile the transaction. Should return a TxProfileResult-compatible object with executionSteps and stats. */
  profile(opts?: any): Promise<any>;
  /** Send the transaction on-chain. */
  send(opts?: any): Promise<any>;
}

/**
 * A benchmark interaction using a raw (duck-typed) action.
 *
 * Unlike NamedBenchmarkedInteraction which wraps a ContractFunctionInteractionCallIntent,
 * this type allows arbitrary action objects that implement simulate/profile/send.
 * The profiler will NOT inject fee options or origin — the action manages everything.
 *
 * Example use case: cold-start FPC where the contract is the tx root and you need
 * to construct TxExecutionRequest manually, calling PXE APIs directly.
 */
export interface RawBenchmarkedInteraction {
  /** The duck-typed action implementing simulate/profile/send. */
  action: ProfileableAction;
  /** The caller address (used for logging/reporting, not injected into the action). */
  caller: AztecAddress;
  /** Display name for this benchmark entry in reports. Required for raw interactions. */
  name: string;
  /** Extra addresses whose private state should be accessible during execution. */
  additionalScopes?: AztecAddress[];
}

/**
 * Type guard to distinguish RawBenchmarkedInteraction from other interaction types.
 *
 * Detection: has 'action' and 'name' directly (not nested under 'interaction'),
 * and does NOT have 'interaction' (which NamedBenchmarkedInteraction has).
 */
export function isRawInteraction(item: any): item is RawBenchmarkedInteraction {
  return (
    item != null &&
    typeof item === 'object' &&
    'action' in item &&
    'name' in item &&
    !('interaction' in item)
  );
}
