/// Auditing Function (AF)
/// Validates transaction legitimacy by checking if sender's address is in the blacklist
///
/// IMPORTANT: The blacklist is HARDCODED in the circuit, not provided as input.
/// This provides privacy protection - blacklist contents remain hidden from public.

use ethereum::types::address::Address;

/// Audit function to check if a single address is blacklisted
/// Returns true if the address is NOT in the blacklist (valid)
/// Returns false if the address IS in the blacklist (invalid)
pub fn audit_address(address: Address) -> bool {
    !is_blacklisted(address)
}

/// Audit function to check multiple addresses
/// Returns an array where true means the address is NOT blacklisted (valid)
pub fn audit_addresses<let N: u32>(addresses: [Address; N]) -> [bool; N] {
    let mut results = [false; N];
    for i in 0..N {
        results[i] = !is_blacklisted(addresses[i]);
    }
    results
}

/// Check if an address is in the hardcoded blacklist
pub fn is_blacklisted(address: Address) -> bool {
    // Hardcoded blacklist addresses
    // Example blacklisted addresses (replace with real addresses in production)
    let blacklist_0: Address = [
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00,
    ];
    let blacklist_1: Address = [
        0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00,
    ];
    let blacklist_2: Address = [
        0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00,
    ];
    let blacklist_3: Address = [
        0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00,
    ];

    let mut found = false;

    // Check blacklist_0
    let mut match_addr = true;
    for j in 0..20 {
        match_addr = match_addr & (address[j] == blacklist_0[j]);
    }
    if match_addr {
        found = true;
    }

    // Check blacklist_1
    match_addr = true;
    for j in 0..20 {
        match_addr = match_addr & (address[j] == blacklist_1[j]);
    }
    if match_addr {
        found = true;
    }

    // Check blacklist_2
    match_addr = true;
    for j in 0..20 {
        match_addr = match_addr & (address[j] == blacklist_2[j]);
    }
    if match_addr {
        found = true;
    }

    // Check blacklist_3
    match_addr = true;
    for j in 0..20 {
        match_addr = match_addr & (address[j] == blacklist_3[j]);
    }
    if match_addr {
        found = true;
    }

    found
}
