/// zkCross Circuit
/// Orchestrates the four core functions: AF, SVF, STF, RVF

use crate::af::audit_address;
use crate::rvf::verify_root_cross_block;
use crate::stf::verify_account_transition;
use crate::types::Transaction;
use ethereum::account::Account;
use ethereum::account::types::AccountProof;
use ethereum::types::address::Address;
use ethereum::types::hash::Hash;

/// Main zkCross verification function
/// Verifies all four core functions together
///
/// # Arguments
/// * `address` - Sender address to audit
/// * `chain_id` - Ethereum chain ID
/// * `tx` - Transaction being verified
/// * `account_old` - Old state account
/// * `proof_old` - Old state MPT proof
/// * `state_root_old` - Old block state root
/// * `account_new` - New state account
/// * `proof_new` - New state MPT proof
/// * `state_root_new` - New block state root
pub fn verify_complete(
    address: Address,
    chain_id: u64,
    tx: Transaction,
    account_old: Account,
    proof_old: AccountProof,
    state_root_old: Hash,
    account_new: Account,
    proof_new: AccountProof,
    state_root_new: Hash,
) {
    // 1. Auditing Function (AF): Check if address is blacklisted
    let af_result = audit_address(address);
    assert(af_result);

    // 2. Signature Verification Function (SVF): TODO - needs PublicKey extraction from Address
    // verify_signature(public_key, tx, chain_id, signature);

    // 3. State Transition Function (STF): Verify state transition
    let sender_valid = verify_account_transition(
        account_old,
        account_new,
        tx,
        true, // is_sender
    );
    assert(sender_valid);

    // 4. Root Verification Function (RVF): Verify state roots
    verify_root_cross_block(
        account_old,
        proof_old,
        state_root_old,
        account_new,
        proof_new,
        state_root_new,
    );
}
