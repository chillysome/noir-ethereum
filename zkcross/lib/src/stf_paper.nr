/// zkCross State Transition Function (STF)
///
/// Based on zkCross paper: STF ensures correctness of the transition from
/// old state State_old to new state State_new after transaction takes place.
///
/// In the paper example (Figure 7):
/// - State_old = {a, b, c, d, e} (from Block I-2)
/// - State_new = {a', b', c', d', e''} (from Block I-3)
/// - n transactions transition from old to new state
///
/// The STF verifies that:
/// 1. Sender's balance decreases by transaction value
/// 2. Receiver's balance increases by transaction value
/// 3. Sender's nonce increments by 1
/// 4. Receiver's nonce remains unchanged
/// 5. All other accounts remain unchanged

use crate::types::Transaction;
use ethereum::account::Account;
use ethereum::types::address::Address;

/// State structure containing multiple accounts
/// This matches the paper's representation of State = {a, b, c, d, e, ...}
pub struct State<let N: u32> {
    accounts: [Account; N],
}

/// Verify state transition for a single transaction
///
/// This is the core STF function from the zkCross paper.
/// It verifies that the transition from old_state to new_state
/// is valid given the transaction.
///
/// # Verification Rules
/// 1. Find sender and receiver accounts in old_state
/// 2. Verify sender balance >= tx.value
/// 3. Verify sender nonce == tx.nonce
/// 4. Calculate expected new states:
///    - Sender: balance -= tx.value, nonce += 1
///    - Receiver: balance += tx.value, nonce unchanged
///    - Others: unchanged
/// 5. Verify new_state matches expected states
///
/// # Arguments
/// * `old_state` - State before transaction (State_old in paper)
/// * `new_state` - State after transaction (State_new in paper)
/// * `tx` - The transaction that caused the state transition
///
/// # Returns
/// `true` if the state transition is valid, `false` otherwise
pub fn verify_state_transition(
    old_state: State<16>,
    new_state: State<16>,
    tx: Transaction,
) -> bool {
    // Find indices of sender and receiver in state array
    let sender_idx = find_account_index(old_state, tx.from);
    let receiver_idx = find_account_index(old_state, tx.to);

    // Verify both accounts exist in state
    let accounts_exist = (sender_idx < 16) & (receiver_idx < 16);

    // Get old account states
    let old_sender = old_state.accounts[sender_idx];
    let old_receiver = old_state.accounts[receiver_idx];

    // Get new account states
    let new_sender = new_state.accounts[sender_idx];
    let new_receiver = new_state.accounts[receiver_idx];

    // === VERIFY SENDER TRANSITION ===

    // Verify sender address matches
    let sender_addr_matches = new_sender.address == tx.from;

    // Verify transaction nonce matches old sender nonce
    let sender_nonce_matches_tx = tx.nonce == old_sender.nonce;

    // Calculate expected sender balance after transaction
    let expected_sender_balance = old_sender.balance - tx.value;

    // Calculate expected sender nonce (must increment by 1)
    let expected_sender_nonce = old_sender.nonce + 1;

    // Verify sender state is correct
    let sender_balance_valid = new_sender.balance == expected_sender_balance;
    let sender_nonce_valid = new_sender.nonce == expected_sender_nonce;

    let sender_valid = accounts_exist
        & sender_addr_matches
        & sender_nonce_matches_tx
        & sender_balance_valid
        & sender_nonce_valid;

    // === VERIFY RECEIVER TRANSITION ===

    // Verify receiver address matches
    let receiver_addr_matches = new_receiver.address == tx.to;

    // Calculate expected receiver balance after transaction
    let expected_receiver_balance = old_receiver.balance + tx.value;

    // Verify receiver nonce unchanged
    let receiver_nonce_unchanged = new_receiver.nonce == old_receiver.nonce;

    // Verify receiver state is correct
    let receiver_balance_valid = new_receiver.balance == expected_receiver_balance;
    let receiver_valid = receiver_addr_matches & receiver_nonce_unchanged & receiver_balance_valid;

    // === VERIFY OTHER ACCOUNTS UNCHANGED ===

    let others_unchanged = if accounts_exist {
        verify_other_accounts_unchanged(old_state, new_state, sender_idx, receiver_idx)
    } else {
        false
    };

    // All verifications must pass
    sender_valid & receiver_valid & others_unchanged
}

/// Find the index of an account in the state
///
/// # Arguments
/// * `state` - The state containing accounts
/// * `address` - The address to search for
///
/// # Returns
/// The index of the account, or 16 (out of bounds) if not found
fn find_account_index(state: State<16>, address: Address) -> u32 {
    let mut found_idx: u32 = 16; // Default to invalid index
    let mut i: u32 = 0;

    for i in 0..16 {
        if state.accounts[i].address == address {
            found_idx = i;
        }
    }

    found_idx
}

/// Verify that all accounts except sender and receiver remain unchanged
///
/// This is important for ensuring only the two accounts involved in
/// the transaction are modified.
///
/// # Arguments
/// * `old_state` - State before transaction
/// * `new_state` - State after transaction
/// * `sender_idx` - Index of the sender account
/// * `receiver_idx` - Index of the receiver account
///
/// # Returns
/// `true` if all other accounts are unchanged
fn verify_other_accounts_unchanged(
    old_state: State<16>,
    new_state: State<16>,
    sender_idx: u32,
    receiver_idx: u32,
) -> bool {
    let mut all_unchanged = true;

    for i in 0..16 {
        // Skip sender and receiver (they should change)
        let should_skip = (i == sender_idx) | (i == receiver_idx);

        if !should_skip {
            // Verify account is unchanged
            let old_account = old_state.accounts[i];
            let new_account = new_state.accounts[i];
            let account_unchanged = new_account == old_account;
            all_unchanged = all_unchanged & account_unchanged;
        }
    }

    all_unchanged
}

/// Apply a transaction to an old state to get the new state
///
/// This is the inverse of verify_state_transition.
/// Given a valid old_state and transaction, it computes
/// the expected new_state.
///
/// # Arguments
/// * `old_state` - State before transaction
/// * `tx` - The transaction to apply
///
/// # Returns
/// The new state after applying the transaction
pub fn apply_transaction(old_state: State<16>, tx: Transaction) -> State<16> {
    let mut new_state = old_state;

    let sender_idx = find_account_index(old_state, tx.from);
    let receiver_idx = find_account_index(old_state, tx.to);

    // Update sender account
    if sender_idx < 16 {
        new_state.accounts[sender_idx].balance = old_state.accounts[sender_idx].balance - tx.value;
        new_state.accounts[sender_idx].nonce = old_state.accounts[sender_idx].nonce + 1;
    }

    // Update receiver account
    if receiver_idx < 16 {
        new_state.accounts[receiver_idx].balance =
            old_state.accounts[receiver_idx].balance + tx.value;
    }

    new_state
}

/// Verify state transition with gas costs included
///
/// This is a more complete version that accounts for gas expenses,
/// which are paid by the sender in addition to the transaction value.
///
/// # Arguments
/// * `old_state` - State before transaction
/// * `new_state` - State after transaction
/// * `tx` - The transaction
/// * `gas_used` - Gas consumed by transaction
/// * `gas_price` - Price per gas unit in Wei
///
/// # Returns
/// `true` if the state transition is valid including gas costs
pub fn verify_state_transition_with_gas(
    old_state: State<16>,
    new_state: State<16>,
    tx: Transaction,
    gas_used: u64,
    gas_price: Field,
) -> bool {
    // Find indices
    let sender_idx = find_account_index(old_state, tx.from);
    let receiver_idx = find_account_index(old_state, tx.to);

    let accounts_exist = (sender_idx < 16) & (receiver_idx < 16);

    // Get old and new accounts
    let old_sender = old_state.accounts[sender_idx];
    let new_sender = new_state.accounts[sender_idx];
    let old_receiver = old_state.accounts[receiver_idx];
    let new_receiver = new_state.accounts[receiver_idx];

    // === VERIFY SENDER WITH GAS ===

    let sender_addr_matches = new_sender.address == tx.from;
    let sender_nonce_matches_tx = tx.nonce == old_sender.nonce;

    // Total cost = tx.value + gas_cost
    let gas_cost = (gas_used as Field) * gas_price;
    let expected_sender_balance = old_sender.balance - tx.value - gas_cost;

    let expected_sender_nonce = old_sender.nonce + 1;
    let sender_balance_valid = new_sender.balance == expected_sender_balance;
    let sender_nonce_valid = new_sender.nonce == expected_sender_nonce;

    let sender_valid = accounts_exist
        & sender_addr_matches
        & sender_nonce_matches_tx
        & sender_balance_valid
        & sender_nonce_valid;

    // === VERIFY RECEIVER (no gas) ===

    let receiver_addr_matches = new_receiver.address == tx.to;
    let expected_receiver_balance = old_receiver.balance + tx.value;
    let receiver_nonce_unchanged = new_receiver.nonce == old_receiver.nonce;
    let receiver_balance_valid = new_receiver.balance == expected_receiver_balance;
    let receiver_valid = receiver_addr_matches & receiver_nonce_unchanged & receiver_balance_valid;

    // === VERIFY OTHERS UNCHANGED ===

    let others_unchanged = if accounts_exist {
        verify_other_accounts_unchanged(old_state, new_state, sender_idx, receiver_idx)
    } else {
        false
    };

    sender_valid & receiver_valid & others_unchanged
}
