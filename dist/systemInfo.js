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
 * Gets the effective memory in GB, respecting container limits.
 * Uses constrainedMemory() which is cgroup-aware in Node 19.6+
 */
function getEffectiveMemoryGB() {
    const constrainedMemory = process.constrainedMemory?.();
    const bytes = constrainedMemory ?? os.totalmem();
    return Math.round(bytes / (1024 * 1024 * 1024));
}
/**
 * Shortens CPU model string to be more readable.
 * e.g., "AMD EPYC 7763 64-Core Processor" -> "AMD EPYC 7763"
 */
function shortenCpuModel(model) {
    // Remove common suffixes and limit to first 3-4 meaningful words
    return model
        .replace(/\s+@\s+[\d.]+GHz/i, '')
        .replace(/\s*\d+-Core Processor/i, '')
        .replace(/\(R\)|\(TM\)/gi, '')
        .replace(/\s+/g, ' ')
        .trim()
        .split(' ')
        .slice(0, 4)
        .join(' ');
}
/**
 * Collects system information for benchmark reports.
 * Returns N/A values if information cannot be determined.
 */
export function getSystemInfo() {
    let cpuModel = 'N/A';
    let cpuCores = 0;
    let totalMemoryGB = 0;
    let arch = 'N/A';
    try {
        const cpus = os.cpus();
        if (cpus && cpus.length > 0 && cpus[0]?.model) {
            cpuModel = shortenCpuModel(cpus[0].model);
        }
    }
    catch {
        // Keep default N/A
    }
    try {
        cpuCores = getEffectiveCpuCount();
    }
    catch {
        // Keep default 0
    }
    try {
        totalMemoryGB = getEffectiveMemoryGB();
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
    return {
        cpuModel,
        cpuCores,
        totalMemoryGB,
        arch,
    };
}
