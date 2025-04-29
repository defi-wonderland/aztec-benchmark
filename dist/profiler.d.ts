import { type ContractFunctionInteraction } from '@aztec/aztec.js';
import { type ProfileResult } from './types.js';
export declare class Profiler {
    #private;
    profile(fsToProfile: ContractFunctionInteraction[]): Promise<ProfileResult[]>;
    saveResults(results: ProfileResult[], filename: string): Promise<void>;
}
