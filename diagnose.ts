import { getAccountProof } from './src';
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

  console.log('Proof key length:', accountData.account_proof.key.length);
  console.log('Expected: 66');
  console.log('Proof depth:', accountData.account_proof.proof.depth);
  console.log(
    'Proof nodes count:',
    accountData.account_proof.proof.nodes.length
  );

  const inputs = {
    account_old: accountData.account,
    proof_old: accountData.account_proof,
    state_root_old: accountData.state_root,
    account_new: accountData.account,
    proof_new: accountData.account_proof,
    state_root_new: accountData.state_root,
  };

  console.log('\n=== Converting inputs ===');
  try {
    const parsed = toCircuitInputs(inputs);
    console.log('Conversion successful');
    console.log('proof_old.key length:', parsed.proof_old.key?.length);
    console.log('proof_new.key length:', parsed.proof_new.key?.length);
    console.log(
      'Keys are same reference?',
      parsed.proof_old.key === parsed.proof_new.key
    );
  } catch (error) {
    console.error('Conversion failed:', error);
  }
}

diagnose().catch(console.error);
