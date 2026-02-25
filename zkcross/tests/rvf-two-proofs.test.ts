import { beforeAll, describe, expect, it } from 'vitest';

import { Prover, toCircuitInputs } from '@zkpersona/noir-helpers';

import circuitAccount from '../../target/verify_account.json' assert {
  type: 'json',
};

import os from 'node:os';
import type { CompiledCircuit } from '@noir-lang/noir_js';
import { http, type PublicClient, createPublicClient } from 'viem';
import { mainnet } from 'viem/chains';
import { getAccountProof } from '../../src';

describe('RVF with Two Separate Proofs', () => {
  let prover: Prover;
  let publicClient: PublicClient;

  beforeAll(() => {
    const threads = os.cpus().length;
    prover = new Prover(circuitAccount as CompiledCircuit, {
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

  it('should verify old and new states with separate proofs', async () => {
    // Get two different blocks (latest and one block before)
    const blockNew = await publicClient.getBlock({ blockTag: 'latest' });
    if (!blockNew) {
      throw new Error('Failed to fetch latest block');
    }

    const blockOld = await publicClient.getBlock({
      blockNumber: blockNew.number - 1n,
    });
    if (!blockOld) {
      throw new Error('Failed to fetch previous block');
    }

    console.log('Block old:', {
      number: blockOld.number,
      stateRoot: blockOld.stateRoot,
    });
    console.log('Block new:', {
      number: blockNew.number,
      stateRoot: blockNew.stateRoot,
    });

    // Get account proofs for both blocks
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

    console.log('Old account:', {
      balance: accountDataOld.account.balance,
      nonce: accountDataOld.account.nonce,
    });
    console.log('New account:', {
      balance: accountDataNew.account.balance,
      nonce: accountDataNew.account.nonce,
    });

    // Generate proof for old state
    console.time('prove-old-state');
    const inputsOld = {
      account: accountDataOld.account,
      account_proof: accountDataOld.account_proof,
      state_root: accountDataOld.state_root,
    };
    const parsedInputsOld = toCircuitInputs(inputsOld);
    const proofOld = await prover.fullProve(parsedInputsOld, { type: 'honk' });
    console.timeEnd('prove-old-state');

    // Verify old state proof
    console.time('verify-old-state');
    const isVerifiedOld = await prover.verify(proofOld, { type: 'honk' });
    console.timeEnd('verify-old-state');
    expect(isVerifiedOld).toBe(true);
    console.log('✓ Old state verified');

    // Generate proof for new state
    console.time('prove-new-state');
    const inputsNew = {
      account: accountDataNew.account,
      account_proof: accountDataNew.account_proof,
      state_root: accountDataNew.state_root,
    };
    const parsedInputsNew = toCircuitInputs(inputsNew);
    const proofNew = await prover.fullProve(parsedInputsNew, { type: 'honk' });
    console.timeEnd('prove-new-state');

    // Verify new state proof
    console.time('verify-new-state');
    const isVerifiedNew = await prover.verify(proofNew, { type: 'honk' });
    console.timeEnd('verify-new-state');
    expect(isVerifiedNew).toBe(true);
    console.log('✓ New state verified');

    console.log('✓ Both states verified successfully with separate proofs');
  });

  it('should verify same account in same block with separate proofs', async () => {
    const block = await publicClient.getBlock({ blockTag: 'latest' });
    if (!block) {
      throw new Error('Failed to fetch block');
    }

    console.log('Block:', { number: block.number, stateRoot: block.stateRoot });

    // Get account proof twice for same block
    const [accountData1, accountData2] = await Promise.all([
      getAccountProof(publicClient, {
        address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
        blockNumber: block.number,
      }),
      getAccountProof(publicClient, {
        address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
        blockNumber: block.number,
      }),
    ]);

    console.log('Account 1:', {
      balance: accountData1.account.balance,
      nonce: accountData1.account.nonce,
    });
    console.log('Account 2:', {
      balance: accountData2.account.balance,
      nonce: accountData2.account.nonce,
    });

    // Generate and verify first proof
    const inputs1 = {
      account: accountData1.account,
      account_proof: accountData1.account_proof,
      state_root: accountData1.state_root,
    };
    const parsedInputs1 = toCircuitInputs(inputs1);
    const proof1 = await prover.fullProve(parsedInputs1, { type: 'honk' });
    const isVerified1 = await prover.verify(proof1, { type: 'honk' });
    expect(isVerified1).toBe(true);
    console.log('✓ First proof verified');

    // Generate and verify second proof
    const inputs2 = {
      account: accountData2.account,
      account_proof: accountData2.account_proof,
      state_root: accountData2.state_root,
    };
    const parsedInputs2 = toCircuitInputs(inputs2);
    const proof2 = await prover.fullProve(parsedInputs2, { type: 'honk' });
    const isVerified2 = await prover.verify(proof2, { type: 'honk' });
    expect(isVerified2).toBe(true);
    console.log('✓ Second proof verified');

    console.log('✓ Both proofs verified successfully');
  });
});
