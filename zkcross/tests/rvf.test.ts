import { beforeAll, describe, expect, it } from 'vitest';

import { Prover, toCircuitInputs, abiEncode } from '@zkpersona/noir-helpers';

import circuit from '../../target/rvf.json' assert { type: 'json' };

import os from 'node:os';
import type { CompiledCircuit } from '@noir-lang/noir_js';
import { http, type PublicClient, createPublicClient } from 'viem';
import { mainnet } from 'viem/chains';
import { getAccountProof } from '../../src';

describe('Root Verification Function (RVF) Verification', () => {
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
      transport: http(
        'https://eth-mainnet.g.alchemy.com/v2/NWE0grP8z2DMMTWR1yVp_'
      ),
    });
  });

  it('should prove single account first', async () => {
    const accountData = await getAccountProof(publicClient, {
      address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
    });

    console.log(
      'account_proof.proof.depth:',
      accountData.account_proof.proof.depth
    );
    console.log(
      'account_proof.proof.nodes count:',
      accountData.account_proof.proof.nodes.length
    );
    console.log(
      'account_proof.key length:',
      accountData.account_proof.key.length
    );
    console.log(
      'account_proof.value length:',
      accountData.account_proof.value.length
    );
    console.log('Expected key length: 66');
    console.log('Expected value length: 110');

    const inputs = {
      account_old: accountData.account,
      proof_old: accountData.account_proof,
      state_root_old: accountData.state_root,
      account_new: accountData.account,
      proof_new: accountData.account_proof,
      state_root_new: accountData.state_root,
    };

    console.log('\nTesting RVF with same account twice...');
    try {
      const parsedInputs = toCircuitInputs(inputs);
      console.log('Inputs converted successfully');
      console.log('proof_old.key length:', parsedInputs.proof_old?.key?.length);
      console.log('proof_new.key length:', parsedInputs.proof_new?.key?.length);

      if (parsedInputs.proof_old?.key?.length !== 66) {
        throw new Error(
          `proof_old.key has invalid length: ${parsedInputs.proof_old.key?.length}, expected 66`
        );
      }
      if (parsedInputs.proof_new?.key?.length !== 66) {
        throw new Error(
          `proof_new.key has invalid length: ${parsedInputs.proof_new.key?.length}, expected 66`
        );
      }

      // Log first node structure
      const firstNode = parsedInputs.proof_old?.proof?.nodes?.[0];
      if (firstNode) {
        console.log(
          'First non-empty byte in first node:',
          firstNode.findIndex((b: number) => b !== 0)
        );
        console.log('First few bytes:', firstNode.slice(0, 10));
      }

      console.log('Starting proof generation...');
      const proof = await prover.fullProve(parsedInputs, { type: 'honk' });
      console.log('Proof generated, verifying...');
      const isVerified = await prover.verify(proof, { type: 'honk' });
      expect(isVerified).toBe(true);
      console.log('✓ RVF verification succeeded');
    } catch (error) {
      console.error('RVF circuit failed:', error);
      throw error;
    }
  });

  it.skip('should prove root cross block verification', async () => {
    // Get latest block and previous block
    const blockNew = await publicClient.getBlock({ blockTag: 'latest' });
    if (!blockNew) {
      throw new Error('Failed to fetch block');
    }

    // Use the latest block for both old and new (same block)
    // This tests that the circuit works correctly when there's no state change
    const blockOld = blockNew;

    console.log('Block old:', {
      number: blockOld.number,
      stateRoot: blockOld.stateRoot,
    });
    console.log('Block new:', {
      number: blockNew.number,
      stateRoot: blockNew.stateRoot,
    });

    // Get account proofs from both blocks in parallel
    console.time('get-rvf-proof');
    const [accountDataOld, accountDataNew] = await Promise.all([
      getAccountProof(publicClient, {
        address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
        blockNumber: blockOld.number,
      }),
      getAccountProof(publicClient, {
        address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
        blockNumber: blockNew.number,
      }),
    ]);
    console.timeEnd('get-rvf-proof');

    console.log('Old account:', {
      balance: accountDataOld.account.balance,
      nonce: accountDataOld.account.nonce,
    });
    console.log('New account:', {
      balance: accountDataNew.account.balance,
      nonce: accountDataNew.account.nonce,
    });

    // Format inputs for RVF circuit
    const inputs = {
      account_old: accountDataOld.account,
      proof_old: accountDataOld.account_proof,
      state_root_old: accountDataOld.state_root,
      account_new: accountDataNew.account,
      proof_new: accountDataNew.account_proof,
      state_root_new: accountDataNew.state_root,
    };

    console.log('Inputs structure:');
    console.log('- account_old address:', accountDataOld.account.address);
    console.log('- account_old nonce:', accountDataOld.account.nonce);
    console.log('- proof_old depth:', accountDataOld.account_proof.proof.depth);
    console.log(
      '- proof_old nodes count:',
      accountDataOld.account_proof.proof.nodes.length
    );
    console.log(
      '- proof_old leaf length:',
      accountDataOld.account_proof.proof.leaf.length
    );
    console.log('- state_root_old:', accountDataOld.state_root);
    console.log('- account_new address:', accountDataNew.account.address);
    console.log('- account_new nonce:', accountDataNew.account.nonce);
    console.log('- proof_new depth:', accountDataNew.account_proof.proof.depth);
    console.log('- state_root_new:', accountDataNew.state_root);

    console.time('prove-rvf');
    try {
      // Try using toCircuitInputs first
      const parsedInputs = toCircuitInputs(inputs);
      console.log('toCircuitInputs succeeded, trying to prove...');
      const proof = await prover.fullProve(parsedInputs, { type: 'honk' });
      console.timeEnd('prove-rvf');
    } catch (error) {
      console.log('Error during proving:', error);
      console.log('Error message:', (error as Error).message);
      console.log('Error stack:', (error as Error).stack);
      throw error;
    }

    console.time('verify-rvf');
    const isVerified = await prover.verify(proof, { type: 'honk' });
    console.timeEnd('verify-rvf');

    expect(isVerified).toBe(true);
  });
});
