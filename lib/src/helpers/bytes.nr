//! Byte manipulation utilities for Ethereum data structures.
//! This module provides core functions for working with bytes and nibbles, including:
//! - Byte-nibble conversions
//! - Byte array manipulations
//! - Padding and shifting operations
//!
//! These utilities are essential for working with Ethereum's RLP encoding
//! and Merkle Patricia Trie implementations.

use crate::helpers::iterator::Iterator;
use crate::types::fragment::Fragment;

/// Converts a single byte into its upper and lower nibbles.
/// A nibble is a 4-bit value, so each byte contains two nibbles.
///
/// # Arguments
/// * `byte`: The byte to convert
///
/// # Returns
/// A tuple containing (upper_nibble, lower_nibble)
pub fn byte_to_nibbles(byte: u8) -> (u8, u8) {
    // Extract upper nibble by integer division
    let upper = byte / 16;
    // Extract lower nibble by subtracting upper nibble
    let lower = byte - 16 * upper;

    (upper, lower)
}

/// Converts a sequence of bytes into a sequence of nibbles.
/// Each byte is split into two nibbles, doubling the length of the sequence.
///
/// # Arguments
/// * `bytes`: The bytes to convert
///
/// # Returns
/// A fragment containing the nibbles
///
/// # Panics
/// Panics if the output fragment is not large enough to hold all nibbles
pub fn bytes_to_nibbles<let MaxLen: u32>(bytes: Fragment<u8, MaxLen>) -> Fragment<u8, MaxLen> {
    // Ensure output fragment can hold all nibbles (2 per byte)
    assert(
        (MaxLen as u64) >= 2 * bytes.len(),
        "Bytes implicit data length must be at least 2 times larger than bytes explicit length",
    );

    // Create output fragment with double the length
    let nibbles = &mut Fragment::from_array_with_len(2 * bytes.len(), [0; MaxLen]);

    // Convert each byte to two nibbles
    bytes.each(|byte, i| {
        let (hi, lo) = byte_to_nibbles(byte);
        nibbles.set(2 * i, hi);
        nibbles.set(2 * i + 1, lo);
    });

    *nibbles
}

/// Combines two nibbles into a single byte.
///
/// # Arguments
/// * `upper`: The upper nibble (4 bits)
/// * `lower`: The lower nibble (4 bits)
///
/// # Returns
/// The combined byte
///
/// # Panics
/// Panics if either nibble is >= 16
pub fn nibbles_to_byte(upper: u8, lower: u8) -> u8 {
    // Validate nibble values
    assert(upper < 16, "Nibble value must be less than 16");
    assert(lower < 16, "Nibble value must be less than 16");

    // Combine nibbles into byte
    upper * 16 + lower
}

/// Converts a sequence of nibbles into a sequence of bytes.
/// Each pair of nibbles is combined into a single byte, halving the length.
///
/// # Arguments
/// * `nibbles`: The nibbles to convert
///
/// # Returns
/// The converted bytes
///
/// # Panics
/// Panics if the number of nibbles is not twice the number of bytes
pub fn nibbles_to_bytes<let BytesLen: u32, let NibblesLen: u32>(
    nibbles: [u8; NibblesLen],
) -> [u8; BytesLen] {
    // Validate input length
    assert(NibblesLen == 2 * BytesLen, "Generic arguments don't match");

    let mut bytes = [0; BytesLen];

    // Combine each pair of nibbles into a byte
    for i in 0..NibblesLen / 2 {
        let byte = nibbles_to_byte(nibbles[2 * i], nibbles[2 * i + 1]);
        bytes[i] = byte;
    }

    bytes
}

/// Performs a left shift operation on a byte array.
/// Bytes are shifted left by n positions, with zeros filling in from the right.
///
/// # Arguments
/// * `input`: The byte array to shift
/// * `n`: The number of positions to shift
///
/// # Returns
/// The shifted byte array
pub fn left_byte_shift<let N: u32>(input: [u8; N], n: u64) -> [u8; N] {
    let mut out: [u8; N] = [0; N];

    // Shift each byte, handling overflow
    for i in 0..N {
        // Check if shifted index is within bounds
        let index_ind = (((i.into() + n) as u32) < (N as u32)) as u64;
        // Only copy if within bounds
        out[i] = (index_ind as u8) * input[index_ind * (i.into() + n)];
    }

    out
}

/// Calculates the actual length of a byte array by counting non-zero bytes.
/// Returns a BoundedVec with the appropriate length and left-shifted content.
///
/// # Arguments
/// * `in_value`: The input byte array
///
/// # Returns
/// A BoundedVec containing the trimmed and shifted bytes
pub fn byte_value<let N: u32>(in_value: [u8; N]) -> BoundedVec<u8, N> {
    let mut value_length = 0;

    // Find the first non-zero byte to determine actual length
    for i in 0..N {
        let num_bytes_index = (value_length == 0) as u32;
        let byte_index = (in_value[i] != 0) as u32;
        value_length =
            num_bytes_index * byte_index * (N - i) + (1 - num_bytes_index) * value_length;
    }

    // Shift bytes to remove leading zeros
    let value: [u8; N] = left_byte_shift(in_value, (N - value_length) as u64);

    BoundedVec::from_parts(value, value_length)
}

/// Right-pads a byte array by removing leading zeros.
/// This is a convenience wrapper around byte_value.
///
/// # Arguments
/// * `arr`: The byte array to pad
///
/// # Returns
/// A BoundedVec with the padded bytes
pub fn right_pad<let N: u32>(arr: [u8; N]) -> BoundedVec<u8, N> {
    byte_value(arr)
}

/// Converts a 32-bit unsigned integer to its big-endian byte array representation.
///
/// This function takes a u32 value and converts it to a 4-byte array in big-endian
/// format, which is the standard byte order used in Ethereum for encoding integers.
///
/// # Arguments
///
/// * `num` - The 32-bit unsigned integer to convert
///
/// # Returns
///
/// A 4-byte array containing the big-endian representation of the input number
pub fn u32_to_u8(num: u32) -> [u8; 4] {
    let mut out: [u8; 4] = [0; 4];
    for i in 0..4 {
        out[i] = (num >> (24 - (i * 8))) as u8;
    }

    out
}

/// Converts a 64-bit unsigned integer to its big-endian byte array representation.
///
/// This function takes a u64 value and converts it to an 8-byte array in big-endian
/// format, which is the standard byte order used in Ethereum for encoding integers.
///
/// # Arguments
///
/// * `num` - The 64-bit unsigned integer to convert
///
/// # Returns
///
/// An 8-byte array containing the big-endian representation of the input number
pub fn u64_to_u8(num: u64) -> [u8; 8] {
    let mut out: [u8; 8] = [0; 8];
    for i in 0..8 {
        out[i] = (num >> (56 - (i * 8))) as u8;
    }

    out
}

/// Converts a u128 to a 16-byte array in big-endian format.
///
/// # Arguments
///
/// * `num`: The u128 value to convert
///
/// # Returns
///
/// A 16-byte array containing the big-endian representation of the input number
pub fn u128_to_u8(num: u128) -> [u8; 16] {
    let mut out: [u8; 16] = [0; 16];
    for i in 0..16 {
        out[i] = (num >> (120 - (i * 8))) as u8;
    }

    out
}

mod byte_to_nibbles_tests {
    use super::byte_to_nibbles;

    #[test]
    fn test_byte_to_nibbles() {
        // Test basic conversion
        let (upper, lower) = byte_to_nibbles(0x12);
        assert(upper == 0x1, "Upper nibble should be 0x1");
        assert(lower == 0x2, "Lower nibble should be 0x2");

        // Test maximum values
        let (upper, lower) = byte_to_nibbles(0xFF);
        assert(upper == 0xF, "Upper nibble should be 0xF");
        assert(lower == 0xF, "Lower nibble should be 0xF");

        // Test zero
        let (upper, lower) = byte_to_nibbles(0x00);
        assert(upper == 0x0, "Upper nibble should be 0x0");
        assert(lower == 0x0, "Lower nibble should be 0x0");
    }
}

mod bytes_to_nibbles_tests {
    use crate::types::fragment::Fragment;
    use super::bytes_to_nibbles;

    #[test]
    fn test_bytes_to_nibbles() {
        let data = [0x00, 0x00, 0x12, 0x34];
        let bytes = Fragment::new(2, 2, data);
        let nibbles = bytes_to_nibbles(bytes);

        assert(nibbles.len() == 4, "Should have 4 nibbles");
        assert(nibbles.at(0) == 0x1, "First nibble should be 0x1");
        assert(nibbles.at(1) == 0x2, "Second nibble should be 0x2");
        assert(nibbles.at(2) == 0x3, "Third nibble should be 0x3");
        assert(nibbles.at(3) == 0x4, "Fourth nibble should be 0x4");
    }

    #[test(should_fail_with = "Bytes implicit data length must be at least 2 times larger than bytes explicit length")]
    fn test_bytes_to_nibbles_invalid_length() {
        let bytes = Fragment::from_array([0x12, 0x34]);
        let _ = bytes_to_nibbles::<2>(bytes); // Should panic as length is too small
    }
}

mod nibbles_to_byte_tests {
    use super::nibbles_to_byte;

    #[test]
    fn test_nibbles_to_byte() {
        // Test basic conversion
        let byte = nibbles_to_byte(0x1, 0x2);
        assert(byte == 0x12, "Should combine to 0x12");

        // Test maximum values
        let byte = nibbles_to_byte(0xF, 0xF);
        assert(byte == 0xFF, "Should combine to 0xFF");

        // Test zero
        let byte = nibbles_to_byte(0x0, 0x0);
        assert(byte == 0x00, "Should combine to 0x00");
    }

    #[test(should_fail_with = "Nibble value must be less than 16")]
    fn test_nibbles_to_byte_invalid_upper() {
        let _ = nibbles_to_byte(16, 0); // Should panic as upper nibble is too large
    }

    #[test(should_fail_with = "Nibble value must be less than 16")]
    fn test_nibbles_to_byte_invalid_lower() {
        let _ = nibbles_to_byte(0, 16); // Should panic as lower nibble is too large
    }
}

mod nibbles_to_bytes_tests {
    use super::nibbles_to_bytes;

    #[test]
    fn test_nibbles_to_bytes() {
        let nibbles = [0x1, 0x2, 0x3, 0x4];
        let bytes = nibbles_to_bytes::<2, 4>(nibbles);

        assert(bytes[0] == 0x12, "First byte should be 0x12");
        assert(bytes[1] == 0x34, "Second byte should be 0x34");
    }

    #[test(should_fail_with = "Generic arguments don't match")]
    fn test_nibbles_to_bytes_invalid_length() {
        let nibbles = [0x1, 0x2, 0x3, 0x4];
        let _ = nibbles_to_bytes::<3, 4>(nibbles); // Should panic as lengths don't match
    }
}

mod left_byte_shift_tests {
    use super::left_byte_shift;

    #[test]
    fn test_left_byte_shift_empty() {
        let input = [0x01, 0x02, 0x03, 0x04];

        // Test no shift
        let shifted = left_byte_shift(input, 0);
        assert(shifted == input, "No shift should return original array");
    }

    #[test]
    fn test_left_byte_shift_one_byte() {
        let input = [0x01, 0x02, 0x03, 0x04];

        // Test shift by 1
        let shifted = left_byte_shift(input, 1);
        assert(shifted[0] == 0x02, "First byte should be 0x02");
        assert(shifted[1] == 0x03, "Second byte should be 0x03");
        assert(shifted[2] == 0x04, "Third byte should be 0x04");
        assert(shifted[3] == 0x00, "Fourth byte should be 0x00");
    }

    #[test]
    fn test_left_byte_shift_all() {
        let input = [0x01, 0x02, 0x03, 0x04];

        // Test shift beyond length
        let shifted = left_byte_shift(input, 4);
        assert(shifted == [0x00, 0x00, 0x00, 0x00], "All bytes should be zero");
    }
}

mod byte_value_tests {
    use super::byte_value;

    #[test]
    fn test_byte_value_leading_zeros() {
        // Test with leading zeros
        let input = [0x00, 0x00, 0x01, 0x02];
        let result = byte_value(input);
        assert(result.len() == 2, "Length should be 2");
        assert(result.storage()[0] == 0x01, "First byte should be 0x01");
        assert(result.storage()[1] == 0x02, "Second byte should be 0x02");
    }

    #[test]
    fn test_byte_value_no_leading_zeros() {
        // Test with no leading zeros
        let input = [0x01, 0x02, 0x03, 0x04];
        let result = byte_value(input);
        assert(result.len() == 4, "Length should be 4");
        assert(result.storage() == input, "Storage should match input");
    }

    #[test]
    fn test_byte_value_all_zeros() {
        // Test with all zeros
        let input = [0x00, 0x00, 0x00, 0x00];
        let result = byte_value(input);
        assert(result.len() == 0, "Length should be 0");
    }
}

mod right_pad_tests {
    use super::right_pad;

    #[test]
    fn test_right_pad_leading_zeros() {
        // Test with leading zeros
        let input = [0x00, 0x00, 0x01, 0x02];
        let result = right_pad(input);
        assert(result.len() == 2, "Length should be 2");
        assert(result.storage()[0] == 0x01, "First byte should be 0x01");
        assert(result.storage()[1] == 0x02, "Second byte should be 0x02");
    }

    #[test]
    fn test_right_pad_no_leading_zeros() {
        // Test with no leading zeros
        let input = [0x01, 0x02, 0x03, 0x04];
        let result = right_pad(input);
        assert(result.len() == 4, "Length should be 4");
        assert(result.storage() == input, "Storage should match input");
    }
}
