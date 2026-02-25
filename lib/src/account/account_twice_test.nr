use ethereum::account::{Account, verify_account};
use ethereum::account::types::AccountProof;
use ethereum::types::hash::Hash;

// Test: Call verify_account twice with the same data
#[test]
fn test_verify_account_twice() {
    use crate::fixtures::account::account_without_storage::{account, account_proof, state_root};

    // First call
    verify_account(account, account_proof, state_root);

    // Second call with same data
    verify_account(account, account_proof, state_root);
}
