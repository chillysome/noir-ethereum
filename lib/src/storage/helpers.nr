//! Storage Proof Verification Helpers
//!
//! This module provides helper functions for verifying Ethereum storage proofs
//! in the Merkle Patricia Trie (MPT). These functions are essential for validating
//! storage keys and values in the Ethereum protocol.

use dep::keccak256::keccak256;

use crate::account::constants::MAX_PREFIXED_KEY_NIBBLE_LENGTH;
use crate::helpers::bytes::right_pad;
use crate::rlp::decode::decode_string;
use crate::types::{bytes32::{Bytes32, BYTES32_LENGTH}, fragment::Fragment, hash::HASH_LENGTH};

use super::constants::MAX_STORAGE_VALUE_LENGTH;

/// Verifies that a storage key matches the expected value.
///
/// This function compares a storage key with its expected value by:
/// 1. Extracting the hash portion of the prefixed key
/// 2. Computing the Keccak-256 hash of the expected key
/// 3. Comparing the two hashes for equality
///
/// # Arguments
///
/// * `expected_key` - The expected storage key as a 32-byte value
/// * `prefixed_key` - The storage key with prefix as a byte array
///
/// # Panics
///
/// Panics with "Storage key does not match the argument" if the keys don't match
pub fn assert_storage_key_equals(
    expected_key: Bytes32,
    prefixed_key: [u8; MAX_PREFIXED_KEY_NIBBLE_LENGTH],
) {
    // Extract the hash portion of the prefixed key (last 32 bytes)
    let storage_key_hash_fragment = Fragment::new(
        (MAX_PREFIXED_KEY_NIBBLE_LENGTH - HASH_LENGTH) as u64,
        HASH_LENGTH as u64,
        prefixed_key,
    );

    // Compute the Keccak-256 hash of the expected key
    let other_storage_key_hash_fragment =
        Fragment::from_array(keccak256(expected_key, BYTES32_LENGTH as u32));

    // Compare the hashes for equality
    assert(
        storage_key_hash_fragment.eq(other_storage_key_hash_fragment),
        "Storage key does not match the argument",
    );
}

/// Creates a fragment from a left-padded byte array.
///
/// This helper function:
/// 1. Finds the actual length of the value by removing leading zeros
/// 2. Calculates the offset to the first non-zero byte
/// 3. Creates a fragment with the appropriate offset and length
///
/// # Arguments
///
/// * `left_padded_value` - The left-padded byte array
///
/// # Returns
///
/// A fragment containing the non-zero portion of the value
fn get_fragment<let N: u32>(left_padded_value: [u8; N]) -> Fragment<u8, N> {
    // Find the actual length by removing leading zeros
    let value_length = right_pad(left_padded_value).len();
    // Calculate offset to first non-zero byte
    let value_offset = N - value_length;
    // Create fragment with appropriate offset and length
    Fragment::new(value_offset as u64, value_length as u64, left_padded_value)
}

/// Extracts and decodes a storage value from RLP-encoded data.
///
/// This function:
/// 1. Creates a fragment from the RLP-encoded value
/// 2. Decodes the RLP string header
/// 3. Handles special cases for single-byte headers
/// 4. Returns the decoded storage value
///
/// # Arguments
///
/// * `rlp_encoded_value` - The RLP-encoded storage value
///
/// # Returns
///
/// The decoded storage value as a byte array
///
/// # Panics
///
/// Panics with "Expected RLP header to be maximum 1 byte long" if the header is too long
pub fn get_storage_value(
    rlp_encoded_value: [u8; MAX_STORAGE_VALUE_LENGTH],
) -> [u8; MAX_STORAGE_VALUE_LENGTH] {
    // Create a fragment from the RLP-encoded left-padded value
    let mut storage_value = get_fragment(rlp_encoded_value);
    // Decode the RLP string header
    let rlp_fragment = decode_string(storage_value);
    let rlp_header_length = rlp_fragment.offset();

    // Storage value is maximum 32 bytes long, so its RLP-encoding's header is maximum 1 byte long
    assert(rlp_header_length <= 1, "Expected RLP header to be maximum 1 byte long");

    // Handle special case for single-byte header
    if rlp_fragment.offset() == 1 {
        let rlp_header_position = storage_value.offset();
        storage_value.set(rlp_header_position - storage_value.offset(), 0);
    }

    // Return the decoded storage value
    storage_value.data()
}
