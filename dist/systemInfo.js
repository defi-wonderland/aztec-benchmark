import * as os from 'node:os';
/**
 * Gets the effective CPU count, respecting container limits.
 * Uses availableParallelism() which is cgroup-aware in Node 18.14+/19.4+
 */
function getEffectiveCpuCount() {
    if (typeof os.availableParallelism === 'function') {
        return os.availableParallelism();
    }
    return os.cpus().length;
}
/**
 * Gets total system memory in GiB.
 */
function getTotalMemoryGiB() {
    return Math.round(os.totalmem() / (1024 * 1024 * 1024));
}
/**
 * Collects system information for benchmark reports.
 * Returns N/A values if information cannot be determined.
 */
export function getSystemInfo() {
    let cpuModel = 'N/A';
    let cpuCores = 0;
    let totalMemoryGiB = 0;
    let arch = 'N/A';
    try {
        cpuCores = getEffectiveCpuCount();
    }
    catch {
        // Keep default 0
    }
    try {
        totalMemoryGiB = getTotalMemoryGiB();
    }
    catch {
        // Keep default 0
    }
    try {
        // Prefer RUNNER_ARCH env var in CI environments
        arch = (process.env.RUNNER_ARCH ?? os.arch()).toLowerCase();
    }
    catch {
        // Keep default N/A
    }
    try {
        const cpus = os.cpus();
        if (cpus && cpus.length > 0 && cpus[0]?.model) {
            cpuModel = cpus[0].model.trim();
        }
    }
    catch {
        // Keep default N/A
    }
    return {
        cpuModel,
        cpuCores,
        totalMemoryGiB,
        arch,
    };
}
