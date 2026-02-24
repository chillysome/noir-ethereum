//! RLP (Recursive Length Prefix) Fragment structure and operations.
//!
//! This module provides a data structure for representing RLP-encoded data fragments.
//! A fragment represents a portion of RLP-encoded data with metadata about its position,
//! length, and type (string or list).

use crate::helpers::bytes::{byte_value, u128_to_u8, u32_to_u8, u64_to_u8};
use crate::types::{address::Address, bytes32::Bytes32, fragment::Fragment};
use super::constants::{List, String};
use super::header::RlpHeader;

/// Represents a fragment of RLP-encoded data.
///
/// A fragment contains metadata about a portion of RLP-encoded data:
/// - `offset`: The starting position of the fragment in the original data
/// - `length`: The length of the fragment in bytes
/// - `data_type`: Whether the fragment represents a string (0) or list (1)
pub struct RlpFragment {
    offset: u64,
    length: u64,
    data_type: u8,
}

impl RlpFragment {
    /// Creates a new RLP fragment with the given metadata.
    ///
    /// # Arguments
    ///
    /// * `offset` - The starting position in the original data
    /// * `length` - The length of the fragment in bytes
    /// * `data_type` - The type of the fragment (String or List)
    ///
    /// # Returns
    ///
    /// A new RLP fragment with the specified metadata
    pub fn new(offset: u64, length: u64, data_type: u8) -> Self {
        Self { offset, length, data_type }
    }

    /// Creates a new RLP fragment from an RLP header.
    ///
    /// This is a convenience method to convert an RLP header into a fragment,
    /// preserving the header's metadata.
    ///
    /// # Arguments
    ///
    /// * `header` - The RLP header to convert
    ///
    /// # Returns
    ///
    /// A new RLP fragment with metadata from the header
    pub fn from_header(header: RlpHeader) -> Self {
        Self::new(header.offset(), header.len(), header.data_type())
    }

    /// Checks if the fragment represents a string.
    ///
    /// # Returns
    ///
    /// `true` if the fragment is a string, `false` otherwise
    pub fn is_string(self) -> bool {
        self.data_type == String
    }

    /// Checks if the fragment represents a list.
    ///
    /// # Returns
    ///
    /// `true` if the fragment is a list, `false` otherwise
    pub fn is_list(self) -> bool {
        self.data_type == List
    }

    /// Checks if the fragment is empty.
    ///
    /// # Returns
    ///
    /// `true` if the fragment has zero length, `false` otherwise
    pub fn is_empty(self) -> bool {
        self.length == 0
    }

    /// Gets the length of the fragment in bytes.
    ///
    /// # Returns
    ///
    /// The length of the fragment in bytes
    pub fn len(self) -> u64 {
        self.length
    }

    /// Gets the offset of the fragment in the original data.
    ///
    /// # Returns
    ///
    /// The starting position of the fragment
    pub fn offset(self) -> u64 {
        self.offset
    }

    /// Gets the data type of the fragment.
    ///
    /// # Returns
    ///
    /// The type of the fragment (String or List)
    pub fn data_type(self) -> u8 {
        self.data_type
    }

    /// Gets the end position of the fragment in the original data.
    ///
    /// # Returns
    ///
    /// The position immediately after the end of the fragment
    pub fn end(self) -> u64 {
        self.offset + self.length
    }

    /// Checks if this fragment completely contains another fragment.
    ///
    /// A fragment A contains fragment B if B's start and end positions
    /// are within A's start and end positions.
    ///
    /// # Arguments
    ///
    /// * `other` - The fragment to check for containment
    ///
    /// # Returns
    ///
    /// `true` if this fragment contains the other fragment, `false` otherwise
    pub fn contains(self, other: Self) -> bool {
        let self_end = self.end();
        let other_end = other.end();
        (self.offset <= other.offset) * (self_end >= other_end)
    }

    /// Checks if this fragment overlaps with another fragment.
    ///
    /// Two fragments overlap if they share any positions in the original data.
    ///
    /// # Arguments
    ///
    /// * `other` - The fragment to check for overlap
    ///
    /// # Returns
    ///
    /// `true` if the fragments overlap, `false` otherwise
    pub fn overlaps(self, other: Self) -> bool {
        let self_end = self.end();
        let other_end = other.end();
        ((self.offset <= other.offset) * (self_end > other.offset))
            + ((other.offset <= self.offset) * (other_end > self.offset))
    }

    /// Checks if the fragment is valid.
    ///
    /// A fragment is valid if it has a non-negative length.
    ///
    /// # Returns
    ///
    /// `true` if the fragment is valid, `false` otherwise
    pub fn is_valid(self) -> bool {
        (self.length > 0) + self.is_empty()
    }

    /// Asserts that an RLP fragment matches a byte array value.
    ///
    /// This function verifies that:
    /// - The fragment is of type String
    /// - The fragment length matches the value length
    /// - The fragment's bytes match the provided value
    ///
    /// # Arguments
    ///
    /// * `field_name` - Name of the field being validated (used in error messages)
    /// * `rlp` - The RLP fragment to validate
    /// * `value` - The expected byte array value
    ///
    /// # Panics
    ///
    /// Panics with a descriptive message if any of the assertions fail:
    /// - "Invalid RLP type" if the fragment is not a String
    /// - "Invalid RLP length" if lengths don't match
    /// - "Invalid RLP value" if the bytes don't match
    pub fn assert_eq_bytes<let FieldNameLen: u32, let MaxRlpLen: u32, let MaxValueLen: u32>(
        self,
        field_name: str<FieldNameLen>,
        rlp: Fragment<u8, MaxRlpLen>,
        value: Fragment<u8, MaxValueLen>,
    ) {
        assert(self.data_type == String, f"{field_name}: Invalid RLP type");
        assert(self.length == value.len(), f"{field_name}: Invalid RLP length");
        assert(
            rlp.sub_fragment(self.offset, self.length).eq(value),
            f"{field_name}: Invalid RLP value",
        );
    }

    /// Asserts that an RLP fragment matches a bounded vector value.
    ///
    /// This is a convenience wrapper around `assert_eq_bytes` that works with
    /// bounded vectors instead of fragments.
    ///
    /// # Arguments
    ///
    /// * `field_name` - Name of the field being validated (used in error messages)
    /// * `rlp` - The RLP fragment to validate
    /// * `value` - The expected bounded vector value
    ///
    /// # Panics
    ///
    /// Panics with the same messages as `assert_eq_bytes`
    pub fn assert_eq_bounded_vec<let FieldNameLen: u32, let MaxRlpLen: u32, let MaxValueLen: u32>(
        self,
        field_name: str<FieldNameLen>,
        rlp: Fragment<u8, MaxRlpLen>,
        value: BoundedVec<u8, MaxValueLen>,
    ) {
        self.assert_eq_bytes(field_name, rlp, Fragment::from_vec(value));
    }

    /// Asserts that an RLP fragment represents an empty string.
    ///
    /// This function verifies that:
    /// - The fragment is of type String
    /// - The fragment has zero length
    ///
    /// # Arguments
    ///
    /// * `field_name` - Name of the field being validated (used in error messages)
    ///
    /// # Panics
    ///
    /// Panics with a descriptive message if any of the assertions fail:
    /// - "Invalid RLP type" if the fragment is not a String
    /// - "Expected empty string" if the length is not zero
    pub fn assert_empty_string<let FieldNameLen: u32, let MaxRlpLen: u32>(
        self,
        field_name: str<FieldNameLen>,
    ) {
        assert(self.data_type == String, f"{field_name}: Invalid RLP type");
        assert(self.length == 0, f"{field_name}: Expected empty string");
    }

    /// Asserts that an RLP fragment matches a u1 value.
    ///
    /// This function verifies that the fragment contains exactly one byte
    /// matching the provided u1 value.
    ///
    /// # Arguments
    ///
    /// * `field_name` - Name of the field being validated (used in error messages)
    /// * `rlp` - The RLP fragment to validate
    /// * `value` - The expected u1 value
    ///
    /// # Panics
    ///
    /// Panics with the same messages as `assert_eq_bytes`
    pub fn assert_eq_u1<let FieldNameLen: u32, let MaxRlpLen: u32>(
        self,
        field_name: str<FieldNameLen>,
        rlp: Fragment<u8, MaxRlpLen>,
        value: u1,
    ) {
        self.assert_eq_bytes(field_name, rlp, Fragment::from_array([value as u8]));
    }

    /// Asserts that an RLP fragment matches a u8 value.
    ///
    /// This function verifies that the fragment contains exactly one byte
    /// matching the provided u8 value.
    ///
    /// # Arguments
    ///
    /// * `field_name` - Name of the field being validated (used in error messages)
    /// * `rlp` - The RLP fragment to validate
    /// * `value` - The expected u8 value
    ///
    /// # Panics
    ///
    /// Panics with the same messages as `assert_eq_bytes`
    pub fn assert_eq_u8<let FieldNameLen: u32, let MaxRlpLen: u32>(
        self,
        field_name: str<FieldNameLen>,
        rlp: Fragment<u8, MaxRlpLen>,
        value: u8,
    ) {
        self.assert_eq_bounded_vec(field_name, rlp, byte_value([value]));
    }

    /// Asserts that an RLP fragment matches a u32 value.
    ///
    /// This function verifies that the fragment contains exactly four bytes
    /// representing the big-endian encoding of the provided u32 value.
    ///
    /// # Arguments
    ///
    /// * `field_name` - Name of the field being validated (used in error messages)
    /// * `rlp` - The RLP fragment to validate
    /// * `value` - The expected u32 value
    ///
    /// # Panics
    ///
    /// Panics with the same messages as `assert_eq_bytes`
    pub fn assert_eq_u32<let FieldNameLen: u32, let MaxRlpLen: u32>(
        self,
        field_name: str<FieldNameLen>,
        rlp: Fragment<u8, MaxRlpLen>,
        value: u32,
    ) {
        self.assert_eq_bounded_vec(field_name, rlp, byte_value(u32_to_u8(value)));
    }

    /// Asserts that an RLP fragment matches a u64 value.
    ///
    /// This function verifies that the fragment contains exactly eight bytes
    /// representing the big-endian encoding of the provided u64 value.
    ///
    /// # Arguments
    ///
    /// * `field_name` - Name of the field being validated (used in error messages)
    /// * `rlp` - The RLP fragment to validate
    /// * `value` - The expected u64 value
    ///
    /// # Panics
    ///
    /// Panics with the same messages as `assert_eq_bytes`
    pub fn assert_eq_u64<let FieldNameLen: u32, let MaxRlpLen: u32>(
        self,
        field_name: str<FieldNameLen>,
        rlp: Fragment<u8, MaxRlpLen>,
        value: u64,
    ) {
        self.assert_eq_bounded_vec(field_name, rlp, byte_value(u64_to_u8(value)));
    }

    /// Asserts that an RLP fragment matches a u128 value.
    ///
    /// This function verifies that the fragment contains exactly sixteen bytes
    /// representing the big-endian encoding of the provided u128 value.
    ///
    /// # Arguments
    ///
    /// * `field_name` - Name of the field being validated (used in error messages)
    /// * `rlp` - The RLP fragment to validate
    /// * `value` - The expected u128 value
    ///
    /// # Panics
    ///
    /// Panics with the same messages as `assert_eq_bytes`
    pub fn assert_eq_u128<let FieldNameLen: u32, let MaxRlpLen: u32>(
        self,
        field_name: str<FieldNameLen>,
        rlp: Fragment<u8, MaxRlpLen>,
        value: u128,
    ) {
        self.assert_eq_bounded_vec(field_name, rlp, byte_value(u128_to_u8(value)));
    }

    /// Asserts that an RLP fragment matches an Ethereum address.
    ///
    /// This function verifies that the fragment contains exactly twenty bytes
    /// matching the provided Ethereum address.
    ///
    /// # Arguments
    ///
    /// * `field_name` - Name of the field being validated (used in error messages)
    /// * `rlp` - The RLP fragment to validate
    /// * `value` - The expected Ethereum address
    ///
    /// # Panics
    ///
    /// Panics with the same messages as `assert_eq_bytes`
    pub fn assert_eq_address<let FieldNameLen: u32, let MaxRlpLen: u32>(
        self,
        field_name: str<FieldNameLen>,
        rlp: Fragment<u8, MaxRlpLen>,
        value: Address,
    ) {
        self.assert_eq_bytes(field_name, rlp, Fragment::from_array(value));
    }

    /// Asserts that an RLP fragment matches a 32-byte value.
    ///
    /// This function verifies that the fragment contains exactly thirty-two bytes
    /// matching the provided Bytes32 value.
    ///
    /// # Arguments
    ///
    /// * `field_name` - Name of the field being validated (used in error messages)
    /// * `rlp` - The RLP fragment to validate
    /// * `value` - The expected Bytes32 value
    ///
    /// # Panics
    ///
    /// Panics with the same messages as `assert_eq_bytes`
    pub fn assert_eq_bytes32<let FieldNameLen: u32, let MaxRlpLen: u32>(
        self,
        field_name: str<FieldNameLen>,
        rlp: Fragment<u8, MaxRlpLen>,
        value: Bytes32,
    ) {
        self.assert_eq_bytes(field_name, rlp, Fragment::from_array(value));
    }
}

impl Eq for RlpFragment {
    /// Checks if two fragments are equal.
    ///
    /// Two fragments are equal if they have the same offset, length, and data type.
    ///
    /// # Arguments
    ///
    /// * `other` - The fragment to compare with
    ///
    /// # Returns
    ///
    /// `true` if the fragments are equal, `false` otherwise
    fn eq(self, other: Self) -> bool {
        (self.offset == other.offset)
            & (self.length == other.length)
            & (self.data_type == other.data_type)
    }
}

mod tests {
    use crate::rlp::constants::{List, String};
    use crate::rlp::fragment::RlpFragment;
    use crate::rlp::header::RlpHeader;

    #[test]
    fn test_fragment_creation() {
        let fragment = RlpFragment::new(0, 10, String);
        assert(fragment.is_string());
        assert(!fragment.is_list());
        assert(fragment.len() == 10);
        assert(fragment.offset() == 0);
        assert(fragment.end() == 10);
    }

    #[test]
    fn test_fragment_from_header() {
        let header = RlpHeader::new(5, 15, List);
        let fragment = RlpFragment::from_header(header);
        assert(fragment.is_list());
        assert(!fragment.is_string());
        assert(fragment.len() == 15);
        assert(fragment.offset() == 5);
        assert(fragment.end() == 20);
    }

    #[test]
    fn test_empty_fragment() {
        let fragment = RlpFragment::new(0, 0, String);
        assert(fragment.is_empty());
        assert(fragment.is_valid());
        assert(fragment.end() == 0);
    }

    #[test]
    fn test_fragment_contains() {
        let outer = RlpFragment::new(0, 10, String);
        let inner = RlpFragment::new(2, 5, String);
        assert(outer.contains(inner));
        assert(!inner.contains(outer));
    }

    #[test]
    fn test_fragment_overlaps() {
        let a = RlpFragment::new(0, 5, String);
        let b = RlpFragment::new(3, 5, String);
        assert(a.overlaps(b));
        assert(b.overlaps(a));
    }

    #[test]
    fn test_fragment_no_overlap() {
        let a = RlpFragment::new(0, 3, String);
        let b = RlpFragment::new(4, 3, String);
        assert(!a.overlaps(b));
        assert(!b.overlaps(a));
    }

    #[test]
    fn test_fragment_equality() {
        let a = RlpFragment::new(0, 10, String);
        let b = RlpFragment::new(0, 10, String);
        let c = RlpFragment::new(1, 10, String);
        let d = RlpFragment::new(0, 11, String);
        let e = RlpFragment::new(0, 10, List);

        assert(a == b);
        assert(a != c);
        assert(a != d);
        assert(a != e);
    }

    #[test]
    fn test_fragment_validity() {
        let valid = RlpFragment::new(0, 10, String);
        let empty = RlpFragment::new(0, 0, String);
        assert(valid.is_valid());
        assert(empty.is_valid());
    }

    #[test]
    fn test_fragment_boundary_conditions() {
        let max_offset = RlpFragment::new(0xffffffffffffffff, 1, String);
        assert(max_offset.is_valid());
        assert(max_offset.end() == 0xffffffffffffffff + 1);
    }
}
