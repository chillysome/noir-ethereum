import { beforeAll, describe, expect, it } from 'vitest';

import {
  Field,
  FixedSizeArray,
  Prover,
  U8,
  U64,
  toCircuitInputs,
} from '@zkpersona/noir-helpers';

import circuit from '../../target/zkcross.json' assert { type: 'json' };

import os from 'node:os';
import type { CompiledCircuit } from '@noir-lang/noir_js';
import {
  http,
  type PublicClient,
  createPublicClient,
  hexToBytes,
  parseEther,
} from 'viem';
import { keccak256, recoverPublicKey, serializeTransaction } from 'viem';
import { mainnet } from 'viem/chains';
import { getAccountProof, parseAddress } from '../../src';

describe('Complete zkCross Circuit (AF + SVF + STF + RVF)', () => {
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

  async function findValidTransaction() {
    // Try to get a transaction from latest block
    const block = await publicClient.getBlock({
      blockTag: 'latest',
      includeTransactions: true,
    });
    return block.transactions.find((t) => t.r && t.s && t.v && t.to);
  }

  it('should prove complete zkCross verification (AF + SVF + STF + RVF)', async () => {
    // Get latest block and previous block
    const blockNew = await publicClient.getBlock({
      blockTag: 'latest',
      includeTransactions: true,
    });
    const blockOld = await publicClient.getBlock({
      blockNumber: (blockNew.number - 1n) as bigint,
    });

    if (!(blockNew && blockOld)) {
      throw new Error('Failed to fetch blocks');
    }

    const tx = blockNew.transactions.find((t) => t.r && t.s && t.v && t.to);

    if (!tx) {
      throw new Error('No valid transaction found');
    }

    console.log('Transaction:', {
      hash: tx.hash,
      from: tx.from,
      to: tx.to,
      value: tx.value,
      nonce: tx.nonce,
      blockNew: blockNew.number,
      blockOld: blockOld.number,
    });

    const fromAddr = tx.from;
    const toAddr = tx.to!;

    console.time('get-rvf-proofs');
    // Get account proofs from both blocks
    const [
      senderAccountDataOld,
      senderAccountDataNew,
      receiverAccountDataOld,
      receiverAccountDataNew,
    ] = await Promise.all([
      getAccountProof(publicClient, {
        address: fromAddr,
        blockNumber: blockOld.number,
      }),
      getAccountProof(publicClient, {
        address: fromAddr,
        blockNumber: blockNew.number,
      }),
      getAccountProof(publicClient, {
        address: toAddr,
        blockNumber: blockOld.number,
      }),
      getAccountProof(publicClient, {
        address: toAddr,
        blockNumber: blockNew.number,
      }),
    ]);
    console.timeEnd('get-rvf-proofs');

    console.log(
      'Sender account proof depth:',
      senderAccountDataOld.account_proof.proof
    );
    console.log(
      'Receiver account proof depth:',
      receiverAccountDataOld.account_proof.proof
    );

    console.log('Sender old account:', {
      balance: senderAccountDataOld.account.balance,
      nonce: senderAccountDataOld.account.nonce,
    });
    console.log('Sender new account:', {
      balance: senderAccountDataNew.account.balance,
      nonce: senderAccountDataNew.account.nonce,
    });
    console.log('Receiver old account:', {
      balance: receiverAccountDataOld.account.balance,
      nonce: receiverAccountDataOld.account.nonce,
    });
    console.log('Receiver new account:', {
      balance: receiverAccountDataNew.account.balance,
      nonce: receiverAccountDataNew.account.nonce,
    });

    // Prepare SVF inputs - using real transaction signature
    const rBytes = hexToBytes(tx.r as `0x${string}`);
    const sBytes = hexToBytes(tx.s as `0x${string}`);
    const rPadded =
      rBytes.length === 32
        ? [...rBytes]
        : [...rBytes, ...new Array(32 - rBytes.length).fill(0)];
    const sPadded =
      sBytes.length === 32
        ? [...sBytes]
        : [...sBytes, ...new Array(32 - sBytes.length).fill(0)];
    const signature = [...rPadded, ...sPadded];

    const serializedTx = serializeTransaction(tx);
    const messageHash = hexToBytes(keccak256(serializedTx));

    console.log('Serialized tx length:', serializedTx.length);
    console.log('Message hash:', keccak256(serializedTx));

    const publicKeyHex = await recoverPublicKey({
      hash: messageHash as `0x${string}`,
      signature: {
        r: tx.r as `0x${string}`,
        s: tx.s as `0x${string}`,
        yParity: Number(((tx.v as bigint) - 27n) % 2n),
      },
    });

    const publicKey = hexToBytes(publicKeyHex);
    const publicKeyX = publicKey.slice(1, 33);
    const publicKeyY = publicKey.slice(33, 65);

    console.log('Public key length:', publicKey.length);

    const inputs = {
      // STF inputs (sender) - using real old and new states
      old_sender_account: senderAccountDataOld.account,
      new_sender_account: senderAccountDataNew.account,

      // STF inputs (receiver) - using real old and new states
      old_receiver_account: receiverAccountDataOld.account,
      new_receiver_account: receiverAccountDataNew.account,

      // Transaction - use real tx data
      tx: {
        from: parseAddress(fromAddr),
        to: parseAddress(toAddr),
        value: new Field(tx.value || 0n),
        nonce: new U64(tx.nonce || 0n),
      },

      // SVF inputs - using real signature and public key
      public_key_x: new FixedSizeArray(
        32,
        Array.from(publicKeyX).map((b) => new U8(b))
      ),
      public_key_y: new FixedSizeArray(
        32,
        Array.from(publicKeyY).map((b) => new U8(b))
      ),
      signature: new FixedSizeArray(
        64,
        signature.map((b) => new U8(b))
      ),
      message_hash: new FixedSizeArray(
        32,
        Array.from(messageHash).map((b) => new U8(b))
      ),

      // RVF inputs for sender (old and new blocks)
      old_sender_proof: senderAccountDataOld.account_proof,
      old_sender_state_root: senderAccountDataOld.state_root,
      new_sender_proof: senderAccountDataNew.account_proof,
      new_sender_state_root: senderAccountDataNew.state_root,

      // RVF inputs for receiver (old and new blocks)
      old_receiver_proof: receiverAccountDataOld.account_proof,
      old_receiver_state_root: receiverAccountDataOld.state_root,
      new_receiver_proof: receiverAccountDataNew.account_proof,
      new_receiver_state_root: receiverAccountDataNew.state_root,
    };

    console.time('prove-zkcross-complete');
    try {
      const parsedInputs = toCircuitInputs(inputs);
      console.log('Inputs converted successfully');
      const proof = await prover.fullProve(parsedInputs, { type: 'honk' });
      console.timeEnd('prove-zkcross-complete');

      console.time('verify-zkcross-complete');
      const isVerified = await prover.verify(proof, { type: 'honk' });
      console.timeEnd('verify-zkcross-complete');

      expect(isVerified).toBe(true);
    } catch (error) {
      console.error('Error during proof generation:', error);
      throw error;
    }
  });

  it('should fail with blacklisted address', async () => {
    // Use a blacklisted address (all zeros for sender)
    const blacklistedAddress = '0x0000000000000000000000000000000000000000';
    const toAddr = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';

    console.log('Testing with blacklisted sender address');

    // Get real account data for receiver
    const receiverAccountData = await getAccountProof(publicClient, {
      address: toAddr,
    });

    // Mock signature and public key
    const publicKeyX = new Array(32).fill(0).map((_, i) => new U8(i));
    const publicKeyY = new Array(32).fill(0).map((_, i) => new U8(i + 1));
    const signature = new Array(64).fill(0).map((_, i) => new U8(i));
    const messageHash = new Array(32).fill(0).map((_, i) => new U8(i));

    const inputs = {
      // Sender with blacklisted address
      old_sender_account: {
        address: new FixedSizeArray(
          20,
          new Array(20).fill(0).map(() => new U8(0))
        ),
        balance: new Field(parseEther('100')),
        nonce: new U64(0n),
        code_hash: new FixedSizeArray(
          32,
          new Array(32).fill(0).map(() => new U8(0))
        ),
        storage_hash: new FixedSizeArray(
          32,
          new Array(32).fill(0).map(() => new U8(0))
        ),
      },
      new_sender_account: {
        address: new FixedSizeArray(
          20,
          new Array(20).fill(0).map(() => new U8(0))
        ),
        balance: new Field(parseEther('99')),
        nonce: new U64(1n),
        code_hash: new FixedSizeArray(
          32,
          new Array(32).fill(0).map(() => new U8(0))
        ),
        storage_hash: new FixedSizeArray(
          32,
          new Array(32).fill(0).map(() => new U8(0))
        ),
      },
      // Receiver with real account data
      old_receiver_account: receiverAccountData.account,
      new_receiver_account: receiverAccountData.account,

      // Transaction
      tx: {
        from: new FixedSizeArray(
          20,
          new Array(20).fill(0).map(() => new U8(0))
        ),
        to: parseAddress(toAddr),
        value: new Field(parseEther('1')),
        nonce: new U64(0n),
      },

      // SVF inputs
      public_key_x: new FixedSizeArray(32, publicKeyX),
      public_key_y: new FixedSizeArray(32, publicKeyY),
      signature: new FixedSizeArray(64, signature),
      message_hash: new FixedSizeArray(32, messageHash),

      // RVF inputs - use mock proofs for sender (won't matter since AF will fail first)
      old_sender_proof: receiverAccountData.account_proof,
      old_sender_state_root: receiverAccountData.state_root,
      new_sender_proof: receiverAccountData.account_proof,
      new_sender_state_root: receiverAccountData.state_root,

      // RVF inputs for receiver
      old_receiver_proof: receiverAccountData.account_proof,
      old_receiver_state_root: receiverAccountData.state_root,
      new_receiver_proof: receiverAccountData.account_proof,
      new_receiver_state_root: receiverAccountData.state_root,
    };

    try {
      const parsedInputs = toCircuitInputs(inputs);
      await prover.fullProve(parsedInputs, { type: 'honk' });
      expect(false).toBe(true); // Should not reach here
    } catch (error) {
      expect(error).toBeDefined(); // Expected to fail due to blacklisted address
    }
  });
});
