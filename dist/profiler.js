var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _Profiler_instances, _Profiler_profileOne;
import fs from 'node:fs';
// --- Helper Functions ---
function sumArray(arr) {
    return arr.reduce((a, b) => a + b, 0);
}
function sumGas(gas) {
    return (gas?.daGas ?? 0) + (gas?.l2Gas ?? 0);
}
// --- Profiler Class (Adapted from scripts/benchmark.ts) ---
export class Profiler {
    constructor() {
        _Profiler_instances.add(this);
    }
    async profile(fsToProfile) {
        const results = [];
        for (const f of fsToProfile) {
            results.push(await __classPrivateFieldGet(this, _Profiler_instances, "m", _Profiler_profileOne).call(this, f));
        }
        return results;
    }
    async saveResults(results, filename) {
        if (!results.length) {
            console.log(`No results to save for ${filename}. Saving empty report.`);
            fs.writeFileSync(filename, JSON.stringify({ summary: {}, results: [], gasSummary: {} }, null, 2));
            return;
        }
        const summary = results.reduce((acc, result) => ({
            ...acc,
            [result.name]: result.totalGateCount,
        }), {});
        const gasSummary = results.reduce((acc, result) => ({
            ...acc,
            [result.name]: result.gas
                ? sumGas(result.gas.gasLimits) + sumGas(result.gas.teardownGasLimits)
                : 0,
        }), {});
        const report = {
            summary,
            results: results,
            gasSummary,
        };
        console.log(`Saving results for ${results.length} methods in ${filename}`);
        try {
            fs.writeFileSync(filename, JSON.stringify(report, null, 2));
        }
        catch (error) {
            console.error(`Error writing results to ${filename}:`, error.message);
            throw error;
        }
    }
}
_Profiler_instances = new WeakSet(), _Profiler_profileOne = async function _Profiler_profileOne(f) {
    let name = 'unknown_function';
    try {
        const executionPayload = await f.request();
        if (executionPayload.calls && executionPayload.calls.length > 0) {
            const firstCall = executionPayload.calls[0];
            name = firstCall?.name ?? firstCall?.selector?.toString() ?? 'unknown_function';
        }
        else {
            console.warn('No calls found in execution payload.');
        }
    }
    catch (e) {
        const potentialMethodName = f.methodName;
        if (potentialMethodName) {
            name = potentialMethodName;
            console.warn(`Could not simulate request (${e.message}), using interaction.methodName as fallback: ${name}`);
        }
        else {
            console.warn(`Could not determine function name from request simulation: ${e.message}`);
        }
    }
    console.log(`Profiling ${name}...`);
    try {
        const gas = await f.estimateGas();
        const profileResults = await f.profile({ profileMode: 'full' });
        await f.send().wait();
        const result = {
            name,
            totalGateCount: sumArray(profileResults.executionSteps
                .map(step => step.gateCount)
                .filter((count) => count !== undefined)),
            gateCounts: profileResults.executionSteps.map(step => ({
                circuitName: step.functionName,
                gateCount: step.gateCount || 0,
            })),
            gas,
        };
        const daGas = gas?.gasLimits?.daGas ?? 'N/A';
        const l2Gas = gas?.gasLimits?.l2Gas ?? 'N/A';
        console.log(` -> ${name}: ${result.totalGateCount} gates, Gas (DA: ${daGas}, L2: ${l2Gas})`);
        return result;
    }
    catch (error) {
        console.error(`Error profiling ${name}:`, error.message);
        return {
            name: `${name} (FAILED)`,
            totalGateCount: 0,
            gateCounts: [],
            gas: { gasLimits: { daGas: 0, l2Gas: 0 }, teardownGasLimits: { daGas: 0, l2Gas: 0 } },
        };
    }
};
