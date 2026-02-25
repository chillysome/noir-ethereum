use ethereum::account::Account;
use zkcross::stf::verify_account_transition;
use zkcross::types::Transaction;

fn main(is_sender: bool, old_account: Account, new_account: Account, tx: Transaction) -> pub bool {
    verify_account_transition(old_account, new_account, tx, is_sender)
}
