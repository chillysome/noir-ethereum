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
      account: accountData.account,
      proof: accountData.account_proof,
      state_root: accountData.state_root,
    };

    console.log('\nTesting RVF with single account...');
    try {
      const parsedInputs = toCircuitInputs(inputs);
      console.log('Inputs converted successfully');
      console.log('proof.key length:', parsedInputs.proof?.key?.length);

      if (parsedInputs.proof?.key?.length !== 66) {
        throw new Error(
          `proof.key has invalid length: ${parsedInputs.proof.key?.length}, expected 66`
        );
      }

      // Log first node structure
      const firstNode = parsedInputs.proof?.proof?.nodes?.[0];
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

  it('should prove root cross block verification (two blocks)', async () => {
    // Get latest block and previous block
    const blockNew = await publicClient.getBlock({ blockTag: 'latest' });
    if (!blockNew) {
      throw new Error('Failed to fetch block');
    }

    const blockOld = await publicClient.getBlock({
      blockNumber: (blockNew.number - 1n) as bigint,
    });

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

    // Verify account in old block
    const inputsOld = {
      account: accountDataOld.account,
      proof: accountDataOld.account_proof,
      state_root: accountDataOld.state_root,
    };

    console.log('\nVerifying account in old block...');
    console.time('prove-rvf-old');
    try {
      const parsedInputsOld = toCircuitInputs(inputsOld);
      const proofOld = await prover.fullProve(parsedInputsOld, {
        type: 'honk',
      });
      console.timeEnd('prove-rvf-old');
      console.time('verify-rvf-old');
      const isVerifiedOld = await prover.verify(proofOld, { type: 'honk' });
      console.timeEnd('verify-rvf-old');
      expect(isVerifiedOld).toBe(true);
      console.log('✓ Old block verification succeeded');
    } catch (error) {
      console.error('Old block verification failed:', error);
      throw error;
    }

    // Verify account in new block
    const inputsNew = {
      account: accountDataNew.account,
      proof: accountDataNew.account_proof,
      state_root: accountDataNew.state_root,
    };

    console.log('\nVerifying account in new block...');
    console.time('prove-rvf-new');
    try {
      const parsedInputsNew = toCircuitInputs(inputsNew);
      const proofNew = await prover.fullProve(parsedInputsNew, {
        type: 'honk',
      });
      console.timeEnd('prove-rvf-new');
      console.time('verify-rvf-new');
      const isVerifiedNew = await prover.verify(proofNew, { type: 'honk' });
      console.timeEnd('verify-rvf-new');
      expect(isVerifiedNew).toBe(true);
      console.log('✓ New block verification succeeded');
    } catch (error) {
      console.error('New block verification failed:', error);
      throw error;
    }

    console.log('\n✓ Both block verifications succeeded');
  });
});
