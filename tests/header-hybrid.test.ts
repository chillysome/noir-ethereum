import { beforeAll, describe, expect, it } from 'vitest';

import { Prover, toCircuitInputs } from '@zkpersona/noir-helpers';

import circuit from '../target/verify_header.json' assert { type: 'json' };

import os from 'node:os';
import type { CompiledCircuit } from '@noir-lang/noir_js';
import { http, type PublicClient, createPublicClient } from 'viem';
import { mainnet } from 'viem/chains';
import { getBlockHeader } from '../src';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

describe('Header Verification (Hybrid: @zkpersona/noir-helpers + bb CLI)', () => {
  let prover: Prover;
  let publicClient: PublicClient;

  const bbPath = '/root/.bb/bb';
  const circuitPath = path.join(process.cwd(), 'target/verify_header.json');
  const outputDir = path.join(process.cwd(), 'target/verify_header');
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

  it('should verify block header using hybrid approach', async () => {
    console.time('total-test-time');

    const inputs = await getBlockHeader(publicClient, {});
    const parsedInputs = toCircuitInputs(inputs);

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
    // bb verify looks for public_inputs in ./target/public_inputs by default
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
    console.log('✅ Block header verified successfully (Hybrid approach)');
  });
});
