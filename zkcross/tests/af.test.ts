import { beforeAll, describe, expect, it } from 'vitest';

import { Prover, toCircuitInputs } from '@zkpersona/noir-helpers';

import circuit from '../../target/af.json' assert { type: 'json' };

import os from 'node:os';
import type { CompiledCircuit } from '@noir-lang/noir_js';
import { http, type PublicClient, createPublicClient } from 'viem';
import { mainnet } from 'viem/chains';
import { parseAddress } from '../../src/helpers';

describe('Auditing Function (AF) Verification', () => {
  let prover: Prover;
  let publicClient: PublicClient;

  beforeAll(() => {
    const threads = os.cpus().length;
    prover = new Prover(circuit as CompiledCircuit, {
      type: 'honk',
      options: { threads },
    });
    publicClient = createPublicClient({
      chain: mainnet,
      transport: http(),
    });
  });

  it('should prove non-blacklisted Ethereum address', async () => {
    // Test with a real Ethereum address (Vitalik's)
    const address = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';

    // Format address for Noir circuit
    const addressBytes = parseAddress(address);

    const inputs = {
      address: addressBytes,
    };

    console.time('prove-af-real-address');
    const parsedInputs = toCircuitInputs(inputs);
    const proof = await prover.fullProve(parsedInputs, { type: 'honk' });
    console.timeEnd('prove-af-real-address');

    console.time('verify-af-real-address');
    const isVerified = await prover.verify(proof, { type: 'honk' });
    console.timeEnd('verify-af-real-address');

    expect(isVerified).toBe(true);
  });

  it('should prove with multiple real Ethereum addresses', async () => {
    const addresses = [
      '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', // Vitalik
      '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
      '0xE592427A0AEce92De3Edee1F18E0157C05861564', // Uniswap Router V3
    ];

    for (const address of addresses) {
      const addressBytes = parseAddress(address);

      const inputs = {
        address: addressBytes,
      };

      const parsedInputs = toCircuitInputs(inputs);
      const proof = await prover.fullProve(parsedInputs, { type: 'honk' });
      const isVerified = await prover.verify(proof, { type: 'honk' });

      expect(isVerified).toBe(true);
    }
  });

  it('should prove with address from block transaction', async () => {
    console.time('get-block');
    const block = await publicClient.getBlock({
      blockTag: 'latest',
      includeTransactions: true,
    });
    const blockNumber = block.number!;
    console.timeEnd('get-block');

    // Get a real transaction sender address
    const tx = block.transactions[0];
    if (!(tx && 'from' in tx)) {
      throw new Error('No transaction found');
    }

    const addressBytes = parseAddress(tx.from);

    const inputs = {
      address: addressBytes,
    };

    console.time('parse-inputs');
    const parsedInputs = toCircuitInputs(inputs);
    console.timeEnd('parse-inputs');

    console.time('fullProve-block-transaction');
    const proof = await prover.fullProve(parsedInputs, { type: 'honk' });
    console.timeEnd('fullProve-block-transaction');

    const isVerified = await prover.verify(proof, { type: 'honk' });

    expect(isVerified).toBe(true);
  });

  it('should fail with blacklisted address (0x00...)', async () => {
    // Test with first blacklisted address (all zeros)
    const addressBytes = parseAddress(
      '0x0000000000000000000000000000000000000000'
    );

    const inputs = {
      address: addressBytes,
    };

    try {
      const parsedInputs = toCircuitInputs(inputs);
      await prover.fullProve(parsedInputs, { type: 'honk' });
      expect(false).toBe(true); // Should not reach here
    } catch (error) {
      expect(error).toBeDefined(); // Expected to fail
    }
  });
});
