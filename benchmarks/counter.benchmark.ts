import {
  BenchmarkBase as Benchmark, // Alias for BenchmarkBase
  type BenchmarkContext, 
  type NamedBenchmarkedInteraction 
} from '../cli/types.ts';

import {
  type AccountWallet,
  type ContractFunctionInteraction,
  type PXE,
  type Contract, // Generic Contract type from Aztec.js
  createPXEClient, // Example import
} from '@aztec/aztec.js';
import { CounterContract } from '../src/artifacts/Counter.ts';
import { getInitialTestAccountsWallets } from "@aztec/accounts/testing";

// 1. Define a specific context for your benchmark (optional but good practice)
interface MyBenchmarkContext extends BenchmarkContext {
  pxe: PXE;
  deployer: AccountWallet;
  contract: Contract; // Use the generic Contract type or your specific contract type
}

export default class MyContractBenchmark extends Benchmark {
  // Runs once before all benchmark methods.
  async setup(): Promise<MyBenchmarkContext> {
    console.log('Setting up benchmark environment...');
    const pxe = createPXEClient(process.env.PXE_URL || 'http://localhost:8080');
    const accounts = await getInitialTestAccountsWallets(pxe);
    const deployer = accounts[0]!;

    const deployedContract = await CounterContract.deploy(deployer, deployer.getAddress()).send().deployed();
    const contract = await CounterContract.at(deployedContract.address, deployer);
    console.log('Contract deployed at:', contract.address.toString());

    return { pxe, deployer, contract }; 
  }

  // Returns an array of interactions to benchmark. 
  getMethods(context: MyBenchmarkContext): Array<ContractFunctionInteraction | NamedBenchmarkedInteraction> {
    // Ensure context is available (it should be if setup ran correctly)
    if (!context || !context.contract) {
      // In a real scenario, setup() must initialize the context properly.
      // Throwing an error or returning an empty array might be appropriate here if setup failed.
      console.error("Benchmark context or contract not initialized in setup(). Skipping getMethods.");
      return [];
    }
    
    const { contract, deployer } = context;

    return [
      contract.withWallet(deployer).methods.increment(),
      contract.withWallet(deployer).methods.increment_with_address(),
    ];
  }

  // Optional cleanup phase
  async teardown(context: MyBenchmarkContext): Promise<void> {
    console.log('Cleaning up benchmark environment...');
    if (context && context.pxe) { 
      // await context.pxe.stop(); 
    }
  }
}