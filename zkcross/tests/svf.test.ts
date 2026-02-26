import { beforeAll, describe, expect, it } from 'vitest';

import {
  Field,
  FixedSizeArray,
  Prover,
  U8,
  U64,
  toCircuitInputs,
} from '@zkpersona/noir-helpers';

import circuit from '../../target/svf.json' assert { type: 'json' };

import os from 'node:os';
import type { CompiledCircuit } from '@noir-lang/noir_js';
import { http, type PublicClient, createPublicClient, hexToBytes } from 'viem';
import { keccak256, recoverPublicKey, serializeTransaction } from 'viem';
import { mainnet } from 'viem/chains';

describe('Signature Verification Function (SVF) Verification', () => {
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

  async function findValidTransaction() {
    // Try to get a transaction from multiple blocks
    const block = await publicClient.getBlock({
      blockTag: 'latest',
      includeTransactions: true,
    });
    return block.transactions.find((t) => t.r && t.s && t.v && t.to);
  }

  it('should prove valid signature from Ethereum transaction', async () => {
    const tx = await findValidTransaction();
    if (!tx) {
      throw new Error('No valid transaction found in block');
    }

    console.log('Transaction:', { hash: tx.hash, type: tx.type, v: tx.v });

    // Convert signature values to byte arrays
    const rBytes = hexToBytes(tx.r as `0x${string}`);
    const sBytes = hexToBytes(tx.s as `0x${string}`);

    // Pad to 32 bytes each
    const rPadded =
      rBytes.length === 32
        ? [...rBytes]
        : [...rBytes, ...new Array(32 - rBytes.length).fill(0)];
    const sPadded =
      sBytes.length === 32
        ? [...sBytes]
        : [...sBytes, ...new Array(32 - sBytes.length).fill(0)];

    // Combine r and s into 64-byte signature
    const signature = [...rPadded, ...sPadded];

    // Compute message hash (hash of the serialized transaction)
    const serializedTx = serializeTransaction(tx);
    const messageHash = hexToBytes(keccak256(serializedTx));

    console.log('Serialized tx length:', serializedTx.length);
    console.log('Message hash:', keccak256(serializedTx));

    // Recover public key from signature (returns hex string)
    const publicKeyHex = await recoverPublicKey({
      hash: messageHash as `0x${string}`,
      signature: {
        r: tx.r as `0x${string}`,
        s: tx.s as `0x${string}`,
        yParity: Number(((tx.v as bigint) - 27n) % 2n),
      },
    });

    const publicKey = hexToBytes(publicKeyHex);

    console.log('Public key length:', publicKey.length);
    console.log('Public key:', publicKeyHex);

    // Parse public key (65 bytes: 0x04 + x[32] + y[32] OR 33 bytes compressed)
    let publicKeyX;
    let publicKeyY;
    if (publicKey.length === 65) {
      // Uncompressed format
      publicKeyX = publicKey.slice(1, 33);
      publicKeyY = publicKey.slice(33, 65);
    } else if (publicKey.length === 33) {
      // Compressed format - need to decompress
      throw new Error(
        'Compressed public key not supported, need 65-byte uncompressed format'
      );
    } else {
      throw new Error(
        `Invalid public key length: ${publicKey.length}, expected 65 bytes`
      );
    }

    // Convert to arrays
    const publicKeyXArr = Array.from(publicKeyX).map((b) => b as number);
    const publicKeyYArr = Array.from(publicKeyY).map((b) => b as number);

    const inputs = {
      public_key_x: new FixedSizeArray(
        32,
        publicKeyXArr.map((b) => new U8(b))
      ),
      public_key_y: new FixedSizeArray(
        32,
        publicKeyYArr.map((b) => new U8(b))
      ),
      signature: new FixedSizeArray(
        64,
        signature.map((b) => new U8(b))
      ),
      message_hash: new FixedSizeArray(
        32,
        Array.from(messageHash).map((b) => new U8(b))
      ),
      tx: {
        from: new FixedSizeArray(
          20,
          Array.from(hexToBytes(tx.from)).map((b) => new U8(b))
        ),
        to: new FixedSizeArray(
          20,
          Array.from(hexToBytes(tx.to!)).map((b) => new U8(b))
        ),
        value: new Field(tx.value || 0n),
        nonce: new U64(tx.nonce || 0n),
      },
    };

    console.time('prove-svf-real-tx');
    const parsedInputs = toCircuitInputs(inputs);
    const proof = await prover.fullProve(parsedInputs, { type: 'honk' });
    console.timeEnd('prove-svf-real-tx');

    console.time('verify-svf-real-tx');
    const isVerified = await prover.verify(proof, { type: 'honk' });
    console.timeEnd('verify-svf-real-tx');

    expect(isVerified).toBe(true);
  });

  it('should prove valid signature from block', async () => {
    const tx = await findValidTransaction();
    if (!tx) {
      throw new Error('No valid transaction found');
    }

    // Convert signature values to byte arrays
    const rBytes = hexToBytes(tx.r as `0x${string}`);
    const sBytes = hexToBytes(tx.s as `0x${string}`);

    // Pad to 32 bytes each
    const rPadded =
      rBytes.length === 32
        ? [...rBytes]
        : [...rBytes, ...new Array(32 - rBytes.length).fill(0)];
    const sPadded =
      sBytes.length === 32
        ? [...sBytes]
        : [...sBytes, ...new Array(32 - sBytes.length).fill(0)];

    // Combine r and s into 64-byte signature
    const signature = [...rPadded, ...sPadded];

    // Compute message hash (hash of the serialized transaction)
    const serializedTx = serializeTransaction(tx);
    const messageHash = hexToBytes(keccak256(serializedTx));

    // Recover public key from signature (returns hex string)
    const publicKeyHex = await recoverPublicKey({
      hash: messageHash as `0x${string}`,
      signature: {
        r: tx.r as `0x${string}`,
        s: tx.s as `0x${string}`,
        yParity: Number(((tx.v as bigint) - 27n) % 2n),
      },
    });

    const publicKey = hexToBytes(publicKeyHex);

    console.log('Public key length:', publicKey.length);

    // Parse public key (65 bytes: 0x04 + x[32] + y[32] OR 33 bytes compressed)
    let publicKeyX;
    let publicKeyY;
    if (publicKey.length === 65) {
      // Uncompressed format
      publicKeyX = publicKey.slice(1, 33);
      publicKeyY = publicKey.slice(33, 65);
    } else if (publicKey.length === 33) {
      // Compressed format - need to decompress
      throw new Error(
        'Compressed public key not supported, need 65-byte uncompressed format'
      );
    } else {
      throw new Error(
        `Invalid public key length: ${publicKey.length}, expected 65 bytes`
      );
    }

    // Convert to arrays
    const publicKeyXArr = Array.from(publicKeyX).map((b) => b as number);
    const publicKeyYArr = Array.from(publicKeyY).map((b) => b as number);

    const inputs = {
      public_key_x: new FixedSizeArray(
        32,
        publicKeyXArr.map((b) => new U8(b))
      ),
      public_key_y: new FixedSizeArray(
        32,
        publicKeyYArr.map((b) => new U8(b))
      ),
      signature: new FixedSizeArray(
        64,
        signature.map((b) => new U8(b))
      ),
      message_hash: new FixedSizeArray(
        32,
        Array.from(messageHash).map((b) => new U8(b))
      ),
      tx: {
        from: new FixedSizeArray(
          20,
          Array.from(hexToBytes(tx.from)).map((b) => new U8(b))
        ),
        to: new FixedSizeArray(
          20,
          Array.from(hexToBytes(tx.to!)).map((b) => new U8(b))
        ),
        value: new Field(tx.value || 0n),
        nonce: new U64(tx.nonce || 0n),
      },
    };

    const parsedInputs = toCircuitInputs(inputs);
    const proof = await prover.fullProve(parsedInputs, { type: 'honk' });
    const isVerified = await prover.verify(proof, { type: 'honk' });

    expect(isVerified).toBe(true);
  });

  it('should prove with various v values', async () => {
    const tx = await findValidTransaction();
    if (!tx) {
      throw new Error('No valid transaction found');
    }

    // Convert signature values to byte arrays
    const rBytes = hexToBytes(tx.r as `0x${string}`);
    const sBytes = hexToBytes(tx.s as `0x${string}`);

    // Pad to 32 bytes each
    const rPadded =
      rBytes.length === 32
        ? [...rBytes]
        : [...rBytes, ...new Array(32 - rBytes.length).fill(0)];
    const sPadded =
      sBytes.length === 32
        ? [...sBytes]
        : [...sBytes, ...new Array(32 - sBytes.length).fill(0)];

    // Combine r and s into 64-byte signature
    const signature = [...rPadded, ...sPadded];

    // Compute message hash (hash of the serialized transaction)
    const serializedTx = serializeTransaction(tx);
    const messageHash = hexToBytes(keccak256(serializedTx));

    // Recover public key from signature (returns hex string)
    const publicKeyHex = await recoverPublicKey({
      hash: messageHash as `0x${string}`,
      signature: {
        r: tx.r as `0x${string}`,
        s: tx.s as `0x${string}`,
        yParity: Number(((tx.v as bigint) - 27n) % 2n),
      },
    });

    const publicKey = hexToBytes(publicKeyHex);

    console.log('Public key length:', publicKey.length);

    // Parse public key (65 bytes: 0x04 + x[32] + y[32] OR 33 bytes compressed)
    let publicKeyX;
    let publicKeyY;
    if (publicKey.length === 65) {
      // Uncompressed format
      publicKeyX = publicKey.slice(1, 33);
      publicKeyY = publicKey.slice(33, 65);
    } else if (publicKey.length === 33) {
      // Compressed format - need to decompress
      throw new Error(
        'Compressed public key not supported, need 65-byte uncompressed format'
      );
    } else {
      throw new Error(
        `Invalid public key length: ${publicKey.length}, expected 65 bytes`
      );
    }

    // Convert to arrays
    const publicKeyXArr = Array.from(publicKeyX).map((b) => b as number);
    const publicKeyYArr = Array.from(publicKeyY).map((b) => b as number);

    const inputs = {
      public_key_x: new FixedSizeArray(
        32,
        publicKeyXArr.map((b) => new U8(b))
      ),
      public_key_y: new FixedSizeArray(
        32,
        publicKeyYArr.map((b) => new U8(b))
      ),
      signature: new FixedSizeArray(
        64,
        signature.map((b) => new U8(b))
      ),
      message_hash: new FixedSizeArray(
        32,
        Array.from(messageHash).map((b) => new U8(b))
      ),
      tx: {
        from: new FixedSizeArray(
          20,
          Array.from(hexToBytes(tx.from)).map((b) => new U8(b))
        ),
        to: new FixedSizeArray(
          20,
          Array.from(hexToBytes(tx.to!)).map((b) => new U8(b))
        ),
        value: new Field(tx.value || 0n),
        nonce: new U64(tx.nonce || 0n),
      },
    };

    const parsedInputs = toCircuitInputs(inputs);
    const proof = await prover.fullProve(parsedInputs, { type: 'honk' });
    const isVerified = await prover.verify(proof, { type: 'honk' });

    expect(isVerified).toBe(true);
  });

  it('should fail with invalid signature (r=0)', async () => {
    const tx = await findValidTransaction();
    if (!tx) {
      throw new Error('No valid transaction found');
    }

    // Convert signature values to byte arrays
    const rBytes = hexToBytes(tx.r as `0x${string}`);
    const sBytes = hexToBytes(tx.s as `0x${string}`);

    // Pad to 32 bytes each but set r to all zeros (INVALID)
    const rPadded = new Array(32).fill(0);
    const sPadded =
      sBytes.length === 32
        ? [...sBytes]
        : [...sBytes, ...new Array(32 - sBytes.length).fill(0)];

    // Combine r and s into 64-byte signature (with invalid r)
    const signature = [...rPadded, ...sPadded];

    // Compute message hash (hash of the serialized transaction)
    const serializedTx = serializeTransaction(tx);
    const messageHash = hexToBytes(keccak256(serializedTx));

    // Recover public key from ORIGINAL signature (not modified)
    const publicKeyHex = await recoverPublicKey({
      hash: messageHash as `0x${string}`,
      signature: {
        r: tx.r as `0x${string}`,
        s: tx.s as `0x${string}`,
        yParity: Number(((tx.v as bigint) - 27n) % 2n),
      },
    });

    const publicKey = hexToBytes(publicKeyHex);

    // Parse public key (65 bytes: 0x04 + x[32] + y[32])
    const publicKeyX = publicKey.slice(1, 33);
    const publicKeyY = publicKey.slice(33, 65);

    // Convert to arrays
    const publicKeyXArr = Array.from(publicKeyX).map((b) => b as number);
    const publicKeyYArr = Array.from(publicKeyY).map((b) => b as number);
    const messageHashArr = Array.from(messageHash).map((b) => b as number);

    const inputs = {
      public_key_x: new FixedSizeArray(
        32,
        publicKeyXArr.map((b) => new U8(b))
      ),
      public_key_y: new FixedSizeArray(
        32,
        publicKeyYArr.map((b) => new U8(b))
      ),
      signature: new FixedSizeArray(
        64,
        signature.map((b) => new U8(b))
      ),
      message_hash: new FixedSizeArray(
        32,
        messageHashArr.map((b) => new U8(b))
      ),
      tx: {
        from: new FixedSizeArray(
          20,
          Array.from(hexToBytes(tx.from)).map((b) => new U8(b))
        ),
        to: new FixedSizeArray(
          20,
          Array.from(hexToBytes(tx.to!)).map((b) => new U8(b))
        ),
        value: new Field(tx.value || 0n),
        nonce: new U64(tx.nonce || 0n),
      },
    };

    try {
      const parsedInputs = toCircuitInputs(inputs);
      await prover.fullProve(parsedInputs, { type: 'honk' });
      expect(false).toBe(true); // Should not reach here
    } catch (error) {
      expect(error).toBeDefined(); // Expected to fail
    }
  });

  it('should fail with invalid signature (s=0)', async () => {
    const tx = await findValidTransaction();
    if (!tx) {
      throw new Error('No valid transaction found');
    }

    // Convert signature values to byte arrays
    const rBytes = hexToBytes(tx.r as `0x${string}`);
    const sBytes = hexToBytes(tx.s as `0x${string}`);

    // Pad to 32 bytes each but set s to all zeros (INVALID)
    const rPadded =
      rBytes.length === 32
        ? [...rBytes]
        : [...rBytes, ...new Array(32 - rBytes.length).fill(0)];
    const sPadded = new Array(32).fill(0);

    // Combine r and s into 64-byte signature (with invalid s)
    const signature = [...rPadded, ...sPadded];

    // Compute message hash (hash of the serialized transaction)
    const serializedTx = serializeTransaction(tx);
    const messageHash = hexToBytes(keccak256(serializedTx));

    // Recover public key from ORIGINAL signature (not modified)
    const publicKeyHex = await recoverPublicKey({
      hash: messageHash as `0x${string}`,
      signature: {
        r: tx.r as `0x${string}`,
        s: tx.s as `0x${string}`,
        yParity: Number(((tx.v as bigint) - 27n) % 2n),
      },
    });

    const publicKey = hexToBytes(publicKeyHex);

    // Parse public key (65 bytes: 0x04 + x[32] + y[32])
    const publicKeyX = publicKey.slice(1, 33);
    const publicKeyY = publicKey.slice(33, 65);

    // Convert to arrays
    const publicKeyXArr = Array.from(publicKeyX).map((b) => b as number);
    const publicKeyYArr = Array.from(publicKeyY).map((b) => b as number);
    const messageHashArr = Array.from(messageHash).map((b) => b as number);

    const inputs = {
      public_key_x: new FixedSizeArray(
        32,
        publicKeyXArr.map((b) => new U8(b))
      ),
      public_key_y: new FixedSizeArray(
        32,
        publicKeyYArr.map((b) => new U8(b))
      ),
      signature: new FixedSizeArray(
        64,
        signature.map((b) => new U8(b))
      ),
      message_hash: new FixedSizeArray(
        32,
        messageHashArr.map((b) => new U8(b))
      ),
      tx: {
        from: new FixedSizeArray(
          20,
          Array.from(hexToBytes(tx.from)).map((b) => new U8(b))
        ),
        to: new FixedSizeArray(
          20,
          Array.from(hexToBytes(tx.to!)).map((b) => new U8(b))
        ),
        value: new Field(tx.value || 0n),
        nonce: new U64(tx.nonce || 0n),
      },
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
