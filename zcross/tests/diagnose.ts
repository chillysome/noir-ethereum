import { getAccountProof } from '../../src';
import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';
import { toCircuitInputs } from '@zkpersona/noir-helpers';

async function diagnose() {
  const publicClient = createPublicClient({
    chain: mainnet,
    transport: http(
      'https://eth-mainnet.g.alchemy.com/v2/NWE0grP8z2DMMTWR1yVp_'
    ),
  });

  const accountData = await getAccountProof(publicClient, {
    address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
  });

  console.log('Account data:', JSON.stringify(accountData, null, 2));

  // Check key length
  console.log('\nProof key length:', accountData.account_proof.key.length);
  console.log('Expected: 66');

  // Check nodes
  console.log(
    '\nProof nodes count:',
    accountData.account_proof.proof.nodes.length
  );
  console.log('Proof depth:', accountData.account_proof.proof.depth);

  // Try conversion
  const inputs1 = {
    account_old: accountData.account,
    proof_old: accountData.account_proof,
    state_root_old: accountData.state_root,
    account_new: accountData.account,
    proof_new: accountData.account_proof,
    state_root_new: accountData.state_root,
  };

  console.log('\n=== Converting inputs ===');
  try {
    const parsed1 = toCircuitInputs(inputs1);
    console.log('Conversion successful');

    // Check key length after conversion
    console.log('\nproof_old.key length:', parsed1.proof_old.key?.length);
    console.log('proof_new.key length:', parsed1.proof_new.key?.length);

    // Check if keys are identical (should be the same object reference if toCircuitInputs doesn't clone)
    console.log(
      '\nKeys are same reference?',
      parsed1.proof_old.key === parsed1.proof_new.key
    );
  } catch (error) {
    console.error('Conversion failed:', error);
  }
}

diagnose().catch(console.error);
