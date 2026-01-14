export interface SystemInfo {
    /** CPU model name */
    cpuModel: string;
    /** Number of available CPU cores (container-aware) */
    cpuCores: number;
    /** Total available memory in GiB (container-aware) */
    totalMemoryGiB: number;
    /** CPU architecture (e.g., 'x64', 'arm64') */
    arch: string;
}
/**
 * Collects system information for benchmark reports.
 * Returns N/A values if information cannot be determined.
 */
export declare function getSystemInfo(): SystemInfo;
