//! Ethereum Block Header Structures and Verification
//!
//! This module provides structures and functions for working with Ethereum block headers.
//! It includes:
//! - Complete block header structure with all fields
//! - Partial block header structure for state verification
//! - Header verification functionality

use dep::keccak256::keccak256;

use crate::helpers::arrays::sub_array_equals;
use crate::rlp::{decode::decode_list, list::RlpList};
use crate::types::{address::Address, bytes32::Bytes32, fragment::Fragment, hash::Hash};

use super::constants::{
    BLOCK_NUMBER_INDEX, MAX_HEADER_FIELDS_COUNT, RECEIPTS_ROOT_INDEX, STATE_ROOT_INDEX,
    TRANSACTIONS_ROOT_INDEX, WITHDRAWALS_ROOT_INDEX,
};
use super::{helpers::get_header_fields_count, types::BlockHeaderRlp};

/// Represents a complete Ethereum block header with all fields.
///
/// This structure contains all possible fields that can be present in an Ethereum
/// block header, including those introduced by network upgrades. Optional fields
/// are used for post-upgrade features to maintain compatibility with older blocks.
///
/// # Fields
///
/// * `parent_hash` - Hash of the parent block
/// * `ommers_hash` - Hash of the uncle blocks
/// * `beneficiary` - Address of the block producer
/// * `state_root` - Root hash of the state trie
/// * `transactions_root` - Root hash of the transactions trie
/// * `receipts_root` - Root hash of the receipts trie
/// * `logs_bloom` - Bloom filter of log entries
/// * `difficulty` - Block difficulty
/// * `number` - Block number
/// * `gas_limit` - Maximum gas allowed in this block
/// * `gas_used` - Total gas used by transactions in this block
/// * `timestamp` - Block timestamp
/// * `extra_data` - Additional block data
/// * `mix_hash` - Mix hash for proof of work
/// * `nonce` - Block nonce
/// * `base_fee_per_gas` - Base fee per gas (post-London)
/// * `withdrawals_root` - Root hash of withdrawals (post-Shanghai)
/// * `blob_gas_used` - Gas used by blob transactions (post-Cancun)
/// * `excess_blob_gas` - Excess blob gas (post-Cancun)
/// * `parent_beacon_block_root` - Root of parent beacon block (post-Cancun)
pub struct BlockHeader {
    parent_hash: Hash,
    ommers_hash: Hash,
    beneficiary: Address,
    state_root: Hash,
    transactions_root: Hash,
    receipts_root: Hash,
    logs_bloom: [u8; 256],
    difficulty: Bytes32,
    number: u64,
    gas_limit: u64,
    gas_used: u64,
    timestamp: u64,
    extra_data: Bytes32,
    mix_hash: Hash,
    nonce: u64,
    base_fee_per_gas: Bytes32,
    withdrawals_root: Option<Hash>, // Introduced in Shanghai Upgrade
    blob_gas_used: Option<u64>, // Introduced in EIP-4844
    excess_blob_gas: Option<u64>, // Introduced in EIP-4844
    parent_beacon_block_root: Option<Bytes32>, // Introduced in EIP-4788
}

/// Represents a partial block header used for state verification.
///
/// This structure contains only the fields necessary for verifying the state,
/// transactions, and receipts of a block. It is used when full block header
/// verification is not required.
///
/// # Fields
///
/// * `number` - Block number
/// * `hash` - Block hash
/// * `state_root` - Root hash of the state trie
/// * `transactions_root` - Root hash of the transactions trie
/// * `receipts_root` - Root hash of the receipts trie
/// * `withdrawals_root` - Root hash of withdrawals (post-Shanghai)
pub struct BlockHeaderPartial {
    number: u64,
    hash: Hash,
    state_root: Hash,
    transactions_root: Hash,
    receipts_root: Hash,
    withdrawals_root: Option<Hash>, // Introduced in Shanghai Upgrade
}

impl BlockHeader {
    /// Creates a new block header with all fields.
    ///
    /// # Arguments
    ///
    /// All fields from the BlockHeader structure, with optional fields for
    /// post-upgrade features (Shanghai, Cancun).
    ///
    /// # Returns
    ///
    /// A new BlockHeader instance
    pub fn new(
        parent_hash: Hash,
        ommers_hash: Hash,
        beneficiary: Address,
        state_root: Hash,
        transactions_root: Hash,
        receipts_root: Hash,
        logs_bloom: [u8; 256],
        difficulty: Bytes32,
        number: u64,
        gas_limit: u64,
        gas_used: u64,
        timestamp: u64,
        extra_data: Bytes32,
        mix_hash: Hash,
        nonce: u64,
        base_fee_per_gas: Bytes32,
        withdrawals_root: Option<Hash>,
        blob_gas_used: Option<u64>,
        excess_blob_gas: Option<u64>,
        parent_beacon_block_root: Option<Bytes32>,
    ) -> Self {
        Self {
            parent_hash,
            ommers_hash,
            beneficiary,
            state_root,
            transactions_root,
            receipts_root,
            logs_bloom,
            difficulty,
            number,
            gas_limit,
            gas_used,
            timestamp,
            extra_data,
            mix_hash,
            nonce,
            base_fee_per_gas,
            withdrawals_root,
            blob_gas_used,
            excess_blob_gas,
            parent_beacon_block_root,
        }
    }

    /// Gets the Block Header Parent Hash
    ///
    /// # Returns
    ///
    /// The 32-byte hash of the parent block
    pub fn parent_hash(self) -> Hash {
        self.parent_hash
    }

    /// Gets the Block Header Ommers Hash
    ///
    /// # Returns
    ///
    /// The 32-byte hash of the uncle blocks
    pub fn ommers_hash(self) -> Hash {
        self.ommers_hash
    }

    /// Gets the Block Header Beneficiary
    ///
    /// # Returns
    ///
    /// The 20-byte address of the block producer
    pub fn beneficiary(self) -> Address {
        self.beneficiary
    }

    /// Gets the Block Header State Root
    ///
    /// # Returns
    ///
    /// The 32-byte hash of the state trie
    pub fn state_root(self) -> Hash {
        self.state_root
    }

    /// Gets the Block Header Transactions Root
    ///
    /// # Returns
    ///
    /// The 32-byte hash of the transactions trie
    pub fn transactions_root(self) -> Hash {
        self.transactions_root
    }

    /// Gets the Block Header Receipts Root
    ///
    /// # Returns
    ///
    /// The 32-byte hash of the receipts trie
    pub fn receipts_root(self) -> Hash {
        self.receipts_root
    }

    /// Gets the Block Header Logs Bloom
    ///
    /// # Returns
    ///
    /// The 256-byte bloom filter of log entries
    pub fn logs_bloom(self) -> [u8; 256] {
        self.logs_bloom
    }

    /// Gets the Block Header Difficulty
    ///
    /// # Returns
    ///
    /// The 32-byte difficulty value
    pub fn difficulty(self) -> Bytes32 {
        self.difficulty
    }

    /// Gets the Block Header Number
    ///
    /// # Returns
    ///
    /// The block number
    pub fn number(self) -> u64 {
        self.number
    }

    /// Gets the Block Header Gas Limit
    ///
    /// # Returns
    ///
    /// The maximum gas allowed in this block
    pub fn gas_limit(self) -> u64 {
        self.gas_limit
    }

    /// Gets the Block Header Gas Used
    ///
    /// # Returns
    ///
    /// The total gas used by transactions in this block
    pub fn gas_used(self) -> u64 {
        self.gas_used
    }

    /// Gets the Block Header Timestamp
    ///
    /// # Returns
    ///
    /// The block timestamp
    pub fn timestamp(self) -> u64 {
        self.timestamp
    }

    /// Gets the Block Header Extra Data
    ///
    /// # Returns
    ///
    /// The additional block data
    pub fn extra_data(self) -> Bytes32 {
        self.extra_data
    }

    /// Gets the Block Header Mix Hash
    ///
    /// # Returns
    ///
    /// The 32-byte mix hash for proof of work
    pub fn mix_hash(self) -> Hash {
        self.mix_hash
    }

    /// Gets the Block Header Nonce
    ///
    /// # Returns
    ///
    /// The block nonce
    pub fn nonce(self) -> u64 {
        self.nonce
    }

    /// Gets the Block Header Base Fee Per Gas
    ///
    /// # Returns
    ///
    /// The block base fee per gas
    pub fn base_fee_per_gas(self) -> Bytes32 {
        self.base_fee_per_gas
    }

    /// Gets the Block Header Withdrawals Root
    ///
    /// # Returns
    ///
    /// The 32-byte withdrawals root
    pub fn withdrawals_root(self) -> Option<Hash> {
        self.withdrawals_root
    }

    /// Gets the Block Header Blob Gas Used
    ///
    /// # Returns
    ///
    /// The gas used by blob transactions
    pub fn blob_gas_used(self) -> Option<u64> {
        self.blob_gas_used
    }

    /// Gets the Block Header Excess Blob Gas
    ///
    /// # Returns
    ///
    /// The excess blob gas
    pub fn excess_blob_gas(self) -> Option<u64> {
        self.excess_blob_gas
    }

    /// Gets the Block Header Parent Beacon Block Root
    ///
    /// # Returns
    ///
    /// The 32-byte parent beacon block root
    pub fn parent_beacon_block_root(self) -> Option<Bytes32> {
        self.parent_beacon_block_root
    }
}

impl BlockHeaderPartial {
    /// Creates a new partial block header for state verification.
    ///
    /// # Arguments
    ///
    /// * `number` - Block number
    /// * `hash` - Block hash
    /// * `state_root` - Root hash of the state trie
    /// * `transactions_root` - Root hash of the transactions trie
    /// * `receipts_root` - Root hash of the receipts trie
    /// * `withdrawals_root` - Optional root hash of withdrawals (post-Shanghai)
    ///
    /// # Returns
    ///
    /// A new BlockHeaderPartial instance
    pub fn new(
        number: u64,
        hash: Hash,
        state_root: Hash,
        transactions_root: Hash,
        receipts_root: Hash,
        withdrawals_root: Option<Hash>,
    ) -> Self {
        Self { number, hash, state_root, transactions_root, receipts_root, withdrawals_root }
    }

    /// Gets the Block Header Number
    ///
    /// # Returns
    ///
    /// The block number
    pub fn number(self) -> u64 {
        self.number
    }

    /// Gets the Block Header Hash
    ///
    /// # Returns
    ///
    /// The 32-byte block hash
    pub fn hash(self) -> Hash {
        self.hash
    }

    /// Gets the Block Header State Root
    ///
    /// # Returns
    ///
    /// The 32-byte state root
    pub fn state_root(self) -> Hash {
        self.state_root
    }

    /// Gets the Block Header Transactions Root
    ///
    /// # Returns
    ///
    /// The 32-byte transactions root
    pub fn transactions_root(self) -> Hash {
        self.transactions_root
    }

    /// Gets the Block Header Receipts Root
    ///
    /// # Returns
    ///
    /// The 32-byte receipts root
    pub fn receipts_root(self) -> Hash {
        self.receipts_root
    }

    /// Gets the Block Header Withdrawals Root
    ///
    /// # Returns
    ///
    /// The 32-byte withdrawals root
    pub fn withdrawals_root(self) -> Option<Hash> {
        self.withdrawals_root
    }
}

/// Verifies a block header against a partial header and RLP-encoded data.
///
/// This function performs several checks:
/// 1. Verifies the number of fields matches the expected count for the chain and block number
/// 2. Validates critical fields against the partial header
/// 3. Optionally verifies the withdrawals root if present
/// 4. Confirms the block hash matches the RLP-encoded data
///
/// # Arguments
///
/// * `chain_id` - The ID of the Ethereum network
/// * `block_header_partial` - The partial header containing verification data
/// * `block_header_rlp` - The RLP-encoded block header
///
/// # Panics
///
/// Panics if:
/// - The number of fields doesn't match the expected count
/// - Any critical field doesn't match the partial header
/// - The block hash doesn't match the RLP-encoded data
pub fn verify_header(
    chain_id: u64,
    block_header_partial: BlockHeaderPartial,
    block_header_rlp: BlockHeaderRlp,
) {
    // Convert RLP data to a fragment for processing
    let block_header_rlp = Fragment::from_vec(block_header_rlp);
    let header_rlp_list: RlpList<MAX_HEADER_FIELDS_COUNT> = decode_list(block_header_rlp);

    // Verify the number of fields matches the expected count for this chain and block number
    let expected_header_fields_count =
        get_header_fields_count(chain_id, block_header_partial.number);
    let actual_header_fields_count = header_rlp_list.len() as u64;

    assert(
        expected_header_fields_count == actual_header_fields_count,
        f"Expected header fields count: {expected_header_fields_count}, got
        : {actual_header_fields_count}",
    );

    // Verify critical fields match the partial header
    header_rlp_list.get(BLOCK_NUMBER_INDEX).assert_eq_u64(
        "Block number",
        block_header_rlp,
        block_header_partial.number,
    );
    header_rlp_list.get(STATE_ROOT_INDEX).assert_eq_bytes32(
        "State Root",
        block_header_rlp,
        block_header_partial.state_root,
    );
    header_rlp_list.get(TRANSACTIONS_ROOT_INDEX).assert_eq_bytes32(
        "Transactions Root",
        block_header_rlp,
        block_header_partial.transactions_root,
    );
    header_rlp_list.get(RECEIPTS_ROOT_INDEX).assert_eq_bytes32(
        "Receipts Root",
        block_header_rlp,
        block_header_partial.receipts_root,
    );

    // Verify withdrawals root if present (post-Shanghai)
    if (block_header_partial.withdrawals_root.is_some()) {
        header_rlp_list.get(WITHDRAWALS_ROOT_INDEX).assert_eq_bytes32(
            "Withdrawals Root",
            block_header_rlp,
            block_header_partial.withdrawals_root().unwrap(),
        );
    }

    // Verify the block hash matches the RLP-encoded data
    assert(
        sub_array_equals(
            keccak256(block_header_rlp.data(), block_header_rlp.len() as u32),
            block_header_partial.hash,
            0,
        ),
        "Block Hash does not Match",
    );
}

// Test modules for different network upgrades
mod pre_london_tests {
    use crate::fixtures::header::{PRE_LONDON_BLOCK_HEADER_RLP, PRE_LONDON_PARTIAL_BLOCK_HEADER};
    use super::verify_header;

    #[test]
    fn test_verify_pre_london_block() {
        verify_header(
            1,
            PRE_LONDON_PARTIAL_BLOCK_HEADER,
            PRE_LONDON_BLOCK_HEADER_RLP,
        );
    }
}

mod post_london_tests {
    use crate::fixtures::header::{POST_LONDON_BLOCK_HEADER_RLP, POST_LONDON_PARTIAL_BLOCK_HEADER};
    use super::verify_header;

    #[test]
    fn test_verify_post_london_block() {
        verify_header(
            1,
            POST_LONDON_PARTIAL_BLOCK_HEADER,
            POST_LONDON_BLOCK_HEADER_RLP,
        );
    }
}

mod post_shanghai_tests {
    use crate::fixtures::header::{
        POST_SHANGHAI_BLOCK_HEADER_RLP, POST_SHANGHAI_PARTIAL_BLOCK_HEADER,
    };
    use super::verify_header;

    #[test]
    fn test_verify_post_shanghai_block() {
        verify_header(
            1,
            POST_SHANGHAI_PARTIAL_BLOCK_HEADER,
            POST_SHANGHAI_BLOCK_HEADER_RLP,
        );
    }
}

mod post_cancun_tests {
    use crate::fixtures::header::{POST_CANCUN_BLOCK_HEADER_RLP, POST_CANCUN_PARTIAL_BLOCK_HEADER};
    use super::verify_header;

    #[test]
    fn test_verify_post_cancun_block() {
        verify_header(
            1,
            POST_CANCUN_PARTIAL_BLOCK_HEADER,
            POST_CANCUN_BLOCK_HEADER_RLP,
        );
    }
}
