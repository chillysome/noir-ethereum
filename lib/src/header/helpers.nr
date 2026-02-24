//! Ethereum Block Header Helper Functions
//!
//! This module provides helper functions for working with Ethereum block headers.
//! It includes utilities for determining the number of fields in a block header
//! based on the chain ID and block number, taking into account different network
//! upgrades and their impact on header structure.

use crate::chain::constants::{ETHEREUM_MAINNET_CHAIN_ID, ETHEREUM_SEPOLIA_CHAIN_ID};

use super::constants::{
    CANCUN_BLOCK_NUMBER, LONDON_BLOCK_NUMBER, PRAGUE_BLOCK_NUMBER, SHANGHAI_BLOCK_NUMBER,
};

/// Determines the number of fields in a block header based on chain ID and block number.
///
/// This function calculates the total number of fields in a block header by considering:
/// - The base number of fields (15) present in all Ethereum block headers
/// - Additional fields introduced by network upgrades on mainnet:
///   * London upgrade (EIP-1559): +1 field (base_fee_per_gas)
///   * Shanghai upgrade (EIP-4895): +1 field (withdrawals_root)
///   * Cancun upgrade (EIP-4844): +3 fields (blob_gas_used, excess_blob_gas, parent_beacon_block_root)
///   * Prague upgrade (EIP-7685): +1 field (requests_hash)
/// - Chain-specific requirements (e.g., Sepolia testnet always has 20 fields)
///
/// # Arguments
///
/// * `chain_id` - The ID of the Ethereum network (e.g., 1 for mainnet, 11155111 for Sepolia)
/// * `block_number` - The block number to check against upgrade boundaries
///
/// # Returns
///
/// The total number of fields in the block header for the given chain and block number
///
/// # Panics
///
/// Panics if an unsupported chain ID is provided
pub fn get_header_fields_count(chain_id: u64, block_number: u64) -> u64 {
    // Start with base number of fields present in all Ethereum block headers
    let mut fields_count = 15;

    // Handle mainnet-specific field counts based on network upgrades
    if chain_id == ETHEREUM_MAINNET_CHAIN_ID {
        // Add base_fee_per_gas field after London upgrade
        if block_number >= LONDON_BLOCK_NUMBER {
            fields_count += 1;
        }
        // Add withdrawals_root field after Shanghai upgrade
        if block_number >= SHANGHAI_BLOCK_NUMBER {
            fields_count += 1;
        }
        // Add blob-related fields after Cancun upgrade
        if block_number >= CANCUN_BLOCK_NUMBER {
            fields_count += 3;
        }
        // Add requests_hash field after Prague upgrade
        if block_number >= PRAGUE_BLOCK_NUMBER {
            fields_count += 1;
        }
    } else if chain_id == ETHEREUM_SEPOLIA_CHAIN_ID {
        // Sepolia testnet always has all fields enabled
        fields_count = 21;
    } else {
        // Reject unsupported networks
        assert(false, "Unsupported chain ID");
    }
    fields_count
}
