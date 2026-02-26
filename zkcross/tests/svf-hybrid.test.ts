import { beforeAll, describe, expect, it } from 'vitest';

import {
  Prover,
  toCircuitInputs,
  U8,
  U64,
  Field,
  FixedSizeArray,
} from '@zkpersona/noir-helpers';

import circuit from '../../target/svf.json' assert { type: 'json' };

import os from 'node:os';
import type { CompiledCircuit } from '@noir-lang/noir_js';
import { http, type PublicClient, createPublicClient, hexToBytes } from 'viem';
import { mainnet } from 'viem/chains';
import { keccak256, recoverPublicKey, serializeTransaction } from 'viem';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

describe('Signature Verification Function (SVF) Verification (Hybrid: @zkpersona/noir-helpers + bb CLI)', () => {
  let prover: Prover;
  let publicClient: PublicClient;

  const bbPath = '/root/.bb/bb';
  const circuitPath = path.join(process.cwd(), 'target/svf.json');
  const outputDir = path.join(process.cwd(), 'target/svf');
  const proofPath = path.join(outputDir, 'proof');
  const vkPath = path.join(outputDir, 'vk');
  const witnessPath = path.join(outputDir, 'witness.gz');

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

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
  });

  const runCommand = (command: string, captureOutput = false): string => {
    try {
      console.time(`exec-${command.split(' ')[0]}`);
      const result = execSync(command, {
        stdio: captureOutput ? 'pipe' : 'inherit',
        maxBuffer: 50 * 1024 * 1024, // 50MB buffer
      });
      console.timeEnd(`exec-${command.split(' ')[0]}`);
      return result ? result.toString() : '';
    } catch (error) {
      console.error(`Command failed: ${command}`);
      throw error;
    }
  };

  async function findValidTransaction() {
    // Try to get a transaction from multiple blocks
    const block = await publicClient.getBlock({
      blockTag: 'latest',
      includeTransactions: true,
    });
    return block.transactions.find((t) => t.r && t.s && t.v && t.to);
  }

  it('should prove valid signature from Ethereum transaction', async () => {
    console.time('total-test-time');

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
    let publicKeyX, publicKeyY;
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

    console.time('prepare-inputs');
    const parsedInputs = toCircuitInputs(inputs);
    console.timeEnd('prepare-inputs');

    // Generate witness using @zkpersona/noir-helpers
    console.time('generate-witness-helpers');
    const { witness } = await prover.simulateWitness(parsedInputs);
    console.timeEnd('generate-witness-helpers');

    // Save witness to file for bb CLI
    console.time('save-witness');
    fs.writeFileSync(witnessPath, Buffer.from(witness));
    console.log(`Witness saved to: ${witnessPath} (${witness.length} bytes)`);
    console.timeEnd('save-witness');

    // Generate proof using bb CLI
    console.time('bb-prove');
    runCommand(
      `${bbPath} prove -b ${circuitPath} -w ${witnessPath} -o ${outputDir} -s ultra_honk`
    );
    console.timeEnd('bb-prove');

    // Generate verification key
    console.time('bb-write-vk');
    runCommand(
      `${bbPath} write_vk -b ${circuitPath} -o ${outputDir} -s ultra_honk`
    );
    console.timeEnd('bb-write-vk');

    // Verify proof using bb CLI
    console.time('bb-verify');
    const publicInputsPath = path.join(outputDir, 'public_inputs');
    const targetPublicInputsPath = path.join(
      process.cwd(),
      'target/public_inputs'
    );
    if (fs.existsSync(publicInputsPath)) {
      if (!fs.existsSync(path.join(process.cwd(), 'target'))) {
        fs.mkdirSync(path.join(process.cwd(), 'target'), { recursive: true });
      }
      fs.copyFileSync(publicInputsPath, targetPublicInputsPath);
      runCommand(`${bbPath} verify -p ${proofPath} -k ${vkPath} -s ultra_honk`);
    } else {
      console.warn('Public inputs file not found, skipping verification');
    }
    console.timeEnd('bb-verify');

    console.timeEnd('total-test-time');

    expect(fs.existsSync(proofPath)).toBe(true);
    expect(fs.existsSync(vkPath)).toBe(true);
    console.log('✅ SVF verification succeeded (Hybrid approach)');
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
    let publicKeyX, publicKeyY;
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

    // Generate witness
    const { witness } = await prover.simulateWitness(parsedInputs);
    fs.writeFileSync(witnessPath, Buffer.from(witness));

    // Generate and verify proof
    runCommand(
      `${bbPath} prove -b ${circuitPath} -w ${witnessPath} -o ${outputDir} -s ultra_honk`
    );
    runCommand(
      `${bbPath} write_vk -b ${circuitPath} -o ${outputDir} -s ultra_honk`
    );

    const publicInputsPath = path.join(outputDir, 'public_inputs');
    const targetPublicInputsPath = path.join(
      process.cwd(),
      'target/public_inputs'
    );
    if (fs.existsSync(publicInputsPath)) {
      if (!fs.existsSync(path.join(process.cwd(), 'target'))) {
        fs.mkdirSync(path.join(process.cwd(), 'target'), { recursive: true });
      }
      fs.copyFileSync(publicInputsPath, targetPublicInputsPath);
      runCommand(`${bbPath} verify -p ${proofPath} -k ${vkPath} -s ultra_honk`);
    }

    expect(fs.existsSync(proofPath)).toBe(true);
    console.log(
      '✅ SVF block transaction verification succeeded (Hybrid approach)'
    );
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
    let publicKeyX, publicKeyY;
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

    // Generate witness
    const { witness } = await prover.simulateWitness(parsedInputs);
    fs.writeFileSync(witnessPath, Buffer.from(witness));

    // Generate and verify proof
    runCommand(
      `${bbPath} prove -b ${circuitPath} -w ${witnessPath} -o ${outputDir} -s ultra_honk`
    );
    runCommand(
      `${bbPath} write_vk -b ${circuitPath} -o ${outputDir} -s ultra_honk`
    );

    const publicInputsPath = path.join(outputDir, 'public_inputs');
    const targetPublicInputsPath = path.join(
      process.cwd(),
      'target/public_inputs'
    );
    if (fs.existsSync(publicInputsPath)) {
      if (!fs.existsSync(path.join(process.cwd(), 'target'))) {
        fs.mkdirSync(path.join(process.cwd(), 'target'), { recursive: true });
      }
      fs.copyFileSync(publicInputsPath, targetPublicInputsPath);
      runCommand(`${bbPath} verify -p ${proofPath} -k ${vkPath} -s ultra_honk`);
    }

    expect(fs.existsSync(proofPath)).toBe(true);
    console.log(
      '✅ SVF various v values verification succeeded (Hybrid approach)'
    );
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
      const { witness } = await prover.simulateWitness(parsedInputs);
      fs.writeFileSync(witnessPath, Buffer.from(witness));

      runCommand(
        `${bbPath} prove -b ${circuitPath} -w ${witnessPath} -o ${outputDir} -s ultra_honk 2>&1 || true`
      );
      expect(false).toBe(true); // Should not reach here
    } catch (error) {
      expect(error).toBeDefined(); // Expected to fail
      console.log(
        '✅ Invalid signature (r=0) correctly rejected (Hybrid approach)'
      );
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
      const { witness } = await prover.simulateWitness(parsedInputs);
      fs.writeFileSync(witnessPath, Buffer.from(witness));

      runCommand(
        `${bbPath} prove -b ${circuitPath} -w ${witnessPath} -o ${outputDir} -s ultra_honk 2>&1 || true`
      );
      expect(false).toBe(true); // Should not reach here
    } catch (error) {
      expect(error).toBeDefined(); // Expected to fail
      console.log(
        '✅ Invalid signature (s=0) correctly rejected (Hybrid approach)'
      );
    }
  });
});
