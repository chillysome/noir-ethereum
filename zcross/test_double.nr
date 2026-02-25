/// Test double verification
use ethereum::account::{Account, verify_account};
use ethereum::account::types::AccountProof;
use ethereum::types::hash::Hash;

/// Test calling verify_account twice with the same data
#[test]
fn test_double_verify_same_account() {
    // Use fixture data
    let account = crate::fixtures::account::account_without_storage::account;
    let account_proof = crate::fixtures::account::account_without_storage::account_proof;
    let state_root = crate::fixtures::account::account_without_storage::state_root;

    // Call once - should work
    verify_account(account, account_proof, state_root);

    // Call twice - does this work?
    verify_account(account, account_proof, state_root);
}
