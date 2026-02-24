//! Ethereum Transaction Types and Verification
//!
//! This module provides structures and functions for working with different types of Ethereum transactions:
//! - Legacy transactions (pre-EIP-1559)
//! - EIP-2930 transactions (Access Lists)
//! - EIP-1559 transactions (Fee Market)
//! - EIP-4844 transactions (Blob Transactions)
//! - EIP-7702 transactions (Authorization Lists)
use crate::{
    helpers::bytes::right_pad,
    mpt::verify::verify_merkle_proof,
    types::{address::Address, bytes32::Bytes32, fragment::Fragment, hash::Hash},
};

use super::helpers::{
    assert_transaction_index_equals, assert_tx_rlp_equals, split_into_tx_type_and_rlp,
};
use super::types::TransactionProof;
use super::types::TransactionType;

/// Represents a legacy Ethereum transaction (pre-EIP-1559).
///
/// Legacy transactions are the original transaction format used in Ethereum before
/// the introduction of EIP-1559. They include:
/// - Basic transaction fields (nonce, gas price, gas limit, etc.)
/// - Simple signature fields (v, r, s)
///
/// # Generics
///
/// * `MaxDataLen` - Maximum length of the transaction data field
pub struct LegacyTransaction<let MaxDataLen: u32> {
    /// The nonce of the transaction,
    nonce: u64,
    /// The gas price in wei per unit of gas
    gas_price: u64,
    /// The maximum amount of gas that can be used by the transaction
    gas_limit: u64,
    /// The recipient address, or None for contract creation
    to: Option<Address>,
    /// The amount of ETH to transfer in wei
    value: u128,
    /// The transaction data/code
    data: BoundedVec<u8, MaxDataLen>,
    /// The recovery parameter of the signature
    v: u8,
    /// The first component of the signature
    r: Bytes32,
    /// The second component of the signature
    s: Bytes32,
}

impl<let MaxDataLen: u32> LegacyTransaction<MaxDataLen> {
    pub fn new(
        nonce: u64,
        gas_price: u64,
        gas_limit: u64,
        to: Option<Address>,
        value: u128,
        data: BoundedVec<u8, MaxDataLen>,
        v: u8,
        r: Bytes32,
        s: Bytes32,
    ) -> Self {
        Self { nonce, gas_price, gas_limit, to, value, data, v, r, s }
    }

    /// Returns the transaction nonce
    pub fn nonce(self) -> u64 {
        self.nonce
    }

    /// Returns the gas price in wei per unit of gas
    pub fn gas_price(self) -> u64 {
        self.gas_price
    }

    /// Returns the maximum amount of gas that can be used by the transaction
    pub fn gas_limit(self) -> u64 {
        self.gas_limit
    }

    /// Returns the recipient address, or None for contract creation
    pub fn to(self) -> Option<Address> {
        self.to
    }

    /// Returns the amount of ETH to transfer in wei
    pub fn value(self) -> u128 {
        self.value
    }

    /// Returns the transaction data/code
    pub fn data(self) -> BoundedVec<u8, MaxDataLen> {
        self.data
    }

    /// Returns the recovery parameter of the signature
    pub fn v(self) -> u8 {
        self.v
    }

    /// Returns the first component of the signature
    pub fn r(self) -> Bytes32 {
        self.r
    }

    /// Returns the second component of the signature
    pub fn s(self) -> Bytes32 {
        self.s
    }
}

impl<let MaxDataLen: u32> Eq for LegacyTransaction<MaxDataLen> {
    fn eq(self, other: Self) -> bool {
        (self.nonce == other.nonce)
            & (self.gas_price == other.gas_price)
            & (self.gas_limit == other.gas_limit)
            & (self.to == other.to)
            & (self.value == other.value)
            & (self.data == other.data)
            & (self.v == other.v)
            & (self.r == other.r)
            & (self.s == other.s)
    }
}

/// Represents an EIP-2930 access list.
///
/// Access lists contain:
/// - Address of the contract
/// - Storage keys for access
///
/// # Generics
///
/// * `MaxStorageKeysLen` - Maximum length of the storage keys
pub struct AccessList<let MaxStorageKeysLen: u32> {
    address: Address,
    storage_keys: BoundedVec<Hash, MaxStorageKeysLen>,
}

impl<let MaxStorageKeysLen: u32> AccessList<MaxStorageKeysLen> {
    pub fn new(address: Address, storage_keys: BoundedVec<Hash, MaxStorageKeysLen>) -> Self {
        Self { address, storage_keys }
    }

    /// Returns the address of the contract
    pub fn address(self) -> Address {
        self.address
    }

    /// Returns the storage keys for access
    pub fn storage_keys(self) -> BoundedVec<Hash, MaxStorageKeysLen> {
        self.storage_keys
    }
}

impl<let MaxStorageKeysLen: u32> Eq for AccessList<MaxStorageKeysLen> {
    fn eq(self, other: Self) -> bool {
        (self.address == other.address) & (self.storage_keys == other.storage_keys)
    }
}

/// Represents an EIP-2930 transaction with access lists.
///
/// EIP-2930 introduced access lists to optimize gas usage for state access.
/// These transactions include:
/// - All legacy transaction fields
/// - Chain ID
/// - Access list for gas optimization
///
/// # Generics
///
/// * `MaxDataLen` - Maximum length of the transaction data field
/// * `MaxAccessListLen` - Maximum length of the access list
/// * `MaxStorageKeysLen` - Maximum length of the storage keys
pub struct EIP2930Transaction<let MaxDataLen: u32, let MaxAccessListLen: u32, let MaxStorageKeysLen: u32> {
    /// The chain ID
    chain_id: u64,
    /// The nonce of the transaction
    nonce: u64,
    /// The gas price in wei per unit of gas
    gas_price: u64,
    /// The maximum amount of gas that can be used
    gas_limit: u64,
    /// The recipient address, or None for contract creation
    to: Option<Address>,
    /// The amount of ETH to transfer in wei
    value: u128,
    /// The transaction data/code
    data: BoundedVec<u8, MaxDataLen>,
    /// The access list for gas optimization
    access_lists: BoundedVec<AccessList<MaxStorageKeysLen>, MaxAccessListLen>,
    /// The recovery parameter of the signature
    v: u8,
    /// The first component of the signature
    r: Bytes32,
    /// The second component of the signature
    s: Bytes32,
}

impl<let MaxDataLen: u32, let MaxAccessListLen: u32, let MaxStorageKeysLen: u32> EIP2930Transaction<MaxDataLen, MaxAccessListLen, MaxStorageKeysLen> {
    pub fn new(
        chain_id: u64,
        nonce: u64,
        gas_price: u64,
        gas_limit: u64,
        to: Option<Address>,
        value: u128,
        data: BoundedVec<u8, MaxDataLen>,
        access_lists: BoundedVec<AccessList<MaxStorageKeysLen>, MaxAccessListLen>,
        v: u8,
        r: Bytes32,
        s: Bytes32,
    ) -> Self {
        Self { chain_id, nonce, gas_price, gas_limit, to, value, data, access_lists, v, r, s }
    }

    /// Returns the chain ID
    pub fn chain_id(self) -> u64 {
        self.chain_id
    }

    /// Returns the transaction nonces
    pub fn nonce(self) -> u64 {
        self.nonce
    }

    /// Returns the gas price in wei per unit of gas
    pub fn gas_price(self) -> u64 {
        self.gas_price
    }

    /// Returns the maximum amount of gas that can be used
    pub fn gas_limit(self) -> u64 {
        self.gas_limit
    }

    /// Returns the recipient address, or None for contract creation
    pub fn to(self) -> Option<Address> {
        self.to
    }

    /// Returns the amount of ETH to transfer in wei
    pub fn value(self) -> u128 {
        self.value
    }

    /// Returns the transaction data/code
    pub fn data(self) -> BoundedVec<u8, MaxDataLen> {
        self.data
    }

    /// Returns the access list for gas optimization
    pub fn access_lists(self) -> BoundedVec<AccessList<MaxStorageKeysLen>, MaxAccessListLen> {
        self.access_lists
    }

    /// Returns the recovery parameter of the signature
    pub fn v(self) -> u8 {
        self.v
    }

    /// Returns the first component of the signature
    pub fn r(self) -> Bytes32 {
        self.r
    }

    /// Returns the second component of the signature
    pub fn s(self) -> Bytes32 {
        self.s
    }
}

impl<let MaxDataLen: u32, let MaxAccessListLen: u32, let MaxStorageKeysLen: u32> Eq for EIP2930Transaction<MaxDataLen, MaxAccessListLen, MaxStorageKeysLen> {
    fn eq(self, other: Self) -> bool {
        (self.chain_id == other.chain_id)
            & (self.nonce == other.nonce)
            & (self.gas_price == other.gas_price)
            & (self.gas_limit == other.gas_limit)
            & (self.to == other.to)
            & (self.value == other.value)
            & (self.data == other.data)
            & (self.access_lists == other.access_lists)
            & (self.v == other.v)
            & (self.r == other.r)
            & (self.s == other.s)
    }
}

/// Represents an EIP-1559 transaction with fee market changes.
///
/// EIP-1559 introduced a new fee market mechanism with:
/// - Base fee that is burned
/// - Priority fee for miners/validators
/// - Maximum fee per gas
/// - Access lists for gas optimization
///
/// # Generics
///
/// * `MaxDataLen` - Maximum length of the transaction data field
/// * `MaxAccessListLen` - Maximum length of the access list
/// * `MaxStorageKeysLen` - Maximum length of the storage keys
pub struct EIP1559Transaction<let MaxDataLen: u32, let MaxAccessListLen: u32, let MaxStorageKeysLen: u32> {
    /// The chain ID
    chain_id: u64,
    /// The nonce of the transaction
    nonce: u64,
    /// The maximum priority fee per gas in wei
    max_priority_fee_per_gas: u64,
    /// The maximum fee per gas in wei
    max_fee_per_gas: u64,
    /// The maximum amount of gas that can be used
    gas_limit: u64,
    /// The recipient address, or None for contract creation
    to: Option<Address>,
    /// The amount of ETH to transfer in wei
    value: u128,
    /// The transaction data/code
    data: BoundedVec<u8, MaxDataLen>,
    /// The access list for gas optimization
    access_lists: BoundedVec<AccessList<MaxStorageKeysLen>, MaxAccessListLen>,
    /// The recovery parameter of the signature
    v: u8,
    /// The first component of the signature
    r: Bytes32,
    /// The second component of the signature
    s: Bytes32,
}

impl<let MaxDataLen: u32, let MaxAccessListLen: u32, let MaxStorageKeysLen: u32> EIP1559Transaction<MaxDataLen, MaxAccessListLen, MaxStorageKeysLen> {
    pub fn new(
        chain_id: u64,
        nonce: u64,
        max_priority_fee_per_gas: u64,
        max_fee_per_gas: u64,
        gas_limit: u64,
        to: Option<Address>,
        value: u128,
        data: BoundedVec<u8, MaxDataLen>,
        access_lists: BoundedVec<AccessList<MaxStorageKeysLen>, MaxAccessListLen>,
        v: u8,
        r: Bytes32,
        s: Bytes32,
    ) -> Self {
        Self {
            chain_id,
            nonce,
            max_priority_fee_per_gas,
            max_fee_per_gas,
            gas_limit,
            to,
            value,
            data,
            access_lists,
            v,
            r,
            s,
        }
    }

    /// Returns the chain ID
    pub fn chain_id(self) -> u64 {
        self.chain_id
    }

    /// Returns the transaction nonce
    pub fn nonce(self) -> u64 {
        self.nonce
    }

    /// Returns the maximum priority fee per gas in wei
    pub fn max_priority_fee_per_gas(self) -> u64 {
        self.max_priority_fee_per_gas
    }

    /// Returns the maximum fee per gas in wei
    pub fn max_fee_per_gas(self) -> u64 {
        self.max_fee_per_gas
    }

    /// Returns the maximum amount of gas that can be used
    pub fn gas_limit(self) -> u64 {
        self.gas_limit
    }

    /// Returns the recipient address, or None for contract creation
    pub fn to(self) -> Option<Address> {
        self.to
    }

    /// Returns the amount of ETH to transfer in wei
    pub fn value(self) -> u128 {
        self.value
    }

    /// Returns the transaction data/code
    pub fn data(self) -> BoundedVec<u8, MaxDataLen> {
        self.data
    }

    /// Returns the access list for gas optimization
    pub fn access_lists(self) -> BoundedVec<AccessList<MaxStorageKeysLen>, MaxAccessListLen> {
        self.access_lists
    }

    /// Returns the recovery parameter of the signature
    pub fn v(self) -> u8 {
        self.v
    }

    /// Returns the first component of the signature
    pub fn r(self) -> Bytes32 {
        self.r
    }

    /// Returns the second component of the signature
    pub fn s(self) -> Bytes32 {
        self.s
    }
}

impl<let MaxDataLen: u32, let MaxAccessListLen: u32, let MaxStorageKeysLen: u32> Eq for EIP1559Transaction<MaxDataLen, MaxAccessListLen, MaxStorageKeysLen> {
    fn eq(self, other: Self) -> bool {
        (self.chain_id == other.chain_id)
            & (self.nonce == other.nonce)
            & (self.max_priority_fee_per_gas == other.max_priority_fee_per_gas)
            & (self.max_fee_per_gas == other.max_fee_per_gas)
            & (self.gas_limit == other.gas_limit)
            & (self.to == other.to)
            & (self.value == other.value)
            & (self.data == other.data)
            & (self.access_lists == other.access_lists)
            & (self.v == other.v)
            & (self.r == other.r)
            & (self.s == other.s)
    }
}

/// Represents an EIP-4844 transaction with blob data.
///
/// EIP-4844 introduced blob transactions for layer 2 scaling with:
/// - All EIP-1559 fields
/// - Blob-specific fields (max fee per blob gas, versioned hashes)
/// - Access lists for gas optimization
///
/// # Generics
///
/// * `MaxDataLen` - Maximum length of the transaction data field
/// * `MaxAccessListLen` - Maximum length of the access list
/// * `MaxStorageKeysLen` - Maximum length of the storage keys
pub struct EIP4844Transaction<let MaxDataLen: u32, let MaxAccessListLen: u32, let MaxStorageKeysLen: u32> {
    /// The chain ID
    chain_id: u64,
    /// The nonce of the transaction
    nonce: u64,
    /// The maximum priority fee per gas in wei
    max_priority_fee_per_gas: u64,
    /// The maximum fee per gas in wei
    max_fee_per_gas: u64,
    /// The maximum amount of gas that can be used
    gas_limit: u64,
    /// The recipient address, or None for contract creation
    to: Option<Address>,
    /// The amount of ETH to transfer in wei
    value: u128,
    /// The transaction data/code
    data: BoundedVec<u8, MaxDataLen>,
    /// The access list for gas optimization
    access_lists: BoundedVec<AccessList<MaxStorageKeysLen>, MaxAccessListLen>,
    /// The maximum fee per blob gas in wei
    max_fee_per_blob_gas: u64,
    /// The versioned hashes of the blob data
    blob_versioned_hashes: BoundedVec<Hash, 6>,
    /// The recovery parameter of the signature
    v: u8,
    /// The first component of the signature
    r: Bytes32,
    /// The second component of the signature
    s: Bytes32,
}

impl<let MaxDataLen: u32, let MaxAccessListLen: u32, let MaxStorageKeysLen: u32> EIP4844Transaction<MaxDataLen, MaxAccessListLen, MaxStorageKeysLen> {
    pub fn new(
        chain_id: u64,
        nonce: u64,
        max_priority_fee_per_gas: u64,
        max_fee_per_gas: u64,
        gas_limit: u64,
        to: Option<Address>,
        value: u128,
        data: BoundedVec<u8, MaxDataLen>,
        access_lists: BoundedVec<AccessList<MaxStorageKeysLen>, MaxAccessListLen>,
        max_fee_per_blob_gas: u64,
        blob_versioned_hashes: BoundedVec<Hash, 6>,
        v: u8,
        r: Bytes32,
        s: Bytes32,
    ) -> Self {
        Self {
            chain_id,
            nonce,
            max_priority_fee_per_gas,
            max_fee_per_gas,
            gas_limit,
            to,
            value,
            data,
            access_lists,
            max_fee_per_blob_gas,
            blob_versioned_hashes,
            v,
            r,
            s,
        }
    }

    /// Returns the chain ID
    pub fn chain_id(self) -> u64 {
        self.chain_id
    }

    /// Returns the transaction nonce
    pub fn nonce(self) -> u64 {
        self.nonce
    }

    /// Returns the maximum priority fee per gas in wei
    pub fn max_priority_fee_per_gas(self) -> u64 {
        self.max_priority_fee_per_gas
    }

    /// Returns the maximum fee per gas in wei
    pub fn max_fee_per_gas(self) -> u64 {
        self.max_fee_per_gas
    }

    /// Returns the maximum amount of gas that can be used
    pub fn gas_limit(self) -> u64 {
        self.gas_limit
    }

    /// Returns the recipient address, or None for contract creation
    pub fn to(self) -> Option<Address> {
        self.to
    }

    /// Returns the amount of ETH to transfer in wei
    pub fn value(self) -> u128 {
        self.value
    }

    /// Returns the transaction data/code
    pub fn data(self) -> BoundedVec<u8, MaxDataLen> {
        self.data
    }

    /// Returns the access list for gas optimization
    pub fn access_lists(self) -> BoundedVec<AccessList<MaxStorageKeysLen>, MaxAccessListLen> {
        self.access_lists
    }

    /// Returns the maximum fee per blob gas in wei
    pub fn max_fee_per_blob_gas(self) -> u64 {
        self.max_fee_per_blob_gas
    }

    /// Returns the versioned hashes of the blob data
    pub fn blob_versioned_hashes(self) -> BoundedVec<Hash, 6> {
        self.blob_versioned_hashes
    }

    /// Returns the recovery parameter of the signature
    pub fn v(self) -> u8 {
        self.v
    }

    /// Returns the first component of the signature
    pub fn r(self) -> Bytes32 {
        self.r
    }

    /// Returns the second component of the signature
    pub fn s(self) -> Bytes32 {
        self.s
    }
}

impl<let MaxDataLen: u32, let MaxAccessListLen: u32, let MaxStorageKeysLen: u32> Eq for EIP4844Transaction<MaxDataLen, MaxAccessListLen, MaxStorageKeysLen> {
    fn eq(self, other: Self) -> bool {
        (self.chain_id == other.chain_id)
            & (self.nonce == other.nonce)
            & (self.max_priority_fee_per_gas == other.max_priority_fee_per_gas)
            & (self.max_fee_per_gas == other.max_fee_per_gas)
            & (self.gas_limit == other.gas_limit)
            & (self.to == other.to)
            & (self.value == other.value)
            & (self.data == other.data)
            & (self.access_lists == other.access_lists)
            & (self.max_fee_per_blob_gas == other.max_fee_per_blob_gas)
            & (self.blob_versioned_hashes == other.blob_versioned_hashes)
            & (self.v == other.v)
            & (self.r == other.r)
            & (self.s == other.s)
    }
}

/// Represents an authorization entry for EIP-7702 transactions.
///
/// Authorization entries contain:
/// - Chain ID
/// - Authorized address
/// - Nonce for ordering
/// - Signature components (v, r, s)
pub struct AuthorizationEntry {
    /// The chain ID
    chain_id: u64,
    /// The authorized address
    address: Address,
    /// The nonce for ordering
    nonce: u64,
    /// The recovery parameter of the signature
    v: u8,
    /// The first component of the signature
    r: Bytes32,
    /// The second component of the signature
    s: Bytes32,
}

/// Represents an EIP-7702 transaction with authorization lists.
///
/// EIP-7702 introduces authorization lists for:
/// - All EIP-1559 fields
/// - Authorization list for access control
/// - Access lists for gas optimization
///
/// # Generics
///
/// * `MaxDataLen` - Maximum length of the transaction data field
/// * `MaxAccessListLen` - Maximum length of the access list
/// * `MaxStorageKeysLen` - Maximum length of the storage keys
/// * `MaxAuthorizationListLen` - Maximum length of the authorization list
pub struct EIP7702Transaction<let MaxDataLen: u32, let MaxAccessListLen: u32, let MaxStorageKeysLen: u32, let MaxAuthorizationListLen: u32> {
    /// The chain ID
    chain_id: u64,
    /// The nonce of the transaction
    nonce: u64,
    /// The maximum priority fee per gas in wei
    max_priority_fee_per_gas: u64,
    /// The maximum fee per gas in wei
    max_fee_per_gas: u64,
    /// The maximum amount of gas that can be used
    gas_limit: u64,
    /// The recipient address, or None for contract creation
    to: Option<Address>,
    /// The amount of ETH to transfer in wei
    value: u128,
    /// The transaction data/code
    data: BoundedVec<u8, MaxDataLen>,
    /// The access list for gas optimization
    access_lists: BoundedVec<AccessList<MaxStorageKeysLen>, MaxAccessListLen>,
    /// The authorization list for access control
    authorization_lists: BoundedVec<AuthorizationEntry, MaxAuthorizationListLen>,
    /// The recovery parameter of the signature
    v: u8,
    /// The first component of the signature
    r: Bytes32,
    /// The second component of the signature
    s: Bytes32,
}

/// Represents a partial transaction for verification purposes.
///
/// This structure contains only the essential fields needed for transaction
/// verification, omitting fee-related fields that vary by transaction type.
///
/// # Generics
///
/// * `MaxDataLen` - Maximum length of the transaction data field
pub struct TransactionPartial<let MaxDataLen: u32> {
    /// The nonce of the transaction
    nonce: u64,
    /// The maximum amount of gas that can be used
    gas_limit: u64,
    /// The recipient address, or None for contract creation
    to: Option<Address>,
    /// The amount of ETH to transfer in wei
    value: u128,
    /// The transaction data/code
    data: BoundedVec<u8, MaxDataLen>,
    /// The recovery parameter of the signature
    v: u8,
    /// The first component of the signature
    r: Bytes32,
    /// The second component of the signature
    s: Bytes32,
}

impl<let MaxDataLen: u32> TransactionPartial<MaxDataLen> {
    pub fn new(
        nonce: u64,
        gas_limit: u64,
        to: Option<Address>,
        value: u128,
        data: BoundedVec<u8, MaxDataLen>,
        v: u8,
        r: Bytes32,
        s: Bytes32,
    ) -> Self {
        Self { nonce, gas_limit, to, value, data, v, r, s }
    }

    /// Returns the transaction nonce
    pub fn nonce(self) -> u64 {
        self.nonce
    }

    /// Returns the maximum amount of gas that can be used
    pub fn gas_limit(self) -> u64 {
        self.gas_limit
    }

    /// Returns the recipient address, or None for contract creation
    pub fn to(self) -> Option<Address> {
        self.to
    }

    /// Returns the amount of ETH to transfer in wei
    pub fn value(self) -> u128 {
        self.value
    }

    /// Returns the transaction data/code
    pub fn data(self) -> BoundedVec<u8, MaxDataLen> {
        self.data
    }

    /// Returns the recovery parameter of the signature
    pub fn v(self) -> u8 {
        self.v
    }

    /// Returns the first component of the signature
    pub fn r(self) -> Bytes32 {
        self.r
    }

    /// Returns the second component of the signature
    pub fn s(self) -> Bytes32 {
        self.s
    }
}

impl<let MaxDataLen: u32> Eq for TransactionPartial<MaxDataLen> {
    fn eq(self, other: Self) -> bool {
        (self.nonce == other.nonce)
            & (self.gas_limit == other.gas_limit)
            & (self.to == other.to)
            & (self.value == other.value)
            & (self.data == other.data)
            & (self.v == other.v)
            & (self.r == other.r)
            & (self.s == other.s)
    }
}

impl<let MaxDataLen: u32> From<LegacyTransaction<MaxDataLen>> for TransactionPartial<MaxDataLen> {
    fn from(legacy: LegacyTransaction<MaxDataLen>) -> Self {
        Self {
            nonce: legacy.nonce,
            gas_limit: legacy.gas_limit,
            to: legacy.to,
            value: legacy.value,
            data: legacy.data,
            v: legacy.v,
            r: legacy.r,
            s: legacy.s,
        }
    }
}

impl<let MaxDataLen: u32, let MaxAccessListLen: u32, let MaxStorageKeysLen: u32> From<EIP2930Transaction<MaxDataLen, MaxAccessListLen, MaxStorageKeysLen>> for TransactionPartial<MaxDataLen> {
    fn from(eip2930: EIP2930Transaction<MaxDataLen, MaxAccessListLen, MaxStorageKeysLen>) -> Self {
        Self {
            nonce: eip2930.nonce,
            gas_limit: eip2930.gas_limit,
            to: eip2930.to,
            value: eip2930.value,
            data: eip2930.data,
            v: eip2930.v,
            r: eip2930.r,
            s: eip2930.s,
        }
    }
}

impl<let MaxDataLen: u32, let MaxAccessListLen: u32, let MaxStorageKeysLen: u32> From<EIP1559Transaction<MaxDataLen, MaxAccessListLen, MaxStorageKeysLen>> for TransactionPartial<MaxDataLen> {
    fn from(eip1559: EIP1559Transaction<MaxDataLen, MaxAccessListLen, MaxStorageKeysLen>) -> Self {
        Self {
            nonce: eip1559.nonce,
            gas_limit: eip1559.gas_limit,
            to: eip1559.to,
            value: eip1559.value,
            data: eip1559.data,
            v: eip1559.v,
            r: eip1559.r,
            s: eip1559.s,
        }
    }
}

/// Represents the layout of fields in a partial transaction.
///
/// This structure defines the position and count of fields in a partial
/// transaction's RLP encoding, used for verification and serialization.
pub struct TransactionPartialFieldLayout {
    /// The total number of fields in the layout
    field_count: u32,
    /// The index of the nonce field
    nonce_index: u32,
    /// The index of the gas limit field
    gas_limit_index: u32,
    /// The index of the recipient field
    to_index: u32,
    /// The index of the value field
    value_index: u32,
    /// The index of the data field
    data_index: u32,
    /// The index of the signature field
    signature_index: u32,
}

impl TransactionPartialFieldLayout {
    pub fn new(
        field_count: u32,
        nonce_index: u32,
        gas_limit_index: u32,
        to_index: u32,
        value_index: u32,
        data_index: u32,
        signature_index: u32,
    ) -> Self {
        Self {
            field_count,
            nonce_index,
            gas_limit_index,
            to_index,
            value_index,
            data_index,
            signature_index,
        }
    }
    /// Returns the total number of fields in the layout
    pub fn field_count(self) -> u32 {
        self.field_count
    }

    /// Returns the index of the nonce field
    pub fn nonce_index(self) -> u32 {
        self.nonce_index
    }

    /// Returns the index of the gas limit field
    pub fn gas_limit_index(self) -> u32 {
        self.gas_limit_index
    }

    /// Returns the index of the recipient field
    pub fn to_index(self) -> u32 {
        self.to_index
    }

    /// Returns the index of the value field
    pub fn value_index(self) -> u32 {
        self.value_index
    }

    /// Returns the index of the data field
    pub fn data_index(self) -> u32 {
        self.data_index
    }

    /// Returns the index of the signature field
    pub fn signature_index(self) -> u32 {
        self.signature_index
    }
}

/// Verifies that a transaction matches its RLP encoding.
///
/// This function:
/// 1. Splits the encoded transaction into type and RLP components
/// 2. Verifies the transaction type matches
/// 3. Verifies the RLP encoding matches the transaction fields
///
/// # Arguments
///
/// * `tx_type` - The expected transaction type
/// * `encoded_tx` - The RLP-encoded transaction
/// * `tx` - The transaction to verify
///
/// # Generics
///
/// * `MaxDataLen` - Maximum length of the transaction data field
/// * `MaxEncodedDataLen` - Maximum length of the encoded transaction
pub fn assert_transaction_equals<let MaxDataLen: u32, let MaxEncodedDataLen: u32>(
    tx_type: TransactionType,
    encoded_tx: Fragment<u8, MaxEncodedDataLen>,
    tx: TransactionPartial<MaxDataLen>,
) {
    let is_legacy = tx_type == 0;
    let (actual_tx_type, tx_rlp) = split_into_tx_type_and_rlp(is_legacy, encoded_tx);

    assert(actual_tx_type == tx_type, "Invalid Transaction Type type");
    assert_tx_rlp_equals(tx_rlp, tx_type, tx);
}

/// Verifies a transaction proof against a transaction root.
///
/// This function:
/// 1. Verifies the transaction index matches
/// 2. Verifies the transaction matches its RLP encoding
/// 3. Verifies the Merkle proof against the transaction root
///
/// # Arguments
///
/// * `transaction_index` - The index of the transaction in the trie
/// * `transaction_type` - The type of the transaction
/// * `transaction` - The transaction to verify
/// * `transaction_proof` - The Merkle proof for the transaction
/// * `transaction_root` - The root hash of the transaction trie
///
/// # Generics
///
/// * `MaxDataLen` - Maximum length of the transaction data field
/// * `MaxEncodedDataLen` - Maximum length of the encoded transaction
/// * `MaxLeafLen` - Maximum length of a leaf node in the trie
/// * `MaxEncodedTxLen` - Maximum length of an encoded transaction
/// * `MaxDepthNoLeaf` - Maximum depth of the trie excluding leaf nodes
pub fn verify_transaction_proof<let MaxDataLen: u32, let MaxEncodedDataLen: u32, let MaxLeafLen: u32, let MaxEncodedTxLen: u32, let MaxDepthNoLeaf: u32>(
    transaction_index: u64,
    transaction_type: TransactionType,
    transaction: TransactionPartial<MaxDataLen>,
    transaction_proof: TransactionProof<MaxLeafLen, MaxEncodedTxLen, MaxDepthNoLeaf>,
    transaction_root: Hash,
) {
    let key = Fragment::from_vec(right_pad(transaction_proof.key()));
    assert_transaction_index_equals(key, transaction_index);

    let value = right_pad(transaction_proof.value()).storage();
    assert_transaction_equals(transaction_type, Fragment::from_array(value), transaction);
    verify_merkle_proof(
        transaction_proof.key(),
        transaction_proof.value(),
        transaction_root,
        transaction_proof.proof(),
    )
}

mod test_legacy_transaction {
    use crate::fixtures::transaction::legacy::{
        transaction, transaction_index, transaction_proof, transaction_root, transaction_type,
    };
    use super::verify_transaction_proof;

    #[test]
    fn test_legacy_transaction() {
        verify_transaction_proof(
            transaction_index,
            transaction_type,
            transaction,
            transaction_proof,
            transaction_root,
        )
    }
}

mod test_eip1559_transaction {
    use crate::fixtures::transaction::eip1559::{
        transaction, transaction_index, transaction_proof, transaction_root, transaction_type,
    };
    use super::verify_transaction_proof;

    #[test]
    fn test_eip1559_transaction() {
        verify_transaction_proof(
            transaction_index,
            transaction_type,
            transaction,
            transaction_proof,
            transaction_root,
        )
    }
}

mod test_eip4844_transaction {
    use crate::fixtures::transaction::eip4844::{
        transaction, transaction_index, transaction_proof, transaction_root, transaction_type,
    };
    use super::verify_transaction_proof;

    #[test]
    fn test_eip4844_transaction() {
        verify_transaction_proof(
            transaction_index,
            transaction_type,
            transaction,
            transaction_proof,
            transaction_root,
        )
    }
}

mod test_eip7702_transaction {
    use crate::fixtures::transaction::eip7702::{
        transaction, transaction_index, transaction_proof, transaction_root, transaction_type,
    };
    use super::verify_transaction_proof;

    #[test]
    fn test_eip7702_transaction() {
        verify_transaction_proof(
            transaction_index,
            transaction_type,
            transaction,
            transaction_proof,
            transaction_root,
        )
    }
}
