import { getAccountProof } from '../../src';
import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';
import { toCircuitInputs } from '@zkpersona/noir-helpers';

async function debug() {
  const publicClient = createPublicClient({
    chain: mainnet,
    transport: http(
      'https://eth-mainnet.g.alchemy.com/v2/NWE0grP8z2DMMTWR1yVp_'
    ),
  });

  const accountData = await getAccountProof(publicClient, {
    address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
  });

  console.log('Account Data:');
  console.log('- address:', accountData.account.address);
  console.log('- nonce:', accountData.account.nonce);
  console.log('- balance:', accountData.account.balance);
  console.log('- storage_hash:', accountData.account.storage_hash);
  console.log('- code_hash:', accountData.account.code_hash);

  console.log('\nProof Data:');
  console.log('- proof depth:', accountData.account_proof.proof.depth);
  console.log(
    '- proof nodes count:',
    accountData.account_proof.proof.nodes.length
  );
  console.log(
    '- proof leaf length:',
    accountData.account_proof.proof.leaf.length
  );
  console.log('- proof key length:', accountData.account_proof.key.length);
  console.log('- proof value length:', accountData.account_proof.value.length);

  console.log('\nState Root:', accountData.state_root);

  // Test single verification
  const inputsSingle = {
    account: accountData.account,
    account_proof: accountData.account_proof,
    state_root: accountData.state_root,
  };

  console.log('\n\n=== Testing Single Verification ===');
  try {
    const parsedInputsSingle = toCircuitInputs(inputsSingle);
    console.log('Single inputs converted successfully');
    console.log(
      'parsedInputsSingle:',
      JSON.stringify(parsedInputsSingle, null, 2).substring(0, 500)
    );
  } catch (error) {
    console.error('Single inputs conversion failed:', error);
  }

  // Test RVF with same account twice
  const inputsRVF = {
    account_old: accountData.account,
    proof_old: accountData.account_proof,
    state_root_old: accountData.state_root,
    account_new: accountData.account,
    proof_new: accountData.account_proof,
    state_root_new: accountData.state_root,
  };

  console.log('\n\n=== Testing RVF with Same Account Twice ===');
  try {
    const parsedInputsRVF = toCircuitInputs(inputsRVF);
    console.log('RVF inputs converted successfully');
    console.log('Keys:');
    console.log(
      '- proof_old.key length:',
      parsedInputsRVF.proof_old.key?.length
    );
    console.log(
      '- proof_new.key length:',
      parsedInputsRVF.proof_new.key?.length
    );
    console.log(
      '- Are keys equal?',
      JSON.stringify(parsedInputsRVF.proof_old.key) ===
        JSON.stringify(parsedInputsRVF.proof_new.key)
    );
  } catch (error) {
    console.error('RVF inputs conversion failed:', error);
  }

  // Test RVF with deep cloned data
  console.log('\n\n=== Testing RVF with Deep Cloned Data ===');
  const accountData2 = await getAccountProof(publicClient, {
    address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
  });

  const inputsRVFCloned = {
    account_old: accountData.account,
    proof_old: accountData.account_proof,
    state_root_old: accountData.state_root,
    account_new: accountData2.account,
    proof_new: accountData2.account_proof,
    state_root_new: accountData2.state_root,
  };

  try {
    const parsedInputsRVFCloned = toCircuitInputs(inputsRVFCloned);
    console.log('RVF cloned inputs converted successfully');
  } catch (error) {
    console.error('RVF cloned inputs conversion failed:', error);
  }
}

debug().catch(console.error);
