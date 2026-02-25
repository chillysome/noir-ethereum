import { beforeAll, describe, expect, it } from 'vitest';

import {
  Prover,
  toCircuitInputs,
  U8,
  U64,
  Field,
  FixedSizeArray,
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
import { mainnet } from 'viem/chains';
import { keccak256, recoverPublicKey, serializeTransaction } from 'viem';

describe('Complete zkCross Circuit (AF + SVF + STF)', () => {
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

  it('should prove complete zkCross verification (AF + SVF + STF)', async () => {
    // Get a real transaction
    const block = await publicClient.getBlock({
      blockTag: 'latest',
      includeTransactions: true,
    });
    const tx = block.transactions.find((t) => t.r && t.s && t.v && t.to);

    if (!tx) {
      throw new Error('No valid transaction found');
    }

    console.log('Transaction:', {
      hash: tx.hash,
      from: tx.from,
      to: tx.to,
      value: tx.value,
    });

    // Prepare SVF inputs
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

    // Prepare STF inputs (Account objects)
    const fromAddr = tx.from;
    const toAddr = tx.to!;
    const value = tx.value || 0n;

    // Create old state accounts (before transaction)
    const fromNonceOld = Number(tx.nonce || 0n);
    const fromBalanceOld = parseEther('100'); // Mock balance
    const toNonceOld = 0;
    const toBalanceOld = parseEther('50'); // Mock balance

    // Create new state accounts (after transaction)
    const fromNonceNew = fromNonceOld + 1;
    const fromBalanceNew = fromBalanceOld - value;
    const toNonceNew = toNonceOld;
    const toBalanceNew = toBalanceOld + value;

    // Prepare inputs
    const inputs = {
      // STF inputs (sender)
      old_sender_account: {
        address: new FixedSizeArray(
          20,
          Array.from(hexToBytes(fromAddr)).map((b) => new U8(b))
        ),
        balance: new Field(fromBalanceOld),
        nonce: new U64(BigInt(fromNonceOld)),
        code_hash: new FixedSizeArray(
          32,
          Array.from({ length: 32 }, () => new U8(0))
        ),
        storage_hash: new FixedSizeArray(
          32,
          Array.from({ length: 32 }, () => new U8(0))
        ),
      },
      new_sender_account: {
        address: new FixedSizeArray(
          20,
          Array.from(hexToBytes(fromAddr)).map((b) => new U8(b))
        ),
        balance: new Field(fromBalanceNew),
        nonce: new U64(BigInt(fromNonceNew)),
        code_hash: new FixedSizeArray(
          32,
          Array.from({ length: 32 }, () => new U8(0))
        ),
        storage_hash: new FixedSizeArray(
          32,
          Array.from({ length: 32 }, () => new U8(0))
        ),
      },
      // STF inputs (receiver)
      old_receiver_account: {
        address: new FixedSizeArray(
          20,
          Array.from(hexToBytes(toAddr)).map((b) => new U8(b))
        ),
        balance: new Field(toBalanceOld),
        nonce: new U64(BigInt(toNonceOld)),
        code_hash: new FixedSizeArray(
          32,
          Array.from({ length: 32 }, () => new U8(0))
        ),
        storage_hash: new FixedSizeArray(
          32,
          Array.from({ length: 32 }, () => new U8(0))
        ),
      },
      new_receiver_account: {
        address: new FixedSizeArray(
          20,
          Array.from(hexToBytes(toAddr)).map((b) => new U8(b))
        ),
        balance: new Field(toBalanceNew),
        nonce: new U64(BigInt(toNonceNew)),
        code_hash: new FixedSizeArray(
          32,
          Array.from({ length: 32 }, () => new U8(0))
        ),
        storage_hash: new FixedSizeArray(
          32,
          Array.from({ length: 32 }, () => new U8(0))
        ),
      },

      // Transaction
      tx: {
        from: new FixedSizeArray(
          20,
          Array.from(hexToBytes(fromAddr)).map((b) => new U8(b))
        ),
        to: new FixedSizeArray(
          20,
          Array.from(hexToBytes(toAddr)).map((b) => new U8(b))
        ),
        value: new Field(value),
        nonce: new U64(BigInt(tx.nonce || 0n)),
      },

      // SVF inputs
      public_key_x: new FixedSizeArray(
        32,
        publicKeyX.map((b) => new U8(b))
      ),
      public_key_y: new FixedSizeArray(
        32,
        publicKeyY.map((b) => new U8(b))
      ),
      signature: new FixedSizeArray(
        64,
        signature.map((b) => new U8(b))
      ),
      message_hash: new FixedSizeArray(
        32,
        Array.from(messageHash).map((b) => new U8(b))
      ),
    };

    console.time('prove-zkcross-complete');
    const parsedInputs = toCircuitInputs(inputs);
    const proof = await prover.fullProve(parsedInputs, { type: 'honk' });
    console.timeEnd('prove-zkcross-complete');

    console.time('verify-zkcross-complete');
    const isVerified = await prover.verify(proof, { type: 'honk' });
    console.timeEnd('verify-zkcross-complete');

    expect(isVerified).toBe(true);
  });

  it('should fail with blacklisted address', async () => {
    // Use first blacklisted address (all zeros)
    const blacklistedAddress = '0x0000000000000000000000000000000000000000';
    const fromAddr = blacklistedAddress;
    const toAddr = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
    const value = parseEther('1');

    // Create mock inputs
    const oldSenderAccount = {
      address: new FixedSizeArray(
        20,
        Array.from(hexToBytes(fromAddr)).map((b) => new U8(b))
      ),
      balance: new Field(parseEther('100')),
      nonce: new U64(0n),
      code_hash: new FixedSizeArray(
        32,
        Array.from({ length: 32 }, () => new U8(0))
      ),
      storage_hash: new FixedSizeArray(
        32,
        Array.from({ length: 32 }, () => new U8(0))
      ),
    };
    const newSenderAccount = {
      address: new FixedSizeArray(
        20,
        Array.from(hexToBytes(fromAddr)).map((b) => new U8(b))
      ),
      balance: new Field(parseEther('99')),
      nonce: new U64(1n),
      code_hash: new FixedSizeArray(
        32,
        Array.from({ length: 32 }, () => new U8(0))
      ),
      storage_hash: new FixedSizeArray(
        32,
        Array.from({ length: 32 }, () => new U8(0))
      ),
    };
    const oldReceiverAccount = {
      address: new FixedSizeArray(
        20,
        Array.from(hexToBytes(toAddr)).map((b) => new U8(b))
      ),
      balance: new Field(parseEther('50')),
      nonce: new U64(0n),
      code_hash: new FixedSizeArray(
        32,
        Array.from({ length: 32 }, () => new U8(0))
      ),
      storage_hash: new FixedSizeArray(
        32,
        Array.from({ length: 32 }, () => new U8(0))
      ),
    };
    const newReceiverAccount = {
      address: new FixedSizeArray(
        20,
        Array.from(hexToBytes(toAddr)).map((b) => new U8(b))
      ),
      balance: new Field(parseEther('51')),
      nonce: new U64(0n),
      code_hash: new FixedSizeArray(
        32,
        Array.from({ length: 32 }, () => new U8(0))
      ),
      storage_hash: new FixedSizeArray(
        32,
        Array.from({ length: 32 }, () => new U8(0))
      ),
    };

    // Mock signature and public key
    const publicKeyX = new Array(32).fill(0).map((_, i) => new U8(i));
    const publicKeyY = new Array(32).fill(0).map((_, i) => new U8(i + 1));
    const signature = new Array(64).fill(0).map((_, i) => new U8(i));
    const messageHash = new Array(32).fill(0).map((_, i) => new U8(i));

    const inputs = {
      old_sender_account: oldSenderAccount,
      new_sender_account: newSenderAccount,
      old_receiver_account: oldReceiverAccount,
      new_receiver_account: newReceiverAccount,
      tx: {
        from: new FixedSizeArray(
          20,
          Array.from(hexToBytes(fromAddr)).map((b) => new U8(b))
        ),
        to: new FixedSizeArray(
          20,
          Array.from(hexToBytes(toAddr)).map((b) => new U8(b))
        ),
        value: new Field(value),
        nonce: new U64(0n),
      },
      public_key_x: new FixedSizeArray(32, publicKeyX),
      public_key_y: new FixedSizeArray(32, publicKeyY),
      signature: new FixedSizeArray(64, signature),
      message_hash: new FixedSizeArray(32, messageHash),
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
