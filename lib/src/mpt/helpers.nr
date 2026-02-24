//! Helper functions for Merkle Patricia Trie (MPT) verification in Ethereum.
//! This module provides core utilities for working with MPT nodes, including:
//! - Node length calculation and validation
//! - Prefix handling and parity checks
//! - Hash extraction from different node types (branch/extension)
//! - Node hash verification

use dep::keccak256::keccak256;

use crate::helpers::bytes::{byte_to_nibbles, bytes_to_nibbles};
use crate::rlp::{decode::{decode_list_of_small_strings, decode_to_rlp_header}, list::RlpList};
use crate::types::{fragment::Fragment, hash::{Hash, HASH_LENGTH}};

use super::constants::{BRANCH_NODE_NUM_FIELDS, EXTENSION_NODE_NUM_FIELDS, MAX_NODE_FIELDS};
use super::types::Node;

/// Calculates the actual length of an RLP-encoded node.
/// This function decodes the RLP header of the node and computes its total length
/// including both the header and payload.
///
/// # Arguments
/// * `node` - The RLP-encoded node as a byte array
///
/// # Returns
/// The total length of the node in bytes
///
/// # Panics
/// Panics if the calculated length exceeds the maximum allowed length
pub fn get_node_len<let MaxNodeLen: u32>(node: [u8; MaxNodeLen]) -> u64 {
    let node_header = decode_to_rlp_header(Fragment::from_array(node));
    let node_len = node_header.offset() + node_header.len();
    assert((node_len as u32) <= MaxNodeLen, "Node RLP length exceeds maximum length");

    node_len
}

/// Calculates the parity of a prefix byte.
/// In MPT, prefixes can be 0, 1, 2, or 3, and their parity determines
/// how the key is encoded.
///
/// # Arguments
/// * `prefix` - The prefix byte (must be < 4)
///
/// # Returns
/// 0 for even parity, 1 for odd parity
///
/// # Panics
/// Panics if prefix >= 4
pub fn parity(prefix: u8) -> u64 {
    assert(prefix < 4, "Prefix must be 0, 1, 2 or 3");
    (prefix % 2) as u64
}

/// Checks if a parity value represents even parity.
pub fn is_even_parity(parity: u64) -> bool {
    parity == 0
}

/// Checks if a parity value represents odd parity.
pub fn is_odd_parity(parity: u64) -> bool {
    parity == 1
}

/// Removes the prefix from a key in an MPT node.
/// MPT keys are prefixed with a byte that indicates their type and parity.
/// This function strips this prefix and handles the special case of even parity
/// where an additional zero nibble must be removed.
///
/// # Arguments
/// * `prefixed_key_bytes` - The key bytes with prefix
///
/// # Returns
/// The key bytes without the prefix
///
/// # Panics
/// Panics if the key doesn't follow the expected format
pub fn strip_prefix<let MaxKeyLen: u32>(
    prefixed_key_bytes: Fragment<u8, MaxKeyLen>,
) -> Fragment<u8, MaxKeyLen> {
    let mut nibbles = bytes_to_nibbles(prefixed_key_bytes);

    let prefix = nibbles.pop_front();
    let parity = parity(prefix);

    if (is_even_parity(parity)) {
        assert(nibbles.pop_front() == 0, "Expected a zero after a prefix of even parity");
    }

    nibbles
}

/// Extracts a hash from a branch node in the MPT.
/// Branch nodes contain 16 possible child hashes and a value.
/// This function extracts the hash at the position indicated by the current key nibble.
///
/// # Arguments
/// * `node` - The RLP-encoded node
/// * `node_rlp_list` - The decoded RLP list of the node
/// * `key_nibbles` - The key being looked up
/// * `key_ptr` - Pointer to the current position in the key
///
/// # Returns
/// The hash fragment at the specified position
///
/// # Panics
/// Panics if the expected hash is not found at the specified position
pub fn extract_hash_from_branch_node<let MaxKeyNibbleLen: u32>(
    node: Node,
    node_rlp_list: RlpList<MAX_NODE_FIELDS>,
    key_nibbles: Fragment<u8, MaxKeyNibbleLen>,
    key_ptr: &mut u64,
) -> Fragment<u8, HASH_LENGTH> {
    let current_nibble = key_nibbles.at(*key_ptr).into();
    let fragment = node_rlp_list.get(current_nibble);
    assert(
        fragment.len() == HASH_LENGTH.into(),
        "Expected a hash at position given by the key nibble",
    );
    *key_ptr += 1;

    Fragment::new(fragment.offset(), (HASH_LENGTH as u64), node).focus()
}

/// Extracts a hash from an extension node in the MPT.
/// Extension nodes contain a shared prefix and a hash to the next node.
/// This function verifies that the extension's prefix matches the current key
/// and extracts the next node's hash.
///
/// # Arguments
/// * `node` - The RLP-encoded node
/// * `node_rlp_list` - The decoded RLP list of the node
/// * `key_nibbles` - The key being looked up
/// * `key_ptr` - Pointer to the current position in the key
///
/// # Returns
/// The hash fragment pointing to the next node
///
/// # Panics
/// Panics if the extension node is invalid or doesn't match the key
pub fn extract_hash_from_extension_node<let MaxKeyNibbleLen: u32>(
    node: Node,
    node_rlp_list: RlpList<MAX_NODE_FIELDS>,
    key_nibbles: Fragment<u8, MaxKeyNibbleLen>,
    key_ptr: &mut u64,
) -> Fragment<u8, HASH_LENGTH> {
    // First Item is a compact encoded Key
    let encoded_partial_key_component = node_rlp_list.get(0);

    let encoded_partial_key: Fragment<u8, MaxKeyNibbleLen> = Fragment::new(
        encoded_partial_key_component.offset(),
        encoded_partial_key_component.len(),
        node,
    )
        .focus();

    // Decode First byte of encoded key. (prefix, padding)
    // Prefix:
    // 0: Extension node with even-length path.
    // 1: Extension node with odd-length path.
    // 2: Leaf node with even-length path.
    // 3: Leaf node with odd-length path.
    // Padding:
    // 0: No padding needed.
    // 1: Padding needed.
    let (prefix, _) = byte_to_nibbles(encoded_partial_key.at(0));

    assert((prefix == 0) | (prefix == 1), "Extension parity prefix must be 0 or 1");

    // Strip Prefix and padding if even parity to get partial key
    let partial_key = strip_prefix(encoded_partial_key);

    let current_key_nibbles_part = key_nibbles.sub_fragment(*key_ptr, partial_key.len());

    assert(
        partial_key == current_key_nibbles_part,
        "Extension key part does not correspond to given key nibbles",
    );

    let next_node = node_rlp_list.get(1);

    assert(
        next_node.len() == HASH_LENGTH.into(),
        "Expected a hash at the end of the extension node",
    );

    *key_ptr += partial_key.len();

    Fragment::new(next_node.offset(), HASH_LENGTH.into(), node).focus()
}

/// Extracts a hash from an MPT node based on its type.
/// This is a high-level function that handles both branch and extension nodes,
/// determining the node type from its RLP structure and delegating to the
/// appropriate extraction function.
///
/// # Arguments
/// * `node` - The RLP-encoded node
/// * `key_nibbles` - The key being looked up
/// * `key_ptr` - Pointer to the current position in the key
///
/// # Returns
/// The hash fragment pointing to the next node
///
/// # Panics
/// Panics if the node type is invalid
pub fn extract_hash<let MaxKeyNibbleLen: u32>(
    node: Node,
    key_nibbles: Fragment<u8, MaxKeyNibbleLen>,
    key_ptr: &mut u64,
) -> Fragment<u8, HASH_LENGTH> {
    let mut hash = Fragment::from_array([0; HASH_LENGTH]);
    let node_list: RlpList<MAX_NODE_FIELDS> =
        decode_list_of_small_strings(Fragment::from_array(node));

    if (node_list.len() == BRANCH_NODE_NUM_FIELDS) {
        hash = extract_hash_from_branch_node(node, node_list, key_nibbles, key_ptr);
    } else if (node_list.len() == EXTENSION_NODE_NUM_FIELDS) {
        hash = extract_hash_from_extension_node(node, node_list, key_nibbles, key_ptr);
    } else {
        assert(false, "Invalid node type");
    }

    hash
}

/// Verifies that a node's hash matches its expected value.
/// This function calculates the Keccak-256 hash of the node and compares it
/// with the provided hash.
///
/// # Arguments
/// * `node` - The RLP-encoded node
/// * `hash` - The expected hash value
///
/// # Panics
/// Panics if the node's hash does not match the expected hash
pub fn verify_node_hash<let MaxNodeLen: u32>(node: [u8; MaxNodeLen], hash: Hash) {
    assert(
        keccak256(node, get_node_len(node) as u32) == hash,
        "Node hash does not match expected hash",
    );
}

mod get_node_len {
    use super::get_node_len;

    #[test]
    fn test_get_node_len_valid() {
        // Test with a simple RLP-encoded node (single byte)
        let node = [0x80]; // RLP encoding of empty string
        let len = get_node_len(node);
        assert(len == 1, "Length should be 1 for empty string");

        // Test with a longer RLP-encoded node
        let node = [0x82, 0x01, 0x02]; // RLP encoding of [0x01, 0x02]
        let len = get_node_len(node);
        assert(len == 3, "Length should be 3 for two-byte string");
    }

    #[test(should_fail_with = "Node RLP length exceeds maximum length")]
    fn test_get_node_len_invalid() {
        let node = [0xc2, 0x42];
        let _ = get_node_len(node);
    }
}

mod parity {
    use super::parity;

    #[test]
    fn test_parity_even() {
        assert(parity(0) == 0, "0 should have even parity");
        assert(parity(2) == 0, "2 should have even parity");
    }

    #[test]
    fn test_parity_odd() {
        assert(parity(1) == 1, "1 should have odd parity");
        assert(parity(3) == 1, "3 should have odd parity");
    }

    #[test(should_fail_with = "Prefix must be 0, 1, 2 or 3")]
    fn test_parity_invalid() {
        let _ = parity(4); // Should panic as prefix must be < 4
    }
}

mod strip_prefix {
    use crate::helpers::bytes::byte_to_nibbles;
    use crate::types::fragment::Fragment;
    use super::strip_prefix;

    #[test]
    fn test_strip_prefix__even() {
        let prefixed_key_bytes =
            Fragment::from_array_with_len(3, [0x20, 0xab, 0xcd, 0x00, 0x00, 0x00]);
        let (prefix, _) = byte_to_nibbles(prefixed_key_bytes.at(0));
        assert(prefix == 2, "Incorrect prefix");
        let stripped_nibbles = strip_prefix(prefixed_key_bytes);
        assert(
            stripped_nibbles == Fragment::from_array_with_len(4, [0xa, 0xb, 0xc, 0xd, 0x0, 0x0]),
            "Incorrect stripping of even prefix",
        );
    }

    #[test]
    fn test_strip_prefix_odd() {
        let prefixed_key_bytes =
            Fragment::from_array_with_len(3, [0x3a, 0xbc, 0xde, 0x00, 0x00, 0x00]);
        let (prefix, _) = byte_to_nibbles(prefixed_key_bytes.at(0));
        assert(prefix == 3, "Incorrect prefix");
        let stripped_nibbles = strip_prefix(prefixed_key_bytes);
        assert(
            stripped_nibbles == Fragment::from_array_with_len(5, [0xa, 0xb, 0xc, 0xd, 0xe, 0x0]),
            "Incorrect stripping of odd prefix",
        );
    }

    #[test(should_fail_with = "Expected a zero after a prefix of even parity")]
    fn test_non_zero_after_even_prefix() {
        let wrong_prefix = 0x21;
        let prefixed_key_bytes =
            Fragment::from_array_with_len(3, [wrong_prefix, 0xab, 0xcd, 0x00, 0x00, 0x00]);
        let _ = strip_prefix(prefixed_key_bytes);
    }

    #[test(should_fail_with = "Prefix must be 0, 1, 2 or 3")]
    fn test_invalid_prefix() {
        let prefixed_key_bytes = Fragment::from_array_with_len(2, [0x4a, 0xbc, 0x00, 0x00]);
        let _ = strip_prefix(prefixed_key_bytes);
    }
}

mod extract_hash {
    use crate::mpt::types::Node;
    use crate::types::fragment::Fragment;
    use super::extract_hash;

    #[test(should_fail_with = "Invalid node type")]
    fn fail_invalid_node_type() {
        let mut invalid_node: Node = [0x00; 532];
        invalid_node[0] = 0xc3;
        invalid_node[1] = 0x01;
        invalid_node[2] = 0x02;
        invalid_node[3] = 0x03;
        let mut key_ptr = 0;
        let key_nibbles = Fragment::from_array([]);
        let _ = extract_hash(invalid_node, key_nibbles, &mut key_ptr);
    }
}

mod extract_hash_from_branch_node {
    use crate::fixtures::mpt::branch_then_leaf::{key, proof_input};
    use crate::helpers::bytes::bytes_to_nibbles;
    use crate::rlp::decode::decode_list_of_small_strings;
    use crate::types::fragment::Fragment;
    use super::extract_hash_from_branch_node;

    #[test]
    fn test_branch_node() {
        let branch_node: [u8; 532] = proof_input.proof().nodes()[0];
        let branch_node_rlp_list = decode_list_of_small_strings(Fragment::from_array(branch_node));
        let key_nibbles = bytes_to_nibbles(Fragment::new(3, 1, key));
        let mut key_ptr = 1;
        let extracted = extract_hash_from_branch_node(
            branch_node,
            branch_node_rlp_list,
            key_nibbles,
            &mut key_ptr,
        );
        let expected: [u8; 32] = [
            0x4d, 0xc9, 0x94, 0xb1, 0xa8, 0x44, 0x39, 0x4a, 0x1d, 0xa2, 0xae, 0x94, 0x88, 0x47,
            0x6b, 0xa8, 0xdb, 0x91, 0xf0, 0x90, 0x22, 0x5d, 0x87, 0x4b, 0x9e, 0xcb, 0x9c, 0x81,
            0xfe, 0x33, 0xc0, 0x19,
        ];
        assert(extracted.data() == expected, "Incorrect hash extracted");
        assert(key_ptr == 2, "Key pointer didn't advance correctly");
    }

}

mod extract_hash_from_extension_node {
    use crate::fixtures::mpt::extension_even::{key as even_key, proof_input as even_proof_input};
    use crate::fixtures::mpt::extension_odd::{key as odd_key, proof_input as odd_proof_input};
    use crate::helpers::bytes::bytes_to_nibbles;
    use crate::rlp::decode::decode_list_of_small_strings;
    use crate::types::fragment::Fragment;
    use super::extract_hash_from_branch_node;

    global expected: [u8; 32] = [
        0x60, 0xc1, 0xdf, 0x16, 0xda, 0x26, 0x84, 0x73, 0xae, 0xe6, 0xb0, 0x02, 0xca, 0xe7, 0x9c,
        0xf9, 0x10, 0xd1, 0xfa, 0x0b, 0xc8, 0xc0, 0x66, 0x9a, 0xfa, 0x63, 0x1b, 0xae, 0xd0, 0xeb,
        0x6f, 0x52,
    ];

    #[test]
    fn test_extension_odd() {
        let branch_node: [u8; 532] = odd_proof_input.proof().nodes()[0];
        let branch_node_rlp_list = decode_list_of_small_strings(Fragment::from_array(branch_node));
        let key_nibbles = bytes_to_nibbles(Fragment::new(4, 2, odd_key));
        let mut key_ptr = 0;
        let extracted = extract_hash_from_branch_node(
            branch_node,
            branch_node_rlp_list,
            key_nibbles,
            &mut key_ptr,
        );

        assert(extracted.data() == expected, "Incorrect hash extracted");
        assert(key_ptr == 1, "Key pointer didn't advance correctly");
    }

    #[test]
    fn test_extension_even() {
        let branch_node: [u8; 532] = even_proof_input.proof().nodes()[1];
        let branch_node_rlp_list = decode_list_of_small_strings(Fragment::from_array(branch_node));
        let key_nibbles = bytes_to_nibbles(Fragment::new(5, 3, even_key));
        let mut key_ptr = 1;
        let extracted = extract_hash_from_branch_node(
            branch_node,
            branch_node_rlp_list,
            key_nibbles,
            &mut key_ptr,
        );

        assert(extracted.data() == expected, "Incorrect hash extracted");
        assert(key_ptr == 2, "Key pointer didn't advance correctly");
    }

}
