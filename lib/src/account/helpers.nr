//! Account and Address Verification Helpers
//!
//! This module provides helper functions for verifying Ethereum accounts and addresses
//! from RLP-encoded data. These functions are essential for validating account states
//! and address hashes in the Ethereum protocol.

use dep::keccak256::keccak256;

use crate::helpers::bytes::right_pad;

use crate::rlp::{decode::decode_list_of_small_strings, list::RlpList};
use crate::types::{address::{Address, ADDRESS_LENGTH}, fragment::Fragment, hash::HASH_LENGTH};

use super::account::Account;
use super::constants::{
    ACCOUNT_FIELDS_COUNT, BALANCE_INDEX, CODE_HASH_INDEX, MAX_ACCOUNT_STATE_LENGTH,
    MAX_PREFIXED_KEY_NIBBLE_LENGTH, NONCE_INDEX, STORAGE_HASH_INDEX,
};

/// Verifies that an RLP-encoded account matches an Account struct.
///
/// This function decodes the RLP-encoded account data and compares each field
/// with the corresponding field in the Account struct. The comparison includes:
/// - Nonce
/// - Balance
/// - Storage Hash
/// - Code Hash
///
/// # Arguments
///
/// * `account_rlp_left_padded` - RLP-encoded account data with left padding
/// * `account` - Account struct to compare against
///
/// # Panics
///
/// Panics if:
/// - The RLP data has an invalid number of fields
/// - Any field in the RLP data doesn't match the Account struct
pub fn assert_account_equals(
    account_rlp_left_padded: [u8; MAX_ACCOUNT_STATE_LENGTH],
    account: Account,
) {
    // Convert left-padded RLP data to right-padded format
    let account_rlp_right_padded = right_pad(account_rlp_left_padded).storage();

    let account_rlp = Fragment::from_array(account_rlp_right_padded);

    // Decode the RLP data into a list of fields
    let account_rlp_list: RlpList<ACCOUNT_FIELDS_COUNT> = decode_list_of_small_strings(account_rlp);

    // Verify the number of fields matches the expected count
    assert(
        account_rlp_list.len() == ACCOUNT_FIELDS_COUNT,
        "Invalid number of fields in account RLP",
    );

    // Compare each field with the Account struct
    account_rlp_list.get(NONCE_INDEX).assert_eq_u64("Nonce", account_rlp, account.nonce() as u64);

    account_rlp_list.get(BALANCE_INDEX).assert_eq_u128(
        "Balance",
        account_rlp,
        account.balance() as u128,
    );

    account_rlp_list.get(STORAGE_HASH_INDEX).assert_eq_bytes32(
        "Storage Hash",
        account_rlp,
        account.storage_hash(),
    );
    account_rlp_list.get(CODE_HASH_INDEX).assert_eq_bytes32(
        "Code Hash",
        account_rlp,
        account.code_hash(),
    );
}

/// Verifies that a hashed address matches an Ethereum address.
///
/// This function compares a pre-computed hash of an address with the
/// Keccak-256 hash of the provided address. The comparison is done by
/// creating fragments of both hashes and checking their equality.
///
/// # Arguments
///
/// * `address_hash` - Pre-computed hash of the address
/// * `address` - Ethereum address to verify
///
/// # Panics
///
/// Panics if the address hash doesn't match the Keccak-256 hash of the address
pub fn assert_address_equals(address_hash: [u8; MAX_PREFIXED_KEY_NIBBLE_LENGTH], address: Address) {
    // Create a fragment from the pre-computed hash
    let address_hash_fragment = Fragment::new(
        (MAX_PREFIXED_KEY_NIBBLE_LENGTH - HASH_LENGTH) as u64,
        HASH_LENGTH as u64,
        address_hash,
    );

    // Compute the Keccak-256 hash of the address
    let other_address_hash_fragment =
        Fragment::from_array(keccak256(address, ADDRESS_LENGTH as u32));

    // Compare the two hashes
    assert(address_hash_fragment.eq(other_address_hash_fragment), "Address mismatch");
}
