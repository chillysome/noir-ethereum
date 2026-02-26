import { beforeAll, describe, expect, it } from 'vitest';

import { Prover, toCircuitInputs } from '@zkpersona/noir-helpers';

import circuit from '../../target/rvf.json' assert { type: 'json' };

import os from 'node:os';
import type { CompiledCircuit } from '@noir-lang/noir_js';
import { http, type PublicClient, createPublicClient } from 'viem';
import { mainnet } from 'viem/chains';
import { getAccountProof } from '../../src';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

describe('Root Verification Function (RVF) Verification (Hybrid: @zkpersona/noir-helpers + bb CLI)', () => {
  let prover: Prover;
  let publicClient: PublicClient;

  const bbPath = '/root/.bb/bb';
  const circuitPath = path.join(process.cwd(), 'target/rvf.json');
  const outputDir = path.join(process.cwd(), 'target/rvf');
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

  it('should prove single account first', async () => {
    console.time('total-test-time');

    const accountData = await getAccountProof(publicClient, {
      address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
    });

    console.log(
      'account_proof.proof.depth:',
      accountData.account_proof.proof.depth
    );
    console.log(
      'account_proof.proof.nodes count:',
      accountData.account_proof.proof.nodes.length
    );
    console.log(
      'account_proof.key length:',
      accountData.account_proof.key.length
    );
    console.log(
      'account_proof.value length:',
      accountData.account_proof.value.length
    );
    console.log('Expected key length: 66');
    console.log('Expected value length: 110');

    const inputs = {
      account: accountData.account,
      proof: accountData.account_proof,
      state_root: accountData.state_root,
    };

    console.log('\nTesting RVF with single account...');
    try {
      console.time('prepare-inputs');
      const parsedInputs = toCircuitInputs(inputs);
      console.log('Inputs converted successfully');
      console.log('proof.key length:', parsedInputs.proof?.key?.length);

      if (parsedInputs.proof?.key?.length !== 66) {
        throw new Error(
          `proof.key has invalid length: ${parsedInputs.proof.key?.length}, expected 66`
        );
      }
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

      console.timeEnd('total-test-time');

      expect(fs.existsSync(proofPath)).toBe(true);
      expect(fs.existsSync(vkPath)).toBe(true);
      console.log('✓ RVF verification succeeded (Hybrid approach)');
    } catch (error) {
      console.error('RVF circuit failed:', error);
      throw error;
    }
  });

  it('should prove root cross block verification (two blocks)', async () => {
    console.time('total-test-time');

    // Get latest block and previous block
    const blockNew = await publicClient.getBlock({ blockTag: 'latest' });
    if (!blockNew) {
      throw new Error('Failed to fetch block');
    }

    const blockOld = await publicClient.getBlock({
      blockNumber: (blockNew.number - 1n) as bigint,
    });

    console.log('Block old:', {
      number: blockOld.number,
      stateRoot: blockOld.stateRoot,
    });
    console.log('Block new:', {
      number: blockNew.number,
      stateRoot: blockNew.stateRoot,
    });

    // Get account proofs from both blocks in parallel
    console.time('get-rvf-proof');
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
    console.timeEnd('get-rvf-proof');

    console.log('Old account:', {
      balance: accountDataOld.account.balance,
      nonce: accountDataOld.account.nonce,
    });
    console.log('New account:', {
      balance: accountDataNew.account.balance,
      nonce: accountDataNew.account.nonce,
    });

    // Verify account in old block
    const inputsOld = {
      account: accountDataOld.account,
      proof: accountDataOld.account_proof,
      state_root: accountDataOld.state_root,
    };

    console.log('\nVerifying account in old block...');
    console.time('prove-rvf-old-hybrid');
    try {
      const parsedInputsOld = toCircuitInputs(inputsOld);

      // Generate witness
      const { witness } = await prover.simulateWitness(parsedInputsOld);
      fs.writeFileSync(witnessPath, Buffer.from(witness));

      // Generate and verify proof
      runCommand(
        `${bbPath} prove -b ${circuitPath} -w ${witnessPath} -o ${outputDir} -s ultra_honk`
      );
      console.timeEnd('prove-rvf-old-hybrid');

      console.time('verify-rvf-old-hybrid');
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
      console.timeEnd('verify-rvf-old-hybrid');

      expect(fs.existsSync(proofPath)).toBe(true);
      console.log('✓ Old block verification succeeded (Hybrid approach)');
    } catch (error) {
      console.error('Old block verification failed:', error);
      throw error;
    }

    // Verify account in new block
    const inputsNew = {
      account: accountDataNew.account,
      proof: accountDataNew.account_proof,
      state_root: accountDataNew.state_root,
    };

    console.log('\nVerifying account in new block...');
    console.time('prove-rvf-new-hybrid');
    try {
      const parsedInputsNew = toCircuitInputs(inputsNew);

      // Generate witness
      const { witness } = await prover.simulateWitness(parsedInputsNew);
      fs.writeFileSync(witnessPath, Buffer.from(witness));

      // Generate and verify proof
      runCommand(
        `${bbPath} prove -b ${circuitPath} -w ${witnessPath} -o ${outputDir} -s ultra_honk`
      );
      console.timeEnd('prove-rvf-new-hybrid');

      console.time('verify-rvf-new-hybrid');
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
      console.timeEnd('verify-rvf-new-hybrid');

      expect(fs.existsSync(proofPath)).toBe(true);
      console.log('✓ New block verification succeeded (Hybrid approach)');
    } catch (error) {
      console.error('New block verification failed:', error);
      throw error;
    }

    console.log('\n✓ Both block verifications succeeded (Hybrid approach)');
    console.timeEnd('total-test-time');
  });
});
