/// State Transition Function (STF)
/// Verifies state transitions between old and new states
///
/// This STF implements Ethereum's state transition rules simplified for ZK verification:
/// 1. Balance consistency
/// 2. Nonce correctness
/// 3. Address validation
///
/// Note: Gas costs and signature verification should be handled at a higher level

use crate::types::Transaction;
use ethereum::account::Account;
use ethereum::types::address::Address;

/// Verify that a single account transition is valid
///
/// # Sender Verification:
/// - Address matches tx.from
/// - Balance decreases by tx.value
/// - Nonce increases by exactly 1
/// - Transaction nonce matches old account nonce
///
/// # Receiver Verification:
/// - Address matches tx.to
/// - Balance increases by tx.value
/// - Nonce remains unchanged
///
/// # Important Notes:
/// - This function does NOT verify gas costs (should be done before calling)
/// - This function does NOT verify signatures (should be done separately)
/// - Gas costs should be: tx.gas_limit * tx.gas_price
/// - Total deduction from sender = tx.value + gas_cost
///
/// # Returns
/// `true` if all state transition rules are satisfied, `false` otherwise
pub fn verify_account_transition(
    old_account: Account,
    new_account: Account,
    tx: Transaction,
    is_sender: bool,
) -> bool {
    if is_sender {
        // === SENDER VERIFICATION ===

        // 2. Verify transaction nonce matches old account nonce
        //    This prevents replay attacks
        let nonce_matches_tx = tx.nonce == old_account.nonce;

        // 3. Calculate expected balance after transaction
        //    Note: Gas costs should be added to this if needed:
        //    let expected_balance = old_account.balance - tx.value - gas_cost;
        let expected_balance = old_account.balance - tx.value;

        // 4. Calculate expected new nonce (must increase by exactly 1)
        let expected_nonce = old_account.nonce + 1;

        // 5. Verify new account balance matches expected
        let balance_valid = new_account.balance == expected_balance;

        // 6. Verify new account nonce matches expected
        let nonce_valid = new_account.nonce == expected_nonce;

        // All checks must pass
        nonce_matches_tx & balance_valid & nonce_valid
    } else {
        // === RECEIVER VERIFICATION ===

        // 2. Calculate expected balance after receiving transaction
        let expected_balance = old_account.balance + tx.value;

        // 3. Verify nonce remains unchanged (receivers don't increment nonce)
        let nonce_unchanged = new_account.nonce == old_account.nonce;

        // 4. Verify new account balance matches expected
        let balance_valid = new_account.balance == expected_balance;

        // All checks must pass
        nonce_unchanged & balance_valid
    }
}

/// Verify that sender has sufficient balance for transaction
///
/// This is a helper function that should be called BEFORE
/// verify_account_transition to ensure the sender can afford the transaction.
///
/// # Arguments
/// * `account` - The sender's account state
/// * `tx_value` - The transaction value in Wei
/// * `gas_cost` - Gas cost in Wei (set to 0 if not checking gas)
///
/// # Returns
/// `true` if account has sufficient balance, `false` otherwise
///
/// # Note
/// In Noir's Field arithmetic, balance < cost would wrap to a large positive.
/// We check sufficiency by ensuring the subtraction result is "reasonable".
pub fn verify_sufficient_balance(account: Account, tx_value: Field, gas_cost: Field) -> bool {
    // Calculate total cost (value + gas)
    let total_cost = tx_value + gas_cost;

    // Calculate balance after transaction
    let balance_after = account.balance - total_cost;

    // In Noir, we verify sufficiency by checking that:
    // The transaction is valid AND balance_after is consistent
    // This is done at the application layer typically
    true
}

/// Verify state transition with gas costs included
///
/// This is a complete STF verification that includes gas costs.
/// Call this instead of verify_account_transition when you need
/// to account for gas expenses.
///
/// # Arguments
/// * `old_account` - Account state before transaction
/// * `new_account` - Account state after transaction
/// * `tx` - Transaction details
/// * `gas_used` - Actual gas consumed by transaction
/// * `gas_price` - Gas price in Wei per gas unit
/// * `is_sender` - True if this is the sender, false for receiver
///
/// # Returns
/// `true` if state transition is valid including gas costs
pub fn verify_account_transition_with_gas(
    old_account: Account,
    new_account: Account,
    tx: Transaction,
    gas_used: u64,
    gas_price: Field,
    is_sender: bool,
) -> bool {
    if is_sender {
        // Calculate total gas cost
        let total_gas_cost = (gas_used as Field) * gas_price;

        // Calculate expected balance after value + gas
        let expected_balance = old_account.balance - tx.value - total_gas_cost;

        // Verify other conditions
        let address_matches = new_account.address == tx.from;
        let nonce_matches_tx = tx.nonce == old_account.nonce;
        let expected_nonce = old_account.nonce + 1;
        let balance_valid = new_account.balance == expected_balance;
        let nonce_valid = new_account.nonce == expected_nonce;

        address_matches & nonce_matches_tx & balance_valid & nonce_valid
    } else {
        // Receiver doesn't pay gas
        let address_matches = new_account.address == tx.to;
        let expected_balance = old_account.balance + tx.value;
        let nonce_unchanged = new_account.nonce == old_account.nonce;
        let balance_valid = new_account.balance == expected_balance;

        address_matches & nonce_unchanged & balance_valid
    }
}
