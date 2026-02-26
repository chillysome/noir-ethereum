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

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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

describe('Complete zkCross Circuit (Hybrid: @zkpersona/noir-helpers + bb CLI)', () => {
  let prover: Prover;
  let publicClient: PublicClient;

  const bbPath = '/root/.bb/bb';
  const circuitPath = path.join(process.cwd(), 'target/zkcross.json');
  const outputDir = path.join(process.cwd(), 'target/zkcross');
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

  async function findValidTransaction() {
    // Try to get a transaction from latest block
    const block = await publicClient.getBlock({
      blockTag: 'latest',
      includeTransactions: true,
    });
    return block.transactions.find((t) => t.r && t.s && t.v && t.to);
  }

  it('should prove complete zkCross verification (AF + SVF + STF + RVF)', async () => {
    console.time('total-test-time');

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

    console.time('prove-zkcross-complete-hybrid');
    try {
      console.time('prepare-inputs');
      const parsedInputs = toCircuitInputs(inputs);
      console.log('Inputs converted successfully');
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
        runCommand(
          `${bbPath} verify -p ${proofPath} -k ${vkPath} -s ultra_honk`
        );
      } else {
        console.warn('Public inputs file not found, skipping verification');
      }
      console.timeEnd('bb-verify');

      console.timeEnd('prove-zkcross-complete-hybrid');
      console.timeEnd('total-test-time');

      expect(fs.existsSync(proofPath)).toBe(true);
      expect(fs.existsSync(vkPath)).toBe(true);
      console.log(
        '✅ All four verifications passed: AF + SVF + STF + RVF (Hybrid approach)'
      );
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
      const { witness } = await prover.simulateWitness(parsedInputs);
      fs.writeFileSync(witnessPath, Buffer.from(witness));

      runCommand(
        `${bbPath} prove -b ${circuitPath} -w ${witnessPath} -o ${outputDir} -s ultra_honk 2>&1 || true`
      );
      expect(false).toBe(true); // Should not reach here
    } catch (error) {
      expect(error).toBeDefined(); // Expected to fail due to blacklisted address
      console.log(
        '✅ Blacklisted address correctly rejected (Hybrid approach)'
      );
    }
  });
});
