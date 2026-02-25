use zkcross::{verify_root_cross_block, Account, AccountProof, Hash};

fn main(
    account: Account,
    account_proof: AccountProof,
    state_root: Hash,
) {
    // Try calling verify_root_cross_block with same account twice
    verify_root_cross_block(
        account,
        account_proof,
        state_root,
        account,
        account_proof,
        state_root,
    )
}
