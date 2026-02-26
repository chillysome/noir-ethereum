import { beforeAll, describe, expect, it } from 'vitest';

import {
  Prover,
  toCircuitInputs,
  U8,
  U64,
  Field,
  FixedSizeArray,
} from '@zkpersona/noir-helpers';

import circuit from '../../target/zkcross_compliance.json' assert {
  type: 'json',
};

import os from 'node:os';
import type { CompiledCircuit } from '@noir-lang/noir_js';
import { http, type PublicClient, createPublicClient, hexToBytes } from 'viem';
import { mainnet } from 'viem/chains';
import { keccak256, recoverPublicKey, serializeTransaction } from 'viem';
import { parseAddress, getTransactionProof } from '../../src';

describe('zkCross Compliance Circuit (AF + SVF + Transaction RVF)', () => {
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

  it('should prove transaction compliance (AF + SVF + Transaction RVF)', async () => {
    console.time('total-test-time');

    // Use a specific known transaction (small size, faster to verify)
    const txHash =
      '0x63cb9d253446d34b2590c9cf06973f14063ede340b0ce19382bf9224f2adc2f5';

    console.time('fetch-transaction');
    const tx = await publicClient.getTransaction({ hash: txHash });
    console.timeEnd('fetch-transaction');

    if (!tx || !tx.r || !tx.s || !tx.v || !tx.to) {
      throw new Error('Invalid transaction');
    }

    console.log('Transaction:', {
      hash: tx.hash,
      from: tx.from,
      to: tx.to,
      value: tx.value,
      nonce: tx.nonce,
    });

    // Step 1: Prepare SVF inputs
    console.time('data-processing');
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
    console.timeEnd('data-processing');

    // Step 2: Prepare Transaction RVF inputs (network request)
    console.time('get-transaction-proof');
    const transactionProofData = await getTransactionProof(publicClient, {
      hash: tx.hash,
      maxLeafLength: 256,
      maxDataLength: 256,
      maxEncodedTransactionLength: 525,
      maxDepthNoLeaf: 4,
    });
    console.timeEnd('get-transaction-proof');

    console.log(
      'Transaction proof depth:',
      transactionProofData.transaction_proof.proof.depth
    );

    // Step 3: Prepare zkCross Transaction type
    console.time('prepare-circuit-inputs');
    const inputs = {
      tx: {
        from: parseAddress(tx.from),
        to: parseAddress(tx.to!),
        value: new Field(tx.value || 0n),
        nonce: new U64(tx.nonce || 0n),
      },

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

      transaction_index: transactionProofData.transaction_index,
      transaction_type: transactionProofData.transaction_type,
      transaction_partial: transactionProofData.transaction,
      transaction_proof: transactionProofData.transaction_proof,
      transaction_root: transactionProofData.transaction_root,
    };
    console.timeEnd('prepare-circuit-inputs');

    console.time('prove-zkcross-compliance');
    try {
      const parsedInputs = toCircuitInputs(inputs);
      console.log('Inputs converted successfully');
      console.time('pure-proof-generation');
      const proof = await prover.fullProve(parsedInputs, { type: 'honk' });
      console.timeEnd('pure-proof-generation');
      console.timeEnd('prove-zkcross-compliance');

      console.time('verify-zkcross-compliance');
      const isVerified = await prover.verify(proof, { type: 'honk' });
      console.timeEnd('verify-zkcross-compliance');

      console.timeEnd('total-test-time');

      expect(isVerified).toBe(true);
      console.log(
        '✅ All three verifications passed: AF + SVF + Transaction RVF'
      );
    } catch (error) {
      console.error('Error during proof generation:', error);
      throw error;
    }
  });

  it('should fail with blacklisted address', async () => {
    // Use the same known transaction
    const txHash =
      '0x63cb9d253446d34b2590c9cf06973f14063ede340b0ce19382bf9224f2adc2f5';
    const tx = await publicClient.getTransaction({ hash: txHash });

    if (!tx || !tx.r || !tx.s || !tx.v || !tx.to) {
      throw new Error('Invalid transaction');
    }

    // Prepare real SVF and RVF inputs
    const transactionProofData = await getTransactionProof(publicClient, {
      hash: tx.hash,
      maxLeafLength: 256,
      maxDataLength: 256,
      maxEncodedTransactionLength: 525,
      maxDepthNoLeaf: 4,
    });

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

    // Use blacklisted address (all zeros) for sender
    const blacklistedAddress = new FixedSizeArray(
      20,
      new Array(20).fill(0).map(() => new U8(0))
    );

    const inputs = {
      tx: {
        from: blacklistedAddress,
        to: parseAddress(tx.to!),
        value: new Field(tx.value || 0n),
        nonce: new U64(tx.nonce || 0n),
      },

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

      transaction_index: transactionProofData.transaction_index,
      transaction_type: transactionProofData.transaction_type,
      transaction_partial: transactionProofData.transaction,
      transaction_proof: transactionProofData.transaction_proof,
      transaction_root: transactionProofData.transaction_root,
    };

    try {
      const parsedInputs = toCircuitInputs(inputs);
      await prover.fullProve(parsedInputs, { type: 'honk' });
      expect(false).toBe(true); // Should not reach here
    } catch (error) {
      expect(error).toBeDefined();
      console.log('✅ Blacklisted address correctly rejected');
    }
  });
});
