use zkcross::{Account, AccountProof, Hash, verify_single_account};

fn main(account: Account, proof: AccountProof, state_root: Hash) {
    verify_single_account(account, proof, state_root)
}
