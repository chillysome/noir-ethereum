/// Root Verification Function (RVF)
/// Verifies that State_old and State_new are consistent with the states recorded in blocks
/// by using Ethereum's Merkle Patricia Tree (MPT) proof verification

use ethereum::account::{Account, verify_account};
use ethereum::account::types::AccountProof;
use ethereum::types::hash::Hash;

/// Verify a single account (for testing)
pub fn verify_single_account(account: Account, account_proof: AccountProof, state_root: Hash) {
    verify_account(account, account_proof, state_root);
}
