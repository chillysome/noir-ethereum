use zkcross::{Account, AccountProof, Hash, verify_root_cross_block};

fn main(
    account_old: Account,
    proof_old: AccountProof,
    state_root_old: Hash,
    account_new: Account,
    proof_new: AccountProof,
    state_root_new: Hash,
) {
    verify_root_cross_block(
        account_old,
        proof_old,
        state_root_old,
        account_new,
        proof_new,
        state_root_new,
    )
}
