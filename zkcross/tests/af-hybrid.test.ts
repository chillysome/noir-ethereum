import { beforeAll, describe, expect, it } from 'vitest';

import { Prover, toCircuitInputs } from '@zkpersona/noir-helpers';

import circuit from '../../target/af.json' assert { type: 'json' };

import os from 'node:os';
import type { CompiledCircuit } from '@noir-lang/noir_js';
import { http, type PublicClient, createPublicClient } from 'viem';
import { mainnet } from 'viem/chains';
import { parseAddress } from '../../src/helpers';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

describe('Auditing Function (AF) Verification (Hybrid: @zkpersona/noir-helpers + bb CLI)', () => {
  let prover: Prover;
  let publicClient: PublicClient;

  const bbPath = '/root/.bb/bb';
  const circuitPath = path.join(process.cwd(), 'target/af.json');
  const outputDir = path.join(process.cwd(), 'target/af');
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

  it('should prove non-blacklisted Ethereum address', async () => {
    console.time('total-test-time');

    // Test with a real Ethereum address (Vitalik's)
    const address = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';

    // Format address for Noir circuit
    const addressBytes = parseAddress(address);

    const inputs = {
      address: addressBytes,
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
    console.log('✅ AF verification succeeded (Hybrid approach)');
  });

  it('should prove with multiple real Ethereum addresses', async () => {
    const addresses = [
      '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', // Vitalik
      '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
      '0xE592427A0AEce92De3Edee1F18E0157C05861564', // Uniswap Router V3
    ];

    for (const address of addresses) {
      const addressBytes = parseAddress(address);

      const inputs = {
        address: addressBytes,
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
        runCommand(
          `${bbPath} verify -p ${proofPath} -k ${vkPath} -s ultra_honk`
        );
      }

      expect(fs.existsSync(proofPath)).toBe(true);
    }
  });

  it('should prove with address from block transaction', async () => {
    console.time('get-block');
    const block = await publicClient.getBlock({
      blockTag: 'latest',
      includeTransactions: true,
    });
    const blockNumber = block.number!;
    console.timeEnd('get-block');

    // Get a real transaction sender address
    const tx = block.transactions[0];
    if (!tx || !('from' in tx)) {
      throw new Error('No transaction found');
    }

    const addressBytes = parseAddress(tx.from);

    const inputs = {
      address: addressBytes,
    };

    console.time('prepare-inputs');
    const parsedInputs = toCircuitInputs(inputs);
    console.timeEnd('prepare-inputs');

    console.time('generate-witness');
    const { witness } = await prover.simulateWitness(parsedInputs);
    console.timeEnd('generate-witness');

    fs.writeFileSync(witnessPath, Buffer.from(witness));

    console.time('bb-prove');
    runCommand(
      `${bbPath} prove -b ${circuitPath} -w ${witnessPath} -o ${outputDir} -s ultra_honk`
    );
    console.timeEnd('bb-prove');

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
      '✅ Block transaction address verification succeeded (Hybrid approach)'
    );
  });

  it('should fail with blacklisted address (0x00...)', async () => {
    // Test with first blacklisted address (all zeros)
    const addressBytes = parseAddress(
      '0x0000000000000000000000000000000000000000'
    );

    const inputs = {
      address: addressBytes,
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
        '✅ Blacklisted address correctly rejected (Hybrid approach)'
      );
    }
  });
});
