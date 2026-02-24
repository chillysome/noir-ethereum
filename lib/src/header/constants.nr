//! Ethereum Block Header Constants
//!
//! This module defines constants used for working with Ethereum block headers.
//! It includes:
//! - Maximum sizes and field counts for block headers
//! - Field indices for RLP-encoded block header fields
//! - Block numbers for major Ethereum network upgrades

/// Maximum size of a block header in bytes
///
/// Calculation:
/// (Parent Hash: 32 bytes + 1 prefix)
/// + (Ommers Hash: 32 bytes + 1 prefix)
/// + (Beneficiary: 20 bytes + 1 prefix)
/// + (State Root: 32 bytes + 1 prefix)
/// + (Transactions Root: 32 bytes + 1 prefix)
/// + (Receipts Root: 32 bytes + 1 prefix)
/// + (Logs Bloom: 256 bytes + 1 prefix + 2 len of len)
/// + (Difficulty: 32 bytes + 1 prefix)
/// + (Number: 8 bytes + 1 prefix)
/// + (Gas Limit: 8 bytes + 1 prefix)
/// + (Gas Used: 8 bytes + 1 prefix)
/// + (Timestamp: 8 bytes + 1 prefix)
/// + (Extra Data: 32 bytes + 1 prefix)
/// + (Mix Hash: 32 bytes + 1 prefix)
/// + (Nonce: 8 bytes + 1 prefix)
/// + (Base Fee Per Gas: 32 bytes + 1 prefix)
/// + (Withdrawals Root: 32 bytes + 1 prefix)
/// + (Blob Gas Used: 8 bytes + 1 prefix)
/// + (Excess Blob Gas: 8 bytes + 1 prefix)
/// + (Parent Beacon Block Root: 32 bytes + 1 prefix)
/// + (Requests Hash: 32 bytes + 1 prefix)
/// =  739
///
/// 739 + list_prefix(3) = 742
pub global MAX_HEADER_SIZE: u32 = 742;

/// Maximum number of fields allowed in a block header
pub global MAX_HEADER_FIELDS_COUNT: u32 = 21;

/// Index of the parent block hash in the RLP-encoded header
pub global PARENT_HASH_INDEX: u32 = 0;

/// Index of the ommers (uncle blocks) hash in the RLP-encoded header
pub global OMMERS_HASH_INDEX: u32 = 1;

/// Index of the beneficiary (miner/validator) address in the RLP-encoded header
pub global BENEFICIARY_INDEX: u32 = 2;

/// Index of the state root hash in the RLP-encoded header
pub global STATE_ROOT_INDEX: u32 = 3;

/// Index of the transactions root hash in the RLP-encoded header
pub global TRANSACTIONS_ROOT_INDEX: u32 = 4;

/// Index of the receipts root hash in the RLP-encoded header
pub global RECEIPTS_ROOT_INDEX: u32 = 5;

/// Index of the logs bloom filter in the RLP-encoded header
pub global LOGS_BLOOM_INDEX: u32 = 6;

/// Index of the difficulty value in the RLP-encoded header
pub global DIFFICULTY_INDEX: u32 = 7;

/// Index of the block number in the RLP-encoded header
pub global BLOCK_NUMBER_INDEX: u32 = 8;

/// Index of the gas limit in the RLP-encoded header
pub global GAS_LIMIT_INDEX: u32 = 9;

/// Index of the gas used in the RLP-encoded header
pub global GAS_USED_INDEX: u32 = 10;

/// Index of the timestamp in the RLP-encoded header
pub global TIMESTAMP_INDEX: u32 = 11;

/// Index of the extra data in the RLP-encoded header
pub global EXTRA_DATA_INDEX: u32 = 12;

/// Index of the mix hash in the RLP-encoded header
pub global MIX_HASH_INDEX: u32 = 13;

/// Index of the nonce in the RLP-encoded header
pub global NONCE_INDEX: u32 = 14;

/// Index of the base fee per gas in the RLP-encoded header (EIP-1559)
pub global BASE_FEE_PER_GAS_INDEX: u32 = 15;

/// Index of the withdrawals root in the RLP-encoded header (Shanghai upgrade)
pub global WITHDRAWALS_ROOT_INDEX: u32 = 16;

/// Index of the blob gas used in the RLP-encoded header (Cancun upgrade)
pub global BLOB_GAS_USED_INDEX: u32 = 17;

/// Index of the excess blob gas in the RLP-encoded header (Cancun upgrade)
pub global EXCESS_BLOB_GAS_INDEX: u32 = 18;

/// Index of the parent beacon block root in the RLP-encoded header (Cancun upgrade)
pub global PARENT_BEACON_BLOCK_ROOT_INDEX: u32 = 19;

/// Index of the requests hash in the RLP-encoded header (Prague upgrade / EIP-7685)
pub global REQUESTS_HASH_INDEX: u32 = 20;

/// Block number where the London upgrade was activated (EIP-1559)
pub global LONDON_BLOCK_NUMBER: u64 = 12_965_000;

/// Block number where the Shanghai upgrade was activated (EIP-4895)
pub global SHANGHAI_BLOCK_NUMBER: u64 = 17_034_870;

/// Block number where the Cancun upgrade was activated (EIP-4844)
pub global CANCUN_BLOCK_NUMBER: u64 = 19_426_587;

/// Block number where the Prague upgrade was activated (EIP-7685)
/// Activated on mainnet at block 22,431,084 (2025-05-07 10:05:11 UTC)
pub global PRAGUE_BLOCK_NUMBER: u64 = 22_431_084;
