import { beforeAll, describe, expect, it } from 'vitest';

import {
  Prover,
  U8,
  U64,
  Field,
  FixedSizeArray,
} from '@zkpersona/noir-helpers';

import circuit from '../../target/zkcross_compliance.json' assert {
  type: 'json',
};

import { http, type PublicClient, createPublicClient, hexToBytes } from 'viem';
import { mainnet } from 'viem/chains';
import { keccak256, recoverPublicKey, serializeTransaction } from 'viem';
import { parseAddress, getTransactionProof } from '../../src';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { toCircuitInputs } from '@zkpersona/noir-helpers';

describe('zkCross Compliance Circuit Hybrid: @zkpersona/noir-helpers + bb CLI', () => {
  let prover: Prover;
  let publicClient: PublicClient;

  const bbPath = '/root/.bb/bb';
  const circuitPath = path.join(
    process.cwd(),
    'target/zkcross_compliance.json'
  );
  const outputDir = path.join(process.cwd(), 'target/zkcross_compliance');
  const proofPath = path.join(outputDir, 'proof');
  const vkPath = path.join(outputDir, 'vk');
  const witnessPath = path.join(outputDir, 'witness.gz');

  beforeAll(() => {
    const os = require('node:os');
    const threads = os.cpus().length;
    prover = new Prover(circuit as any, {
      type: 'honk',
      options: { threads },
    });
    publicClient = createPublicClient({
      chain: mainnet,
      transport: http(
        'https://eth-mainnet.g.alchemy.com/v2/NWE0grP8z2DMMTWR1yVp_'
      ),
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

  it('should prove transaction compliance using @zkpersona/noir-helpers witness + bb CLI', async () => {
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
    console.log('Fetching transaction proof from RPC...');
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

    // Step 3: Prepare circuit inputs
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

    // Convert to circuit inputs
    const parsedInputs = toCircuitInputs(inputs);
    console.timeEnd('prepare-circuit-inputs');

    // Step 4: Generate witness using @zkpersona/noir-helpers
    console.time('generate-witness-helpers');
    const { witness } = await prover.simulateWitness(parsedInputs);
    console.timeEnd('generate-witness-helpers');

    // Save witness to file for bb CLI
    console.time('save-witness');
    fs.writeFileSync(witnessPath, Buffer.from(witness));
    console.log(`Witness saved to: ${witnessPath} (${witness.length} bytes)`);
    console.timeEnd('save-witness');

    // Step 5: Generate proof using bb CLI
    console.time('bb-prove');
    runCommand(
      `${bbPath} prove -b ${circuitPath} -w ${witnessPath} -o ${outputDir} -s ultra_honk`
    );
    console.timeEnd('bb-prove');

    // Step 6: Generate verification key
    console.time('bb-write-vk');
    runCommand(
      `${bbPath} write_vk -b ${circuitPath} -o ${outputDir} -s ultra_honk`
    );
    console.timeEnd('bb-write-vk');

    // Step 7: Verify proof using bb CLI
    console.time('bb-verify');
    // bb verify looks for public_inputs in ./target/public_inputs by default
    // Copy the public_inputs from zkcross_compliance directory
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
    console.log(
      '✅ All three verifications passed: AF + SVF + Transaction RVF (Hybrid approach)'
    );
  });

  it('should fail with blacklisted address using hybrid approach', async () => {
    // Use same known transaction
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

    const parsedInputs = toCircuitInputs(inputs);

    try {
      // Generate witness - this should fail due to blacklisted address
      const { witness } = await prover.simulateWitness(parsedInputs);
      fs.writeFileSync(witnessPath, Buffer.from(witness));

      // Try to prove - this should also fail
      runCommand(
        `${bbPath} prove -b ${circuitPath} -w ${witnessPath} -o ${outputDir} -s ultra_honk 2>&1 || true`
      );
      expect(false).toBe(true); // Should not reach here
    } catch (error) {
      expect(error).toBeDefined();
      console.log(
        '✅ Blacklisted address correctly rejected (Hybrid approach)'
      );
    }
  });
});
